/**
 * FHEVM core for the extension — mirrors zwallet's approach.
 *
 * The @zama-fhe/react-sdk React build spins up a Web Worker that `importScripts` from
 * https://cdn.zama.org/... — remote code that the MV3 CSP (`script-src 'self'`) blocks, so it
 * fails silently and balances never decrypt. Instead we load the SINGLE-THREADED UMD build
 * (`relayer-sdk-js.umd.cjs`) packaged as an extension asset and drive it directly. The EIP-712
 * user-decrypt authorization is signed by the in-extension keyring (see providers.tsx signer).
 */

import { getAddress, toHex } from "viem";

const SEPOLIA_RPC =
  (import.meta.env.VITE_SEPOLIA_RPC as string | undefined) ??
  "https://ethereum-sepolia-rpc.publicnode.com";

// ── UMD SDK types (only what we use) ───────────────────────────────────────────
interface RelayerSDKType {
  initSDK: (options?: { thread?: number }) => Promise<void>;
  createInstance: (config: Record<string, unknown>) => Promise<FhevmInstance>;
  SepoliaConfig: Record<string, unknown>;
}

export interface EIP712TypedData {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  message: Record<string, unknown>;
  primaryType?: string;
}

export interface FhevmInstance {
  createEncryptedInput: (
    contractAddress: string,
    userAddress: string
  ) => {
    add64: (n: bigint) => EncryptedInputBuilder;
    add32: (n: bigint) => EncryptedInputBuilder;
    add128: (n: bigint) => EncryptedInputBuilder;
  };
  generateKeypair: () => { publicKey: string; privateKey: string };
  createEIP712: (
    publicKey: string,
    contractAddresses: string[],
    startTimestamp: number,
    durationDays: number
  ) => EIP712TypedData;
  userDecrypt: (
    handleContractPairs: { handle: string; contractAddress: string }[],
    privateKey: string,
    publicKey: string,
    signatureHex: string,
    contractAddresses: string[],
    userAddress: string,
    startTimestamp: number,
    durationDays: number
  ) => Promise<Record<string, bigint | string>>;
  publicDecrypt?: (
    handles: string[]
  ) => Promise<{
    decryptionProof?: string;
    clearValues?: Record<string, bigint | number | string>;
  }>;
  createDelegatedUserDecryptEIP712?: (
    publicKey: string,
    contractAddresses: string[],
    delegatorAddress: string,
    startTimestamp: number,
    durationDays: number
  ) => EIP712TypedData;
  delegatedUserDecrypt?: (
    handleContractPairs: { handle: string; contractAddress: string }[],
    privateKey: string,
    publicKey: string,
    signatureHex: string,
    contractAddresses: string[],
    delegatorAddress: string,
    delegateAddress: string,
    startTimestamp: number,
    durationDays: number
  ) => Promise<Record<string, bigint | string>>;
}

interface EncryptedInputBuilder {
  encrypt: () => Promise<{ handles: unknown[]; inputProof: unknown }>;
}

declare global {
  interface Window {
    relayerSDK?: RelayerSDKType;
    RelayerSDK?: RelayerSDKType;
  }
}

// ── SDK loading (extension-packaged asset only) ────────────────────────────────
function getSDK(): RelayerSDKType | null {
  return window.relayerSDK || window.RelayerSDK || null;
}

let sdkLoadPromise: Promise<void> | null = null;

function loadRelayerSDK(): Promise<void> {
  if (getSDK()) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;
  if (typeof chrome === "undefined" || !chrome.runtime?.getURL) {
    return Promise.reject(new Error("Relayer SDK requires chrome.runtime.getURL (extension only)."));
  }
  const url = chrome.runtime.getURL("relayer-sdk-js.umd.cjs");
  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.type = "text/javascript";
    script.onload = () => resolve();
    script.onerror = () => {
      sdkLoadPromise = null;
      reject(new Error("Failed to load Zama Relayer SDK from extension assets."));
    };
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
}

