// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {
    ERC7984
} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

/// @title ConfidentialToken — the ONE FHE contract in the Confidential Send 4337 Wallet.
/// @notice A direct-mint ERC-7984 confidential token. Balances and transfer amounts are `euint64`
///         ciphertexts; nobody but the owner (and grantees) can see how much an account holds or
///         sends. The wallet's smart account moves funds by calling the inherited
///         `confidentialTransfer(to, externalEuint64 encAmount, bytes inputProof)` — the encrypted
///         amount rides inside the calldata that `account.execute` forwards here.
///
/// @dev The base `ERC7984` (OpenZeppelin confidential-contracts) already implements:
///        - `confidentialTransfer(address to, externalEuint64 encAmount, bytes inputProof)` — runs
///          `FHE.fromExternal` and moves the clamped amount, branch-free (no revert on overspend);
///        - `confidentialTransfer(address to, euint64 amount)` — internal-handle variant;
///        - `confidentialBalanceOf(address) returns (euint64)` — the encrypted-balance handle the
///          owner decrypts client-side with `useUserDecrypt`;
///        - all balance-touch ACL (`allowThis` + `allow(balance, holder)`).
///      We only add a test/demo `mint`. No FHE logic is added here beyond the base — per the build
///      context, FHE lives in exactly this token and the browser encrypt step, nowhere else.
///
///      §5 seam: in the 4337 path the caller of `confidentialTransfer` is the SMART ACCOUNT (the
///      account's `execute` forwards the call), so the client must create the encrypted input
///      against `(address(this), smartAccountAddress)` — NOT the EOA. `FHE.fromExternal` binds the
///      proof to that pair. This is proven in `test/Confidential4337.test.ts`.
contract ConfidentialToken is ZamaEthereumConfig, ERC7984 {
    address public immutable owner;

    /// @notice A holder → additional address allowed to decrypt that holder's confidential balance.
    /// @dev Needed for the 4337 wallet: the token holder is the SMART ACCOUNT (a contract), which
    ///      cannot sign a Zama user-decrypt. The human owner (the account's EOA signer) registers
    ///      here so the UI can decrypt the account's balance with the EOA. ERC-7984 already grants
    ///      the holder itself ACL; this adds one extra viewer. Registered once per account (via
    ///      `account.execute`); `_update` below re-grants on every balance change since handles
    ///      rotate. Set to `address(0)` to clear.
    mapping(address => address) public balanceViewer;

    event BalanceViewerSet(address indexed holder, address indexed viewer);

    constructor(
        string memory name_,
        string memory symbol_,
        string memory tokenURI_
    ) ERC7984(name_, symbol_, tokenURI_) {
        owner = msg.sender;
    }

    /// @notice Mint `amount` (in the token's 6-decimal micro-units) to `to`.
    /// @dev Demo/testnet faucet so any account can be funded without an underlying ERC-20. `_mint`
    ///      grants the recipient ACL on the new balance so they can decrypt it in the UI. Open on
    ///      purpose for the hackathon demo — a production token would gate this to `owner`.
    function mint(address to, uint64 amount) external {
        _mint(to, FHE.asEuint64(amount));
    }

    /// @notice Register `viewer` as an extra address allowed to decrypt the caller's balance.
    /// @dev The smart account calls this through its `execute` (msg.sender == the account) to let
    ///      its EOA owner see the encrypted balance in the wallet UI. Takes effect on the next
    ///      balance change; call it before the first mint/receive to cover the opening balance.
    function setBalanceViewer(address viewer) external {
        balanceViewer[msg.sender] = viewer;
        emit BalanceViewerSet(msg.sender, viewer);
    }

    /// @dev Re-grant the registered viewer decrypt access on every balance mutation. ERC-7984
    ///      rotates the balance handle on each update, so a one-time `FHE.allow` would go stale;
    ///      we re-grant here in the same tx that produced the new handle (the token holds `allowThis`
    ///      on it, so it may re-grant). No FHE amount logic is added — clamping/settlement stay in
    ///      the base `_update`.
    function _update(
        address from,
        address to,
        euint64 amount
    ) internal virtual override returns (euint64 transferred) {
        transferred = super._update(from, to, amount);

        if (from != address(0)) {
            address v = balanceViewer[from];
            if (v != address(0)) FHE.allow(confidentialBalanceOf(from), v);
        }
        if (to != address(0)) {
            address v = balanceViewer[to];
            if (v != address(0)) FHE.allow(confidentialBalanceOf(to), v);
        }
    }
}
