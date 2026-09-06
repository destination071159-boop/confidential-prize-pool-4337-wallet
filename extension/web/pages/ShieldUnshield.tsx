import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePublicClient } from "wagmi";
import { parseEventLogs, encodeFunctionData, isAddress } from "viem";
import { useEncrypt, usePublicDecrypt } from "@zama-fhe/react-sdk";
import {
  REGISTRY,
  type Asset,
  CONFIDENTIAL_TOKEN_ABI,
  UNDERLYING_TOKEN_ABI,
  parseAmount,
  toUnderlying,
  formatAmount,
  shortAddr,
  BUNDLER_URL,
} from "@zhieldwrap/core";
import { useSmartAccount } from "../hooks/useSmartAccount";
import { recordActivity } from "../lib/activity";
import { useAssets } from "../lib/customTokens";

function AssetPicker({ active, onSelect }: { active: Asset; onSelect: (a: Asset) => void }) {
  const assets = useAssets();
  return (
    <div className="flex flex-wrap gap-2">
      {assets.map((a) => (
        <button
          key={a.token}
          onClick={() => onSelect(a)}
          className={`px-3 py-1.5 rounded-lg text-sm border ${
            a.token === active.token
              ? "bg-[#fff3c4] text-[#8a6d00] border-[#f7c948]"
              : "bg-black/[0.04] text-neutral-600 border-black/10 hover:text-neutral-900"
          }`}
        >
          {a.symbol}
        </button>
      ))}
    </div>
  );
}

export function ShieldUnshield() {
  const [params] = useSearchParams();
  const assets = useAssets();
  const preset = assets.find((a) => a.token.toLowerCase() === (params.get("a") ?? "").toLowerCase());
  const [asset, setAsset] = useState<Asset>(preset ?? REGISTRY[0]);
  const [tab, setTab] = useState<"shield" | "unshield">("shield");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Shield / Unshield {asset.symbol}</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Shield real {asset.symbol.slice(1)} into {asset.symbol}, or unshield it back — both gasless
          through your 4337 smart account.
        </p>
      </div>

      <AssetPicker active={asset} onSelect={setAsset} />

      <div className="flex gap-2">
        <button
          className={tab === "shield" ? "btn-primary" : "btn-secondary"}
          onClick={() => setTab("shield")}
        >
          Shield →
        </button>
        <button
          className={tab === "unshield" ? "btn-primary" : "btn-secondary"}
          onClick={() => setTab("unshield")}
        >
          ← Unshield
        </button>
      </div>

      {tab === "shield" ? <ShieldCard asset={asset} /> : <UnshieldCard asset={asset} />}
    </div>
  );
}

