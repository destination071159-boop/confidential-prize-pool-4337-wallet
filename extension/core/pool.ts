/**
 * Confidential Prize Pool — deployed config + ABIs (shared by the extension and web dApp).
 * Contract: ConfidentialPrizePool.sol on Sepolia. Deposit asset = cUSDC (ERC-7984 wrapper);
 * faucet = mint the ERC-20 underlying (USDCMock).
 */
import poolAbi from "./abis/ConfidentialPrizePool.abi.json";

export const POOL_ADDRESS = "0xD24FBf0F84C9f1AfCc63354498b8f1B3AF6f1067" as `0x${string}`;
export const POOL_ABI = poolAbi as any;

// Deposit asset (confidential ERC-7984) + its ERC-20 underlying (the faucet mints this).
export const POOL_TOKEN = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639" as `0x${string}`; // cUSDC
export const POOL_UNDERLYING = "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF" as `0x${string}`; // USDCMock
export const POOL_UNDERLYING_DECIMALS = 6;
export const POOL_TOKEN_SYMBOL = "cUSDC";
export const POOL_OWNER = "0x204a73e8303F3d09B12062dEdAA74B1CDA6E167d" as `0x${string}`;

// data marker that funds the prize reserve on a deposit-transfer (owner only).
export const PRIZE_TAG = "0x0c2971ae83939c37616f87fd9ca31ab6e47646c973f377b3cae28cf19c9e9999" as `0x${string}`;

// The ERC-7984 4-arg confidentialTransferAndCall (the token has 3-arg & 4-arg overloads; we need the 4-arg).
export const CONFIDENTIAL_TRANSFER_AND_CALL_ABI = [
  {
    type: "function",
    name: "confidentialTransferAndCall",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "encryptedAmount", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ type: "bytes32" }],
  },
] as const;

export const isPoolOwner = (addr?: string) =>
  !!addr && addr.toLowerCase() === POOL_OWNER.toLowerCase();
