import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";

/**
 * THE headline FHE test (build order step 2 + confidentiality invariant §5C).
 * Encrypted spending limits enforced entirely on ciphertext:
 *   - set an ENCRYPTED cap for a key (FHE.fromExternal + ACL to owner only);
 *   - spend under the cap → running total updates (FHE.add);
 *   - spend over the cap → clamps to 0, no revert, no leak (FHE.le + FHE.select);
 *   - period roll-over resets the encrypted total;
 *   - the KEY can NOT decrypt the limit or the total — only the OWNER can (the whole point).
 *
 * EOA-direct here (owner + key are plain signers) to prove the FHE in isolation; the account
 * execution-path wiring (§5A/§5B) is proven in SpendingLimit4337.test.ts.
 */
describe("SpendingLimitModule (encrypted spending limits)", function () {
  let token: any;
  let mod: any;
  let tokenAddr: string;
  let modAddr: string;

  let deployer: HardhatEthersSigner;
  let owner: HardhatEthersSigner; // holds funds, sets the limit
  let key: HardhatEthersSigner; // the granted session key (spends, must not see the limit)
  let payee: HardhatEthersSigner; // receives spends

  const M = 1_000_000n; // 6-decimal micro-units
  const FAR_FUTURE = 4_000_000_000; // operator approval window (year 2096)

  before(async function () {
    [deployer, owner, key, payee] = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();

    const Token = await ethers.getContractFactory("ConfidentialToken");
    token = await Token.connect(deployer).deploy("Confidential USD", "cUSD", "");
    tokenAddr = await token.getAddress();

    const Mod = await ethers.getContractFactory("SpendingLimitModule");
    mod = await Mod.connect(deployer).deploy(tokenAddr);
    modAddr = await mod.getAddress();

    // Fund the owner and approve the module as an ERC-7984 operator on the owner's balance.
    await (await token.mint(owner.address, 1_000n * M)).wait();
    await (await token.connect(owner).setOperator(modAddr, FAR_FUTURE)).wait();
  });

  async function encFor(addr: string, sender: HardhatEthersSigner, amount: bigint) {
    const input = fhevm.createEncryptedInput(addr, sender.address);
    input.add64(amount);
    return input.encrypt();
  }

  async function setLimit(cap: bigint, periodLength: number) {
    // Owner encrypts the cap against (module, owner) and stores it for `key`.
    const { handles, inputProof } = await encFor(modAddr, owner, cap);
    await (await mod.connect(owner).setLimit(key.address, handles[0], inputProof, periodLength)).wait();
  }

  async function spend(amount: bigint) {
    // Key encrypts the amount against (module, key) and spends from the owner's account.
    const { handles, inputProof } = await encFor(modAddr, key, amount);
    await (await mod.connect(key).spend(owner.address, payee.address, handles[0], inputProof)).wait();
  }

  async function spentByKey(): Promise<bigint> {
    const enc = await mod.spentOf(owner.address, key.address);
    if (enc === ethers.ZeroHash) return 0n;
    return fhevm.userDecryptEuint(FhevmType.euint64, enc, modAddr, owner); // OWNER decrypts
  }

  async function payeeBalance(): Promise<bigint> {
    const enc = await token.confidentialBalanceOf(payee.address);
    if (enc === ethers.ZeroHash) return 0n;
    return fhevm.userDecryptEuint(FhevmType.euint64, enc, tokenAddr, payee);
  }

  it("spends under the encrypted cap and tracks the encrypted running total", async function () {
    await setLimit(100n * M, 86_400); // 100 cUSD / day

    await spend(30n * M);
    expect(await spentByKey()).to.equal(30n * M);
    expect(await payeeBalance()).to.equal(30n * M);

    await spend(50n * M);
    expect(await spentByKey()).to.equal(80n * M);
    expect(await payeeBalance()).to.equal(80n * M);
  });

  it("clamps a spend that would exceed the cap to zero (no revert, no leak)", async function () {
    await setLimit(100n * M, 86_400);
    await spend(80n * M); // total 80
    expect(await spentByKey()).to.equal(80n * M);

    // 80 + 40 = 120 > 100 → clamp to 0: nothing moves, total unchanged, no revert.
    await spend(40n * M);
    expect(await spentByKey()).to.equal(80n * M);
    expect(await payeeBalance()).to.equal(80n * M);

    // Exactly to the cap is allowed: 80 + 20 = 100.
    await spend(20n * M);
    expect(await spentByKey()).to.equal(100n * M);
    expect(await payeeBalance()).to.equal(100n * M);
  });

  it("resets the encrypted running total when the period rolls over", async function () {
    await setLimit(100n * M, 3_600); // 100 / hour
    await spend(90n * M);
    expect(await spentByKey()).to.equal(90n * M);

    // Advance past the period → next spend resets the total first.
    await ethers.provider.send("evm_increaseTime", [7_200]);
    await ethers.provider.send("evm_mine", []);

    await spend(60n * M); // fresh period: 60 <= 100
    expect(await spentByKey()).to.equal(60n * M);
    expect(await payeeBalance()).to.equal(150n * M); // 90 + 60 total moved
  });

  it("hides the limit and running total from the key — only the owner can decrypt", async function () {
    await setLimit(100n * M, 86_400);
    await spend(25n * M);

    // Owner CAN decrypt both.
    const limitHandle = await mod.limitOf(owner.address, key.address);
    expect(await fhevm.userDecryptEuint(FhevmType.euint64, limitHandle, modAddr, owner)).to.equal(100n * M);
    expect(await spentByKey()).to.equal(25n * M);

    // Key CANNOT decrypt either (not in the ACL) — the confidentiality invariant.
    let keyLimitRejected = false;
    try {
      await fhevm.userDecryptEuint(FhevmType.euint64, limitHandle, modAddr, key);
    } catch {
      keyLimitRejected = true;
    }
    expect(keyLimitRejected, "key must not decrypt the limit").to.equal(true);

    const spentHandle = await mod.spentOf(owner.address, key.address);
    let keySpentRejected = false;
    try {
      await fhevm.userDecryptEuint(FhevmType.euint64, spentHandle, modAddr, key);
    } catch {
      keySpentRejected = true;
    }
    expect(keySpentRejected, "key must not decrypt the running total").to.equal(true);
  });

  it("stops a revoked key from spending", async function () {
    await setLimit(100n * M, 86_400);
    await spend(10n * M);
    await (await mod.connect(owner).revokeKey(key.address)).wait();

    const { handles, inputProof } = await encFor(modAddr, key, 10n * M);
    await expect(
      mod.connect(key).spend(owner.address, payee.address, handles[0], inputProof),
    ).to.be.revertedWith("no policy");
  });
});
