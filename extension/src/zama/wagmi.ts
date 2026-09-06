/**
 * Drop-in replacement for `@zama-fhe/react-sdk/wagmi`'s WagmiSigner (extension build only).
 *
 * Identical shape to the upstream class, but self-contained so it works alongside our UMD-based
 * FHEVM shim. `signTypedData` routes through wagmi → the internal EIP-1193 provider → the
 * background keyring, which auto-approves `eth_signTypedData_v4` (no user prompt).
 */

import { getAccount, getChainId, signTypedData } from "wagmi/actions";
import type { Config } from "wagmi";
import type { EIP712TypedData } from "./fhevm";

export class WagmiSigner {
  config: Config;

  constructor({ config }: { config: Config }) {
    this.config = config;
  }

  async getChainId(): Promise<number> {
    return getChainId(this.config);
  }

  async getAddress(): Promise<string> {
    const account = getAccount(this.config);
    if (!account?.address) throw new TypeError("Invalid address");
    return account.address;
  }

  async signTypedData(typedData: EIP712TypedData): Promise<string> {
    const { EIP712Domain: _omit, ...types } = typedData.types as Record<string, unknown>;
    return signTypedData(this.config, {
      primaryType: typedData.primaryType ?? Object.keys(types)[0],
      types,
      domain: typedData.domain,
      message: typedData.message,
    } as never);
  }
}
