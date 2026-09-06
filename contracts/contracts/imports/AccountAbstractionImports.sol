// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// This file exists ONLY to pull the eth-infinitism ERC-4337 account contracts into Hardhat's
// compilation so tests/scripts can deploy them via typechain factories. These contracts are
// REUSED, not modified — the confidential transfer is routed through the account's `execute`,
// the account itself has no FHE logic. See CONFIDENTIAL_4337_WALLET_CONTEXT.md §1b.
import {SimpleAccountFactory} from "@account-abstraction/contracts/accounts/SimpleAccountFactory.sol";
import {SimpleAccount} from "@account-abstraction/contracts/accounts/SimpleAccount.sol";
