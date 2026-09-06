import { useState } from "react";
import { usePublicClient } from "wagmi";
import { isAddress, getAddress } from "viem";
import {
  CONFIDENTIAL_TOKEN_ABI,
  UNDERLYING_TOKEN_ABI,
  type Asset,
  shortAddr,
} from "@zhieldwrap/core";
import { addCustomToken, removeCustomToken, useCustomTokens } from "../lib/customTokens";

export function AddToken() {
  const publicClient = usePublicClient();
  const custom = useCustomTokens();
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const valid = isAddress(addr);

  async function add() {
    if (!valid || !publicClient) return;
    setBusy(true);
    setErr(null);
    setStatus("Reading token…");
    try {
      const token = getAddress(addr) as `0x${string}`;
      const read = (a: `0x${string}`, abi: any, fn: string) =>
        (publicClient.readContract as any)({ address: a, abi, functionName: fn });
      const [symbol, name, underlying] = (await Promise.all([
        read(token, CONFIDENTIAL_TOKEN_ABI, "symbol"),
        read(token, CONFIDENTIAL_TOKEN_ABI, "name"),
        read(token, CONFIDENTIAL_TOKEN_ABI, "underlying"),
      ])) as [string, string, `0x${string}`];

      const decimals = (await read(underlying, UNDERLYING_TOKEN_ABI, "decimals")) as number;

      const asset: Asset = {
        symbol: symbol.replace(/Mock$/, ""),
        name,
        token,
        underlying: getAddress(underlying) as `0x${string}`,
        underlyingDecimals: Number(decimals),
      };
      addCustomToken(asset);
      setStatus(`✅ Added ${asset.symbol}.`);
      setAddr("");
    } catch (e: any) {
      setErr("Not a valid ERC-7984 confidential token (couldn't read symbol / underlying).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button className="text-xs font-medium text-[#8a6d00] hover:brightness-105" onClick={() => setOpen((v) => !v)}>
          {open ? "− Hide" : "+ Add token"}
        </button>
        {custom.length > 0 && <span className="text-[11px] text-neutral-500">{custom.length} custom</span>}
      </div>

      {open && (
        <div className="card space-y-3 !p-4">
          <h3 className="text-sm font-semibold">Add a confidential token</h3>
          <p className="text-[11px] text-neutral-500">Paste any ERC-7984 confidential-token (wrapper) address. It'll appear across the wallet.</p>
          <div className="flex gap-2">
            <input
              className="input-field mono text-xs"
              value={addr}
              onChange={(e) => { setAddr(e.target.value); setErr(null); setStatus(null); }}
              placeholder="0x… (ERC-7984 token address)"
              spellCheck={false}
            />
            <button className="btn-primary text-xs shrink-0" onClick={add} disabled={busy || !valid}>
              {busy ? "…" : "Add"}
            </button>
          </div>
          {status && <p className="text-[11px] text-emerald-600">{status}</p>}
          {err && <p className="text-[11px] text-red-600">{err}</p>}

          {custom.length > 0 && (
            <div className="pt-2 border-t border-black/10 space-y-1.5">
              {custom.map((t) => (
                <div key={t.token} className="flex items-center gap-2 text-xs">
                  <span className="font-semibold">{t.symbol}</span>
                  <span className="text-neutral-500 mono">{shortAddr(t.token)}</span>
                  <button className="ml-auto text-[11px] text-red-600 hover:brightness-110" onClick={() => removeCustomToken(t.token)}>
                    remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AddToken;
