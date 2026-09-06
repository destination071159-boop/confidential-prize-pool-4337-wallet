import { useActivities, clearActivities, explorerUrl, activityIcon, timeAgo } from "../lib/activity";

export function Activity() {
  const items = useActivities();

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Activity</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Every confidential operation from this wallet — shield, unshield, grant, send — with its on-chain
            hash.
          </p>
        </div>
        {items.length > 0 && (
          <button className="btn-secondary !py-1.5 text-xs shrink-0" onClick={clearActivities}>
            Clear
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card text-sm text-neutral-500">
          No activity yet. Shield a token, grant a key, or send — every confidential operation shows up here
          with its on-chain hash.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <a
              key={a.id}
              href={explorerUrl(a)}
              target="_blank"
              rel="noreferrer"
              className="card flex items-center gap-3 !p-3 hover:border-[#f7c948] transition-colors"
            >
              <span className="text-lg">{activityIcon(a.type)}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{a.label}</div>
                <div className="text-[11px] text-neutral-500">
                  {timeAgo(a.ts)} · {a.gasless ? "gasless" : "self-paid"} ·{" "}
                  <span className="mono">{a.hash.slice(0, 10)}…</span>
                </div>
              </div>
              <span className="text-xs text-[#8a6d00]">↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default Activity;
