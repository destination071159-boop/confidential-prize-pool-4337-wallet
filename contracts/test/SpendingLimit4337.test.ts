import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";

/**
 * The de-risking test (context §5A + §5B, build order step 3).
 *
 * §5A — the encrypted cap check must run in the EXECUTION phase, never in validateUserOp. Here the
 *       owner's operations (approve operator, set the encrypted limit) run through the account's
 *       `execute`; the key's spend runs as an ordinary call. No FHE ever touches validation.
 * §5B — `FHE.fromExternal` binds the proof to `(module, caller)`. When the SMART ACCOUNT sets the
 *       limit via `execute`, the caller is the ACCOUNT, so the limit must be encrypted against the
 *       account address — not the EOA. Proven both ways below.
 *
 * Uses the real eth-infinitism SimpleAccount behind its ERC1967Proxy (owner-path execute == the same
 * seam a bundler drives via the EntryPoint — the account is the caller either way).
 */
describe("Spending-limit 4337 seam — policy set via account.execute, key spends under the cap", function () {
  const ENTRYPOINT_PLACEHOLDER = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
  const FAR_FUTURE = 4_000_000_000;
  const M = 1_000_000n;

  let token: any;
  let mod: any;
  let tokenAddr: string;
  let modAddr: string;
  let accountImpl: any;

  let deployer: HardhatEthersSigner;
  let ownerEOA: HardhatEthersSigner; // owns the smart account
  let keyEOA: HardhatEthersSigner; // the granted session key (spends)
  let payee: HardhatEthersSigner;

  before(async function () {
    [deployer, ownerEOA, keyEOA, payee] = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();

    const Token = await ethers.getContractFactory("ConfidentialToken");
    token = await Token.connect(deployer).deploy("Confidential USD", "cUSD", "");
    tokenAddr = await token.getAddress();

    const Mod = await ethers.getContractFactory("SpendingLimitModule");
    mod = await Mod.connect(deployer).deploy(tokenAddr);
    modAddr = await mod.getAddress();

    const Impl = await ethers.getContractFactory("SimpleAccount");
    accountImpl = await Impl.connect(deployer).deploy(ENTRYPOINT_PLACEHOLDER);
  });

  async function getAccount(owner: HardhatEthersSigner) {
    const initData = accountImpl.interface.encodeFunctionData("initialize", [owner.address]);
    const Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const proxy = await Proxy.connect(deployer).deploy(await accountImpl.getAddress(), initData);
    const addr = await proxy.getAddress();
    const account = await ethers.getContractAt("SimpleAccount", addr);
    return { addr, account };
  }

  async function encFor(addr: string, sender: string, amount: bigint) {
    const input = fhevm.createEncryptedInput(addr, sender);
    input.add64(amount);
    return input.encrypt();
  }

  async function payeeBalance(): Promise<bigint> {
    const enc = await token.confidentialBalanceOf(payee.address);
    if (enc === ethers.ZeroHash) return 0n;
    return fhevm.userDecryptEuint(FhevmType.euint64, enc, tokenAddr, payee);
  }

  it("sets the encrypted limit through account.execute and lets the key spend under the cap", async function () {
    const { addr: accountAddr, account } = await getAccount(ownerEOA);

    // Fund the smart account and let the owner's EOA view its policies (viewer bridge).
    await (await token.mint(accountAddr, 1_000n * M)).wait();
    await (
      await account
        .connect(ownerEOA)
        .execute(modAddr, 0, mod.interface.encodeFunctionData("setPolicyViewer", [ownerEOA.address]))
    ).wait();

    // Owner op #1 (via execute): approve the module as an ERC-7984 operator on the account's balance.
    await (
      await account
        .connect(ownerEOA)
        .execute(tokenAddr, 0, token.interface.encodeFunctionData("setOperator", [modAddr, FAR_FUTURE]))
    ).wait();

    // Owner op #2 (via execute): set an ENCRYPTED 100 cUSD/day cap for keyEOA.
    // §5B: the ACCOUNT is the caller of setLimit, so encrypt the limit against the ACCOUNT address.
    const encLimit = await encFor(modAddr, accountAddr, 100n * M);
    await (
      await account
        .connect(ownerEOA)
        .execute(
          modAddr,
          0,
          mod.interface.encodeFunctionData("setLimit", [
            keyEOA.address,
            encLimit.handles[0],
            encLimit.inputProof,
            86_400,
          ]),
        )
    ).wait();

    // The owner's EOA (registered viewer) can decrypt the account's limit.
    const limitHandle = await mod.limitOf(accountAddr, keyEOA.address);
    expect(await fhevm.userDecryptEuint(FhevmType.euint64, limitHandle, modAddr, ownerEOA)).to.equal(100n * M);

    // The KEY spends 40 from the account → allowed. Proof bound to (module, KEY).
    let s = await encFor(modAddr, keyEOA.address, 40n * M);
    await (await mod.connect(keyEOA).spend(accountAddr, payee.address, s.handles[0], s.inputProof)).wait();
    expect(await payeeBalance()).to.equal(40n * M);

    // The KEY tries 70 more (40+70=110 > 100) → clamps to 0, nothing moves.
    s = await encFor(modAddr, keyEOA.address, 70n * M);
    await (await mod.connect(keyEOA).spend(accountAddr, payee.address, s.handles[0], s.inputProof)).wait();
    expect(await payeeBalance()).to.equal(40n * M); // unchanged

    // 60 more (40+60=100) is exactly at the cap → allowed.
    s = await encFor(modAddr, keyEOA.address, 60n * M);
    await (await mod.connect(keyEOA).spend(accountAddr, payee.address, s.handles[0], s.inputProof)).wait();
    expect(await payeeBalance()).to.equal(100n * M);
  });

  it("rejects a limit proof bound to the EOA instead of the account (the §5B failure mode)", async function () {
    const { addr: accountAddr, account } = await getAccount(ownerEOA);
    await (await token.mint(accountAddr, 1_000n * M)).wait();

    // WRONG: encrypt the limit against the owner EOA, but the ACCOUNT is the caller of setLimit.
    const encLimit = await encFor(modAddr, ownerEOA.address, 100n * M);
    await expect(
      account
        .connect(ownerEOA)
        .execute(
          modAddr,
          0,
          mod.interface.encodeFunctionData("setLimit", [
            keyEOA.address,
            encLimit.handles[0],
            encLimit.inputProof,
            86_400,
          ]),
        ),
    ).to.be.reverted;
  });
});
