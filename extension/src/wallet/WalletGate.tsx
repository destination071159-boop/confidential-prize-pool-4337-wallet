import { useCallback, useEffect, useState } from "react";
import { useConnect, useAccount } from "wagmi";
import { wallet, type WalletStatus } from "./messaging";
import { keyringConnector } from "./wagmi.config";
import { AccountBar } from "./Accounts";
import { ApprovalOverlay } from "./ApprovalOverlay";

type Screen = "loading" | "no-wallet" | "locked" | "unlocked";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-transparent text-neutral-900 flex flex-col items-center justify-center px-5 py-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-6">
          <span className="text-[#8a6d00] text-xl">⬡</span>
          <span className="font-bold text-lg">Confidential Prize Pool 4337 Wallet</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** No wallet yet: create a fresh seed or import one, protected by a password. */
function Onboarding({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"choose" | "create" | "import" | "import-pk">("choose");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phrase, setPhrase] = useState("");
  const [pk, setPk] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validPw = password.length >= 8 && password === confirm;

  async function doCreate() {
    setError(null);
    if (!validPw) return setError("Passwords must match and be at least 8 characters.");
    setBusy(true);
    try {
      const { mnemonic } = await wallet.create(password);
      setGenerated(mnemonic);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    setError(null);
    if (!validPw) return setError("Passwords must match and be at least 8 characters.");
    setBusy(true);
    try {
      await wallet.import(password, phrase);
      onDone();
    } catch (e) {
      setError((e as Error).message || "Invalid recovery phrase.");
    } finally {
      setBusy(false);
    }
  }

  async function doImportPk() {
    setError(null);
    if (!validPw) return setError("Passwords must match and be at least 8 characters.");
    setBusy(true);
    try {
      await wallet.importPk(password, pk);
      onDone();
    } catch (e) {
      setError((e as Error).message || "Invalid private key.");
    } finally {
      setBusy(false);
    }
  }

  if (generated) {
    return (
      <Shell>
        <div className="card">
          <h2 className="font-semibold mb-2">Save your recovery phrase</h2>
          <p className="text-xs text-neutral-600 mb-3">
            Write these 12 words down and keep them safe. Anyone with them controls your funds.
            Confidential Prize Pool 4337 Wallet can never recover them for you.
          </p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {generated.split(" ").map((w, i) => (
              <div
                key={i}
                className="bg-white/70 border border-black/10 rounded px-2 py-1.5 text-xs font-mono"
              >
                <span className="text-neutral-500 mr-1">{i + 1}.</span>
                {w}
              </div>
            ))}
          </div>
          <button className="btn-primary w-full" onClick={onDone}>
            I&apos;ve saved it — continue
          </button>
        </div>
      </Shell>
    );
  }

  if (mode === "choose") {
    return (
      <Shell>
        <div className="card space-y-3">
          <h2 className="font-semibold">Set up your wallet</h2>
          <p className="text-xs text-neutral-600">
            Confidential Prize Pool 4337 Wallet holds your keys inside this extension. Create a new wallet or import an
            existing recovery phrase.
          </p>
          <button className="btn-primary w-full" onClick={() => setMode("create")}>
            Create a new wallet
          </button>
          <button className="btn-secondary w-full" onClick={() => setMode("import")}>
            Import recovery phrase
          </button>
          <button className="btn-secondary w-full" onClick={() => setMode("import-pk")}>
            Import private key
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="card space-y-3">
        <h2 className="font-semibold">
          {mode === "create"
            ? "Create a wallet"
            : mode === "import-pk"
              ? "Import private key"
              : "Import a wallet"}
        </h2>
        {mode === "import" && (
          <textarea
            className="input-field w-full h-20 font-mono text-xs"
            placeholder="Enter your 12-word recovery phrase"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
          />
        )}
        {mode === "import-pk" && (
          <>
            <textarea
              className="input-field w-full h-16 font-mono text-xs"
              placeholder="0x… private key (64 hex chars)"
              value={pk}
              onChange={(e) => setPk(e.target.value)}
            />
            <p className="text-[11px] text-[#92400e]">
              In MetaMask: account menu → Account details → Show private key. Only import a
              test/throwaway key into this unaudited build.
            </p>
          </>
        )}
        <input
          className="input-field w-full"
          type="password"
          placeholder="Password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          className="input-field w-full"
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <p className="text-[11px] text-neutral-500">
          This password encrypts your wallet on this device. There is no way to reset it.
        </p>
        {error && (
          <div className="text-xs text-red-600 bg-red-900/20 border border-red-800/40 rounded p-2">
            {error}
          </div>
        )}
        <button
          className="btn-primary w-full"
          disabled={busy}
          onClick={mode === "create" ? doCreate : mode === "import-pk" ? doImportPk : doImport}
        >
          {busy
            ? "Working…"
            : mode === "create"
              ? "Create wallet"
              : mode === "import-pk"
                ? "Import key"
                : "Import wallet"}
        </button>
        <button
          className="text-xs text-neutral-500 hover:text-neutral-800 w-full text-center"
          onClick={() => setMode("choose")}
        >
          ← Back
        </button>
      </div>
    </Shell>
  );
}

/** Wallet exists but is locked: enter the password to decrypt the vault in the background. */
function Unlock({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doUnlock() {
    setError(null);
    setBusy(true);
    try {
      await wallet.unlock(password);
      onUnlock();
    } catch (e) {
      setError((e as Error).message || "Incorrect password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="card space-y-3">
        <h2 className="font-semibold">Unlock Confidential Prize Pool 4337 Wallet</h2>
        <input
          className="input-field w-full"
          type="password"
          placeholder="Password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doUnlock()}
        />
        {error && (
          <div className="text-xs text-red-600 bg-red-900/20 border border-red-800/40 rounded p-2">
            {error}
          </div>
        )}
        <button className="btn-primary w-full" disabled={busy} onClick={doUnlock}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </div>
    </Shell>
  );
}

/**
 * Gates the whole app on wallet state. When unlocked, it connects wagmi to the keyring
 * connector so the reused apps/web UI sees a "connected" account and can sign.
 */
export function WalletGate({ children }: { children: React.ReactNode }) {
  const [screen, setScreen] = useState<Screen>("loading");
  const { connect } = useConnect();
  const { isConnected, isConnecting } = useAccount();

  const refresh = useCallback(async () => {
    try {
      const s: WalletStatus = await wallet.status();
      setScreen(!s.hasWallet ? "no-wallet" : !s.isUnlocked ? "locked" : "unlocked");
    } catch {
      setScreen("no-wallet");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Once the keyring is unlocked, auto-connect wagmi to it.
  useEffect(() => {
    if (screen === "unlocked" && !isConnected && !isConnecting) {
      connect({ connector: keyringConnector });
    }
  }, [screen, isConnected, isConnecting, connect]);

  if (screen === "loading") {
    return (
      <Shell>
        <div className="text-center text-neutral-500 text-sm py-8">Loading…</div>
      </Shell>
    );
  }
  if (screen === "no-wallet") return <Onboarding onDone={refresh} />;
  if (screen === "locked") return <Unlock onUnlock={refresh} />;
  return (
    <>
      <AccountBar onChanged={refresh} />
      {children}
      <ApprovalOverlay />
    </>
  );
}
