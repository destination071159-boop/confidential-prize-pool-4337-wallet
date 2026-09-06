/**
 * ERC-4337 layer for the Confidential Prize Pool 4337 Wallet.
 *
 * Turns the extension's EOA keyring into the OWNER of a gasless Safe smart account
 * (EntryPoint v0.7, sponsored by a Pimlico paymaster). Confidential balances, shields,
 * unshields and spending-limit ops all execute from the smart account — which is a
 * DIFFERENT address than the signing EOA. The smart account is the holder; the EOA signs.
 *
 * Config comes from Vite env (.env, gitignored): VITE_BUNDLER_URL / VITE_PAYMASTER_URL /
 * VITE_SPONSORSHIP_POLICY_ID / VITE_SPENDING_LIMIT_MODULE / VITE_RPC_URL.
 */
import { getAddress } from "viem";
import tokenAbi from "./abis/ConfidentialToken.abi.json";
import moduleAbi from "./abis/SpendingLimitModule.abi.json";
import underlyingAbi from "./abis/UnderlyingToken.abi.json";
import { OFFICIAL_PAIRS } from "./constants";

// NOTE: these MUST use static `import.meta.env.VITE_*` access so Vite inlines them at build time.
// A dynamic key (`import.meta.env[k]`) or an `as any` cast defeats the static replacement → empty.
export const CHAIN_ID_BIG = 11155111n; // Sepolia (bigint, for abstractionkit)
export const RPC_URL = import.meta.env.VITE_RPC_URL ?? "";
export const BUNDLER_URL = import.meta.env.VITE_BUNDLER_URL ?? "";
export const PAYMASTER_URL = import.meta.env.VITE_PAYMASTER_URL ?? "";
export const SPONSORSHIP_POLICY_ID = import.meta.env.VITE_SPONSORSHIP_POLICY_ID ?? "";
export const SPENDING_LIMIT_MODULE = getAddress(
  import.meta.env.VITE_SPENDING_LIMIT_MODULE ?? "0x0000000000000000000000000000000000000000"
) as `0x${string}`;

// ABIs (shared with the reference dApp).
export const CONFIDENTIAL_TOKEN_ABI = tokenAbi as any;
export const SPENDING_LIMIT_MODULE_ABI = moduleAbi as any;
export const UNDERLYING_TOKEN_ABI = underlyingAbi as any;

// UserOperation gas/fee overrides (tuned for the strict Pimlico bundler on Sepolia).
export const USEROP_CALL_GAS_LIMIT = 10_000_000n;
export const USEROP_MAX_PRIORITY_FEE_PER_GAS = 300_000_000n; // 0.3 gwei
export const USEROP_MAX_FEE_PER_GAS = 2_000_000_000n; // 2 gwei
export const OPERATOR_UNTIL = 4_000_000_000; // ~year 2096 (uint48)
export const VIEW_DELEGATION_EXPIRY = 4_000_000_000n; // uint64

// Zama ACL (canonical Sepolia) — the smart account (holder) delegates decrypt of a wrapper's
// balance handles to the owner EOA via delegateForUserDecryption(delegate, contract, expiry).
export const ACL_ADDRESS = "0xcA2E8f1F656CD25C01F05d0b243Ab1ecd4a8ffb6" as `0x${string}`;
export const ACL_DELEGATE_ABI = [
  {
    type: "function",
    name: "delegateForUserDecryption",
    stateMutability: "nonpayable",
    inputs: [
      { name: "delegate", type: "address" },
      { name: "contractAddress", type: "address" },
      { name: "expirationDate", type: "uint64" },
    ],
    outputs: [],
  },
] as const;

export const DECIMALS = 6; // ERC-7984 confidential tokens are 6-dec
export const ONE_TOKEN = 1_000_000n;
export const NULL_HANDLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

// ── Asset registry (reuses the extension's OFFICIAL_PAIRS) ──────────────────────
export type Asset = {
  symbol: string; // display, e.g. "cUSDC"
  name: string;
  token: `0x${string}`; // ERC-7984 confidential wrapper
  underlying: `0x${string}`; // ERC-20 underlying
  underlyingDecimals: number;
};

// Focused default set — cUSDC / cUSDT / cWETH / cZAMA. Any other ERC-7984 token can be
// added at runtime via "+ Add token" (see web/lib/customTokens.ts).
const CORE_ASSETS = new Set(["cUSDC", "cUSDT", "cWETH", "cZAMA"]);
export const REGISTRY: Asset[] = OFFICIAL_PAIRS.map((p) => ({
  symbol: p.symbol.replace(/Mock$/, ""), // "cUSDCMock" → "cUSDC"
  name: p.name,
  token: getAddress(p.erc7984Address) as `0x${string}`,
  underlying: getAddress(p.erc20Address) as `0x${string}`,
  underlyingDecimals: p.decimals,
})).filter((a) => CORE_ASSETS.has(a.symbol));

export const isModuleConfigured = () =>
  SPENDING_LIMIT_MODULE !== "0x0000000000000000000000000000000000000000";

// ── Amount helpers (6-dec confidential units) ───────────────────────────────────
export function parseAmount(input: string): bigint {
  const s = (input ?? "").trim();
  if (!s) return 0n;
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "000000").slice(0, DECIMALS);
  return BigInt(whole || "0") * ONE_TOKEN + BigInt(fracPadded || "0");
}

export function formatAmount(v: bigint): string {
  const whole = v / ONE_TOKEN;
  const frac = (v % ONE_TOKEN).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Confidential (6-dec) → underlying token units (rate handled by decimals gap). */
export function toUnderlying(microConf: bigint, underlyingDecimals: number): bigint {
  return underlyingDecimals >= DECIMALS
    ? microConf * 10n ** BigInt(underlyingDecimals - DECIMALS)
    : microConf / 10n ** BigInt(DECIMALS - underlyingDecimals);
}

export const shortAddr = (a?: string): string =>
  a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";

/** Icon path for an asset by symbol; falls back to null (text badge). */
export function iconFor(symbol: string): string | null {
  const key = symbol.replace(/^c/, "").toLowerCase();
  const map: Record<string, string> = {
    usdc: "/icons/usdc.png",
    usdt: "/icons/usdt.png",
    weth: "/icons/weth.svg",
    zama: "/icons/zama.png",
    bron: "/icons/bron.svg",
    tgbp: "/icons/tgbp.webp",
    xaut: "/icons/xaut.png",
  };
  return map[key] ?? null;
}
