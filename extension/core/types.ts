// Shared TypeScript types used across the entire monorepo

export interface RegistryPair {
  id: string;
  erc20Address: string;
  erc7984Address: string;
  name: string;
  symbol: string;
  underlyingSymbol: string;
  decimals: number;
  docsUrl?: string;
  logoUrl?: string;
  isActive: boolean;
  isOfficial: boolean;
  isCustom: boolean;
  hasFaucet: boolean;
  createdAt: number;
}

export interface TxStatus {
  hash: string;
  status: "pending" | "confirmed" | "failed";
  message: string;
  blockNumber?: number;
  gasUsed?: bigint;
  unwrapRequestId?: string;
}

export interface EncryptedBalance {
  token: string;
  encrypted: string;
  decrypted?: bigint;
  isDecrypting: boolean;
}

export interface FaucetClaim {
  token: string;
  amount: bigint;
  timestamp: number;
  txHash: string;
}

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}

export type SupportedChainId = 11155111;

// ── Innovation-layer types ────────────────────────────────────────────────────

export interface WalletPair {
  id: string;
  walletA: string;
  walletB: string;
  encryptedPrivateKeyB: string;
  createdAt: number;
  label?: string;
}

export interface DepositNote {
  version: string;        // "zama:v1"
  token: string;          // cToken address
  amount: string;         // Amount (human-readable)
  commitment: string;     // ZK commitment (hex bigint)
  nullifier: string;      // ZK nullifier (hex bigint)
  leafIndex: number;      // Position in Merkle tree
  timestamp: number;      // Deposit block number
  raw: string;            // Full encoded note string for export
}

export interface RouteHop {
  from:   string;
  to:     string;
  via:    string;
  action: "wrap" | "swap" | "unwrap";
}

export interface SwapRoute {
  inputToken:    string;
  outputToken:   string;
  hops:          RouteHop[];
  estimatedGas:  bigint;
  privacyScore:  number;
}

export interface PrivacyPoolInfo {
  token:         string;
  totalLiquidity: bigint;
  anonymitySet:  number;
  privacyLevel:  "LOW" | "MEDIUM" | "HIGH" | "MAXIMUM";
}
