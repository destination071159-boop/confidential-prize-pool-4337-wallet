import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { encodeFunctionData } from "viem";
import { useEncrypt, useDecryptBalanceAs } from "@zama-fhe/react-sdk";
import {
  POOL_ADDRESS,
  POOL_ABI,
  POOL_TOKEN,
  POOL_UNDERLYING,
  PRIZE_TAG,
  CONFIDENTIAL_TRANSFER_AND_CALL_ABI,
  CONFIDENTIAL_TOKEN_ABI,
  UNDERLYING_TOKEN_ABI,
  ACL_ADDRESS,
  ACL_DELEGATE_ABI,
  VIEW_DELEGATION_EXPIRY,
  NULL_HANDLE,
  parseAmount,
  formatAmount,
  toUnderlying,
  shortAddr,
  isPoolOwner,
  BUNDLER_URL,
} from "@zhieldwrap/core";
import { useSmartAccount } from "../hooks/useSmartAccount";
import { recordActivity } from "../lib/activity";

const viewKey = (a?: string) => `c4337_pool_view_${(a ?? "").toLowerCase()}`;

export function PrizePool() {
  const { eoa, smartAccountAddress, sendTransactions } = useSmartAccount();
  const acct = smartAccountAddress as `0x${string}` | undefined;
  const encrypt = useEncrypt();
  const decryptAs = useDecryptBalanceAs();

  // public pool stats
  const { data: drawCount, refetch: rDraw } = useReadContract({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "drawCount" });
  const { data: depositors, refetch: rDep } = useReadContract({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "depositorCount" });
  const { data: balHandle, refetch: rBal } = useReadContract({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "confidentialBalanceOf", args: acct ? [acct] : undefined, query: { enabled: !!acct } });
  const { data: winHandle, refetch: rWin } = useReadContract({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "confidentialWinningsOf", args: acct ? [acct] : undefined, query: { enabled: !!acct } });

  const [busy, setBusy] = useState<string | null>(null); // which action is running
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [depositAmt, setDepositAmt] = useState("100");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [bal, setBal] = useState<bigint | undefined>();
  const [win, setWin] = useState<bigint | undefined>();
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    try { setGranted(!!acct && localStorage.getItem(viewKey(acct)) === "1"); } catch { /* ignore */ }
  }, [acct]);

  const running = (k: string) => busy === k;
  const anyBusy = busy !== null;
  function ok(m: string) { setMsg(m); setErr(null); }
  function fail(e: any) { setErr(e?.message ?? String(e)); setMsg(null); }

  // ── Faucet: mint 1,000 test USDC (underlying) to the smart account, gasless ──
  async function faucet() {
    if (!acct) return;
    setBusy("faucet"); setErr(null); setMsg("Minting 1,000 test USDC (gasless)…");
    try {
      const amt = toUnderlying(1000n * 1_000_000n, 6); // 1000 * 1e6 (6-dec)
      const data = encodeFunctionData({ abi: UNDERLYING_TOKEN_ABI, functionName: "mint", args: [acct, amt] });
      const res = await sendTransactions([{ to: POOL_UNDERLYING, value: 0n, data }]);
      const txh = await res.included();
      recordActivity({ type: "wrap", label: "Faucet: minted 1,000 test USDC", hash: txh ?? res.userOpHash, isUserOp: !txh, gasless: true });
      ok("✅ Minted 1,000 test USDC. Now deposit into the pool.");
    } catch (e) { fail(e); } finally { setBusy(null); }
  }

  // ── Deposit: approve → wrap → confidentialTransferAndCall(pool), one gasless UserOp ──
  async function deposit() {
    if (!acct) return;
    let conf: bigint; try { conf = parseAmount(depositAmt); } catch { return; }
    if (conf <= 0n) return;
    setBusy("deposit"); setErr(null);
    try {
      const under = toUnderlying(conf, 6);
      setMsg("Encrypting deposit…");
      const enc = await encrypt.mutateAsync({ values: [{ value: conf, type: "euint64" }], contractAddress: POOL_TOKEN, userAddress: acct });
      const approve = encodeFunctionData({ abi: UNDERLYING_TOKEN_ABI, functionName: "approve", args: [POOL_TOKEN, under] });
      const wrap = encodeFunctionData({ abi: CONFIDENTIAL_TOKEN_ABI, functionName: "wrap", args: [acct, under] });
      const dep = encodeFunctionData({ abi: CONFIDENTIAL_TRANSFER_AND_CALL_ABI, functionName: "confidentialTransferAndCall", args: [POOL_ADDRESS, enc.handles[0] as `0x${string}`, enc.inputProof as `0x${string}`, "0x"] });
      setMsg("Depositing into the confidential pool (gasless)…");
      const res = await sendTransactions([
        { to: POOL_UNDERLYING, value: 0n, data: approve },
        { to: POOL_TOKEN, value: 0n, data: wrap },
        { to: POOL_TOKEN, value: 0n, data: dep },
      ]);
      const txh = await res.included();
      recordActivity({ type: "send", label: `Deposited ${depositAmt} into the prize pool`, asset: "cUSDC", hash: txh ?? res.userOpHash, isUserOp: !txh, gasless: true });
      ok(`✅ Deposited ${depositAmt} cUSDC — your amount is encrypted on-chain.`);
      await Promise.all([rBal(), rDep()]);
    } catch (e) { fail(e); } finally { setBusy(null); }
  }

  // ── Enable pool view: smart account delegates decrypt of the POOL to the owner EOA ──
  async function enableView() {
    if (!eoa || !acct) return;
    setBusy("view"); setErr(null); setMsg("Enabling private view (gasless)…");
    try {
      const data = encodeFunctionData({ abi: ACL_DELEGATE_ABI, functionName: "delegateForUserDecryption", args: [eoa as `0x${string}`, POOL_ADDRESS, VIEW_DELEGATION_EXPIRY] });
      const res = await sendTransactions([{ to: ACL_ADDRESS, value: 0n, data }]);
      await res.included();
      try { localStorage.setItem(viewKey(acct), "1"); } catch { /* ignore */ }
      setGranted(true);
      ok("✅ Private view enabled. Reveal your balance/winnings (allow a few seconds).");
    } catch (e) { fail(e); } finally { setBusy(null); }
  }

  async function reveal(which: "balance" | "winnings") {
    if (!acct) return;
    const handle = (which === "balance" ? balHandle : winHandle) as `0x${string}` | undefined;
    if (!handle || handle === NULL_HANDLE) { which === "balance" ? setBal(0n) : setWin(0n); return; }
    setBusy(`reveal-${which}`); setErr(null); setMsg(null);
    try {
      const res: any = await (decryptAs.mutateAsync as any)({ handles: [{ handle, contractAddress: POOL_ADDRESS }], delegatorAddress: acct });
      const v = res?.[handle] as bigint;
      which === "balance" ? setBal(v) : setWin(v);
    } catch (e: any) {
      setErr(granted ? (e?.message ?? String(e)) : "Enable private view first (button above).");
    } finally { setBusy(null); }
  }

  // ── Draw (admin/keeper) ──
  async function draw() {
    setBusy("draw"); setErr(null); setMsg("Running the confidential draw (gasless)…");
    try {
      const data = encodeFunctionData({ abi: POOL_ABI, functionName: "draw", args: [] });
      const res = await sendTransactions([{ to: POOL_ADDRESS, value: 0n, data }]);
      const txh = await res.included();
      recordActivity({ type: "grant", label: "Triggered a confidential prize draw", hash: txh ?? res.userOpHash, isUserOp: !txh, gasless: true });
      ok("✅ Draw complete. Exactly one depositor won — only they can see it. Reveal your winnings.");
      await Promise.all([rDraw(), rWin()]);
    } catch (e) { fail(e); } finally { setBusy(null); }
  }

  // ── Claim winnings ──
  async function claim() {
    setBusy("claim"); setErr(null); setMsg("Claiming winnings (gasless)…");
    try {
      const data = encodeFunctionData({ abi: POOL_ABI, functionName: "claim", args: [] });
      const res = await sendTransactions([{ to: POOL_ADDRESS, value: 0n, data }]);
      const txh = await res.included();
      recordActivity({ type: "spend", label: "Claimed prize winnings", asset: "cUSDC", hash: txh ?? res.userOpHash, isUserOp: !txh, gasless: true });
      ok("✅ Winnings claimed to your account.");
      await Promise.all([rWin()]);
      setWin(undefined);
    } catch (e) { fail(e); } finally { setBusy(null); }
  }

  // ── Withdraw principal (no loss) ──
  async function withdraw() {
    if (!acct) return;
    let conf: bigint; try { conf = parseAmount(withdrawAmt); } catch { return; }
    if (conf <= 0n) return;
    setBusy("withdraw"); setErr(null);
    try {
      setMsg("Encrypting withdrawal…");
      const enc = await encrypt.mutateAsync({ values: [{ value: conf, type: "euint64" }], contractAddress: POOL_ADDRESS, userAddress: acct });
      const data = encodeFunctionData({ abi: POOL_ABI, functionName: "withdraw", args: [enc.handles[0] as `0x${string}`, enc.inputProof as `0x${string}`] });
      setMsg("Withdrawing principal (gasless)…");
      const res = await sendTransactions([{ to: POOL_ADDRESS, value: 0n, data }]);
      const txh = await res.included();
      recordActivity({ type: "unwrap", label: `Withdrew ${withdrawAmt} principal (no-loss)`, asset: "cUSDC", hash: txh ?? res.userOpHash, isUserOp: !txh, gasless: true });
      ok(`✅ Withdrew ${withdrawAmt} cUSDC principal. No loss — your deposit is always yours.`);
      await Promise.all([rBal()]);
      setBal(undefined);
    } catch (e) { fail(e); } finally { setBusy(null); }
  }

  const isAdmin = isPoolOwner(eoa);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Confidential Prize Pool</h1>
        <p className="text-sm text-neutral-600 mt-1">
          No-loss prize savings, made confidential with Zama FHE. Deposit test USDC — your amount and
          balance are encrypted on-chain. At each draw, one depositor wins the yield, picked onchain by
          FHE randomness weighted by deposit size. Only the winner learns the outcome. Withdraw your
          principal anytime — no loss.
        </p>
      </div>

      {/* Pool stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card !p-4"><div className="text-xs text-neutral-500">Depositors</div><div className="text-2xl font-bold">{depositors?.toString() ?? "…"}</div></div>
        <div className="card !p-4"><div className="text-xs text-neutral-500">Draws held</div><div className="text-2xl font-bold">{drawCount?.toString() ?? "…"}</div></div>
        <div className="card !p-4"><div className="text-xs text-neutral-500">Your account</div><div className="text-sm font-bold mono">{shortAddr(acct) || "—"}</div></div>
      </div>

      {/* Faucet + Deposit */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">1 · Get test USDC & deposit</h2>
          <button className="btn-secondary text-xs" onClick={faucet} disabled={anyBusy || !BUNDLER_URL}>{running("faucet") ? "Minting…" : "🚰 Faucet: 1,000 USDC"}</button>
        </div>
        <div>
          <label className="text-xs text-neutral-600">Deposit amount (USDC)</label>
          <input className="input-field mt-1" inputMode="decimal" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} />
        </div>
        <button className="btn-primary w-full" onClick={deposit} disabled={anyBusy || !BUNDLER_URL}>{running("deposit") ? (msg ?? "Working…") : `🔒 Deposit ${depositAmt || "0"} confidentially`}</button>
        <p className="text-[11px] text-neutral-500">ERC-20 approve → wrap to cUSDC → deposit — one gasless transaction; the amount is encrypted before it leaves your device.</p>
      </div>

      {/* My private balance & winnings */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">2 · Your private position</h2>
          {!granted && <button className="btn-secondary text-xs" onClick={enableView} disabled={anyBusy || !BUNDLER_URL}>{running("view") ? "Enabling…" : "🔑 Enable private view"}</button>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-black/[0.03] border border-black/10 p-3">
            <div className="text-[11px] text-neutral-500">Your pool balance</div>
            <div className="text-lg font-bold text-[#8a6d00]">{bal !== undefined ? `${formatAmount(bal)} cUSDC` : "🔒 encrypted"}</div>
            <button className="text-xs text-[#8a6d00] mt-1" onClick={() => reveal("balance")} disabled={anyBusy}>{running("reveal-balance") ? "Decrypting…" : "Reveal (decrypt)"}</button>
          </div>
          <div className="rounded-lg bg-black/[0.03] border border-black/10 p-3">
            <div className="text-[11px] text-neutral-500">Your winnings</div>
            <div className="text-lg font-bold text-emerald-600">{win !== undefined ? `${formatAmount(win)} cUSDC` : "🔒 encrypted"}</div>
            <button className="text-xs text-[#8a6d00] mt-1" onClick={() => reveal("winnings")} disabled={anyBusy}>{running("reveal-winnings") ? "Decrypting…" : "Reveal (decrypt)"}</button>
          </div>
        </div>
        {win !== undefined && win > 0n && (
          <button className="btn-primary w-full" onClick={claim} disabled={anyBusy}>{running("claim") ? "Claiming…" : "🎉 Claim winnings"}</button>
        )}
      </div>

      {/* Draw (admin/keeper) */}
      <div className="card space-y-2">
        <h2 className="font-semibold">3 · Draw {isAdmin ? "(you are the keeper)" : "(admin/keeper)"}</h2>
        <p className="text-[11px] text-neutral-500">Picks a winner onchain with FHE randomness, weighted by deposit size, over the encrypted balances — no offchain RNG, no plaintext. The winner sees their winnings; nobody else learns who won.</p>
        <button className="btn-primary w-full" onClick={draw} disabled={anyBusy || !BUNDLER_URL || !isAdmin} title={isAdmin ? "" : "Only the pool keeper can trigger a draw"}>{running("draw") ? "Drawing…" : "🎲 Trigger confidential draw"}</button>
        {!isAdmin && <p className="text-[11px] text-neutral-400">A production build automates this with a keeper; here the pool owner triggers it.</p>}
      </div>

      {/* Withdraw (no loss) */}
      <div className="card space-y-3">
        <h2 className="font-semibold">4 · Withdraw principal (no loss)</h2>
        <div>
          <label className="text-xs text-neutral-600">Amount (cUSDC)</label>
          <input className="input-field mt-1" inputMode="decimal" value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} placeholder="0.00" />
        </div>
        <button className="btn-secondary w-full" onClick={withdraw} disabled={anyBusy || !BUNDLER_URL}>{running("withdraw") ? (msg ?? "Working…") : "↩︎ Withdraw principal"}</button>
      </div>

      {msg && !anyBusy && <p className="text-xs text-neutral-600">{msg}</p>}
      {err && <p className="text-xs text-red-600 break-words">{err}</p>}
    </div>
  );
}

export default PrizePool;
