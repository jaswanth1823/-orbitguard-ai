export default function SettingsLoading() {
  return (
    <div className="animate-pulse max-w-4xl space-y-6">
      {/* AI status panel skeleton */}
      <div className="h-48 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
      {/* Config sections skeletons */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-40 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
      ))}
    </div>
  );
}