// ── Read-only JSON-RPC provider (createInstance calls eip712Domain() etc.) ──────
function jsonRpcProvider() {
  return {
    request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
      const res = await fetch(SEPOLIA_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const data = (await res.json()) as { result?: unknown; error?: { message?: string } };
      if (data.error) throw new Error(data.error.message ?? "RPC error");
      return data.result;
    },
  };
}

let instancePromise: Promise<FhevmInstance> | null = null;

/** Create (once) and cache the Sepolia FHEVM instance. */
export async function getFhevmInstance(): Promise<FhevmInstance> {
  if (instancePromise) return instancePromise;
  instancePromise = (async () => {
    await loadRelayerSDK();
    const sdk = getSDK();
    if (!sdk) throw new Error("Relayer SDK not available after load.");
    // Force single-threaded: initThreadPool spawns wasm-bindgen rayon workers that hang under
    // the MV3 side-panel CSP (`worker-src 'self'` + no cross-origin isolation). thread:0 skips it.
    await sdk.initSDK({ thread: 0 });
    return sdk.createInstance({ ...sdk.SepoliaConfig, network: jsonRpcProvider() });
  })().catch((e) => {
    instancePromise = null; // allow retry on next call
    console.error("[ZhieldWrap] FHEVM init failed:", e);
    throw e;
  });
  return instancePromise;
}

// ── Encrypt ────────────────────────────────────────────────────────────────────
export interface EncryptValue {
  value: bigint;
  type: "euint32" | "euint64" | "euint128";
}
export interface EncryptResult {
  handles: `0x${string}`[];
  inputProof: `0x${string}`;
}

const toHexStr = (v: unknown): `0x${string}` =>
  typeof v === "string" && v.startsWith("0x") ? (v as `0x${string}`) : toHex(v as Uint8Array);

export async function encrypt(params: {
  values: EncryptValue[];
  contractAddress: string;
  userAddress: string;
}): Promise<EncryptResult> {
  const instance = await getFhevmInstance();
  const contract = getAddress(params.contractAddress as `0x${string}`);
  const user = getAddress(params.userAddress as `0x${string}`);
  const builder = instance.createEncryptedInput(contract, user);
  let cur: EncryptedInputBuilder | null = null;
  for (const v of params.values) {
    const add =
      v.type === "euint32" ? builder.add32 : v.type === "euint128" ? builder.add128 : builder.add64;
    cur = add.call(builder, v.value);
  }
  if (!cur) throw new Error("encrypt: no values provided");
  const { handles, inputProof } = await cur.encrypt();
  return { handles: handles.map(toHexStr), inputProof: toHexStr(inputProof) };
}

// ── User decrypt (EIP-712 signed by the in-extension keyring) ───────────────────
const START_TS_TOLERANCE_SEC = 60;
const DURATION_DAYS = 10;

export interface HandlePair {
  handle: `0x${string}`;
  contractAddress: `0x${string}`;
}

/** signTypedData is provided by the caller (WagmiSigner → keyring, auto-approved). */
export async function userDecrypt(
  pairs: HandlePair[],
  userAddress: string,
  signTypedData: (eip712: EIP712TypedData) => Promise<string>
): Promise<Record<string, bigint>> {
  if (pairs.length === 0) return {};
  const instance = await getFhevmInstance();
  const keypair = instance.generateKeypair();
  const startTimestamp = Math.floor(Date.now() / 1000) - START_TS_TOLERANCE_SEC;
  const contractAddresses = [...new Set(pairs.map((p) => getAddress(p.contractAddress)))];

  const eip712 = instance.createEIP712(
    keypair.publicKey,
    contractAddresses,
    startTimestamp,
    DURATION_DAYS
  );
  const signature = await signTypedData(eip712);
  const sigHex = signature.startsWith("0x") ? signature.slice(2) : signature;

  const handleContractPairs = pairs.map((p) => ({
    handle: p.handle,
    contractAddress: getAddress(p.contractAddress),
  }));
  const user = getAddress(userAddress as `0x${string}`);

  const result = await instance.userDecrypt(
    handleContractPairs,
    keypair.privateKey,
    keypair.publicKey,
    sigHex,
    contractAddresses,
    user,
    startTimestamp,
    DURATION_DAYS
  );

  // Normalize result keys back to the original handle strings the caller passed.
  const out: Record<string, bigint> = {};
  for (const p of pairs) {
    let v = result[p.handle];
    if (v === undefined) v = result[p.handle.toLowerCase()];
    if (v === undefined) continue;
    out[p.handle] = typeof v === "bigint" ? v : BigInt(String(v));
  }
  return out;
}

