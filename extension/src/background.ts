/**
 * ZhieldWrap background service worker (MV3) — Phase 2.
 *
 * Holds the keyring and answers two kinds of messages from the UI (side panel):
 *   1. Wallet control: STATUS / CREATE / IMPORT / UNLOCK / LOCK / RESET / ADD_ACCOUNT /
 *      SET_ACTIVE / REVEAL_SEED.
 *   2. EIP1193: an EIP-1193 request forwarded by the in-page internal provider — signed
 *      here with the in-extension key, or proxied to Sepolia for read-only methods.
 *
 * SECURITY: all secret material stays in this worker. The UI never receives a private key
 * or the mnemonic except via REVEAL_SEED, which re-checks the password.
 */

import * as keyring from "./chrome/keyring";
import { rpcCall, CHAIN_ID } from "./chrome/rpc";

// Toolbar icon opens the side panel (no default_popup set).
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
  console.log("[ZhieldWrap] installed");
});
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

const CHAIN_ID_HEX = "0x" + CHAIN_ID.toString(16); // 0xaa36a7

type RpcError = { code: number; message: string };

// ── User approval for signing operations ──
// A pending request holds until the side panel replies APPROVE / REJECT.
const pendingApprovals = new Map<string, (ok: boolean) => void>();
let approvalSeq = 0;

function requestApproval(method: string, detail: unknown): Promise<boolean> {
  const approvalId = `ap_${++approvalSeq}`;
  return new Promise((resolve) => {
    pendingApprovals.set(approvalId, resolve);
    // Broadcast to the side panel; if nothing is listening, fail closed (reject).
    chrome.runtime
      .sendMessage({ scope: "zw", type: "APPROVAL_REQUEST", approvalId, method, detail })
      .catch(() => {
        if (pendingApprovals.delete(approvalId)) resolve(false);
      });
  });
}

function resolveApproval(approvalId: string, ok: boolean) {
  const r = pendingApprovals.get(approvalId);
  if (r) {
    pendingApprovals.delete(approvalId);
    r(ok);
  }
}

async function handleEip1193(method: string, params: unknown[]): Promise<unknown> {
  switch (method) {
    case "eth_requestAccounts":
    case "eth_accounts": {
      if (!(await keyring.ensureUnlocked())) {
        if (method === "eth_requestAccounts") {
          throw { code: 4100, message: "ZhieldWrap is locked" } as RpcError;
        }
        return [];
      }
      const a = await keyring.getActiveAddress();
      return a ? [a] : [];
    }
    case "eth_chainId":
      return CHAIN_ID_HEX;
    case "net_version":
      return String(CHAIN_ID);
    case "wallet_switchEthereumChain":
    case "wallet_addEthereumChain":
      return null; // single-chain wallet (Sepolia)
    case "wallet_requestPermissions":
      return [{ parentCapability: "eth_accounts" }];
    case "wallet_revokePermissions":
      return null;
    case "eth_sendTransaction": {
      const tx = params[0] as Record<string, string | undefined>;
      if (!(await requestApproval("eth_sendTransaction", tx))) {
        throw { code: 4001, message: "User rejected the transaction" } as RpcError;
      }
      return keyring.ethSendTransaction(tx);
    }
    case "personal_sign": {
      if (!(await requestApproval("personal_sign", { message: params[0], address: params[1] }))) {
        throw { code: 4001, message: "User rejected the signature" } as RpcError;
      }
      return keyring.personalSign(params[0] as string);
    }
    case "eth_sign": {
      if (!(await requestApproval("personal_sign", { message: params[1], address: params[0] }))) {
        throw { code: 4001, message: "User rejected the signature" } as RpcError;
      }
      return keyring.personalSign(params[1] as string);
    }
    // NOTE: eth_signTypedData_* is auto-approved so the Zama FHE decrypt flow (which signs an
    // EIP-712 authorization, often several per action) stays smooth. Add a prompt here later.
    case "eth_signTypedData":
    case "eth_signTypedData_v3":
    case "eth_signTypedData_v4": {
      const raw = params[1];
      return keyring.signTypedDataV4(typeof raw === "string" ? raw : JSON.stringify(raw));
    }
    default:
      // Read-only methods → proxy to the Sepolia node.
      return rpcCall(method, (params as unknown[]) ?? []);
  }
}

// ── External dApp requests (Phase 3: EIP-1193 provider) ──
// Unlike the side panel's own internal provider, requests from external web pages ALWAYS need
// user approval — including typed-data signatures — and carry the requesting origin + favicon.

/** Notify every content script (connected dApp) that the active account changed. */
function broadcastAccountChanged(address: string | null): void {
  try {
    chrome.tabs?.query({}, (tabs) => {
      for (const t of tabs) {
        if (t.id != null) {
          chrome.tabs.sendMessage(t.id, { scope: "zw", type: "EXT_ACCOUNT_CHANGED", address }).catch?.(() => {});
        }
      }
    });
  } catch {
    /* ignore */
  }
}

