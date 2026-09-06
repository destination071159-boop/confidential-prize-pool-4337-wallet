/**
 * Internal EIP-1193 provider for the side panel.
 *
 * Every `request()` is forwarded to the background keyring, which either signs it with the
 * in-extension key (eth_sendTransaction / personal_sign / eth_signTypedData_v4) or proxies
 * it to Sepolia (read-only methods). This object is handed to wagmi's `injected` connector
 * as its target provider, so all of wagmi (and the Zama FHE WagmiSigner) route through here.
 *
 * The private key never reaches this context — it stays in the background worker.
 */

import { send } from "./messaging";

type Handler = (...args: unknown[]) => void;

class InternalProvider {
  readonly isZhieldWrap = true;
  private listeners = new Map<string, Set<Handler>>();

  request({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> {
    return send({ type: "EIP1193", method, params });
  }

  on(event: string, handler: Handler): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return this;
  }

  removeListener(event: string, handler: Handler): this {
    this.listeners.get(event)?.delete(handler);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((h) => h(...args));
  }
}

export const internalProvider = new InternalProvider();
