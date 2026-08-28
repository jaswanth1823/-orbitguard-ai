export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-5">
      {/* Metrics bar skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
        ))}
      </div>
      {/* Main grid skeleton */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <div className="h-80 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
          <div className="h-64 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
        </div>
        <div className="space-y-5">
          <div className="h-72 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
          <div className="h-48 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
        </div>
      </div>
    </div>
  );
}
