// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, euint128, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";

/**
 * @title ConfidentialPrizePool
 * @notice A no-loss prize-savings pool (PoolTogether-style) made confidential with the Zama Protocol.
 *
 * Every depositor's principal and the pool total are ERC-7984 ciphertexts (euint64) — no observer
 * can see individual deposit sizes, pool shares, or odds. Principal is withdrawable in full at any
 * time (no loss). At each draw the admin/keeper triggers an ONCHAIN, deposit-weighted winner
 * selection over the encrypted balances using FHE randomness — no offchain RNG, no plaintext
 * balances — and the accrued yield (a mock, admin-funded prize reserve) is awarded to the winner as
 * an encrypted winnings balance. Only the winner learns they won, by decrypting their own winnings
 * via the EIP-712 user-decryption flow.
 *
 * ── Weighted draw (exact, no encrypted division) ─────────────────────────────────────────────
 * Let bal[i] be depositor i's encrypted principal and prefix[i] = bal[0]+..+bal[i], total = prefix[n-1].
 * Draw r = FHE.randEuint64() (encrypted, uniform in [0, 2^64)). Widen to 128 bits and form the
 * scaled ticket  T = r * total  (< 2^128, fits euint128). Depositor i wins iff
 *      prefix[i-1] * 2^64  <=  T  <  prefix[i] * 2^64
 * i.e. i is the first index whose scaled cumulative range contains T. Since r/2^64 is uniform in
 * [0,1), the probability of landing in bucket i equals bal[i]/total — deposit-weighted, exactly,
 * computed entirely on ciphertext with mul + lt + select. No FHE.div/rem by an encrypted value.
 *
 * ── Confidentiality / leakage ────────────────────────────────────────────────────────────────
 * Encrypted (never revealed onchain): every deposit amount, every balance, the pool total, each
 * depositor's odds, the prize amount, and the winner's identity. Public (documented leakage): the
 * set of depositor addresses and the depositor count (the draw loop length), that a deposit/withdraw
 * happened and when, and draw timing. A production build could hide the participant set with
 * stealth addresses / a shielded pool; here it is public for a legible demo.
 *
 * ── Yield source ─────────────────────────────────────────────────────────────────────────────
 * The prize reserve is a MOCK: the admin funds it by sending confidential tokens to this pool with
 * data == PRIZE_TAG (see onConfidentialTransferReceived). A real integration would instead accrue
 * yield from a lending market / LST on the pooled principal and top up the reserve from that yield —
 * the draw + award logic is unchanged.
 */
