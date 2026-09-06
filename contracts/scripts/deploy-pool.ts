import { ethers, artifacts } from "hardhat";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Deploy ConfidentialPrizePool against the existing ZhieldWrap cUSDC wrapper (ERC-7984), so the
 * deposit flow is the bounty's "ERC-20 approve → wrap → deposit", and USDCMock.mint() is the faucet.
 *   npx hardhat run scripts/deploy-pool.ts --network sepolia
 */
const CUSDC = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639"; // cUSDC (ERC7984ERC20Wrapper)
const USDC_UNDERLYING = "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF"; // USDCMock (ERC-20, mintable = faucet)
const DRAW_INTERVAL = 0; // 0 = admin/keeper can draw anytime (documented keeper flow)

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("deployer:", deployer.address);
  console.log("balance :", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const Pool = await ethers.getContractFactory("ConfidentialPrizePool");
  const pool = await Pool.deploy(CUSDC, DRAW_INTERVAL);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("ConfidentialPrizePool:", poolAddr);

  const art = await artifacts.readArtifact("ConfidentialPrizePool");
  const out = {
    chainId: 11155111,
    pool: poolAddr,
    token: CUSDC,
    tokenSymbol: "cUSDC",
    underlying: USDC_UNDERLYING,
    underlyingDecimals: 6,
    owner: deployer.address,
    drawInterval: DRAW_INTERVAL,
    deployedAt: new Date().toISOString(),
  };

  const dir = join(__dirname, "..", "deployments");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "prize-pool.json"), JSON.stringify(out, null, 2));
  writeFileSync(join(dir, "ConfidentialPrizePool.abi.json"), JSON.stringify(art.abi, null, 2));
  console.log("saved → contracts/deployments/{prize-pool.json, ConfidentialPrizePool.abi.json}");
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
