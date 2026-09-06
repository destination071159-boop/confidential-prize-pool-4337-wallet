interface PrivacyScoreProps {
  score: number; // 0–100
  label?: string;
  size?: "sm" | "md" | "lg";
}

const SIZE = {
  sm: { ring: "w-12 h-12 text-xs", bar: "h-1.5" },
  md: { ring: "w-20 h-20 text-sm", bar: "h-2" },
  lg: { ring: "w-28 h-28 text-base", bar: "h-3" },
};

function scoreColor(score: number): string {
  if (score >= 75) return "text-green-400 stroke-green-400";
  if (score >= 40) return "text-yellow-400 stroke-yellow-400";
  return "text-red-600 stroke-red-400";
}

function barColor(score: number): string {
  if (score >= 75) return "bg-green-400";
  if (score >= 40) return "bg-yellow-400";
  return "bg-red-400";
}

export function PrivacyScore({ score, label, size = "md" }: PrivacyScoreProps) {
  const clamped = Math.min(100, Math.max(0, score));
  const sz = SIZE[size];
  const color = scoreColor(clamped);
  const bar   = barColor(clamped);
  const circumference = 2 * Math.PI * 18; // radius 18
  const dash = (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Ring */}
      <div className={`relative ${sz.ring} flex items-center justify-center`}>
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18" fill="none" strokeWidth="3" className="stroke-zinc-700" />
          <circle
            cx="20" cy="20" r="18" fill="none" strokeWidth="3"
            strokeDasharray={`${dash} ${circumference}`}
            className={`transition-all duration-700 ${color}`}
          />
        </svg>
        <span className={`font-bold ${color}`}>{clamped}</span>
      </div>

      {/* Bar */}
      <div className={`w-full bg-zinc-700 rounded-full overflow-hidden ${sz.bar}`}>
        <div
          className={`${sz.bar} rounded-full transition-all duration-700 ${bar}`}
          style={{ width: `${clamped}%` }}
        />
      </div>

      {label && <span className="text-xs text-zinc-400">{label}</span>}
    </div>
  );
}
