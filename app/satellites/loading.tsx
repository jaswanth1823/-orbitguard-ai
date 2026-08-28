export default function SatellitesLoading() {
  return (
    <div className="animate-pulse space-y-5">
      {/* Controls skeleton */}
      <div className="flex gap-3">
        <div className="h-9 w-64 bg-[#0f1a2e] border border-[#1e2d4a] rounded-lg" />
        <div className="h-9 w-48 bg-[#0f1a2e] border border-[#1e2d4a] rounded-lg" />
      </div>
      {/* Table skeleton */}
      <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl overflow-hidden">
        <div className="h-10 border-b border-[#1e2d4a] bg-[#0a1120]" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 border-b border-[#1e2d4a] last:border-0" />
        ))}
      </div>
    </div>
  );
}