async function extRequireUnlocked(): Promise<void> {
  if (!(await keyring.ensureUnlocked())) {
    throw { code: 4100, message: "Open ZhieldWrap and unlock to approve this request." } as RpcError;
  }
}

/** Best-effort: surface the side panel so the approval prompt is visible (may no-op without a gesture). */
function tryOpenPanel(): void {
  try {
    chrome.windows?.getCurrent?.((w) => {
      if (w?.id != null) chrome.sidePanel?.open?.({ windowId: w.id }).catch(() => {});
    });
  } catch {
    /* ignore */
  }
}

async function handleExtSign(
  method: string,
  params: unknown[],
  origin: string,
  favicon: string | null
): Promise<string> {
  await extRequireUnlocked();
  tryOpenPanel();
  const isTyped = method.startsWith("eth_signTypedData");
  const detail: Record<string, unknown> = { origin, favicon, external: true, method };
  if (isTyped) {
    detail.typedData = typeof params[1] === "string" ? params[1] : JSON.stringify(params[1]);
    detail.address = params[0];
  } else if (method === "eth_sign") {
    detail.message = params[1];
    detail.address = params[0];
  } else {
    detail.message = params[0];
    detail.address = params[1];
  }
  if (!(await requestApproval(isTyped ? "eth_signTypedData" : "personal_sign", detail))) {
    throw { code: 4001, message: "User rejected the signature request" } as RpcError;
  }
  if (isTyped) {
    const raw = params[1];
    return keyring.signTypedDataV4(typeof raw === "string" ? raw : JSON.stringify(raw));
  }
  return keyring.personalSign((method === "eth_sign" ? params[1] : params[0]) as string);
}

async function handleExtSendTx(
  tx: Record<string, string | undefined>,
  origin: string,
  favicon: string | null
): Promise<string> {
  await extRequireUnlocked();
  tryOpenPanel();
  if (!(await requestApproval("eth_sendTransaction", { ...tx, origin, favicon, external: true }))) {
    throw { code: 4001, message: "User rejected the transaction" } as RpcError;
  }
  return keyring.ethSendTransaction(tx);
}

interface Msg {
  scope?: string;
  type?: string;
  [k: string]: unknown;
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  if (!msg || msg.scope !== "zw") return false;

  (async () => {
    try {
      let result: unknown;
      switch (msg.type) {
        case "STATUS":
          result = {
            hasWallet: await keyring.hasWallet(),
            isUnlocked: await keyring.ensureUnlocked(),
            accounts: await keyring.getAccounts(),
            activeAddress: await keyring.getActiveAddress(),
          };
          break;
        case "CREATE":
          result = await keyring.create(msg.password as string);
          break;
        case "IMPORT":
          result = await keyring.importMnemonic(msg.password as string, msg.mnemonic as string);
          break;
        case "IMPORT_PK":
          result = await keyring.importPrivateKey(msg.password as string, msg.privateKey as string);
          break;
        case "UNLOCK":
          await keyring.unlock(msg.password as string);
          broadcastAccountChanged(await keyring.getActiveAddress());
          result = { ok: true };
          break;
        case "LOCK":
          await keyring.lock();
          broadcastAccountChanged(null);
          result = { ok: true };
          break;
        case "RESET":
          await keyring.reset();
          result = { ok: true };
          break;
        case "ADD_ACCOUNT":
          result = await keyring.addAccount();
          break;
        case "SET_ACTIVE":
          await keyring.setActive(msg.address as string);
          broadcastAccountChanged(msg.address as string);
          result = { ok: true };
          break;
        case "REVEAL_SEED":
          result = { mnemonic: await keyring.revealSeed(msg.password as string) };
          break;
        case "APPROVE":
          resolveApproval(msg.approvalId as string, true);
          result = { ok: true };
          break;
        case "REJECT":
          resolveApproval(msg.approvalId as string, false);
          result = { ok: true };
          break;
        case "EIP1193":
          result = await handleEip1193(msg.method as string, (msg.params as unknown[]) ?? []);
          break;
        // ── External dApp provider (content script → background) ──
        case "EXT_GET_ACCOUNT":
          result = { address: await keyring.getActiveAddress() };
          break;
        case "EXT_RPC":
          result = await rpcCall(msg.method as string, (msg.params as unknown[]) ?? []);
          break;
        case "EXT_SIGN":
          result = await handleExtSign(
            msg.method as string,
            (msg.params as unknown[]) ?? [],
            msg.origin as string,
            (msg.favicon as string | null) ?? null
          );
          break;
        case "EXT_SEND_TX":
          result = await handleExtSendTx(
            msg.tx as Record<string, string | undefined>,
            msg.origin as string,
            (msg.favicon as string | null) ?? null
          );
          break;
        default:
          throw new Error(`Unknown message type: ${String(msg.type)}`);
      }
      sendResponse({ ok: true, result });
    } catch (e) {
      const err = e as { message?: string; code?: number };
      sendResponse({ ok: false, error: err?.message || String(e), code: err?.code });
    }
  })();

  return true; // async response
});
