export default function MissionCopilotLoading() {
  return (
    <div className="flex gap-5 h-[calc(100vh-7rem)] animate-pulse">
      {/* Chat area skeleton */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex-1 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
        <div className="h-20 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
      </div>
      {/* Sidebar skeleton */}
      <div className="w-72 space-y-4">
        <div className="h-72 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
        <div className="h-40 bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl" />
      </div>
    </div>
  );
}
