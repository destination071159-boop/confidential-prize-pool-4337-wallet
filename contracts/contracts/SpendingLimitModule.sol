// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/// @title SpendingLimitModule — encrypted per-key spending limits, for ANY ERC-7984 confidential token.
/// @notice Grant a spending key without revealing your limit. An owner (a 4337 smart account) sets an
///         ENCRYPTED per-key, per-TOKEN spending cap; a granted key can then spend from the owner's
///         confidential balance of that token up to the cap — and the key never learns the limit or how
///         much is left. Limit + running total live as `euint64` ciphertext; every spend checks the cap
///         entirely on encrypted values (`FHE.add`/`FHE.le`/`FHE.select`); only the OWNER decrypts.
///
/// @dev Multi-asset: policies are keyed by `(owner, key, token)`, so one module serves a whole registry
///      of ZhieldWrap confidential tokens (cUSDC, cUSDT, cWETH, …). The owner approves this module as an
///      ERC-7984 operator per token it wants to use. §5A: runs in execution, never validation. §5B:
///      `fromExternal` binds the proof to `(module, msg.sender)` — the owner for `setLimit`, key for `spend`.
contract SpendingLimitModule is ZamaEthereumConfig {
    struct KeyPolicy {
        euint64 limit; // encrypted per-period cap
        euint64 spent; // encrypted running total this period
        uint256 periodStart; // plaintext — timing is not secret
        uint256 periodLength; // plaintext
        bool exists;
    }

    // owner (the smart account) => session key => token => policy
    mapping(address => mapping(address => mapping(address => KeyPolicy))) private _policies;

    // owner => an extra address allowed to decrypt that owner's policies (the owner's EOA, since a
    // smart account is a contract and can't sign a Zama user-decrypt). Never granted to a session key.
    mapping(address => address) public policyViewer;

    event LimitSet(address indexed owner, address indexed key, address indexed token, uint256 periodLength);
    event Spent(address indexed owner, address indexed key, address token, address to); // no amounts
    event KeyRevoked(address indexed owner, address indexed key, address token);
    event PolicyViewerSet(address indexed owner, address indexed viewer);

    /// @notice Register `viewer` (the caller/owner's own EOA) as allowed to decrypt the caller's
    ///         policies in the UI. Takes effect on the next setLimit/spend. NOT a session key.
    function setPolicyViewer(address viewer) external {
        policyViewer[msg.sender] = viewer;
        emit PolicyViewerSet(msg.sender, viewer);
    }

    // ── Owner: set / update an encrypted limit for a key on a token ────────────────────────────────

    function setLimit(
        address token,
        address key,
        externalEuint64 encLimit,
        bytes calldata inputProof,
        uint256 periodLength
    ) external {
        require(periodLength > 0, "period=0");
        euint64 limit = FHE.fromExternal(encLimit, inputProof);
        euint64 zero = FHE.asEuint64(0);

        KeyPolicy storage p = _policies[msg.sender][key][token];
        p.limit = limit;
        p.spent = zero;
        p.periodStart = block.timestamp;
        p.periodLength = periodLength;
        p.exists = true;

        FHE.allowThis(limit);
        FHE.allow(limit, msg.sender);
        FHE.allowThis(zero);
        FHE.allow(zero, msg.sender);
        address v = policyViewer[msg.sender];
        if (v != address(0)) {
            FHE.allow(limit, v);
            FHE.allow(zero, v);
        }

        emit LimitSet(msg.sender, key, token, periodLength);
    }

    function revokeKey(address token, address key) external {
        require(_policies[msg.sender][key][token].exists, "no policy");
        delete _policies[msg.sender][key][token];
        emit KeyRevoked(msg.sender, key, token);
    }

    // ── Key: spend under the encrypted cap ────────────────────────────────────────────────────────

    function spend(
        address token,
        address account,
        address to,
        externalEuint64 encAmount,
        bytes calldata inputProof
    ) external returns (euint64 allowed) {
        KeyPolicy storage p = _policies[account][msg.sender][token];
        require(p.exists, "no policy");

        address viewer = policyViewer[account];

        if (block.timestamp > p.periodStart + p.periodLength) {
            p.spent = FHE.asEuint64(0);
            p.periodStart = block.timestamp;
            FHE.allowThis(p.spent);
            FHE.allow(p.spent, account);
            if (viewer != address(0)) FHE.allow(p.spent, viewer);
        }

        euint64 amount = FHE.fromExternal(encAmount, inputProof);

        euint64 wouldBe = FHE.add(p.spent, amount);
        ebool within = FHE.le(wouldBe, p.limit);
        allowed = FHE.select(within, amount, FHE.asEuint64(0));

        p.spent = FHE.add(p.spent, allowed);
        FHE.allowThis(p.spent);
        FHE.allow(p.spent, account);
        if (viewer != address(0)) FHE.allow(p.spent, viewer);

        FHE.allowThis(allowed);
        FHE.allowTransient(allowed, token);
        IERC7984(token).confidentialTransferFrom(account, to, allowed);

        emit Spent(account, msg.sender, token, to);
        return allowed;
    }

    // ── Owner views (decrypt client-side) ─────────────────────────────────────────────────────────

    function limitOf(address token, address account, address key) external view returns (euint64) {
        return _policies[account][key][token].limit;
    }

    function spentOf(address token, address account, address key) external view returns (euint64) {
        return _policies[account][key][token].spent;
    }

    function policyMeta(
        address token,
        address account,
        address key
    ) external view returns (uint256 periodStart, uint256 periodLength, bool exists) {
        KeyPolicy storage p = _policies[account][key][token];
        return (p.periodStart, p.periodLength, p.exists);
    }
}
