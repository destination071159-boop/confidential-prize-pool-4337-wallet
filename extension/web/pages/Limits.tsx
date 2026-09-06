import { useState } from "react";
import { useReadContract } from "wagmi";
import { isAddress, encodeFunctionData } from "viem";
import { useEncrypt, useUserDecrypt } from "@zama-fhe/react-sdk";
import {
  REGISTRY,
  type Asset,
  CONFIDENTIAL_TOKEN_ABI,
  SPENDING_LIMIT_MODULE,
  SPENDING_LIMIT_MODULE_ABI,
  OPERATOR_UNTIL,
  NULL_HANDLE,
  parseAmount,
  formatAmount,
  shortAddr,
  BUNDLER_URL,
} from "@zhieldwrap/core";
import { useAssets } from "../lib/customTokens";
import { useSmartAccount } from "../hooks/useSmartAccount";
import { recordActivity } from "../lib/activity";

export function Limits() {
  const [asset, setAsset] = useState<Asset>(REGISTRY[0]);
  const assets = useAssets();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Confidential Spending Limits</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Grant a key a hidden {asset.symbol} cap. Only you can see the limit and running total — the key
          spends against a ciphertext it can't read.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {assets.map((a) => (
          <button
            key={a.token}
            onClick={() => setAsset(a)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              a.token === asset.token
                ? "bg-[#fff3c4] text-[#8a6d00] border-[#f7c948]"
                : "bg-black/[0.04] text-neutral-600 border-black/10 hover:text-neutral-900"
            }`}
          >
            {a.symbol}
          </button>
        ))}
      </div>
      <GrantKeyCard asset={asset} />
      <PolicyViewCard asset={asset} />
    </div>
  );
}

function GrantKeyCard({ asset }: { asset: Asset }) {
  const { eoa, smartAccountAddress, sendTransactions } = useSmartAccount();
  const encrypt = useEncrypt();
  const [key, setKey] = useState("");
  const [limit, setLimit] = useState("");
  const [days, setDays] = useState("1");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const validKey = isAddress(key);
  let validLimit = false;
  try {
    validLimit = parseAmount(limit) > 0n;
  } catch {
    validLimit = false;
  }
  const validDays = Number(days) > 0;

  async function grant() {
    if (!smartAccountAddress || !eoa || !validKey || !validLimit || !validDays) return;
    setBusy(true);
    setErr(null);
    try {
      const cap = parseAmount(limit);
      const periodSeconds = BigInt(Math.round(Number(days) * 86400));
      setStatus("Encrypting the limit…");
      const enc = await encrypt.mutateAsync({
        values: [{ value: cap, type: "euint64" }],
        contractAddress: SPENDING_LIMIT_MODULE,
        userAddress: smartAccountAddress as `0x${string}`,
      });
      const encLimit = enc.handles[0] as `0x${string}`;
      const inputProof = enc.inputProof as `0x${string}`;
      const setViewer = encodeFunctionData({ abi: SPENDING_LIMIT_MODULE_ABI, functionName: "setPolicyViewer", args: [eoa as `0x${string}`] });
      const setOperator = encodeFunctionData({ abi: CONFIDENTIAL_TOKEN_ABI, functionName: "setOperator", args: [SPENDING_LIMIT_MODULE, OPERATOR_UNTIL] });
      const setLimitData = encodeFunctionData({ abi: SPENDING_LIMIT_MODULE_ABI, functionName: "setLimit", args: [asset.token, key as `0x${string}`, encLimit, inputProof, periodSeconds] });
      setStatus("Building & signing UserOperation…");
      const res = await sendTransactions([
        { to: SPENDING_LIMIT_MODULE, value: 0n, data: setViewer },
        { to: asset.token, value: 0n, data: setOperator },
        { to: SPENDING_LIMIT_MODULE, value: 0n, data: setLimitData },
      ]);
      const txh = await res.included();
      recordActivity({
        type: "grant",
        label: `Granted ${shortAddr(key)} a hidden ${limit} ${asset.symbol} / ${days}d cap`,
        asset: asset.symbol,
        hash: txh ?? res.userOpHash,
        isUserOp: !txh,
        gasless: true,
      });
      setStatus(`✅ Granted ${shortAddr(key)} a hidden ${limit} ${asset.symbol} / ${days}d cap. They can't see it.`);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Grant a spending key — {asset.symbol}</h2>
      <div>
        <label className="text-xs text-neutral-600">Key address (the signer you delegate to)</label>
        <input className="input-field mt-1 mono text-xs" value={key} onChange={(e) => setKey(e.target.value)} placeholder="0x…" spellCheck={false} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-neutral-600">Limit ({asset.symbol})</label>
          <input className="input-field mt-1" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="100.00" />
        </div>
        <div>
          <label className="text-xs text-neutral-600">Period (days)</label>
          <input className="input-field mt-1" inputMode="decimal" value={days} onChange={(e) => setDays(e.target.value)} placeholder="1" />
        </div>
      </div>
      <button className="btn-primary w-full" onClick={grant} disabled={busy || !validKey || !validLimit || !validDays || !BUNDLER_URL}>
        {busy ? status ?? "Working…" : `🔑 Grant key with hidden ${asset.symbol} limit`}
      </button>
      {status && !busy && <p className="text-xs text-neutral-600">{status}</p>}
      {err && <p className="text-xs text-red-600 break-words">{err}</p>}
    </div>
  );
}