contract ConfidentialPrizePool is ZamaEthereumConfig, IERC7984Receiver {
    IERC7984 public immutable token; // the confidential (ERC-7984) deposit asset
    address public owner;            // admin / keeper: funds the prize reserve and triggers draws

    // data marker (in confidentialTransferAndCall) that funds the prize reserve instead of depositing
    bytes32 public constant PRIZE_TAG = keccak256("CONFIDENTIAL_PRIZE_POOL:PRIZE");

    address[] public depositors;
    mapping(address => bool) public isDepositor;

    mapping(address => euint64) private _balance;  // encrypted principal per depositor
    euint64 private _total;                          // encrypted pool total (sum of principals)
    mapping(address => euint64) private _winnings;   // encrypted, claimable prize winnings per user
    euint64 private _prizeReserve;                    // encrypted, admin-funded yield reserve

    // A depositor is a 4337 smart account; the human owner (an EOA) can't be inferred on-chain, so the
    // deposit passes its owner EOA in `data` and we grant that EOA decrypt access to the balance/winnings.
    // This lets the owner reveal with a plain user-decryption (no delegated-decrypt round-trip needed).
    mapping(address => address) public viewerOf; // smart account => owner EOA allowed to decrypt

    uint256 public drawCount;
    uint256 public lastDrawTime;
    uint256 public drawInterval; // seconds; a keeper may call draw() once per interval

    event Deposited(address indexed user);
    event Withdrawn(address indexed user);
    event PrizeFunded(address indexed by);
    event DrawCompleted(uint256 indexed drawId, uint256 depositors, uint256 timestamp);
    event Claimed(address indexed user);
    event OwnerChanged(address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(IERC7984 _token, uint256 _drawInterval) {
        token = _token;
        owner = msg.sender;
        drawInterval = _drawInterval;
        lastDrawTime = block.timestamp;
    }

    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    function setDrawInterval(uint256 s) external onlyOwner {
        drawInterval = s;
    }

    function depositorCount() external view returns (uint256) {
        return depositors.length;
    }

    // ── Deposit / fund prize (ERC-7984 receiver callback) ────────────────────────────────────────
    // Users deposit by calling token.confidentialTransferAndCall(pool, encAmount, proof, "0x").
    // The admin funds the prize reserve the same way but with data == abi.encode(PRIZE_TAG).
    function onConfidentialTransferReceived(
        address /* operator */,
        address from,
        euint64 amount,
        bytes calldata data
    ) external override returns (ebool) {
        require(msg.sender == address(token), "only token");

        // `data` semantics: 32 bytes == PRIZE_TAG funds the prize reserve (owner only); otherwise a
        // 32-byte word is the depositor's owner EOA (for decrypt access); empty means no viewer.
        bool isPrize = false;
        address viewer = address(0);
        if (data.length == 32) {
            bytes32 word = abi.decode(data, (bytes32));
            if (word == PRIZE_TAG) {
                isPrize = true;
            } else {
                viewer = address(uint160(uint256(word)));
            }
        }

        // Re-home the incoming handle into a pool-OWNED ciphertext (add to 0). The pool only has
        // TRANSIENT access to `amount` from the token, so persistent FHE.allow on it does not stick.
        // A handle the pool creates via arithmetic is fully owned, so allowThis/allow persist.
        euint64 incoming = FHE.add(amount, FHE.asEuint64(0));

        if (isPrize) {
            // Mock yield source: anyone may top up the prize reserve (in production this would be
            // funded from real yield on the pooled principal — see README). Kept open so the demo can
            // fund the prize in-app from the connected account.
            _prizeReserve = FHE.isInitialized(_prizeReserve) ? FHE.add(_prizeReserve, incoming) : incoming;
            FHE.allowThis(_prizeReserve);
            emit PrizeFunded(from);
        } else {
            _balance[from] = FHE.isInitialized(_balance[from]) ? FHE.add(_balance[from], incoming) : incoming;
            _total = FHE.isInitialized(_total) ? FHE.add(_total, incoming) : incoming;
            FHE.allowThis(_balance[from]);
            FHE.allow(_balance[from], from);
            if (viewer != address(0)) {
                viewerOf[from] = viewer;
                FHE.allow(_balance[from], viewer); // owner EOA can plain user-decrypt its balance
            }
            FHE.allowThis(_total);
            if (!isDepositor[from]) {
                isDepositor[from] = true;
                depositors.push(from);
            }
            emit Deposited(from);
        }

        // The token FHE.select's on this success flag → it needs transient ACL access to it.
        ebool success = FHE.asEbool(true);
        FHE.allowTransient(success, msg.sender);
        return success;
    }

    // ── Withdraw principal (no loss, any time) ───────────────────────────────────────────────────
    function withdraw(externalEuint64 encAmount, bytes calldata inputProof) external {
        euint64 requested = FHE.fromExternal(encAmount, inputProof);
        euint64 bal = _balance[msg.sender];
        require(FHE.isInitialized(bal), "no balance");

        // clamp to available principal — never revert-reveal, never take a loss
        euint64 actual = FHE.select(FHE.ge(bal, requested), requested, bal);

        _balance[msg.sender] = FHE.sub(bal, actual);
        _total = FHE.sub(_total, actual);
        FHE.allowThis(_balance[msg.sender]);
        FHE.allow(_balance[msg.sender], msg.sender);
        if (viewerOf[msg.sender] != address(0)) FHE.allow(_balance[msg.sender], viewerOf[msg.sender]);
        FHE.allowThis(_total);

        FHE.allowTransient(actual, address(token));
        token.confidentialTransfer(msg.sender, actual);
        emit Withdrawn(msg.sender);
    }

    // ── Draw: onchain, deposit-weighted, FHE-random winner selection over encrypted balances ──────
    // Public so any account (or a keeper) can trigger a round; a production build would gate this
    // behind a keeper / drawInterval to prevent draw-grinding. Here drawInterval == 0 (draw anytime).
    function draw() external {
        uint256 n = depositors.length;
        require(n > 0, "no depositors");
        require(block.timestamp >= lastDrawTime + drawInterval || drawInterval == 0, "too early");

        // Random scaled ticket T = r * total, in [0, total * 2^64), computed at 128-bit width.
        euint128 r = FHE.asEuint128(FHE.randEuint64());
        euint128 total128 = FHE.asEuint128(_total);
        euint128 ticket = FHE.mul(r, total128);
        euint128 twoPow64 = FHE.asEuint128(uint128(1) << 64);

        euint64 prize = FHE.isInitialized(_prizeReserve) ? _prizeReserve : FHE.asEuint64(0);
        euint64 zero = FHE.asEuint64(0);

        euint128 prefix = FHE.asEuint128(0);
        ebool prevCrossed = FHE.asEbool(false); // whether an earlier bucket already contained the ticket

        for (uint256 i = 0; i < n; i++) {
            address who = depositors[i];
            euint64 bal = _balance[who];
            euint128 bal128 = FHE.isInitialized(bal) ? FHE.asEuint128(bal) : FHE.asEuint128(0);

            prefix = FHE.add(prefix, bal128);
            euint128 threshold = FHE.mul(prefix, twoPow64); // prefix[i] * 2^64

            // crossed_i: ticket < prefix[i]*2^64. Winner = first i where crossed flips true.
            ebool crossed = FHE.lt(ticket, threshold);
            // notPrev = complement of prevCrossed (no FHE.not in workspace → select-complement)
            ebool notPrev = FHE.select(prevCrossed, FHE.asEbool(false), FHE.asEbool(true));
            ebool isWinner = FHE.and(crossed, notPrev);
            prevCrossed = crossed;

            euint64 award = FHE.select(isWinner, prize, zero);
            _winnings[who] = FHE.isInitialized(_winnings[who]) ? FHE.add(_winnings[who], award) : award;
            FHE.allowThis(_winnings[who]);
            FHE.allow(_winnings[who], who);
            if (viewerOf[who] != address(0)) FHE.allow(_winnings[who], viewerOf[who]);
        }

        // reserve consumed by this draw
        _prizeReserve = FHE.asEuint64(0);
        FHE.allowThis(_prizeReserve);

        drawCount += 1;
        lastDrawTime = block.timestamp;
        emit DrawCompleted(drawCount, n, block.timestamp);
    }

    // ── Claim winnings (winner-only; others claim 0) ─────────────────────────────────────────────
    function claim() external {
        euint64 win = _winnings[msg.sender];
        require(FHE.isInitialized(win), "nothing to claim");

        _winnings[msg.sender] = FHE.asEuint64(0);
        FHE.allowThis(_winnings[msg.sender]);
        FHE.allow(_winnings[msg.sender], msg.sender);
        if (viewerOf[msg.sender] != address(0)) FHE.allow(_winnings[msg.sender], viewerOf[msg.sender]);

        FHE.allowTransient(win, address(token));
        token.confidentialTransfer(msg.sender, win);
        emit Claimed(msg.sender);
    }

    // ── Encrypted views (handles the connected wallet decrypts via EIP-712) ──────────────────────
    function confidentialBalanceOf(address user) external view returns (bytes32) {
        return euint64.unwrap(_balance[user]);
    }

    function confidentialWinningsOf(address user) external view returns (bytes32) {
        return euint64.unwrap(_winnings[user]);
    }

    function confidentialTotal() external view returns (bytes32) {
        return euint64.unwrap(_total);
    }

    function canDraw() external view returns (bool) {
        return depositors.length > 0 && (drawInterval == 0 || block.timestamp >= lastDrawTime + drawInterval);
    }
}
