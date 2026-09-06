/**
 * Vault encryption for the ZhieldWrap keyring — runs ONLY in the background service worker.
 *
 * PBKDF2 (SHA-256, 600k iterations) → AES-256-GCM, via WebCrypto (`crypto.subtle`).
 * Approach adapted from zWallet's `cryptoUtils.ts` (MIT License, (c) 2021-2025 Apoorv Lathey).
 *
 * The plaintext (a BIP-39 mnemonic) is NEVER written to storage or sent to the UI unencrypted.
 */

const ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Encrypted blob persisted in chrome.storage.local. Contains no secret without the password. */
export interface Vault {
  v: 1;
  salt: string;
  iv: string;
  ct: string;
}

export async function encryptString(plain: string, password: string): Promise<Vault> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(plain) as unknown as BufferSource
  );
  return { v: 1, salt: toB64(salt), iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function decryptString(vault: Vault, password: string): Promise<string> {
  const key = await deriveKey(password, fromB64(vault.salt));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(vault.iv) as BufferSource },
    key,
    fromB64(vault.ct) as unknown as BufferSource
  );
  return dec.decode(plain);
}
