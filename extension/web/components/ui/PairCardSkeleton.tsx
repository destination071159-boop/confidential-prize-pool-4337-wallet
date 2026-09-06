export function PairCardSkeleton() {
  return (
    <div className="card animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full skeleton" />
          <div className="space-y-2">
            <div className="h-4 w-36 skeleton rounded" />
            <div className="h-3 w-24 skeleton rounded" />
          </div>
        </div>
        <div className="h-5 w-16 skeleton rounded-full" />
      </div>
      <div className="bg-white/60 rounded-lg p-3 border border-black/10 space-y-2 mb-4">
        <div className="h-3 w-full skeleton rounded" />
        <div className="h-3 w-full skeleton rounded" />
      </div>
      <div className="flex gap-2">
        <div className="h-7 flex-1 skeleton rounded-lg" />
        <div className="h-7 flex-1 skeleton rounded-lg" />
        <div className="h-7 w-10 skeleton rounded-lg" />
      </div>
    </div>
  );
}
