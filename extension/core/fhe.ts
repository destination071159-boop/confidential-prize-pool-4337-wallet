import { ethers } from "ethers";
import { TokenMetadata } from "./types";

// Minimal ABI for ERC-7984 balance handle and metadata
const METADATA_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

// ERC-7984 balance handle ABI
const ERC7984_BALANCE_ABI = [
  "function getHandle(address owner) view returns (bytes32)",
  // OZ ERC7984ERC20Wrapper uses confidentialBalanceOf
  "function confidentialBalanceOf(address owner) view returns (bytes32)",
  // Some implementations expose balanceOf returning bytes32 directly
  "function balanceOf(address owner) view returns (bytes32)",
];

/**
 * getTokenMetadata — fetches name, symbol, decimals from any token contract.
 * Falls back to safe defaults if metadata calls fail.
 */
export async function getTokenMetadata(
  tokenAddress: string,
  provider: ethers.Provider
): Promise<TokenMetadata> {
  try {
    const contract = new ethers.Contract(tokenAddress, METADATA_ABI, provider);
    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);
    return { name: name as string, symbol: symbol as string, decimals: Number(decimals) };
  } catch {
    return { name: "Unknown Token", symbol: "???", decimals: 18 };
  }
}

/**
 * validateERC7984Contract — checks that an address is a valid ERC-7984 contract.
 * Throws a descriptive error if the address is invalid or not ERC-7984.
 */
export async function validateERC7984Contract(
  tokenAddress: string,
  provider: ethers.Provider
): Promise<void> {
  if (!ethers.isAddress(tokenAddress)) {
    throw new Error("Invalid Ethereum address format");
  }

  const code = await provider.getCode(tokenAddress);
  if (code === "0x") {
    throw new Error("No contract found at this address on Sepolia");
  }

  // Attempt to call getHandle / confidentialBalanceOf / balanceOf — ERC-7984 must have one
  try {
    const contract = new ethers.Contract(tokenAddress, ERC7984_BALANCE_ABI, provider);
    const signerAddress = "0x0000000000000000000000000000000000000001";
    try { await contract.getHandle(signerAddress); }
    catch { try { await contract.confidentialBalanceOf(signerAddress); }
    catch { await contract.balanceOf(signerAddress); } }
  } catch {
    throw new Error("This address does not appear to be a valid ERC-7984 token contract");
  }
}

/**
 * getERC7984Handle — reads the encrypted balance handle for a user from any ERC-7984 token.
 * Returns the bytes32 handle that `useUserDecrypt` from @zama-fhe/react-sdk uses.
 */
export async function getERC7984Handle(
  tokenAddress: string,
  userAddress: string,
  provider: ethers.Provider
): Promise<`0x${string}`> {
  const contract = new ethers.Contract(tokenAddress, ERC7984_BALANCE_ABI, provider);

  try {
    const handle = await contract.getHandle(userAddress);
    return handle as `0x${string}`;
  } catch {
    try {
      const handle = await contract.confidentialBalanceOf(userAddress);
      return handle as `0x${string}`;
    } catch {
      const handle = await contract.balanceOf(userAddress);
      return handle as `0x${string}`;
    }
  }
}
