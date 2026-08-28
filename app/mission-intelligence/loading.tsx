export default function MissionIntelligenceLoading() {
  return (
    <div className="animate-pulse space-y-5">
      {/* Header status skeleton */}
      <div className="h-24 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
      {/* Main grid skeleton */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <div className="h-48 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
          <div className="h-48 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
          <div className="h-32 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
        </div>
        <div className="space-y-5">
          <div className="h-64 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
          <div className="h-48 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
        </div>
      </div>
    </div>
  );
}
