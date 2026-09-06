/**
 * Confidential Agent Allowance — GASLESS demo agent.
 *
 * Plays an AI agent handed a key with a SECRET spending cap. The agent has its OWN gasless 4337 smart
 * account (pre-deployed by the owner at mint time); its spends are sponsored by a paymaster, so the
 * agent needs ZERO ETH. It spends the owner's confidential tokens up to a limit it can never read
 * (the cap is an FHE ciphertext on-chain). An over-budget spend silently settles 0 — no revert, no
 * leak — and the agent never learns the cap.
 *
 * Usage:
 *   1. Wallet → Agent Allowances → mint an agent → "Copy agent config".
 *   2. Paste it into  scripts/agent.config.json  (see agent.config.example.json).
 *   3. node scripts/agent-demo.cjs        # no funding needed — the agent is gasless
 */
const { createInstance, SepoliaConfig } = require("@zama-fhe/relayer-sdk/node");
const { Wallet, Interface, hexlify } = require("ethers");
const { SafeAccountV0_3_0, Erc7677Paymaster } = require("abstractionkit");
const fs = require("fs");
const path = require("path");

const ONE = 1_000_000n; // 6-dec confidential unit
const MODULE_IFACE = new Interface([
  "function spend(address token,address account,address to,bytes32 encryptedAmount,bytes inputProof)",
]);

const CALL_GAS_LIMIT = 10_000_000n;
const MAX_PRIORITY_FEE = 300_000_000n;
const MAX_FEE = 2_000_000_000n;

function loadConfig() {
  const p = path.join(__dirname, "agent.config.json");
  if (!fs.existsSync(p)) {
    console.error("Missing scripts/agent.config.json — paste the agent config exported from the wallet.");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function spendGasless(instance, signer, cfg, amountConf, label) {
  const chainId = BigInt(cfg.chainId ?? 11155111);
  console.log(`\n▶ ${label}`);
  console.log(`  requested amount (encrypted before it leaves this process): ${amountConf / ONE} ${cfg.symbol}`);

  // 1) encrypt the amount, bound to (module, agent smart account = the spend's msg.sender)
  const input = instance.createEncryptedInput(cfg.module, cfg.agentSmartAccount);
  input.add64(amountConf);
  const enc = await input.encrypt();
  const handle = hexlify(enc.handles[0]);
  const proof = hexlify(enc.inputProof);

  // 2) spend(token, ownerSmartAccount, to=agent, encAmount, proof) — clamped to the hidden cap
  const data = MODULE_IFACE.encodeFunctionData("spend", [
    cfg.token,
    cfg.ownerSmartAccount,
    cfg.agentSmartAccount,
    handle,
    proof,
  ]);

  // 3) build → sponsor → sign → send a gasless UserOperation from the agent's smart account
  const account = new SafeAccountV0_3_0(cfg.agentSmartAccount);
  let userOp = await account.createUserOperation(
    [{ to: cfg.module, value: 0n, data }],
    cfg.rpc,
    cfg.bundlerUrl,
    { callGasLimit: CALL_GAS_LIMIT, maxPriorityFeePerGas: MAX_PRIORITY_FEE, maxFeePerGas: MAX_FEE }
  );

  const paymaster = new Erc7677Paymaster(cfg.paymasterUrl, { chainId });
  const { userOperation } = await paymaster.createPaymasterUserOperation(
    account,
    userOp,
    cfg.bundlerUrl,
    cfg.sponsorshipPolicyId ? { sponsorshipPolicyId: cfg.sponsorshipPolicyId } : {}
  );
  userOp = userOperation;

  const eip712 = account.getUserOperationEip712Data(userOp, chainId);
  const types = { ...eip712.types };
  delete types.EIP712Domain;
  const signature = await signer.signTypedData(eip712.domain, types, eip712.messageValue);
  userOp.signature = SafeAccountV0_3_0.formatEip712SingleSignatureToUseroperationSignature(signature);

  const resp = await account.sendUserOperation(userOp, cfg.bundlerUrl);
  console.log(`  userOp ${resp.userOperationHash} — sponsored (agent paid 0 gas)…`);
  const receipt = await resp.included();
  const txh = receipt?.receipt?.transactionHash ?? receipt?.transactionHash;
  console.log(`  ✅ mined${txh ? ` (tx ${txh})` : ""} — the agent submitted a ciphertext and never saw the limit.`);
}

async function main() {
  const cfg = loadConfig();
  const signer = new Wallet(cfg.agentPrivateKey);

  console.log("──────────────────────────────────────────────────────────────");
  console.log(" Confidential Agent Allowance — GASLESS demo");
  console.log(`  agent account     ${cfg.agentSmartAccount}  (gasless 4337, owned by the agent key)`);
  console.log(`  owner (spend from) ${cfg.ownerSmartAccount}`);
  console.log(`  token             ${cfg.symbol} (${cfg.token})`);
  console.log(`  module            ${cfg.module}`);
  console.log("  agent ETH needed: 0  (spends are paymaster-sponsored)");
  console.log("──────────────────────────────────────────────────────────────");

  const instance = await createInstance({ ...SepoliaConfig, network: cfg.rpc });

  // 1) a spend the owner's hidden budget comfortably covers → settles the real amount.
  await spendGasless(instance, signer, cfg, 30n * ONE, "Under-budget spend: 30 (agent guesses it's safe)");

  // 2) a spend WAY over any sane budget → the FHE cap clamps it to 0. Agent gets no error, no hint.
  await spendGasless(instance, signer, cfg, 100_000n * ONE, "Over-budget spend: 100,000 (agent overreaches)");

  console.log("\n──────────────────────────────────────────────────────────────");
  console.log(" Done. What just happened:");
  console.log("  • The agent held NO ETH — both spends were paymaster-sponsored UserOps.");
  console.log("  • Both were accepted on-chain — same success, no revert.");
  console.log("  • The FHE spending-limit module clamped each transfer to your ENCRYPTED cap:");
  console.log("      the 30 settled; the 100,000 settled 0.");
  console.log("  • The agent submitted only ciphertext and never learned the cap or remaining balance.");
  console.log("  → Wallet → Spending Limits → paste the agent account → Decrypt: only YOU see");
  console.log("    limit / spent / remaining. 'Spent' rose by 30, not 100,030.");
  console.log("──────────────────────────────────────────────────────────────");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
