/**
 * The ZhieldWrap keyring — runs ONLY in the background service worker.
 *
 * Supports two account types:
 *   - "seed": HD accounts derived from a single BIP-39 mnemonic (m/44'/60'/0'/0/i).
 *   - "pk":   standalone accounts imported from a raw private key (e.g. exported from MetaMask).
 *
 * Persistence (chrome.storage.local):
 *   - `zw.vault`         encrypted mnemonic (absent if the wallet has no seed, only imported keys)
 *   - `zw.pk.<address>`  encrypted private key, one per imported "pk" account
 *   - `zw.accounts`      account metadata (address / index / name / type — no secrets)
 *   - `zw.active`        active address
 *
 * Secrets are decrypted only into the in-memory session (lost on lock / worker restart).
 * The password is cached in memory while unlocked so new accounts can be encrypted without
 * re-prompting; it is never persisted.
 */

import {
  HDNodeWallet,
  Mnemonic,
  Wallet,
  JsonRpcProvider,
  getBytes,
  isHexString,
  type BaseWallet,
  type TransactionRequest,
} from "ethers";
import { encryptString, decryptString, type Vault } from "./crypto";
import { RPC_URL, CHAIN_ID } from "./rpc";

export { CHAIN_ID } from "./rpc";

const K_VAULT = "zw.vault";
const K_ACCOUNTS = "zw.accounts";
const K_ACTIVE = "zw.active";
const K_PK_PREFIX = "zw.pk."; // + lowercased address

export type AccountType = "seed" | "pk";
export interface AccountMeta {
  address: string;
  index: number; // HD index for "seed"; sequential label index for "pk"
  name: string;
  type: AccountType;
}

const session: {
  unlocked: boolean;
  mnemonic: string | null;
  password: string | null;
  wallets: Map<string, BaseWallet>;
} = { unlocked: false, mnemonic: null, password: null, wallets: new Map() };

const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID);

// ── storage helpers ──
function get<T>(key: string): Promise<T | undefined> {
  return new Promise((res) => chrome.storage.local.get(key, (o) => res(o[key] as T | undefined)));
}
function put(key: string, val: unknown): Promise<void> {
  return new Promise((res) => chrome.storage.local.set({ [key]: val }, () => res()));
}
function del(keys: string[]): Promise<void> {
  return new Promise((res) => chrome.storage.local.remove(keys, () => res()));
}

// ── session-scoped storage (RAM-only, survives service-worker restarts, cleared on browser
// close). Holds the decrypted unlock so a killed MV3 worker doesn't silently re-lock the wallet.
const K_SESSION = "zw.session";
function getSession<T>(key: string): Promise<T | undefined> {
  return new Promise((res) => chrome.storage.session.get(key, (o) => res(o[key] as T | undefined)));
}
function putSession(key: string, val: unknown): Promise<void> {
  return new Promise((res) => chrome.storage.session.set({ [key]: val }, () => res()));
}
function delSession(keys: string[]): Promise<void> {
  return new Promise((res) => chrome.storage.session.remove(keys, () => res()));
}

function derive(phrase: string, index: number): HDNodeWallet {
  return HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(phrase), `m/44'/60'/0'/0/${index}`);
}

function normalizePk(pkRaw: string): string {
  let pk = pkRaw.trim();
  if (!pk.startsWith("0x")) pk = "0x" + pk;
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new Error("Invalid private key (need 64 hex chars)");
  return pk;
}

/** Rebuild the in-memory signers from storage. Requires the password to decrypt each secret. */
async function rebuildSession(phrase: string | null, password: string): Promise<void> {
  session.wallets.clear();
  const accounts = await getAccounts();
  for (const a of accounts) {
    const key = a.address.toLowerCase();
    if (a.type === "pk") {
      const vault = await get<Vault>(K_PK_PREFIX + key);
      if (!vault) continue;
      const pk = await decryptString(vault, password); // throws on wrong password
      session.wallets.set(key, new Wallet(pk, provider));
    } else if (phrase) {
      session.wallets.set(key, derive(phrase, a.index).connect(provider));
    }
  }
  session.mnemonic = phrase;
  session.password = password;
  session.unlocked = true;
  // Persist so a restarted service worker can rehydrate without re-prompting the password.
  await putSession(K_SESSION, { mnemonic: phrase, password });
}

/**
 * Rehydrate the in-memory session from chrome.storage.session if the worker was restarted.
 * No-op if already unlocked or if there is no saved session.
 */
export async function ensureSession(): Promise<void> {
  if (session.unlocked) return;
  const saved = await getSession<{ mnemonic: string | null; password: string }>(K_SESSION);
  if (!saved?.password) return;
  try {
    await rebuildSession(saved.mnemonic ?? null, saved.password);
  } catch {
    await delSession([K_SESSION]);
  }
}

// ── public API ──
export function isUnlocked(): boolean {
  return session.unlocked;
}

/** Async unlock check that first rehydrates a session dropped by a service-worker restart. */
export async function ensureUnlocked(): Promise<boolean> {
  await ensureSession();
  return session.unlocked;
}

export async function getAccounts(): Promise<AccountMeta[]> {
  return (await get<AccountMeta[]>(K_ACCOUNTS)) ?? [];
}

export async function hasWallet(): Promise<boolean> {
  return (await getAccounts()).length > 0;
}

export async function getActiveAddress(): Promise<string | null> {
  const active = await get<string>(K_ACTIVE);
  if (active) return active;
  const accounts = await getAccounts();
  return accounts[0]?.address ?? null;
}

