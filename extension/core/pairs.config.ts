import { RegistryPair } from "./types";

/**
 * LOCAL_PAIRS — Secondary source of pairs for the registry.
 * These supplement the official onchain Zama Wrappers Registry.
 *
 * HOW TO ADD A NEW ERC-20 ↔ ERC-7984 PAIR:
 * ─────────────────────────────────────────
 * 1. Open this file (`packages/core/src/pairs.config.ts`)
 * 2. Add a new entry to the LOCAL_PAIRS array (see EXAMPLE below)
 * 3. Fill in all required fields (addresses, name, symbol, decimals)
 * 4. Set isCustom: true and isOfficial: false
 * 5. Commit, push, and redeploy — the pair appears labeled "⚠ Custom"
 *
 * RULES:
 * - Custom pairs will NOT override official onchain pairs (official always wins)
 * - Always set isCustom: true and isOfficial: false
 * - Both contracts must be deployed on Sepolia (chainId: 11155111)
 * - symbol must start with "c" (e.g. "cMYT" wraps "MYT")
 * - decimals must match the underlying ERC-20 decimals
 *
 * EXAMPLE — add a custom pair:
 * {
 *   id: "custom-1",
 *   erc20Address:   "0xYourERC20ContractAddressOnSepolia",
 *   erc7984Address: "0xYourERC7984ContractAddressOnSepolia",
 *   name: "My Dev Token",
 *   symbol: "cMYT",
 *   underlyingSymbol: "MYT",
 *   decimals: 18,
 *   isActive: true,
 *   isOfficial: false,
 *   isCustom: true,
 *   hasFaucet: false,  // true only if ERC-20 has a public mint()
 *   createdAt: 0,
 *   docsUrl: "https://your-docs-url.com"  // optional
 * }
 */
export const LOCAL_PAIRS: RegistryPair[] = [
  // Add your custom pairs here following the example above.
  // Leave this array empty to use only the official onchain registry.
];
