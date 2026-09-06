import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";

// Reference test for ConfidentialVault.sol — mirrors this workspace's Hardhat + @fhevm conventions
// (see references/testing.md). Deploy path assumes the contract is compiled under its name.

describe("ConfidentialVault", function () {
  let vault: any;
  let vaultAddr: string;
  let signers: HardhatEthersSigner[];

  before(async function () {
    signers = await ethers.getSigners();
  });

  beforeEach(async function () {
    // FHE ops only run on the mock network — skip elsewhere.
    if (!fhevm.isMock) this.skip();

    const factory = await ethers.getContractFactory("ConfidentialVault");
    vault = await factory.deploy();
    vaultAddr = await vault.getAddress();
  });

  // Helper: build a single-euint64 encrypted input bound to (vault, sender).
  async function encAmount(amount: number, sender: HardhatEthersSigner) {
    const input = fhevm.createEncryptedInput(vaultAddr, sender.address);
    input.add64(amount);
    return input.encrypt(); // -> { handles, inputProof }
  }

  // Helper: decrypt the caller's own balance handle.
  async function readBalance(user: HardhatEthersSigner): Promise<bigint> {
    const enc = await vault.connect(user).myBalance();
    return fhevm.userDecryptEuint(FhevmType.euint64, enc, vaultAddr, user);
  }

  it("credits an encrypted deposit", async function () {
    const user = signers[1];
    const { handles, inputProof } = await encAmount(1_000, user);
    await vault.connect(user).deposit(handles[0], inputProof);

    expect(await readBalance(user)).to.equal(1_000n);
  });

  it("accumulates multiple deposits (init-or-add)", async function () {
    const user = signers[1];

    let enc = await encAmount(1_000, user);
    await vault.connect(user).deposit(enc.handles[0], enc.inputProof);

    enc = await encAmount(500, user);
    await vault.connect(user).deposit(enc.handles[0], enc.inputProof);

    expect(await readBalance(user)).to.equal(1_500n);
  });

  it("withdraws up to the balance", async function () {
    const user = signers[1];

    let enc = await encAmount(1_000, user);
    await vault.connect(user).deposit(enc.handles[0], enc.inputProof);

    enc = await encAmount(400, user);
    await vault.connect(user).withdraw(enc.handles[0], enc.inputProof);

    expect(await readBalance(user)).to.equal(600n);
  });

  it("clamps an over-withdrawal instead of reverting", async function () {
    const user = signers[1];

    let enc = await encAmount(1_000, user);
    await vault.connect(user).deposit(enc.handles[0], enc.inputProof);

    // Ask for more than the balance — FHE.select clamps to 1_000, leaving 0.
    enc = await encAmount(5_000, user);
    await vault.connect(user).withdraw(enc.handles[0], enc.inputProof);

    expect(await readBalance(user)).to.equal(0n);
  });

  it("reveals a balance via the Form-B request/fulfill flow", async function () {
    const user = signers[1];

    const enc = await encAmount(2_500, user);
    await vault.connect(user).deposit(enc.handles[0], enc.inputProof);

    // 1) request: marks the handle publicly decryptable and stores it under a requestId.
    const tx = await vault.connect(user).requestBalanceReveal();
    const receipt = await tx.wait();
    const requested = receipt.logs
      .map((l: any) => vault.interface.parseLog(l))
      .find((e: any) => e && e.name === "BalanceRevealRequested");
    const requestId: bigint = requested.args.requestId;

    // 2) off-chain: publicly decrypt the stored handle.
    const pending = await vault.pendingReveals(requestId);
    const result = await fhevm.publicDecrypt([pending.balanceHandle]);

    // 3) fulfill: feed the cleartext + proof back on-chain (checkSignatures verifies it).
    await expect(
      vault
        .connect(signers[0])
        .fulfillBalanceReveal(requestId, result.abiEncodedClearValues, result.decryptionProof),
    )
      .to.emit(vault, "BalanceRevealed")
      .withArgs(user.address, requestId, 2_500n);
  });
});