export async function create(password: string): Promise<{ mnemonic: string; address: string }> {
  const phrase = Wallet.createRandom().mnemonic!.phrase;
  const acct = derive(phrase, 0);
  await put(K_VAULT, await encryptString(phrase, password));
  await put(K_ACCOUNTS, [{ address: acct.address, index: 0, name: "Account 1", type: "seed" }]);
  await put(K_ACTIVE, acct.address);
  await rebuildSession(phrase, password);
  return { mnemonic: phrase, address: acct.address };
}

export async function importMnemonic(
  password: string,
  phraseRaw: string
): Promise<{ address: string }> {
  const phrase = phraseRaw.trim().toLowerCase().replace(/\s+/g, " ");
  Mnemonic.fromPhrase(phrase); // validates checksum
  const acct = derive(phrase, 0);
  await put(K_VAULT, await encryptString(phrase, password));
  await put(K_ACCOUNTS, [{ address: acct.address, index: 0, name: "Account 1", type: "seed" }]);
  await put(K_ACTIVE, acct.address);
  await rebuildSession(phrase, password);
  return { address: acct.address };
}

/**
 * Import a standalone private key.
 *  - As the first wallet: `password` sets the vault password and unlocks.
 *  - When already unlocked: `password` is ignored; the cached session password is reused.
 */
export async function importPrivateKey(
  password: string,
  pkRaw: string
): Promise<{ address: string }> {
  await ensureSession(); // rehydrate so an unlocked wallet reuses its session password
  const pk = normalizePk(pkRaw);
  const wallet = new Wallet(pk); // throws on invalid key
  const address = wallet.address;
  const key = address.toLowerCase();

  const accounts = await getAccounts();
  if (accounts.some((a) => a.address.toLowerCase() === key)) {
    throw new Error("This account is already imported");
  }

  const encPassword = session.unlocked && session.password ? session.password : password;
  if (!encPassword || encPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  await put(K_PK_PREFIX + key, await encryptString(pk, encPassword));
  const meta: AccountMeta = {
    address,
    index: accounts.length,
    name: `Account ${accounts.length + 1}`,
    type: "pk",
  };
  await put(K_ACCOUNTS, [...accounts, meta]);
  await put(K_ACTIVE, address);

  if (session.unlocked) {
    session.wallets.set(key, new Wallet(pk, provider));
  } else {
    await rebuildSession(session.mnemonic, encPassword);
  }
  return { address };
}

export async function unlock(password: string): Promise<void> {
  const accounts = await getAccounts();
  if (accounts.length === 0) throw new Error("No wallet exists");
  const vault = await get<Vault>(K_VAULT);
  let phrase: string | null = null;
  try {
    if (vault) phrase = await decryptString(vault, password);
    await rebuildSession(phrase, password); // decrypts pk vaults; throws on wrong password
  } catch {
    throw new Error("Incorrect password");
  }
}

export async function lock(): Promise<void> {
  session.unlocked = false;
  session.mnemonic = null;
  session.password = null;
  session.wallets.clear();
  await delSession([K_SESSION]);
}

export async function reset(): Promise<void> {
  const accounts = await getAccounts();
  await lock();
  const pkKeys = accounts
    .filter((a) => a.type === "pk")
    .map((a) => K_PK_PREFIX + a.address.toLowerCase());
  await del([K_VAULT, K_ACCOUNTS, K_ACTIVE, ...pkKeys]);
}

export async function addAccount(): Promise<AccountMeta> {
  await ensureSession();
  if (!session.unlocked || !session.mnemonic) throw new Error("No seed to derive from");
  const accounts = await getAccounts();
  const seedIndexes = accounts.filter((a) => a.type === "seed").map((a) => a.index);
  const index = seedIndexes.length ? Math.max(...seedIndexes) + 1 : 0;
  const w = derive(session.mnemonic, index).connect(provider);
  const meta: AccountMeta = {
    address: w.address,
    index,
    name: `Account ${accounts.length + 1}`,
    type: "seed",
  };
  await put(K_ACCOUNTS, [...accounts, meta]);
  session.wallets.set(w.address.toLowerCase(), w);
  return meta;
}

export async function setActive(address: string): Promise<void> {
  await put(K_ACTIVE, address);
}

export async function revealSeed(password: string): Promise<string> {
  const vault = await get<Vault>(K_VAULT);
  if (!vault) throw new Error("This wallet has no recovery phrase (imported private key only)");
  try {
    return await decryptString(vault, password);
  } catch {
    throw new Error("Incorrect password");
  }
}

async function activeWallet(): Promise<BaseWallet> {
  await ensureSession();
  if (!session.unlocked) throw new Error("Locked");
  const addr = await getActiveAddress();
  if (!addr) throw new Error("No active account");
  const w = session.wallets.get(addr.toLowerCase());
  if (!w) throw new Error("Active account not in session");
  return w;
}

// ── EIP-1193 signing ──
export async function ethSendTransaction(tx: Record<string, string | undefined>): Promise<string> {
  const w = await activeWallet();
  const req: TransactionRequest = {
    to: tx.to,
    data: tx.data,
    value: tx.value,
    gasLimit: tx.gas,
    nonce: tx.nonce !== undefined ? Number(tx.nonce) : undefined,
    gasPrice: tx.gasPrice,
    maxFeePerGas: tx.maxFeePerGas,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
  };
  const resp = await w.sendTransaction(req);
  return resp.hash;
}

export async function personalSign(message: string): Promise<string> {
  const w = await activeWallet();
  return w.signMessage(isHexString(message) ? getBytes(message) : message);
}

export async function signTypedDataV4(json: string): Promise<string> {
  const w = await activeWallet();
  const parsed = JSON.parse(json) as {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    message: Record<string, unknown>;
  };
  const types = { ...parsed.types };
  delete (types as Record<string, unknown>).EIP712Domain;
  return w.signTypedData(parsed.domain as never, types as never, parsed.message as never);
}
