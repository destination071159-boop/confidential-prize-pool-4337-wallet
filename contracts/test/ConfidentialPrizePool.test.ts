import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";

// Full-cycle test for ConfidentialPrizePool: deposit → fund prize → draw → claim → no-loss withdraw.
// FHE ops only run on the mock network.
describe("ConfidentialPrizePool", function () {
  let token: any;
  let tokenAddr: string;
  let pool: any;
  let poolAddr: string;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let carol: HardhatEthersSigner;

  const PRIZE_TAG = ethers.keccak256(ethers.toUtf8Bytes("CONFIDENTIAL_PRIZE_POOL:PRIZE"));

  before(async function () {
    [owner, alice, bob, carol] = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    const Token = await ethers.getContractFactory("ConfidentialToken");
    token = await Token.deploy("Confidential USD", "cUSD", "");
    tokenAddr = await token.getAddress();

    const Pool = await ethers.getContractFactory("ConfidentialPrizePool");
    pool = await Pool.deploy(tokenAddr, 0); // drawInterval 0 → owner can draw anytime
    poolAddr = await pool.getAddress();
  });

  // Deposit `amount` from `user` into the pool via the ERC-7984 receiver flow.
  async function deposit(user: HardhatEthersSigner, amount: number, data = "0x") {
    await token.mint(user.address, amount);
    const input = fhevm.createEncryptedInput(tokenAddr, user.address); // bound to TOKEN
    input.add64(amount);
    const { handles, inputProof } = await input.encrypt();
    await token
      .connect(user)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](poolAddr, handles[0], inputProof, data);
  }

  async function readBalance(user: HardhatEthersSigner): Promise<bigint> {
    const h = await pool.confidentialBalanceOf(user.address);
    return fhevm.userDecryptEuint(FhevmType.euint64, h, poolAddr, user);
  }
  async function readWinnings(user: HardhatEthersSigner): Promise<bigint> {
    const h = await pool.confidentialWinningsOf(user.address);
    if (h === ethers.ZeroHash) return 0n;
    return fhevm.userDecryptEuint(FhevmType.euint64, h, poolAddr, user);
  }
  async function readTokenBal(user: HardhatEthersSigner): Promise<bigint> {
    const h = await token.confidentialBalanceOf(user.address);
    if (h === ethers.ZeroHash) return 0n;
    return fhevm.userDecryptEuint(FhevmType.euint64, h, tokenAddr, user);
  }

  it("credits encrypted deposits and tracks depositors", async function () {
    await deposit(alice, 1_000);
    await deposit(bob, 3_000);
    expect(await readBalance(alice)).to.equal(1_000n);
    expect(await readBalance(bob)).to.equal(3_000n);
    expect(await pool.depositorCount()).to.equal(2n);
  });

  it("runs a draw and awards the full prize to exactly one depositor", async function () {
    await deposit(alice, 1_000);
    await deposit(bob, 2_000);
    await deposit(carol, 5_000);

    // owner funds the prize reserve (data == PRIZE_TAG)
    const prize = 900;
    await deposit(owner, prize, ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [PRIZE_TAG]));

    await pool.connect(owner).draw();
    expect(await pool.drawCount()).to.equal(1n);

    const w = [await readWinnings(alice), await readWinnings(bob), await readWinnings(carol)];
    const winners = w.filter((x) => x > 0n);
    expect(winners.length, "exactly one winner").to.equal(1);
    expect(winners[0], "winner gets the full prize").to.equal(BigInt(prize));
    expect(w.reduce((a, b) => a + b, 0n), "total awarded == prize").to.equal(BigInt(prize));
  });

  it("lets the winner claim and guarantees no-loss principal withdrawal", async function () {
    await deposit(alice, 1_000);
    await deposit(bob, 2_000);
    const prize = 500;
    await deposit(owner, prize, ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [PRIZE_TAG]));
    await pool.connect(owner).draw();

    // whichever of alice/bob won, they claim and receive the prize in tokens
    const winner = (await readWinnings(alice)) > 0n ? alice : bob;
    const before = await readTokenBal(winner);
    await pool.connect(winner).claim();
    expect(await readTokenBal(winner)).to.equal(before + BigInt(prize));
    expect(await readWinnings(winner)).to.equal(0n);

    // no loss: both can withdraw their full principal any time
    for (const [u, amt] of [[alice, 1_000], [bob, 2_000]] as const) {
      const input = fhevm.createEncryptedInput(poolAddr, u.address);
      input.add64(amt);
      const { handles, inputProof } = await input.encrypt();
      const tBefore = await readTokenBal(u);
      await pool.connect(u).withdraw(handles[0], inputProof);
      expect(await readBalance(u), "principal fully withdrawn").to.equal(0n);
      expect(await readTokenBal(u)).to.equal(tBefore + BigInt(amt));
    }
  });
});