function ShieldCard({ asset }: { asset: Asset }) {
  const { smartAccountAddress, sendTransactions } = useSmartAccount();
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  let valid = false;
  try {
    valid = parseAmount(amount) > 0n;
  } catch {
    valid = false;
  }

  async function shield() {
    if (!smartAccountAddress || !valid) return;
    setBusy(true);
    setErr(null);
    setStatus(`Shielding ${asset.symbol.slice(1)} → ${asset.symbol} (gasless)…`);
    try {
      const conf = parseAmount(amount);
      const under = toUnderlying(conf, asset.underlyingDecimals);
      const acct = smartAccountAddress as `0x${string}`;
      const mint = encodeFunctionData({ abi: UNDERLYING_TOKEN_ABI, functionName: "mint", args: [acct, under] });
      const approve = encodeFunctionData({ abi: UNDERLYING_TOKEN_ABI, functionName: "approve", args: [asset.token, under] });
      const doWrap = encodeFunctionData({ abi: CONFIDENTIAL_TOKEN_ABI, functionName: "wrap", args: [acct, under] });
      const res = await sendTransactions([
        { to: asset.underlying, value: 0n, data: mint },
        { to: asset.underlying, value: 0n, data: approve },
        { to: asset.token, value: 0n, data: doWrap },
      ]);
      const txh = await res.included();
      recordActivity({
        type: "wrap",
        label: `Shielded ${amount} ${asset.symbol.slice(1)} → ${asset.symbol}`,
        asset: asset.symbol,
        hash: txh ?? res.userOpHash,
        isUserOp: !txh,
        gasless: true,
      });
      setStatus(`✅ Shielded ${amount} ${asset.symbol.slice(1)} → ${asset.symbol} (gasless).`);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Shield → {asset.symbol}</h2>
      <p className="text-xs text-neutral-500">
        Mint test {asset.symbol.slice(1)} → approve → wrap into your smart account — one gasless UserOp.
      </p>
      <div>
        <label className="text-xs text-neutral-600">Amount ({asset.symbol.slice(1)})</label>
        <input className="input-field mt-1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <button className="btn-primary w-full" onClick={shield} disabled={busy || !valid || !BUNDLER_URL}>
        {busy ? "Shielding…" : `Shield ${amount || "0"} ${asset.symbol.slice(1)} → ${asset.symbol}`}
      </button>
      {status && <p className="text-xs text-neutral-600">{status}</p>}
      {err && <p className="text-xs text-red-600 break-words">{err}</p>}
    </div>
  );
}

function UnshieldCard({ asset }: { asset: Asset }) {
  const { smartAccountAddress, sendTransactions } = useSmartAccount();
  const encrypt = useEncrypt();
  const publicDecrypt = usePublicDecrypt();
  const publicClient = usePublicClient();
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  let validAmount = false;
  try {
    validAmount = parseAmount(amount) > 0n;
  } catch {
    validAmount = false;
  }
  const recipient = (isAddress(to) ? to : smartAccountAddress) as `0x${string}` | undefined;

  async function unshield() {
    if (!smartAccountAddress || !validAmount || !recipient || !publicClient) return;
    setBusy(true);
    setErr(null);
    try {
      const micro = parseAmount(amount);
      setStatus("Encrypting amount…");
      const enc = await encrypt.mutateAsync({
        values: [{ value: micro, type: "euint64" }],
        contractAddress: asset.token,
        userAddress: smartAccountAddress as `0x${string}`,
      });
      const encAmount = enc.handles[0] as `0x${string}`;
      const inputProof = enc.inputProof as `0x${string}`;

      setStatus("Requesting unshield (gasless)…");
      const reqData = encodeFunctionData({
        abi: CONFIDENTIAL_TOKEN_ABI,
        functionName: "unwrap",
        args: [smartAccountAddress as `0x${string}`, recipient, encAmount, inputProof],
      });
      const res = await sendTransactions([{ to: asset.token, value: 0n, data: reqData }]);
      const reqTxh = await res.included();
      recordActivity({
        type: "unwrap",
        label: `Unshield requested — ${amount} ${asset.symbol} → ${asset.symbol.slice(1)}`,
        asset: asset.symbol,
        hash: reqTxh ?? res.userOpHash,
        isUserOp: !reqTxh,
        gasless: true,
      });
      if (!reqTxh) throw new Error("Could not resolve the unshield request transaction.");

      const receipt = await publicClient.getTransactionReceipt({ hash: reqTxh as `0x${string}` });
      const logs = parseEventLogs({ abi: CONFIDENTIAL_TOKEN_ABI, eventName: "UnwrapRequested", logs: receipt.logs }) as any[];
      const mine = logs.filter((l) => (l.args?.receiver as string)?.toLowerCase() === recipient.toLowerCase());
      const evt = (mine.length ? mine : logs)[(mine.length ? mine : logs).length - 1];
      if (!evt) throw new Error("UnwrapRequested event not found.");
      const requestId = evt.args.unwrapRequestId as `0x${string}`;

      setStatus("Decrypting burnt amount (public oracle)…");
      const dec = await publicDecrypt.mutateAsync([requestId]);
      const cleartext = BigInt(dec.clearValues[requestId] ?? Object.values(dec.clearValues)[0]);
      const decryptionProof = dec.decryptionProof;

      setStatus("Finalizing unshield (gasless)…");
      const finData = encodeFunctionData({
        abi: CONFIDENTIAL_TOKEN_ABI,
        functionName: "finalizeUnwrap",
        args: [requestId, cleartext, decryptionProof],
      });
      const res2 = await sendTransactions([{ to: asset.token, value: 0n, data: finData }]);
      const finTxh = await res2.included();
      recordActivity({
        type: "unwrap",
        label: `Unshielded ${formatAmount(cleartext)} ${asset.symbol} → ${asset.symbol.slice(1)} · ${shortAddr(recipient)}`,
        asset: asset.symbol,
        hash: finTxh ?? res2.userOpHash,
        isUserOp: !finTxh,
        gasless: true,
      });
      setStatus(`✅ Unshielded ${formatAmount(cleartext)} ${asset.symbol} → real ${asset.symbol.slice(1)} → ${shortAddr(recipient)} (gasless).`);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Unshield {asset.symbol} → {asset.symbol.slice(1)}</h2>
      <p className="text-xs text-neutral-500">
        Burns the confidential amount, decrypts it via the public oracle, then releases the underlying —
        all gasless (3 steps).
      </p>
      <div>
        <label className="text-xs text-neutral-600">Amount ({asset.symbol})</label>
        <input className="input-field mt-1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </div>
      <div>
        <label className="text-xs text-neutral-600">Send {asset.symbol.slice(1)} to (defaults to your smart account)</label>
        <input className="input-field mt-1 mono text-xs" value={to} onChange={(e) => setTo(e.target.value)} placeholder={smartAccountAddress ?? "0x…"} spellCheck={false} />
      </div>
      <button className="btn-primary w-full" onClick={unshield} disabled={busy || !validAmount || !recipient || !BUNDLER_URL}>
        {busy ? status ?? "Working…" : `🔓 Unshield ${amount || "0"} ${asset.symbol} → ${asset.symbol.slice(1)}`}
      </button>
      {status && !busy && <p className="text-xs text-neutral-600">{status}</p>}
      {err && <p className="text-xs text-red-600 break-words">{err}</p>}
    </div>
  );
}

export default ShieldUnshield;
