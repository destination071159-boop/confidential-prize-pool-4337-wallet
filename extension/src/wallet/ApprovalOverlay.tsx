import { useEffect, useState } from "react";
import { wallet } from "./messaging";

interface ApprovalRequest {
  approvalId: string;
  method: "eth_sendTransaction" | "personal_sign" | "eth_signTypedData";
  detail: Record<string, unknown>;
}

function hexToEth(hex?: string): string {
  if (!hex) return "0";
  try {
    const wei = BigInt(hex);
    const whole = wei / 10n ** 18n;
    const frac = (wei % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : whole.toString();
  } catch {
    return "0";
  }
}

function decodeMessage(msg: unknown): string {
  if (typeof msg !== "string") return String(msg);
  if (/^0x[0-9a-fA-F]*$/.test(msg)) {
    try {
      const bytes = new Uint8Array(msg.slice(2).match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
      const text = new TextDecoder().decode(bytes);
      // Only show decoded text if it's printable
      if (/^[\x20-\x7e\s]*$/.test(text)) return text;
    } catch {
      /* fall through */
    }
  }
  return msg;
}

function formatTyped(raw: unknown): string {
  if (typeof raw !== "string") return String(raw);
  try {
    const parsed = JSON.parse(raw) as { message?: unknown; primaryType?: unknown };
    return JSON.stringify(parsed.message ?? parsed, null, 2);
  } catch {
    return raw;
  }
}

/** Listens for signing requests from the background and prompts the user to approve or reject. */
export function ApprovalOverlay() {
  const [req, setReq] = useState<ApprovalRequest | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const listener = (msg: { scope?: string; type?: string } & Partial<ApprovalRequest>) => {
      if (msg?.scope === "zw" && msg.type === "APPROVAL_REQUEST" && msg.approvalId) {
        setReq({
          approvalId: msg.approvalId,
          method: msg.method as ApprovalRequest["method"],
          detail: (msg.detail as Record<string, unknown>) ?? {},
        });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  if (!req) return null;

  async function act(approve: boolean) {
    if (!req) return;
    setBusy(true);
    try {
      if (approve) await wallet.approve(req.approvalId);
      else await wallet.reject(req.approvalId);
    } finally {
      setBusy(false);
      setReq(null);
    }
  }

  const isTx = req.method === "eth_sendTransaction";
  const isTyped = req.method === "eth_signTypedData";
  const d = req.detail;
  const origin = typeof d.origin === "string" ? (d.origin as string) : null;
  const favicon = typeof d.favicon === "string" ? (d.favicon as string) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white/70 border border-black/10 rounded-t-2xl sm:rounded-2xl p-4">
        <h3 className="font-semibold text-neutral-900 text-sm mb-1">
          {isTx ? "Confirm transaction" : "Signature request"}
        </h3>
        {origin ? (
          <div className="flex items-center gap-2 mb-3 text-xs text-neutral-600">
            {favicon && (
              <img src={favicon} alt="" className="w-4 h-4 rounded" onError={(e) => (e.currentTarget.style.display = "none")} />
            )}
            <span className="truncate">{origin}</span>
          </div>
        ) : (
          <p className="text-xs text-neutral-500 mb-3">
            A dApp is asking Confidential Prize Pool 4337 Wallet to {isTx ? "send a transaction" : "sign a message"}.
          </p>
        )}

        <div className="bg-white/70 border border-black/10 rounded-lg p-3 text-xs space-y-2 mb-4 break-all">
          {isTx ? (
            <>
              <Row label="To" value={(d.to as string) || "(contract deploy)"} mono />
              <Row label="Value" value={`${hexToEth(d.value as string)} ETH`} />
              {typeof d.data === "string" && d.data.length > 2 && (
                <Row label="Data" value={`${(d.data as string).slice(0, 42)}…`} mono />
              )}
            </>
          ) : isTyped ? (
            <div>
              <div className="text-neutral-500 mb-1">Typed data (EIP-712)</div>
              <div className="text-neutral-900 whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                {formatTyped(d.typedData)}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-neutral-500 mb-1">Message</div>
              <div className="text-neutral-900 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {decodeMessage(d.message)}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            className="flex-1 text-sm py-2 rounded-lg border border-black/10 text-neutral-700 hover:bg-black/[0.05]"
            disabled={busy}
            onClick={() => act(false)}
          >
            Reject
          </button>
          <button className="btn-primary flex-1" disabled={busy} onClick={() => act(true)}>
            {busy ? "…" : isTx ? "Confirm" : "Sign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-neutral-500 shrink-0">{label}</span>
      <span className={"text-neutral-900 text-right " + (mono ? "font-mono" : "")}>{value}</span>
    </div>
  );
}
