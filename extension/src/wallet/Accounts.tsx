import { useCallback, useEffect, useState } from "react";
import { wallet, type AccountMeta, type WalletStatus } from "./messaging";
import { internalProvider } from "./internalProvider";

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function CopyAddr({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="text-neutral-500 hover:text-neutral-900 transition-colors"
      title="Copy address"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard may be blocked */
        }
      }}
    >
      {copied ? "✓" : "⎘"}
    </button>
  );
}

/** Thin bar shown above the app: active account + address (copyable) + Accounts menu. */
export function AccountBar({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await wallet.status());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const active =
    status?.accounts.find((a) => a.address === status.activeAddress) ?? status?.accounts[0] ?? null;

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-black/10 bg-white/85 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <span className="text-xs font-medium text-neutral-900 truncate">
            {active?.name ?? "Account"}
          </span>
          {active && (
            <span className="text-xs font-mono text-neutral-600 flex items-center gap-1">
              {short(active.address)}
              <CopyAddr address={active.address} />
            </span>
          )}
        </div>
        <button
          className="text-xs px-2 py-1 rounded-md border border-black/10 text-neutral-700 hover:bg-black/[0.05] shrink-0"
          onClick={() => setOpen(true)}
        >
          Accounts ▾
        </button>
      </div>

      {open && status && (
        <AccountSheet
          status={status}
          onClose={() => setOpen(false)}
          onChanged={async () => {
            await refresh();
            onChanged();
          }}
        />
      )}
    </>
  );
}

function AccountSheet({
  status,
  onClose,
  onChanged,
}: {
  status: WalletStatus;
  onClose: () => void;
  onChanged: () => void;
}) {
  const hasSeed = status.accounts.some((a) => a.type === "seed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "import-pk" | "reveal">("list");
  const [pk, setPk] = useState("");
  const [pw, setPw] = useState("");
  const [seed, setSeed] = useState<string | null>(null);

  async function guard(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const activeAddr = status.activeAddress;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white/70 border border-black/10 rounded-t-2xl sm:rounded-2xl p-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-neutral-900 text-sm">
            {view === "list" ? "Accounts" : view === "import-pk" ? "Import private key" : "Recovery phrase"}
          </h3>
          <button className="text-neutral-500 hover:text-neutral-800 text-lg leading-none" onClick={onClose}>
            ×
          </button>
        </div>

        {error && (
          <div className="text-xs text-red-600 bg-red-900/20 border border-red-800/40 rounded p-2 mb-3">
            {error}
          </div>
        )}

        {view === "list" && (
          <>
            <div className="space-y-1 mb-4">
              {status.accounts.map((a: AccountMeta) => {
                const isActive = a.address === activeAddr;
                return (
                  <button
                    key={a.address}
                    disabled={busy}
                    onClick={() =>
                      guard(async () => {
                        await wallet.setActive(a.address);
                        internalProvider.emit("accountsChanged", [a.address]);
                        onChanged();
                      })
                    }
                    className={
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left " +
                      (isActive
                        ? "border-[#f7c948] bg-[#fff3c4]"
                        : "border-black/10 hover:border-[#f7c948]")
                    }
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-neutral-900 truncate flex items-center gap-1">
                        {a.name}
                        <span className="text-[10px] text-neutral-500 uppercase">
                          {a.type === "pk" ? "key" : "seed"}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-neutral-500">{short(a.address)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <CopyAddr address={a.address} />
                      {isActive && <span className="text-xs text-[#8a6d00]">●</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              {hasSeed && (
                <button
                  className="btn-secondary w-full text-xs py-1.5"
                  disabled={busy}
                  onClick={() =>
                    guard(async () => {
                      const m = await wallet.addAccount();
                      internalProvider.emit("accountsChanged", [m.address]);
                      onChanged();
                    })
                  }
                >
                  + Add account (from seed)
                </button>
              )}
              <button
                className="btn-secondary w-full text-xs py-1.5"
                onClick={() => setView("import-pk")}
              >
                Import private key
              </button>
              {hasSeed && (
                <button
                  className="btn-secondary w-full text-xs py-1.5"
                  onClick={() => setView("reveal")}
                >
                  Reveal recovery phrase
                </button>
              )}
              <button
                className="w-full text-xs py-1.5 rounded-lg border border-red-900/60 text-red-600 hover:bg-red-950/30"
                disabled={busy}
                onClick={() =>
                  guard(async () => {
                    await wallet.lock();
                    internalProvider.emit("disconnect");
                    onChanged();
                    onClose();
                  })
                }
              >
                Lock wallet
              </button>
            </div>
          </>
        )}

        {view === "import-pk" && (
          <div className="space-y-3">
            <textarea
              className="input-field w-full h-16 font-mono text-xs"
              placeholder="0x… private key"
              value={pk}
              onChange={(e) => setPk(e.target.value)}
            />
            <button
              className="btn-primary w-full text-xs py-1.5"
              disabled={busy}
              onClick={() =>
                guard(async () => {
                  // Unlocked: the background reuses the cached session password.
                  const m = await wallet.importPk("", pk);
                  internalProvider.emit("accountsChanged", [m.address]);
                  setPk("");
                  setView("list");
                  onChanged();
                })
              }
            >
              {busy ? "Importing…" : "Import"}
            </button>
            <button className="text-xs text-neutral-500 w-full" onClick={() => setView("list")}>
              ← Back
            </button>
          </div>
        )}

        {view === "reveal" && (
          <div className="space-y-3">
            {seed ? (
              <>
                <p className="text-[11px] text-[#92400e]">
                  Never share these words. Anyone with them controls your funds.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {seed.split(" ").map((w, i) => (
                    <div
                      key={i}
                      className="bg-white/70 border border-black/10 rounded px-2 py-1.5 text-xs font-mono"
                    >
                      <span className="text-neutral-500 mr-1">{i + 1}.</span>
                      {w}
                    </div>
                  ))}
                </div>
                <button
                  className="btn-secondary w-full text-xs py-1.5"
                  onClick={() => {
                    setSeed(null);
                    setPw("");
                    setView("list");
                  }}
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <input
                  className="input-field w-full"
                  type="password"
                  placeholder="Confirm password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                />
                <button
                  className="btn-primary w-full text-xs py-1.5"
                  disabled={busy}
                  onClick={() =>
                    guard(async () => {
                      const { mnemonic } = await wallet.revealSeed(pw);
                      setSeed(mnemonic);
                    })
                  }
                >
                  {busy ? "…" : "Reveal"}
                </button>
                <button className="text-xs text-neutral-500 w-full" onClick={() => setView("list")}>
                  ← Back
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
