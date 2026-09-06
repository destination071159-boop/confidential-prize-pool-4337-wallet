// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, ebool, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ConfidentialVault — a minimal reference exercising this workspace's FHE conventions.
/// @notice Encrypted per-user balances. Deposit/withdraw take encrypted amounts; a balance can be
///         revealed to the public via the Form-B request/fulfill decryption flow. This is a
///         teaching example for `.claude/skills/fhe-solidity` — it mirrors the conventions in
///         VulnVault + confidential-derivatives-zama (see SKILL.md). Kept dependency-free (no
///         ERC-7984) so it compiles on its own; the ERC-7984 deposit path lives in
///         references/erc7984-tokens.md.
contract ConfidentialVault is ZamaEthereumConfig {
    // --- encrypted state ---
    mapping(address => euint64) private _balances;

    // --- Form-B pending reveal requests (see references/async-decryption.md) ---
    struct RevealRequest {
        address user;
        bytes32 balanceHandle;
    }
    mapping(uint256 => RevealRequest) public pendingReveals;
    uint256 private _nextRequestId;

    event Deposited(address indexed user);
    event Withdrawn(address indexed user);
    event BalanceRevealRequested(address indexed user, uint256 requestId, bytes32 balanceHandle);
    event BalanceRevealed(address indexed user, uint256 requestId, uint64 balance);

    /// @notice Credit an encrypted deposit. Convert the external input, then grant ACL.
    function deposit(externalEuint64 encAmount, bytes calldata inputProof) external {
        euint64 amount = FHE.fromExternal(encAmount, inputProof);

        // init-or-add: a ciphertext has no implicit zero — guard first-touch with isInitialized.
        if (FHE.isInitialized(_balances[msg.sender])) {
            _balances[msg.sender] = FHE.add(_balances[msg.sender], amount);
        } else {
            _balances[msg.sender] = amount;
        }

        // ACL: this contract must reuse the handle later; the user must be able to decrypt it.
        FHE.allowThis(_balances[msg.sender]);
        FHE.allow(_balances[msg.sender], msg.sender);

        emit Deposited(msg.sender);
    }

    /// @notice Withdraw an encrypted amount, clamped to the available balance.
    /// @dev No plaintext `if` on ciphertext: clamp with FHE.select instead of reverting, so the
    ///      balance is never revealed by a revert.
    function withdraw(externalEuint64 encAmount, bytes calldata inputProof) external {
        euint64 requested = FHE.fromExternal(encAmount, inputProof);

        euint64 actual = FHE.select(
            FHE.ge(_balances[msg.sender], requested),
            requested,
            _balances[msg.sender]
        );

        _balances[msg.sender] = FHE.sub(_balances[msg.sender], actual);

        FHE.allowThis(_balances[msg.sender]);
        FHE.allow(_balances[msg.sender], msg.sender);

        // In a real vault you would now move `actual` out via an ERC-7984 confidentialTransfer,
        // preceded by FHE.allowTransient(actual, address(token)). See references/erc7984-tokens.md.

        emit Withdrawn(msg.sender);
    }

    /// @notice Return the caller's encrypted balance handle (the caller can userDecrypt it).
    function myBalance() external view returns (euint64) {
        return _balances[msg.sender];
    }

    // --- Form-B public reveal: request → off-chain publicDecrypt → verified fulfill ---

    /// @notice Request that the caller's balance be made publicly decryptable and revealed on-chain.
    function requestBalanceReveal() external returns (uint256 requestId) {
        require(FHE.isInitialized(_balances[msg.sender]), "No balance");

        FHE.makePubliclyDecryptable(_balances[msg.sender]);
        bytes32 balanceHandle = euint64.unwrap(_balances[msg.sender]);

        requestId = _nextRequestId++;
        pendingReveals[requestId] = RevealRequest({user: msg.sender, balanceHandle: balanceHandle});

        emit BalanceRevealRequested(msg.sender, requestId, balanceHandle);
    }

    /// @notice Permissionless callback: verify the decrypted cleartext, then act on it.
    /// @dev Signature convention: (requestId, abiEncodedCleartexts, decryptionProof). Verify with
    ///      FHE.checkSignatures over the exact handles, then abi.decode.
    function fulfillBalanceReveal(
        uint256 requestId,
        bytes calldata abiEncodedCleartexts,
        bytes calldata decryptionProof
    ) external {
        RevealRequest memory req = pendingReveals[requestId];
        require(req.user != address(0), "Unknown request");

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = req.balanceHandle;

        FHE.checkSignatures(handles, abiEncodedCleartexts, decryptionProof);
        uint64 balance = abi.decode(abiEncodedCleartexts, (uint64));

        delete pendingReveals[requestId];
        emit BalanceRevealed(req.user, requestId, balance);
    }
}
