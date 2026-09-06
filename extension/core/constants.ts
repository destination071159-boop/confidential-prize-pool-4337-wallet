import { RegistryPair } from "./types";

export const CHAIN_ID = 11155111 as const; // Sepolia

// ─────────────────────────────────────────────────────────────────────────────
// OFFICIAL ZAMA CONTRACT ADDRESSES (Sepolia)
// Source: https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia
// ─────────────────────────────────────────────────────────────────────────────

export const REGISTRY_CONTRACT_ADDRESS = "0x2f0750Bbb0A246059d80e94c454586a7F27a128e";

export const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
// publicnode: no API key, CORS-enabled, allows eth_getLogs up to a 50k-block range and does not
// rate-limit like the shared public Infura key (which returns -32005 "Too Many Requests" under load).
export const SEPOLIA_LOGS_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
export const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

// ─────────────────────────────────────────────────────────────────────────────
// OFFICIAL PAIR ADDRESSES (Sepolia) — hardcoded as fallback
// Primary source is always the onchain registry contract above.
// Source: https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia#wrappers-registry
// ─────────────────────────────────────────────────────────────────────────────

export const OFFICIAL_PAIRS: RegistryPair[] = [
  {
    id: "official-0",
    name: "Confidential USDC Mock",
    symbol: "cUSDCMock",
    underlyingSymbol: "USDCMock",
    erc7984Address: "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
    erc20Address: "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF",
    decimals: 6,
    isActive: true,
    isOfficial: true,
    isCustom: false,
    hasFaucet: true,
    createdAt: 0,
    docsUrl: "https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia",
  },
  {
    id: "official-1",
    name: "Confidential USDT Mock",
    symbol: "cUSDTMock",
    underlyingSymbol: "USDTMock",
    erc7984Address: "0x4E7B06D78965594eB5EF5414c357ca21E1554491",
    erc20Address: "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0",
    decimals: 6,
    isActive: true,
    isOfficial: true,
    isCustom: false,
    hasFaucet: true,
    createdAt: 0,
    docsUrl: "https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia",
  },
  {
    id: "official-2",
    name: "Confidential WETH Mock",
    symbol: "cWETHMock",
    underlyingSymbol: "WETHMock",
    erc7984Address: "0x46208622DA27d91db4f0393733C8BA082ed83158",
    erc20Address: "0xff54739b16576FA5402F211D0b938469Ab9A5f3F",
    decimals: 18,
    isActive: true,
    isOfficial: true,
    isCustom: false,
    hasFaucet: true,
    createdAt: 0,
    docsUrl: "https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia",
  },
  {
    id: "official-3",
    name: "Confidential BRON Mock",
    symbol: "cBRONMock",
    underlyingSymbol: "BRONMock",
    erc7984Address: "0xaa5612FA27c927a0c7961f5AEFEE5ba3A0F9C891",
    erc20Address: "0xFf021fB13cA64e5354c62c954b949a88cfDEb25E",
    decimals: 18,
    isActive: true,
    isOfficial: true,
    isCustom: false,
    hasFaucet: true,
    createdAt: 0,
    docsUrl: "https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia",
  },
  {
    id: "official-4",
    name: "Confidential ZAMA Mock",
    symbol: "cZAMAMock",
    underlyingSymbol: "ZAMAMock",
    erc7984Address: "0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB",
    erc20Address: "0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57",
    decimals: 18,
    isActive: true,
    isOfficial: true,
    isCustom: false,
    hasFaucet: true,
    createdAt: 0,
    docsUrl: "https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia",
  },
  {
    id: "official-5",
    name: "Confidential tGBP Mock",
    symbol: "ctGBPMock",
    underlyingSymbol: "tGBPMock",
    erc7984Address: "0xfCE5c7069c5525eF6c8C2b2E35A745bA20a2F7CC",
    erc20Address: "0x93c931278A2aad1916783F952f94276eA5111442",
    decimals: 18,
    isActive: true,
    isOfficial: true,
    isCustom: false,
    hasFaucet: true,
    createdAt: 0,
    docsUrl: "https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia",
  },
  {
    id: "official-6",
    name: "Confidential XAUt Mock",
    symbol: "cXAUtMock",
    underlyingSymbol: "XAUtMock",
    erc7984Address: "0xe4FcF848739845BC81Dee1d5352cf3844F0a60C7",
    erc20Address: "0x24377AE4AA0C45ecEe71225007f17c5D423dd940",
    decimals: 18,
    isActive: true,
    isOfficial: true,
    isCustom: false,
    hasFaucet: true,
    createdAt: 0,
    docsUrl: "https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia",
  },
  {
    id: "official-7",
    name: "Confidential tGBP",
    symbol: "ctGBP",
    underlyingSymbol: "tGBP",
    erc7984Address: "0x167DC962808B32CFFFc7e14B5018c0bE06A3A208",
    erc20Address: "0xf6Ef9ADB61A48E29E36bc873070A46A3D2667ff3",
    decimals: 18,
    isActive: true,
    isOfficial: true,
    isCustom: false,
    hasFaucet: false, // Restricted mint — no public faucet
    createdAt: 0,
    docsUrl: "https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// FAUCET CONFIG
// Mock ERC-20 tokens have a public mint() function (1M token limit per call).
// We call mint() directly on the underlying ERC-20 mock token.
// ─────────────────────────────────────────────────────────────────────────────

export const FAUCET_MINT_AMOUNT = BigInt("1000000000000000000000"); // 1,000 tokens
export const FAUCET_MAX_AMOUNT = BigInt("1000000000000000000000000"); // 1,000,000 tokens
export const FAUCET_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─────────────────────────────────────────────────────────────────────────────
// OUR DEPLOYED CONTRACTS (fill in after deploying to Sepolia)
// Run: cd contracts && npx hardhat run scripts/deploy.ts --network sepolia
// ─────────────────────────────────────────────────────────────────────────────

/** ZKVerifier.sol — Groth16 BN128 verifier + nullifier registry */
export const ZK_VERIFIER_ADDRESS = "0x62dBF2724FA845A00712FD992736289FA6a72F6d";

/** PrivacyPool.sol — FhEVM encrypted deposits + ZK withdrawals */
export const PRIVACY_POOL_ADDRESS = "0x6Cb4dA4E8712866ED8B98c753DC396D94281C36E";
// Block at which the PrivacyPool was deployed — used to bound event log queries
export const PRIVACY_POOL_DEPLOY_BLOCK = 11_216_354;

/** CrossSwapRouter.sol — cross-pair ERC-20 ↔ ERC-7984 routing */
export const CROSS_SWAP_ROUTER_ADDRESS = "0x65422Cde6Af545d84184a55f6b6963B75812dcc2";

/** ConfidentialSwapPool.sol — direct cToken ↔ cToken 1:1 swap, amounts hidden on-chain */
export const CONFIDENTIAL_SWAP_POOL_ADDRESS = "0x88D2dDC39Cde7cf0195f7713784D8e60f857Fe0a";

// NOTE: There is no FhEVM Gateway contract on Sepolia.
// The Zama Gateway is a separate Arbitrum rollup chain — not a contract on any host chain.
// @zama-fhe/react-sdk handles Gateway interaction internally; no address needed here.
// See: https://docs.zama.org/protocol/protocol/overview/gateway

// ─────────────────────────────────────────────────────────────────────────────
// PRIVACY POOL THRESHOLDS
// ─────────────────────────────────────────────────────────────────────────────

export const ANONYMITY_SET_THRESHOLDS = {
  LOW:    5,
  MEDIUM: 20,
  HIGH:   100,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// ZK CIRCUIT PATHS (served from apps/web/public/zkeys/)
// Generated by: circuits/compile.sh
// ─────────────────────────────────────────────────────────────────────────────

export const ZK_WASM_PATH = "/zkeys/privacyProof.wasm";
export const ZK_ZKEY_PATH = "/zkeys/privacyProof.zkey";
