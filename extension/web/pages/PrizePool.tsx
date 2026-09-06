import { useState } from "react";
import { useReadContract } from "wagmi";
import { encodeFunctionData, encodeAbiParameters } from "viem";
import { useEncrypt, useUserDecryptNow } from "@zama-fhe/react-sdk";
import {
  POOL_ADDRESS,
  POOL_ABI,
  POOL_TOKEN,
  POOL_UNDERLYING,
  PRIZE_TAG,
  CONFIDENTIAL_TRANSFER_AND_CALL_ABI,
  CONFIDENTIAL_TOKEN_ABI,
  UNDERLYING_TOKEN_ABI,
  NULL_HANDLE,
  parseAmount,
  formatAmount,
  toUnderlying,
  shortAddr,
  BUNDLER_URL,
} from "@zhieldwrap/core";
import { useSmartAccount } from "../hooks/useSmartAccount";
import { recordActivity } from "../lib/activity";

export function PrizePool() {
  const { eoa, smartAccountAddress, sendTransactions } = useSmartAccount();
  const acct = smartAccountAddress as `0x${string}` | undefined;
  const encrypt = useEncrypt();
  const decrypt = useUserDecryptNow();

  // public pool stats
  const { data: drawCount, refetch: rDraw } = useReadContract({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "drawCount" });
  const { data: depositors, refetch: rDep } = useReadContract({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "depositorCount" });
  const { data: balHandle, refetch: rBal } = useReadContract({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "confidentialBalanceOf", args: acct ? [acct] : undefined, query: { enabled: !!acct } });
  const { data: winHandle, refetch: rWin } = useReadContract({ address: POOL_ADDRESS, abi: POOL_ABI, functionName: "confidentialWinningsOf", args: acct ? [acct] : undefined, query: { enabled: !!acct } });

  const [busy, setBusy] = useState<string | null>(null); // which action is running
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [depositAmt, setDepositAmt] = useState("100");
  const [fundAmt, setFundAmt] = useState("500");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [bal, setBal] = useState<bigint | undefined>();
  const [win, setWin] = useState<bigint | undefined>();

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
      // Pass the owner EOA in `data` so the pool grants it decrypt access → we can reveal with a plain
      // user-decryption (no delegated-decrypt round-trip, which the testnet relayer rejects).
      const viewerData = encodeAbiParameters([{ type: "address" }], [eoa as `0x${string}`]);
      const dep = encodeFunctionData({ abi: CONFIDENTIAL_TRANSFER_AND_CALL_ABI, functionName: "confidentialTransferAndCall", args: [POOL_ADDRESS, enc.handles[0] as `0x${string}`, enc.inputProof as `0x${string}`, viewerData] });
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

  async function reveal(which: "balance" | "winnings") {
    if (!acct) return;
    const handle = (which === "balance" ? balHandle : winHandle) as `0x${string}` | undefined;
    if (!handle || handle === NULL_HANDLE) { which === "balance" ? setBal(0n) : setWin(0n); return; }
    setBusy(`reveal-${which}`); setErr(null); setMsg(null);
    try {
      // Plain user-decryption: the pool granted our EOA access at deposit time, so no delegation needed.
      const res: any = await decrypt.mutateAsync({ handles: [{ handle, contractAddress: POOL_ADDRESS }] });
      const v = res?.[handle] as bigint;
      which === "balance" ? setBal(v) : setWin(v);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally { setBusy(null); }
  }

  // ── Fund the prize reserve (mock yield) — mint → wrap → confidentialTransferAndCall(PRIZE_TAG) ──
  async function fundPrize() {
    if (!acct) return;
    let conf: bigint; try { conf = parseAmount(fundAmt); } catch { return; }
    if (conf <= 0n) return;
    setBusy("fund"); setErr(null);
    try {
      const under = toUnderlying(conf, 6);
      setMsg("Encrypting prize amount…");
      const enc = await encrypt.mutateAsync({ values: [{ value: conf, type: "euint64" }], contractAddress: POOL_TOKEN, userAddress: acct });
      const mint = encodeFunctionData({ abi: UNDERLYING_TOKEN_ABI, functionName: "mint", args: [acct, under] });
      const approve = encodeFunctionData({ abi: UNDERLYING_TOKEN_ABI, functionName: "approve", args: [POOL_TOKEN, under] });
      const wrap = encodeFunctionData({ abi: CONFIDENTIAL_TOKEN_ABI, functionName: "wrap", args: [acct, under] });
      const fund = encodeFunctionData({ abi: CONFIDENTIAL_TRANSFER_AND_CALL_ABI, functionName: "confidentialTransferAndCall", args: [POOL_ADDRESS, enc.handles[0] as `0x${string}`, enc.inputProof as `0x${string}`, PRIZE_TAG] });
      setMsg("Funding the prize reserve (gasless)…");
      const res = await sendTransactions([
        { to: POOL_UNDERLYING, value: 0n, data: mint },
        { to: POOL_UNDERLYING, value: 0n, data: approve },
        { to: POOL_TOKEN, value: 0n, data: wrap },
        { to: POOL_TOKEN, value: 0n, data: fund },
      ]);
      const txh = await res.included();
      recordActivity({ type: "setup", label: `Funded the prize reserve with ${fundAmt} cUSDC (mock yield)`, asset: "cUSDC", hash: txh ?? res.userOpHash, isUserOp: !txh, gasless: true });
      ok(`✅ Prize reserve funded with ${fundAmt} cUSDC. Trigger a draw to award it.`);
    } catch (e) { fail(e); } finally { setBusy(null); }
  }

  // ── Draw (permissionless / keeper) ──
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
          <span className="text-[11px] text-neutral-400">only you can decrypt</span>
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

      {/* Fund prize (mock yield) */}
      <div className="card space-y-3">
        <h2 className="font-semibold">3 · Fund the prize <span className="text-[11px] font-normal text-neutral-400">mock yield source</span></h2>
        <p className="text-[11px] text-neutral-500">The prize is the yield on pooled savings. Here you fund the encrypted prize reserve directly; a production build tops this up from real lending/LST yield instead — the draw logic is identical.</p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-neutral-600">Prize amount (cUSDC)</label>
            <input className="input-field mt-1" inputMode="decimal" value={fundAmt} onChange={(e) => setFundAmt(e.target.value)} />
          </div>
          <button className="btn-secondary" onClick={fundPrize} disabled={anyBusy || !BUNDLER_URL}>{running("fund") ? "Funding…" : "🎁 Fund prize"}</button>
        </div>
      </div>

      {/* Draw (permissionless / keeper) */}
      <div className="card space-y-2">
        <h2 className="font-semibold">4 · Draw</h2>
        <p className="text-[11px] text-neutral-500">Picks a winner onchain with FHE randomness, weighted by deposit size, over the encrypted balances — no offchain RNG, no plaintext. The winner sees their winnings; nobody else learns who won.</p>
        <button className="btn-primary w-full" onClick={draw} disabled={anyBusy || !BUNDLER_URL}>{running("draw") ? "Drawing…" : "🎲 Trigger confidential draw"}</button>
        <p className="text-[11px] text-neutral-400">Anyone can trigger a round (a production build gates this behind a keeper to prevent grinding).</p>
      </div>

      {/* Withdraw (no loss) */}
      <div className="card space-y-3">
        <h2 className="font-semibold">5 · Withdraw principal (no loss)</h2>
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
