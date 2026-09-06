/**
 * Read-only JSON-RPC proxy to Sepolia, used by the background worker to answer any
 * eth_* method the keyring does not sign itself (eth_call, eth_getBalance, eth_getLogs, …).
 */

export const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
export const CHAIN_ID = 11155111; // Sepolia

let id = 0;

export async function rpcCall<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message || "RPC error");
  return json.result as T;
}
