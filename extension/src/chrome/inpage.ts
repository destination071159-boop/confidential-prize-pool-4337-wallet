/**
 * Inpage provider (Phase 3) — runs in the page's MAIN world, injected by inject.ts.
 *
 * This is what a dApp sees as `window.ethereum` (and via EIP-6963 discovery). It holds NO keys
 * and does no network itself; every signing/tx/read request is postMessage'd to the content
 * script (inject.ts), which relays to the background keyring. Sepolia-only.
 */

type Json = Record<string, unknown>;

// ── Minimal EventEmitter (avoids bundling node 'events' into the MAIN world) ────
class Emitter {
  private listeners = new Map<string, Set<(...a: unknown[]) => void>>();
  on(event: string, cb: (...a: unknown[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return this;
  }
  removeListener(event: string, cb: (...a: unknown[]) => void) {
    this.listeners.get(event)?.delete(cb);
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((cb) => cb(...args));
  }
}

const SEPOLIA_CHAIN_ID = 11155111;
const CHAIN_ID_HEX = "0x" + SEPOLIA_CHAIN_ID.toString(16); // 0xaa36a7

// Pending page→content round-trips, keyed by request id.
const pendingTx = new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>();
const pendingSig = new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>();
const pendingRpc = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

let rid = 0;
const nextId = () => `${Date.now()}-${++rid}`;

function post(type: string, msg: Json) {
  window.postMessage({ type, msg }, "*");
}

function rpc(method: string, params: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = nextId();
    pendingRpc.set(id, { resolve, reject });
    post("i_rpcRequest", { id, method, params });
    setTimeout(() => {
      if (pendingRpc.delete(id)) reject(new Error("RPC request timeout"));
    }, 30_000);
  });
}

class ZhieldWrapProvider extends Emitter {
  isZhieldWrap = true;
  isMetaMask = true; // maximize dApp compatibility
  private address: string | null;

  constructor(address: string | null) {
    super();
    this.address = address;
  }

  setAddress(address: string | null) {
    this.address = address;
    this.emit("accountsChanged", address ? [address] : []);
  }

  request(args: { method: string; params?: unknown[] }): Promise<unknown> {
    return this.send(args.method, args.params ?? []);
  }

  private reject(code: number, message: string): never {
    const err = new Error(message) as Error & { code: number };
    err.code = code;
    throw err;
  }

  async send(method: string, params: unknown[] = []): Promise<unknown> {
    switch (method) {
      case "eth_requestAccounts": {
        if (!this.address) this.reject(4100, "ZhieldWrap is locked or has no account");
        this.emit("connect", { chainId: CHAIN_ID_HEX });
        return [this.address];
      }
      case "eth_accounts":
        return this.address ? [this.address] : [];
      case "eth_chainId":
        return CHAIN_ID_HEX;
      case "net_version":
        return String(SEPOLIA_CHAIN_ID);
      case "wallet_switchEthereumChain": {
        const target = Number((params[0] as { chainId?: string })?.chainId ?? "0x0");
        if (target !== SEPOLIA_CHAIN_ID) {
          this.reject(4902, `ZhieldWrap only supports Sepolia (0xaa36a7)`);
        }
        return null;
      }
      case "wallet_addEthereumChain":
        return null;
      case "wallet_requestPermissions":
        return [{ parentCapability: "eth_accounts" }];
      case "wallet_revokePermissions":
        return null;

      case "eth_sign":
      case "personal_sign":
      case "eth_signTypedData":
      case "eth_signTypedData_v3":
      case "eth_signTypedData_v4": {
        const id = nextId();
        return new Promise<string>((resolve, reject) => {
          pendingSig.set(id, { resolve, reject });
          post("i_signatureRequest", { id, method, params });
        });
      }

      case "eth_sendTransaction": {
        const tx = (params[0] ?? {}) as Json;
        const id = nextId();
        return new Promise<string>((resolve, reject) => {
          pendingTx.set(id, { resolve, reject });
          post("i_sendTransaction", { id, tx });
        });
      }

      default:
        // Everything else (eth_call, eth_getBalance, eth_estimateGas, logs, …) → RPC proxy.
        return rpc(method, params);
    }
  }
}

