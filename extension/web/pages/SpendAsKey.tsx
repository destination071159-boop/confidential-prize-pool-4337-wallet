import { useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { sepolia } from "viem/chains";
import { isAddress } from "viem";
import { useEncrypt } from "@zama-fhe/react-sdk";
import {
  REGISTRY,
  type Asset,
  SPENDING_LIMIT_MODULE,
  SPENDING_LIMIT_MODULE_ABI,
  parseAmount,
  shortAddr,
} from "@zhieldwrap/core";
import { useAssets } from "../lib/customTokens";

const SPEND_GAS = 12_000_000n;

export function SpendAsKey() {
  const [asset, setAsset] = useState<Asset>(REGISTRY[0]);
  const assets = useAssets();
  const { address: eoa } = useAccount();
  const encrypt = useEncrypt();
  const { writeContractAsync } = useWriteContract();
  const [owner, setOwner] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const validOwner = isAddress(owner);
  const validTo = isAddress(to);
  let validAmount = false;
  try {
    validAmount = parseAmount(amount) > 0n;
  } catch {
    validAmount = false;
  }

  async function spend() {
    if (!eoa || !validOwner || !validTo || !validAmount) return;
    setBusy(true);
    setErr(null);
    try {
      const micro = parseAmount(amount);
      setStatus("Encrypting amount…");
      const enc = await encrypt.mutateAsync({
        values: [{ value: micro, type: "euint64" }],
        contractAddress: SPENDING_LIMIT_MODULE,
        userAddress: eoa as `0x${string}`,
      });
      const encAmount = enc.handles[0] as `0x${string}`;
      const inputProof = enc.inputProof as `0x${string}`;
      setStatus(`Spending ${asset.symbol} (clamped to the hidden cap)…`);
      const hash = await writeContractAsync({
        address: SPENDING_LIMIT_MODULE,
        abi: SPENDING_LIMIT_MODULE_ABI,
        functionName: "spend",
        args: [asset.token, owner as `0x${string}`, to as `0x${string}`, encAmount, inputProof],
        gas: SPEND_GAS,
        account: eoa as `0x${string}`,
        chain: sepolia,
      });
      setStatus(`✅ Spend submitted · ${shortAddr(hash)}. Settles 0 if over the hidden cap.`);
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
        <h1 className="text-2xl font-bold">Spend as a granted key</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Connect the <b>key</b> account and spend {asset.symbol} from the owner's smart account up to a cap
          you cannot see — over it, the transfer settles 0. Ordinary call (key pays gas).
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
          <label className="text-xs text-neutral-600">Owner smart account (who granted you)</label>
          <input className="input-field mt-1 mono text-xs" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="0x…" spellCheck={false} />
        </div>
        <div>
          <label className="text-xs text-neutral-600">Recipient</label>
          <input className="input-field mt-1 mono text-xs" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" spellCheck={false} />
        </div>
        <div>
          <label className="text-xs text-neutral-600">Amount ({asset.symbol})</label>
          <input className="input-field mt-1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <button className="btn-primary w-full" onClick={spend} disabled={busy || !validOwner || !validTo || !validAmount}>
          {busy ? status ?? "Working…" : `🔒 Spend ${asset.symbol} under hidden cap`}
        </button>
        {status && !busy && <p className="text-xs text-neutral-600">{status}</p>}
        {err && <p className="text-xs text-red-600 break-words">{err}</p>}
      </div>
    </div>
  );
}

export default SpendAsKey;
