import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";

/**
 * Build order step 1: prove the FHE core EOA-direct before routing through the account.
 * mint → confidentialTransfer between two signers → decrypt both balances.
 */
describe("ConfidentialToken (EOA-direct FHE core)", function () {
  let token: any;
  let tokenAddr: string;
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  before(async function () {
    [deployer, alice, bob] = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    const Token = await ethers.getContractFactory("ConfidentialToken");
    token = await Token.connect(deployer).deploy("Confidential USD", "cUSD", "");
    tokenAddr = await token.getAddress();
  });

  async function balanceOf(holder: HardhatEthersSigner): Promise<bigint> {
    const enc = await token.confidentialBalanceOf(holder.address);
    if (enc === ethers.ZeroHash) return 0n;
    return fhevm.userDecryptEuint(FhevmType.euint64, enc, tokenAddr, holder);
  }

  it("mints an encrypted balance the owner can decrypt", async function () {
    await (await token.mint(alice.address, 1_000_000n)).wait();
    expect(await balanceOf(alice)).to.equal(1_000_000n);
  });

  it("moves an encrypted amount between two accounts", async function () {
    await (await token.mint(alice.address, 1_000_000n)).wait();

    const input = fhevm.createEncryptedInput(tokenAddr, alice.address);
    input.add64(300_000n);
    const { handles, inputProof } = await input.encrypt();

    await (
      await token
        .connect(alice)
        ["confidentialTransfer(address,bytes32,bytes)"](bob.address, handles[0], inputProof)
    ).wait();

    expect(await balanceOf(alice)).to.equal(700_000n);
    expect(await balanceOf(bob)).to.equal(300_000n);
  });
});
