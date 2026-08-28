export default function AnomaliesLoading() {
  return (
    <div className="animate-pulse space-y-5">
      {/* Stats cards skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
        ))}
      </div>
      {/* Content grid skeleton */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <div className="space-y-4">
          <div className="h-64 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
          <div className="h-48 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
        </div>
        <div className="xl:col-span-3 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
