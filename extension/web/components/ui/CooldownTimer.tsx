import { useState, useEffect } from "react";

interface CooldownTimerProps {
  /** Unix timestamp (ms) when the cooldown expires */
  expiresAt: number;
  onExpire?: () => void;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Ready";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function CooldownTimer({ expiresAt, onExpire }: CooldownTimerProps) {
  const [remaining, setRemaining] = useState(() => Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      const r = Math.max(0, expiresAt - Date.now());
      setRemaining(r);
      if (r === 0) onExpire?.();
    }, 1_000);
    return () => clearInterval(id);
  }, [expiresAt, onExpire, remaining]);

  const pct = remaining <= 0 ? 0 : Math.min(100, (remaining / 86_400_000) * 100);
  const ready = remaining <= 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-zinc-700 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all ${ready ? "bg-green-400" : "bg-orange-400"}`}
          style={{ width: ready ? "100%" : `${100 - pct}%` }}
        />
      </div>
      <span className={`text-xs font-mono min-w-[64px] text-right ${ready ? "text-green-400" : "text-orange-400"}`}>
        {formatRemaining(remaining)}
      </span>
    </div>
  );
}