// ── Delegated user decrypt (decrypt a DELEGATOR's balances as the connected DELEGATE) ──
// The confidential balances are held by the smart account (delegator); the extension EOA (delegate)
// was authorized on-chain via ACL.delegateForUserDecryption. This proves that delegation to the relayer.
export async function delegatedUserDecrypt(
  pairs: HandlePair[],
  delegatorAddress: string,
  delegateAddress: string,
  signTypedData: (eip712: EIP712TypedData) => Promise<string>
): Promise<Record<string, bigint>> {
  if (pairs.length === 0) return {};
  const instance = await getFhevmInstance();
  if (!instance.createDelegatedUserDecryptEIP712 || !instance.delegatedUserDecrypt) {
    throw new Error("Delegated decrypt not supported by this SDK build.");
  }
  const keypair = instance.generateKeypair();
  const startTimestamp = Math.floor(Date.now() / 1000) - START_TS_TOLERANCE_SEC;
  const contractAddresses = [...new Set(pairs.map((p) => getAddress(p.contractAddress)))];
  const delegator = getAddress(delegatorAddress as `0x${string}`);
  const delegate = getAddress(delegateAddress as `0x${string}`);

  const eip712 = instance.createDelegatedUserDecryptEIP712(
    keypair.publicKey,
    contractAddresses,
    delegator,
    startTimestamp,
    DURATION_DAYS
  );
  const signature = await signTypedData(eip712);
  const sigHex = signature.startsWith("0x") ? signature.slice(2) : signature;

  const handleContractPairs = pairs.map((p) => ({
    handle: p.handle,
    contractAddress: getAddress(p.contractAddress),
  }));

  const result = await instance.delegatedUserDecrypt(
    handleContractPairs,
    keypair.privateKey,
    keypair.publicKey,
    sigHex,
    contractAddresses,
    delegator,
    delegate,
    startTimestamp,
    DURATION_DAYS
  );

  const out: Record<string, bigint> = {};
  for (const p of pairs) {
    let v = result[p.handle];
    if (v === undefined) v = result[p.handle.toLowerCase()];
    if (v === undefined) continue;
    out[p.handle] = typeof v === "bigint" ? v : BigInt(String(v));
  }
  return out;
}

// ── Public decrypt (KMS, for unwrap finalize) ───────────────────────────────────
export interface PublicDecryptResult {
  clearValues: Record<string, bigint>;
  decryptionProof: `0x${string}`;
}

export async function publicDecrypt(handles: `0x${string}`[]): Promise<PublicDecryptResult> {
  const instance = await getFhevmInstance();
  if (!instance.publicDecrypt) throw new Error("publicDecrypt not supported by SDK build.");
  const res = await instance.publicDecrypt(handles);
  const clearValues: Record<string, bigint> = {};
  for (const [k, v] of Object.entries(res.clearValues ?? {})) {
    clearValues[k] = typeof v === "bigint" ? v : BigInt(String(v));
  }
  return {
    clearValues,
    decryptionProof: (res.decryptionProof ?? "0x") as `0x${string}`,
  };
}
