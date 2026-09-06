import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

/**
 * Deploy the SpendingLimitModule against a REAL ZhieldWrap confidential token (cUSDCMock, an
 * ERC-7984 wrapper of USDCMock), and fund the demo smart account by wrapping USDC → cUSDC.
 *
 * This is the ZW × Spending-Limit merge: hidden per-key spending limits enforced on a real
 * ecosystem confidential token, not a mock faucet token.
 *
 * Usage: npx hardhat run scripts/deploy-zw.ts --network sepolia
 */

// ── ZhieldWrap registry addresses (Sepolia) ──
const CUSDC = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639"; // Confidential USDC (Mock), ERC-7984 wrapper
const USDC = "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF"; // underlying USDCMock (6 decimals)

// The deployer's deterministic 4337 smart account (SafeAccountV0_3_0, already deployed in the SLW demo).
const SMART_ACCOUNT = "0x4B8192BB2600477e555320512986F4058B136c41";

const M = 1_000_000n; // 6-decimal micro-units

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Network: ${network.name}\nDeployer: ${deployer.address}`);

  // 1) Deploy the module bound to the ZW cUSDC token.
  const Mod = await ethers.getContractFactory("SpendingLimitModule");
  const mod = await Mod.deploy(CUSDC);
  await mod.waitForDeployment();
  const modAddr = await mod.getAddress();
  console.log(`\n✅ SpendingLimitModule (→ cUSDC) deployed: ${modAddr}`);

  // 2) Fund the smart account with 500 cUSDC by wrapping real USDC.
  const usdc = new ethers.Contract(
    USDC,
    ["function mint(address to, uint256 amount)", "function approve(address spender, uint256 amount) returns (bool)"],
    deployer,
  );
  const cusdc = new ethers.Contract(CUSDC, ["function wrap(address to, uint256 amount) returns (bytes32)"], deployer);

  const amount = 500n * M;
  console.log(`\nFunding ${SMART_ACCOUNT} with 500 cUSDC (mint USDC → approve → wrap)…`);
  await (await usdc.mint(deployer.address, amount)).wait();
  await (await usdc.approve(CUSDC, amount)).wait();
  await (await cusdc.wrap(SMART_ACCOUNT, amount)).wait();
  console.log(`✅ Wrapped 500 USDC → cUSDC into the smart account`);

  // 3) Export for the app.
  const outDir = join(__dirname, "..", "..", "app", "lib");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // Minimal ERC-7984 wrapper ABI the app needs (setOperator / confidentialBalanceOf / isOperator).
  const tokenAbi = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function setOperator(address operator, uint48 until)",
    "function isOperator(address holder, address spender) view returns (bool)",
    "function confidentialBalanceOf(address account) view returns (bytes32)",
    "function wrap(address to, uint256 amount) returns (bytes32)",
  ];
  writeFileSync(join(outDir, "ConfidentialToken.abi.json"), JSON.stringify(tokenAbi, null, 2));
  writeFileSync(
    join(outDir, "SpendingLimitModule.abi.json"),
    (await ethers.getContractFactory("SpendingLimitModule")).interface.formatJson(),
  );
  writeFileSync(
    join(outDir, "deployment.json"),
    JSON.stringify(
      {
        chainId: Number((await ethers.provider.getNetwork()).chainId),
        network: network.name,
        confidentialToken: CUSDC,
        confidentialTokenSymbol: "cUSDC",
        underlying: USDC,
        spendingLimitModule: modAddr,
        source: "ZhieldWrap registry",
        deployedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`\n📝 Wrote app/lib (token ABI, module ABI, deployment.json)`);
  console.log(`\nSet in app/.env.local:`);
  console.log(`  NEXT_PUBLIC_CONFIDENTIAL_TOKEN=${CUSDC}`);
  console.log(`  NEXT_PUBLIC_SPENDING_LIMIT_MODULE=${modAddr}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