function PolicyViewCard({ asset }: { asset: Asset }) {
  const { smartAccountAddress, sendTransactions } = useSmartAccount();
  const [key, setKey] = useState("");
  const [clicked, setClicked] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const validKey = isAddress(key);
  const owner = smartAccountAddress as `0x${string}` | undefined;

  const { data: limitHandle, refetch: rl } = useReadContract({
    address: SPENDING_LIMIT_MODULE,
    abi: SPENDING_LIMIT_MODULE_ABI,
    functionName: "limitOf",
    args: owner && validKey ? [asset.token, owner, key] : undefined,
    query: { enabled: !!owner && validKey },
  });
  const { data: spentHandle, refetch: rs } = useReadContract({
    address: SPENDING_LIMIT_MODULE,
    abi: SPENDING_LIMIT_MODULE_ABI,
    functionName: "spentOf",
    args: owner && validKey ? [asset.token, owner, key] : undefined,
    query: { enabled: !!owner && validKey },
  });
  const lHandle = limitHandle as `0x${string}` | undefined;
  const sHandle = spentHandle as `0x${string}` | undefined;
  const hasPolicy = !!lHandle && lHandle !== NULL_HANDLE;

  const limitDec = useUserDecrypt(
    { handles: lHandle && lHandle !== NULL_HANDLE ? [{ handle: lHandle, contractAddress: SPENDING_LIMIT_MODULE }] : [] },
    { enabled: clicked && !!lHandle && lHandle !== NULL_HANDLE }
  );
  const spentDec = useUserDecrypt(
    { handles: sHandle && sHandle !== NULL_HANDLE ? [{ handle: sHandle, contractAddress: SPENDING_LIMIT_MODULE }] : [] },
    { enabled: clicked && !!sHandle && sHandle !== NULL_HANDLE }
  );
  const isDecrypting = (limitDec as any).isLoading || (spentDec as any).isLoading;
  const limitVal = lHandle ? (limitDec.data?.[lHandle] as bigint | undefined) : undefined;
  const spentVal = sHandle ? (spentDec.data?.[sHandle] as bigint | undefined) : undefined;
  const remaining = limitVal !== undefined && spentVal !== undefined ? limitVal - spentVal : undefined;

  async function reveal() {
    try {
      await Promise.all([rl(), rs()]);
      setClicked(true);
    } catch (e) {
      console.error(e);
    }
  }
  async function revoke() {
    if (!validKey) return;
    setRevoking(true);
    setStatus("Revoking key (gasless)…");
    try {
      const data = encodeFunctionData({ abi: SPENDING_LIMIT_MODULE_ABI, functionName: "revokeKey", args: [asset.token, key as `0x${string}`] });
      const res = await sendTransactions([{ to: SPENDING_LIMIT_MODULE, value: 0n, data }]);
      const txh = await res.included();
      recordActivity({ type: "revoke", label: `Revoked key ${shortAddr(key)}`, asset: asset.symbol, hash: txh ?? res.userOpHash, isUserOp: !txh, gasless: true });
      setStatus("✅ Key revoked.");
      setClicked(false);
      await Promise.all([rl(), rs()]);
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Your {asset.symbol} policy for a key</h2>
      <div>
        <label className="text-xs text-neutral-600">Key address</label>
        <input className="input-field mt-1 mono text-xs" value={key} onChange={(e) => { setKey(e.target.value); setClicked(false); }} placeholder="0x…" spellCheck={false} />
      </div>
      {validKey && !hasPolicy && <p className="text-xs text-neutral-500">No {asset.symbol} policy set for this key yet.</p>}
      {hasPolicy && (
        <>
          {clicked ? (
            <div className="flex gap-5">
              <div>
                <div className="text-[11px] text-neutral-500">Limit</div>
                <div className="text-xl font-bold tabular-nums">{limitVal !== undefined ? formatAmount(limitVal) : "⏳"}</div>
              </div>
              <div>
                <div className="text-[11px] text-neutral-500">Spent</div>
                <div className="text-xl font-bold tabular-nums">{spentVal !== undefined ? formatAmount(spentVal) : "⏳"}</div>
              </div>
              <div>
                <div className="text-[11px] text-neutral-500">Remaining</div>
                <div className="text-xl font-bold tabular-nums text-emerald-600">{remaining !== undefined ? formatAmount(remaining) : "—"}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#92400e] mono">🔒 limit &amp; spent are encrypted — only you can decrypt</div>
          )}
          {!clicked && (
            <button className="btn-primary" onClick={reveal} disabled={isDecrypting}>
              {isDecrypting ? "Decrypting…" : "Decrypt my policy"}
            </button>
          )}
          <div className="pt-2 border-t border-black/10">
            <button className="btn-danger !py-1.5 text-xs" onClick={revoke} disabled={revoking || !BUNDLER_URL}>
              {revoking ? "Revoking…" : "⚠︎ Revoke this key"}
            </button>
          </div>
        </>
      )}
      {status && <p className="text-xs text-neutral-600">{status}</p>}
    </div>
  );
}

export default Limits;
