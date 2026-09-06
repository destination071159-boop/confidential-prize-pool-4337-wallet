import { useState } from "react";
import { encodeFunctionData } from "viem";
import {
  SPENDING_LIMIT_MODULE,
  SPENDING_LIMIT_MODULE_ABI,
  shortAddr,
  BUNDLER_URL,
} from "@zhieldwrap/core";
import { useSmartAccount } from "../hooks/useSmartAccount";
import { recordActivity } from "../lib/activity";

export function Overview() {
  const { eoa, smartAccountAddress, sendTransactions } = useSmartAccount();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Your 4337 smart account — holds confidential tokens, enforces encrypted limits, gas sponsored.
        </p>
      </div>

      <div className="card space-y-2">
        <h2 className="font-semibold">Account</h2>
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-500">Connected EOA</span>
          <span className="mono text-sm">{shortAddr(eoa) || "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-500">Smart account</span>
          <span className="mono text-sm">{shortAddr(smartAccountAddress) || "—"}</span>
        </div>
        <p className="text-xs text-neutral-500 pt-1">
          Your 4337 smart account holds the confidential tokens and enforces encrypted per-key limits.
          Owner ops are gasless (paymaster-sponsored).
        </p>
      </div>

      <SetupCard eoa={eoa} sendTransactions={sendTransactions} />
    </div>
  );
}

function SetupCard({
  eoa,
  sendTransactions,
}: {
  eoa?: string;
  sendTransactions: ReturnType<typeof useSmartAccount>["sendTransactions"];
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function setup() {
    if (!eoa) return;
    setBusy(true);
    setErr(null);
    setStatus("Registering your view key (gasless)…");
    try {
      const data = encodeFunctionData({
        abi: SPENDING_LIMIT_MODULE_ABI,
        functionName: "setPolicyViewer",
        args: [eoa as `0x${string}`],
      });
      const res = await sendTransactions([{ to: SPENDING_LIMIT_MODULE, value: 0n, data }]);
      const txh = await res.included();
      recordActivity({
        type: "setup",
        label: "Registered view key",
        hash: txh ?? res.userOpHash,
        isUserOp: !txh,
        gasless: true,
      });
      setStatus("✅ View key registered — you can now decrypt your own policies.");
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">1 · Register view key (one time)</h2>
      <p className="text-xs text-neutral-500">
        Authorizes your EOA to decrypt your account's encrypted policies. Operator approval per token
        happens automatically when you grant a limit.
      </p>
      <button className="btn-primary" onClick={setup} disabled={busy || !BUNDLER_URL}>
        {busy ? "Working…" : "Register view key"}
      </button>
      {status && <p className="text-xs text-neutral-600">{status}</p>}
      {err && <p className="text-xs text-red-600 break-words">{err}</p>}
    </div>
  );
}

export default Overview;
