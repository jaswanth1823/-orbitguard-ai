import Link from 'next/link';
import { Spacecraft } from '@/lib/types';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatusBadge, HealthBadge } from '@/components/ui/Badge';
import { HealthBar } from '@/components/ui/HealthBar';
import { Satellite, ChevronRight, AlertTriangle } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

interface SpacecraftStatusGridProps {
  spacecraft: Spacecraft[];
}

export function SpacecraftStatusGrid({ spacecraft }: SpacecraftStatusGridProps) {
  const sorted = [...spacecraft].sort((a, b) => a.health_score - b.health_score);

  return (
    <Card>
      <CardHeader
        title="Spacecraft Fleet"
        subtitle={`${spacecraft.length} monitored`}
        icon={<Satellite className="w-4 h-4 text-blue-400" />}
        actions={
          <Link
            href="/satellites"
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
          >
            View all <ChevronRight className="w-3 h-3" />
          </Link>
        }
      />
      <div className="divide-y divide-[#1e2d4a]">
        {sorted.map(sc => (
          <Link
            key={sc.id}
            href={`/satellites/${sc.id}`}
            className="flex items-center gap-4 px-5 py-3 hover:bg-[#111d35] transition-colors group"
          >
            {/* Name & status */}
            <div className="w-28 flex-shrink-0">
              <div className="text-sm font-mono font-medium text-slate-200 group-hover:text-blue-300 transition-colors">
                {sc.name}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 truncate">{sc.mission}</div>
            </div>

            {/* Status badge */}
            <StatusBadge status={sc.status} />

            {/* Health bar */}
            <div className="flex-1 min-w-0">
              <HealthBar score={sc.health_score} showValue={false} size="sm" />
            </div>

            {/* Score */}
            <div className="w-10 text-right">
              <HealthBadge score={sc.health_score} />
            </div>

            {/* Anomalies */}
            {sc.active_anomalies > 0 && (
              <div className="flex items-center gap-1 text-orange-400 w-16 justify-end">
                <AlertTriangle className="w-3 h-3" />
                <span className="text-xs">{sc.active_anomalies}</span>
              </div>
            )}

            {/* Last update */}
            <div className="text-[10px] text-slate-500 w-16 text-right flex-shrink-0">
              {formatRelativeTime(sc.last_telemetry_at)}
            </div>

            <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" />
          </Link>
        ))}
      </div>
    </Card>
  );
}
