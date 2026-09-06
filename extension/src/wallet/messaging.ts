/**
 * Typed helper for the side panel to talk to the background keyring.
 * Every message is tagged { scope: "zw" } so the background can ignore foreign messages.
 */

export interface AccountMeta {
  address: string;
  index: number;
  name: string;
  type: "seed" | "pk";
}

export interface WalletStatus {
  hasWallet: boolean;
  isUnlocked: boolean;
  accounts: AccountMeta[];
  activeAddress: string | null;
}

export function send<T = unknown>(msg: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ scope: "zw", ...msg }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!resp) {
          reject(new Error("No response from background worker"));
          return;
        }
        if (resp.ok) {
          resolve(resp.result as T);
        } else {
          const err = new Error(resp.error || "Background error") as Error & { code?: number };
          err.code = resp.code;
          reject(err);
        }
      });
    } catch (e) {
      reject(e as Error);
    }
  });
}

export const wallet = {
  status: () => send<WalletStatus>({ type: "STATUS" }),
  create: (password: string) => send<{ mnemonic: string; address: string }>({ type: "CREATE", password }),
  import: (password: string, mnemonic: string) =>
    send<{ address: string }>({ type: "IMPORT", password, mnemonic }),
  importPk: (password: string, privateKey: string) =>
    send<{ address: string }>({ type: "IMPORT_PK", password, privateKey }),
  unlock: (password: string) => send<{ ok: true }>({ type: "UNLOCK", password }),
  lock: () => send<{ ok: true }>({ type: "LOCK" }),
  reset: () => send<{ ok: true }>({ type: "RESET" }),
  addAccount: () => send<AccountMeta>({ type: "ADD_ACCOUNT" }),
  setActive: (address: string) => send<{ ok: true }>({ type: "SET_ACTIVE", address }),
  revealSeed: (password: string) => send<{ mnemonic: string }>({ type: "REVEAL_SEED", password }),
  approve: (approvalId: string) => send<{ ok: true }>({ type: "APPROVE", approvalId }),
  reject: (approvalId: string) => send<{ ok: true }>({ type: "REJECT", approvalId }),
};