// ── EIP-6963 discovery ──────────────────────────────────────────────────────────
let providerInstance: ZhieldWrapProvider | null = null;
const SESSION_UUID =
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : nextId();

// 1x1 transparent PNG placeholder icon (kept tiny; real icon can replace later).
const ICON =
  "data:image/svg+xml;base64," +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="20" fill="#6d28d9"/><text x="48" y="62" font-size="44" fill="#fff" text-anchor="middle" font-family="sans-serif">Z</text></svg>'
  );

function announce() {
  if (!providerInstance) return;
  window.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail: Object.freeze({
        info: Object.freeze({
          uuid: SESSION_UUID,
          name: "Confidential Prize Pool 4337 Wallet",
          icon: ICON,
          rdns: "com.zhieldwrap",
        }),
        provider: providerInstance,
      }),
    })
  );
}

function setWindowEthereum(provider: ZhieldWrapProvider) {
  try {
    try {
      delete (window as unknown as Record<string, unknown>).ethereum;
    } catch {
      /* not configurable — ignore */
    }
    try {
      (window as unknown as Record<string, unknown>).ethereum = provider;
      if ((window as unknown as Record<string, unknown>).ethereum === provider) return;
    } catch {
      /* fall through to defineProperty */
    }
    Object.defineProperty(window, "ethereum", {
      value: provider,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    // Another wallet claimed window.ethereum; EIP-6963 discovery still works.
  }
}

window.addEventListener("eip6963:requestProvider", announce);

// ── Messages from the content script (inject.ts) ────────────────────────────────
window.addEventListener("message", (e: MessageEvent) => {
  if (e.source !== window || !e.data?.type) return;
  const { type, msg } = e.data as { type: string; msg: Json };

  switch (type) {
    case "init": {
      providerInstance = new ZhieldWrapProvider((msg.address as string) ?? null);
      setWindowEthereum(providerInstance);
      announce();
      break;
    }
    case "setAddress":
      providerInstance?.setAddress((msg.address as string) ?? null);
      break;
    case "accountsChanged":
      providerInstance?.setAddress((msg.address as string) ?? null);
      break;
    case "sendTransactionResult": {
      const cb = pendingTx.get(msg.id as string);
      if (!cb) break;
      pendingTx.delete(msg.id as string);
      if (msg.success && msg.txHash) cb.resolve(msg.txHash as string);
      else {
        const err = new Error((msg.error as string) || "Transaction failed") as Error & {
          code: number;
        };
        if (/reject|denied|cancel/i.test(err.message)) err.code = 4001;
        cb.reject(err);
      }
      break;
    }
    case "signatureRequestResult": {
      const cb = pendingSig.get(msg.id as string);
      if (!cb) break;
      pendingSig.delete(msg.id as string);
      if (msg.success && msg.signature) cb.resolve(msg.signature as string);
      else {
        const err = new Error((msg.error as string) || "Signature rejected") as Error & {
          code: number;
        };
        if (/reject|denied|cancel/i.test(err.message)) err.code = 4001;
        cb.reject(err);
      }
      break;
    }
    case "rpcResponse": {
      const cb = pendingRpc.get(msg.id as string);
      if (!cb) break;
      pendingRpc.delete(msg.id as string);
      if (msg.error) {
        const err = new Error(msg.error as string) as Error & { code?: number; data?: unknown };
        if (msg.errorCode !== undefined) err.code = msg.errorCode as number;
        if (msg.errorData !== undefined) err.data = msg.errorData;
        cb.reject(err);
      } else cb.resolve(msg.result);
      break;
    }
  }
});

export {};
