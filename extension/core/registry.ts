import { ethers } from "ethers";
import { RegistryPair } from "./types";
import { REGISTRY_CONTRACT_ADDRESS, SEPOLIA_RPC, OFFICIAL_PAIRS } from "./constants";
import { LOCAL_PAIRS } from "./pairs.config";

// Minimal ABI for the Zama Wrappers Registry contract
// Based on Zama documentation — the contract exposes a getAllPairs() function
const REGISTRY_ABI = [
  "function getAllPairs() view returns (tuple(address erc20, address erc7984, string name, string symbol, bool isActive, uint256 createdAt)[])",
  "function getPairCount() view returns (uint256)",
];

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(SEPOLIA_RPC);
}

function getRegistryContract(provider: ethers.Provider): ethers.Contract {
  return new ethers.Contract(REGISTRY_CONTRACT_ADDRESS, REGISTRY_ABI, provider);
}

/**
 * fetchAllPairs — Hybrid Registry Fetch
 *
 * Fetches pairs from TWO sources and merges them:
 *   1. Official onchain Zama Wrappers Registry (PRIMARY)
 *   2. Local pairs.config.ts (SECONDARY — supplements onchain data)
 *
 * Merge rules:
 *   - Official pairs always take priority over local config
 *   - If a local pair shares an erc20Address with an official pair, local is ignored
 *   - Official pairs: isOfficial=true, isCustom=false
 *   - Local pairs:    isOfficial=false, isCustom=true
 *   - Official pairs appear first in the returned array
 *
 * On registry contract failure, falls back to the OFFICIAL_PAIRS hardcoded list
 * defined in constants.ts so the app always shows pairs even when RPC is flaky.
 */
export async function fetchAllPairs(): Promise<RegistryPair[]> {
  const provider = getProvider();
  const registry = getRegistryContract(provider);

  let officialPairs: RegistryPair[];

  try {
    const rawPairs: Array<{
      erc20: string;
      erc7984: string;
      name: string;
      symbol: string;
      isActive: boolean;
      createdAt: bigint;
    }> = await registry.getAllPairs();

    officialPairs = rawPairs.map((raw, index) => ({
      id: `official-${index}`,
      erc20Address: raw.erc20,
      erc7984Address: raw.erc7984,
      name: raw.name,
      symbol: raw.symbol,
      underlyingSymbol: raw.symbol.startsWith("c") ? raw.symbol.slice(1) : raw.symbol,
      decimals: 18,
      isActive: raw.isActive,
      isOfficial: true,
      isCustom: false,
      hasFaucet: raw.symbol.toLowerCase().includes("mock"),
      createdAt: Number(raw.createdAt),
      docsUrl: "https://docs.zama.org/protocol/protocol-apps/addresses/testnet/sepolia",
    }));
  } catch {
    // Onchain fetch failed — use hardcoded fallback
    console.warn(
      "[registry] Onchain registry fetch failed; using hardcoded OFFICIAL_PAIRS fallback"
    );
    officialPairs = OFFICIAL_PAIRS.map((p) => ({
      ...p,
      isOfficial: true,
      isCustom: false,
    }));
  }

  // Merge local config pairs — official addresses always win
  const officialAddresses = new Set(
    officialPairs.map((p) => p.erc20Address.toLowerCase())
  );

  const validLocalPairs = LOCAL_PAIRS.filter(
    (lp) => !officialAddresses.has(lp.erc20Address.toLowerCase())
  ).map((lp) => ({ ...lp, isOfficial: false, isCustom: true }));

  return [...officialPairs, ...validLocalPairs];
}

/**
 * searchPairs — client-side search (no extra network call)
 */
export function searchPairs(pairs: RegistryPair[], query: string): RegistryPair[] {
  if (!query.trim()) return pairs;
  const q = query.toLowerCase();
  return pairs.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.symbol.toLowerCase().includes(q) ||
      p.underlyingSymbol.toLowerCase().includes(q) ||
      p.erc20Address.toLowerCase().includes(q) ||
      p.erc7984Address.toLowerCase().includes(q)
  );
}

/**
 * filterByStatus — client-side filter by active/inactive status
 */
export function filterByStatus(
  pairs: RegistryPair[],
  status: "all" | "active" | "inactive"
): RegistryPair[] {
  if (status === "all") return pairs;
  return pairs.filter((p) => (status === "active" ? p.isActive : !p.isActive));
}

/**
 * filterBySource — client-side filter by official/custom
 */
export function filterBySource(
  pairs: RegistryPair[],
  source: "all" | "official" | "custom"
): RegistryPair[] {
  if (source === "all") return pairs;
  return pairs.filter((p) => (source === "official" ? p.isOfficial : p.isCustom));
}
