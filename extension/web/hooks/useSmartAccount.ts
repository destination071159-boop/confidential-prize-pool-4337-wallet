import { useMemo } from "react";
import { useAccount, useConfig } from "wagmi";
import {
  signTypedData,
  sendTransaction,
  waitForTransactionReceipt,
  getBytecode,
} from "wagmi/actions";
import { SafeAccountV0_3_0, Erc7677Paymaster, type MetaTransaction } from "abstractionkit";
import { recordGasSaved } from "../lib/gasSaved";
import {
  CHAIN_ID_BIG as CHAIN_ID,
  RPC_URL,
  BUNDLER_URL,
  PAYMASTER_URL,
  SPONSORSHIP_POLICY_ID,
  USEROP_CALL_GAS_LIMIT,
  USEROP_MAX_PRIORITY_FEE_PER_GAS,
  USEROP_MAX_FEE_PER_GAS,
} from "@zhieldwrap/core";

/**
 * Drives a gasless ERC-4337 Safe smart account (EntryPoint v0.7) whose OWNER is the extension's
 * keyring EOA. The smart account is a DIFFERENT address than the EOA — it holds the confidential
 * tokens and executes every op; the EOA only signs (auto-approved by the keyring, no popup).
 *
 * Strict bundlers reject the Safe deploy initCode inside a UserOp (AA13), so the account is
 * pre-deployed with one plain tx the first time, then attached to by address (no initCode).
 */
export function useSmartAccount() {
  const { address: eoa } = useAccount();
  const config = useConfig();

  const smartAccountAddress = useMemo(() => {
    if (!eoa) return undefined;
    try {
      return SafeAccountV0_3_0.createAccountAddress([eoa]) as `0x${string}`;
    } catch {
      return undefined;
    }
  }, [eoa]);

  /** Deploy the Safe with a normal tx if it isn't on-chain yet (avoids UserOp AA13). */
  async function ensureDeployed(addr: `0x${string}`) {
    const code = await getBytecode(config, { address: addr });
    if (code && code !== "0x") return;
    const draft = SafeAccountV0_3_0.initializeNewAccount([eoa as string]) as any;
    const hash = await sendTransaction(config, {
      to: draft.factoryAddress as `0x${string}`,
      data: draft.factoryData as `0x${string}`,
    });
    await waitForTransactionReceipt(config, { hash });
  }

  /** Build → sign (keyring EIP-712) → send a UserOperation executing `transactions`. */
  async function sendTransactions(transactions: MetaTransaction[]): Promise<{
    userOpHash: string;
    included: () => Promise<string | null>;
  }> {
    if (!eoa || !smartAccountAddress) throw new Error("Unlock your wallet first.");
    if (!BUNDLER_URL) throw new Error("Bundler URL not configured (VITE_BUNDLER_URL).");

    await ensureDeployed(smartAccountAddress);
    const account = new SafeAccountV0_3_0(smartAccountAddress);

    let userOp = await account.createUserOperation(
      transactions,
      RPC_URL || undefined,
      BUNDLER_URL,
      {
        callGasLimit: USEROP_CALL_GAS_LIMIT,
        maxPriorityFeePerGas: USEROP_MAX_PRIORITY_FEE_PER_GAS,
        maxFeePerGas: USEROP_MAX_FEE_PER_GAS,
      }
    );

    // Gasless sponsorship (Pimlico ERC-7677) — the paymaster pays; the smart account pays 0.
    if (PAYMASTER_URL) {
      const paymaster = new Erc7677Paymaster(PAYMASTER_URL, { chainId: CHAIN_ID });
      const { userOperation: sponsored } = await paymaster.createPaymasterUserOperation(
        account,
        userOp,
        BUNDLER_URL,
        SPONSORSHIP_POLICY_ID ? { sponsorshipPolicyId: SPONSORSHIP_POLICY_ID } : {}
      );
      userOp = sponsored;
    }

    const eip712 = account.getUserOperationEip712Data(userOp, CHAIN_ID);
    const types = { ...eip712.types } as Record<string, unknown>;
    delete (types as any).EIP712Domain;

    const signature = await signTypedData(config, {
      account: eoa as `0x${string}`,
      domain: eip712.domain as any,
      types: types as any,
      primaryType: "SafeOp",
      message: eip712.messageValue as any,
    });

    userOp.signature =
      SafeAccountV0_3_0.formatEip712SingleSignatureToUseroperationSignature(signature);

    const sponsored = !!PAYMASTER_URL;
    const response = await account.sendUserOperation(userOp, BUNDLER_URL);
    return {
      userOpHash: (response as any).userOperationHash ?? (response as any).userOpHash,
      included: async (): Promise<string | null> => {
        const receipt: any = await (response as any).included();
        try {
          if (sponsored) {
            const cost =
              receipt?.actualGasCost ??
              receipt?.receipt?.actualGasCost ??
              (receipt?.receipt?.gasUsed && receipt?.receipt?.effectiveGasPrice
                ? BigInt(receipt.receipt.gasUsed) * BigInt(receipt.receipt.effectiveGasPrice)
                : 0n);
            recordGasSaved(BigInt(cost ?? 0n));
          }
        } catch {
          /* non-fatal */
        }
        return receipt?.receipt?.transactionHash ?? receipt?.transactionHash ?? null;
      },
    };
  }

  return { eoa, smartAccountAddress, sendTransactions };
}
