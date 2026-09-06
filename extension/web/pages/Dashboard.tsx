import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { formatUnits, encodeFunctionData } from "viem";
import { useDecryptBalanceAs } from "@zama-fhe/react-sdk";
import {
  REGISTRY,
  type Asset,
  CONFIDENTIAL_TOKEN_ABI,
  UNDERLYING_TOKEN_ABI,
  ACL_ADDRESS,
  ACL_DELEGATE_ABI,
  VIEW_DELEGATION_EXPIRY,
  NULL_HANDLE,
  formatAmount,
  shortAddr,
  iconFor,
  BUNDLER_URL,
} from "@zhieldwrap/core";
import { useSmartAccount } from "../hooks/useSmartAccount";
import { useGasSaved, formatEthShort } from "../lib/gasSaved";
import { recordActivity } from "../lib/activity";
import { useAssets } from "../lib/customTokens";
import { AddToken } from "../components/AddToken";

const viewGrantKey = (acct?: string) => `c4337_view_delegated_${(acct ?? "").toLowerCase()}`;

function AssetIcon({ asset, big }: { asset: Asset; big?: boolean }) {
  const src = iconFor(asset.symbol);
  const cls = big ? "w-9 h-9" : "w-6 h-6";
  if (src)
    return <img src={src} alt={asset.symbol} className={`${cls} rounded-full object-cover bg-white`} />;
  return (
    <span className={`${cls} rounded-full bg-black/[0.04] border border-black/10 grid place-items-center text-[10px] font-bold text-[#8a6d00]`}>
      {asset.symbol.slice(1, 3)}
    </span>
  );
}

function trimNum(s: string): string {
  if (!s.includes(".")) return s;
  const t = s.replace(/0+$/, "").replace(/\.$/, "");
  return t === "" ? "0" : t;
}

