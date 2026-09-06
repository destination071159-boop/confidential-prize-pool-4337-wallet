import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

/**
 * Deploy the MULTI-TOKEN SpendingLimitModule (policies keyed by token) and fund the demo smart
 * account with a few ZhieldWrap confidential tokens by wrapping their underlyings. One module now
 * serves a whole registry of confidential assets.
 */
const SMART = "0x4B8192BB2600477e555320512986F4058B136c41";
const M = 1_000_000n;

// ZhieldWrap registry (Sepolia). confidential decimals are all 6; underlyingDecimals drives wrap.
const REGISTRY = [
  { symbol: "cUSDC", name: "Confidential USDC", token: "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639", underlying: "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF", underlyingDecimals: 6 },
  { symbol: "cUSDT", name: "Confidential USDT", token: "0x4E7B06D78965594eB5EF5414c357ca21E1554491", underlying: "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0", underlyingDecimals: 6 },
  { symbol: "cWETH", name: "Confidential WETH", token: "0x46208622DA27d91db4f0393733C8BA082ed83158", underlying: "0xff54739b16576FA5402F211D0b938469Ab9A5f3F", underlyingDecimals: 18 },
  { symbol: "cZAMA", name: "Confidential ZAMA", token: "0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB", underlying: "0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57", underlyingDecimals: 18 },
  { symbol: "cBRON", name: "Confidential BRON", token: "0xaa5612FA27c927a0c7961f5AEFEE5ba3A0F9C891", underlying: "0xFf021fB13cA64e5354c62c954b949a88cfDEb25E", underlyingDecimals: 18 },
  { symbol: "ctGBP", name: "Confidential tGBP", token: "0xfCE5c7069c5525eF6c8C2b2E35A745bA20a2F7CC", underlying: "0x93c931278A2aad1916783F952f94276eA5111442", underlyingDecimals: 18 },
  { symbol: "cXAUt", name: "Confidential XAUt", token: "0xe4FcF848739845BC81Dee1d5352cf3844F0a60C7", underlying: "0x24377AE4AA0C45ecEe71225007f17c5D423dd940", underlyingDecimals: 18 },
];

async function fund(deployer: any, entry: (typeof REGISTRY)[number], confAmount: bigint) {
  const underlyingAmt = confAmount * 10n ** BigInt(entry.underlyingDecimals - 6); // conf is 6-dec
  const u = new ethers.Contract(entry.underlying, [
    "function mint(address,uint256)",
    "function approve(address,uint256) returns (bool)",
  ], deployer);
  const w = new ethers.Contract(entry.token, ["function wrap(address,uint256) returns (bytes32)"], deployer);
  await (await u.mint(deployer.address, underlyingAmt)).wait();
  await (await u.approve(entry.token, underlyingAmt)).wait();
  await (await w.wrap(SMART, underlyingAmt)).wait();
  console.log(`  ✅ wrapped → ${entry.symbol}`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Network: ${network.name}\nDeployer: ${deployer.address}`);

  const Mod = await ethers.getContractFactory("SpendingLimitModule");
  const mod = await Mod.deploy();
  await mod.waitForDeployment();
  const modAddr = await mod.getAddress();
  console.log(`\n✅ SpendingLimitModule (multi-token) deployed: ${modAddr}`);

  console.log(`\nFunding ${SMART} with a few ZW confidential tokens…`);
  await fund(deployer, REGISTRY[1], 300n * M); // cUSDT
  await fund(deployer, REGISTRY[2], 5n * M);   // cWETH
  await fund(deployer, REGISTRY[3], 250n * M); // cZAMA
  // (cUSDC was funded by the earlier single-token deploy)

  const outDir = join(__dirname, "..", "..", "app", "lib");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "SpendingLimitModule.abi.json"), Mod.interface.formatJson());
  writeFileSync(join(outDir, "registry.json"), JSON.stringify(REGISTRY, null, 2));
  writeFileSync(
    join(outDir, "deployment.json"),
    JSON.stringify(
      { chainId: Number((await ethers.provider.getNetwork()).chainId), network: network.name, spendingLimitModule: modAddr, registry: "ZhieldWrap", deployedAt: new Date().toISOString() },
      null, 2,
    ),
  );
  console.log(`\n📝 Wrote app/lib (module ABI, registry.json, deployment.json)`);
  console.log(`\nSet NEXT_PUBLIC_SPENDING_LIMIT_MODULE=${modAddr}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
