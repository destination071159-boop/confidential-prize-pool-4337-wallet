import { ethers, network } from "hardhat";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

/**
 * Deploy the Spending-Limit wallet's FHE contracts to Sepolia and export addresses + ABIs to the
 * app: the ERC-7984 token (the asset spent) and the SpendingLimitModule (the encrypted-policy headline).
 *
 * Usage: npx hardhat run scripts/deploy.ts --network sepolia
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

  const Token = await ethers.getContractFactory("ConfidentialToken");
  const token = await Token.deploy("Confidential USD", "cUSD", "");
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log(`\n✅ ConfidentialToken deployed: ${tokenAddr}`);

  const Mod = await ethers.getContractFactory("SpendingLimitModule");
  const mod = await Mod.deploy(tokenAddr);
  await mod.waitForDeployment();
  const modAddr = await mod.getAddress();
  console.log(`✅ SpendingLimitModule deployed: ${modAddr}`);

  const outDir = join(__dirname, "..", "..", "app", "lib");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  writeFileSync(
    join(outDir, "ConfidentialToken.abi.json"),
    (await ethers.getContractFactory("ConfidentialToken")).interface.formatJson(),
  );
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
        confidentialToken: tokenAddr,
        spendingLimitModule: modAddr,
        deployedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`\n📝 Wrote app/lib/deployment.json + token/module ABIs`);
  console.log(`\nSet in app/.env.local:`);
  console.log(`  NEXT_PUBLIC_CONFIDENTIAL_TOKEN=${tokenAddr}`);
  console.log(`  NEXT_PUBLIC_SPENDING_LIMIT_MODULE=${modAddr}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