function PortfolioRow({
  asset,
  smartAccountAddress,
  revealed,
  onRevealed,
}: {
  asset: Asset;
  smartAccountAddress?: string;
  revealed: boolean;
  onRevealed?: () => void;
}) {
  const acct = smartAccountAddress as `0x${string}` | undefined;
  const { data: pub } = useReadContract({
    address: asset.underlying,
    abi: UNDERLYING_TOKEN_ABI,
    functionName: "balanceOf",
    args: acct ? [acct] : undefined,
    query: { enabled: !!acct },
  });
  const { data: cHandle } = useReadContract({
    address: asset.token,
    abi: CONFIDENTIAL_TOKEN_ABI,
    functionName: "confidentialBalanceOf",
    args: acct ? [acct] : undefined,
    query: { enabled: !!acct },
  });
  const handle = cHandle as `0x${string}` | undefined;
  const hasBal = !!handle && handle !== NULL_HANDLE;

  const decryptAs = useDecryptBalanceAs();
  const [shielded, setShielded] = useState<bigint | undefined>();
  const [decErr, setDecErr] = useState(false);
  const [decLoading, setDecLoading] = useState(false);

  useEffect(() => {
    if (!revealed) {
      setShielded(undefined);
      setDecErr(false);
      setDecLoading(false);
      return;
    }
    if (!hasBal || !acct || !handle) return;
    let cancelled = false;
    setDecLoading(true);
    setDecErr(false);
    setShielded(undefined);
    (decryptAs.mutateAsync as any)({ handles: [{ handle, contractAddress: asset.token }], delegatorAddress: acct })
      .then((res: any) => {
        if (!cancelled) {
          setShielded(res?.[handle] as bigint);
          setDecLoading(false);
          onRevealed?.(); // a successful decrypt proves the on-chain delegation exists
        }
      })
      .catch((e: any) => {
        console.error("[shielded-decrypt]", asset.symbol, e?.message ?? e);
        if (!cancelled) {
          setDecErr(true);
          setDecLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, hasBal, handle, acct]);

  const under = asset.symbol.slice(1);
  const pubStr = pub !== undefined ? trimNum(formatUnits(pub as bigint, asset.underlyingDecimals)) : "…";

  return (
    <div className="card flex items-center gap-3 !p-4">
      <AssetIcon asset={asset} big />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm">{asset.symbol}</div>
        <div className="text-xs text-neutral-500 truncate">{asset.name}</div>
      </div>
      <div className="text-right">
        <div className="text-[11px] text-neutral-500">🔓 Unshielded</div>
        <div className="text-sm font-semibold tabular-nums">
          {pubStr} <span className="text-neutral-500 text-xs">{under}</span>
        </div>
      </div>
      <div className="text-right w-28">
        <div className="text-[11px] text-neutral-500">🔒 Shielded</div>
        <div className="text-sm font-semibold tabular-nums mono">
          {!acct ? (
            <span className="text-neutral-400">—</span>
          ) : !hasBal ? (
            <span className="text-neutral-500">0 {asset.symbol}</span>
          ) : !revealed ? (
            <span className="text-[#92400e]">••••••</span>
          ) : shielded !== undefined ? (
            <span className="text-[#8a6d00]">{formatAmount(shielded)} {asset.symbol}</span>
          ) : decLoading ? (
            <span className="text-neutral-400">…</span>
          ) : decErr ? (
            <span className="text-[#92400e]" title="Enable owner view first.">🔒 enable view</span>
          ) : (
            <span className="text-[#92400e]">••••••</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { eoa, smartAccountAddress, sendTransactions } = useSmartAccount();
  const gasWei = useGasSaved();
  const assets = useAssets();
  const [revealed, setRevealed] = useState(false);
  const [granting, setGranting] = useState(false);
  const [granted, setGranted] = useState(false);
  const [grantMsg, setGrantMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      setGranted(!!smartAccountAddress && localStorage.getItem(viewGrantKey(smartAccountAddress)) === "1");
    } catch {
      /* ignore */
    }
  }, [smartAccountAddress]);

  function markGranted() {
    if (granted) return;
    setGranted(true);
    try {
      if (smartAccountAddress) localStorage.setItem(viewGrantKey(smartAccountAddress), "1");
    } catch {
      /* ignore */
    }
  }

  async function enableView() {
    if (!eoa || !smartAccountAddress) return;
    setGranting(true);
    setGrantMsg("Delegating decrypt rights to your EOA (gasless)…");
    try {
      const calls = assets.map((a) => ({
        to: ACL_ADDRESS,
        value: 0n,
        data: encodeFunctionData({
          abi: ACL_DELEGATE_ABI,
          functionName: "delegateForUserDecryption",
          args: [eoa as `0x${string}`, a.token as `0x${string}`, VIEW_DELEGATION_EXPIRY],
        }),
      }));
      const res = await sendTransactions(calls);
      const txh = await res.included();
      recordActivity({
        type: "setup",
        label: `Enabled owner view — delegated decrypt of ${assets.length} assets`,
        hash: txh ?? res.userOpHash,
        isUserOp: !txh,
        gasless: true,
      });
      try {
        localStorage.setItem(viewGrantKey(smartAccountAddress), "1");
      } catch {
        /* ignore */
      }
      setGranted(true);
      setGrantMsg("✅ Owner view enabled. Reveal shielded balances (allow a few seconds to propagate).");
    } catch (e: any) {
      setGrantMsg(e?.message ?? String(e));
    } finally {
      setGranting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Your confidential portfolio — public and shielded balance per asset, held by your gasless 4337
          smart account.
        </p>
      </div>

      {/* Identity + controls */}
      <div className="card flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            className="btn-secondary !py-1.5 text-xs"
            title={smartAccountAddress ? `Smart account (holds balances) — click to copy\n${smartAccountAddress}` : ""}
            onClick={() => smartAccountAddress && navigator.clipboard?.writeText(smartAccountAddress).catch(() => {})}
          >
            🏦 Smart account <span className="mono text-neutral-900">{shortAddr(smartAccountAddress) || "—"}</span> ⧉
          </button>
          <span className="text-xs text-neutral-500">
            owned by EOA <span className="mono">{shortAddr(eoa) || "—"}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!granted && (
            <button className="btn-primary text-xs" onClick={enableView} disabled={granting || !eoa || !BUNDLER_URL}>
              {granting ? "Enabling…" : "🔑 Enable owner view"}
            </button>
          )}
          <button className={revealed ? "btn-secondary text-xs" : "btn-primary text-xs"} onClick={() => setRevealed((v) => !v)}>
            {revealed ? "🙈 Hide shielded" : "👁 Reveal shielded"}
          </button>
        </div>
      </div>
      {grantMsg && <p className="text-xs text-neutral-600 -mt-2">{grantMsg}</p>}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card !p-4">
          <div className="text-xs text-neutral-500">Confidential assets</div>
          <div className="text-2xl font-bold">{assets.length}</div>
        </div>
        <div className="card !p-4">
          <div className="text-xs text-neutral-500">Owner view</div>
          <div className={`text-lg font-bold ${granted ? "text-emerald-600" : "text-neutral-500"}`}>
            {granted ? "Delegated" : "Not set"}
          </div>
        </div>
        <div className="card !p-4">
          <div className="text-xs text-neutral-500">Gas sponsored</div>
          <div className="text-lg font-bold text-emerald-600">⛽ {formatEthShort(gasWei)} ETH</div>
        </div>
      </div>

      {/* Per-asset rows */}
      <div className="space-y-2">
        {assets.map((a) => (
          <PortfolioRow key={a.token} asset={a} smartAccountAddress={smartAccountAddress} revealed={revealed} onRevealed={markGranted} />
        ))}
      </div>

      <AddToken />
    </div>
  );
}

export default Dashboard;
