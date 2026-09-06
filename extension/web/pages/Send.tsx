import { useState } from "react";
import { isAddress, encodeFunctionData } from "viem";
import { useEncrypt } from "@zama-fhe/react-sdk";
import {
  REGISTRY,
  type Asset,
  CONFIDENTIAL_TOKEN_ABI,
  parseAmount,
  shortAddr,
  BUNDLER_URL,
} from "@zhieldwrap/core";
import { useAssets } from "../lib/customTokens";
import { useSmartAccount } from "../hooks/useSmartAccount";
import { recordActivity } from "../lib/activity";

export function Send() {
  const [asset, setAsset] = useState<Asset>(REGISTRY[0]);
  const assets = useAssets();
  const { smartAccountAddress, sendTransactions } = useSmartAccount();
  const encrypt = useEncrypt();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cipher, setCipher] = useState<string | null>(null);
  const validTo = isAddress(to);
  let validAmount = false;
  try {
    validAmount = parseAmount(amount) > 0n;
  } catch {
    validAmount = false;
  }

  async function send() {
    if (!smartAccountAddress || !validTo || !validAmount) return;
    setBusy(true);
    setErr(null);
    setCipher(null);
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
      setCipher(encAmount);
      const data = encodeFunctionData({
        abi: CONFIDENTIAL_TOKEN_ABI,
        functionName: "confidentialTransfer",
        args: [to as `0x${string}`, encAmount, inputProof],
      });
      setStatus("Building & signing UserOperation…");
      const res = await sendTransactions([{ to: asset.token, value: 0n, data }]);
      const txh = await res.included();
      recordActivity({
        type: "send",
        label: `Sent ${amount} ${asset.symbol} to ${shortAddr(to)}`,
        asset: asset.symbol,
        hash: txh ?? res.userOpHash,
        isUserOp: !txh,
        gasless: true,
      });
      setStatus(`✅ Sent ${amount} ${asset.symbol} confidentially (gasless).`);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Send {asset.symbol}</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Move {asset.symbol} out of your smart account with the amount encrypted end to end — gasless.
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

      <div className="card space-y-3">
        <div>
          <label className="text-xs text-neutral-600">Recipient</label>
          <input className="input-field mt-1 mono text-xs" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" spellCheck={false} />
        </div>
        <div>
          <label className="text-xs text-neutral-600">Amount ({asset.symbol})</label>
          <input className="input-field mt-1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <button className="btn-primary w-full" onClick={send} disabled={busy || !validTo || !validAmount || !BUNDLER_URL}>
          {busy ? status ?? "Working…" : `🔒 Send ${asset.symbol} confidentially`}
        </button>
        {status && !busy && <p className="text-xs text-neutral-600">{status}</p>}
        {err && <p className="text-xs text-red-600 break-words">{err}</p>}
        {cipher && (
          <div className="rounded-lg bg-black/[0.03] border border-black/10 p-3">
            <div className="text-[11px] text-neutral-500 mb-1">Encrypted amount (on-chain)</div>
            <div className="mono text-[10px] text-neutral-700 break-all">{cipher}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Send;
