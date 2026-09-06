import { ethers, fhevm } from "hardhat";
async function main() {
  // @ts-ignore
  if (fhevm.initializeCLIApi) await fhevm.initializeCLIApi();
  const [owner] = await ethers.getSigners();
  const POOL = "0x63277297F8923DC27548EAaf11ee1FcfF2724EE7";
  const CUSDC = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639";
  const USDC  = "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF";
  const PRIZE_TAG = ethers.keccak256(ethers.toUtf8Bytes("CONFIDENTIAL_PRIZE_POOL:PRIZE"));
  const amount = 500n * 1_000_000n; // 500 cUSDC (6-dec)

  const usdc  = new ethers.Contract(USDC,  ["function mint(address,uint256)","function approve(address,uint256)"], owner);
  const cusdc = new ethers.Contract(CUSDC, ["function wrap(address,uint256)","function confidentialTransferAndCall(address,bytes32,bytes,bytes) returns (bytes32)"], owner);

  console.log("owner:", owner.address);
  console.log("mint…");    await (await usdc.mint(owner.address, amount)).wait();
  console.log("approve…"); await (await usdc.approve(CUSDC, amount)).wait();
  console.log("wrap…");    await (await cusdc.wrap(owner.address, amount)).wait();

  console.log("encrypt prize amount (bound to cUSDC token)…");
  const enc = await fhevm.createEncryptedInput(CUSDC, owner.address).add64(amount).encrypt();
  const prizeData = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [PRIZE_TAG]);

  console.log("fund prize reserve…");
  await (await cusdc.confidentialTransferAndCall(POOL, enc.handles[0], enc.inputProof, prizeData)).wait();
  console.log("✅ prize reserve funded with 500 cUSDC");
}
main().catch(e=>{console.error("ERR:", e.message||e);process.exit(1);});
