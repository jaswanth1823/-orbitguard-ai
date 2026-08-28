import { Anomaly } from '@/lib/types';
import { Card, CardHeader } from '@/components/ui/Card';
import { SeverityBadge } from '@/components/ui/Badge';
import { AlertTriangle, Clock } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import { EmptyState } from '@/components/ui/LoadingState';

interface AnomalyTimelineProps {
  anomalies: Anomaly[];
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function AnomalyTimeline({ anomalies }: AnomalyTimelineProps) {
  const sorted = [...anomalies].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  return (
    <Card>
      <CardHeader
        title="Active Anomalies"
        subtitle={`${anomalies.length} open`}
        icon={<AlertTriangle className="w-4 h-4 text-orange-400" />}
      />
      <div className="divide-y divide-[#1e2d4a]">
        {sorted.length === 0 ? (
          <div className="p-4">
            <EmptyState message="No active anomalies" />
          </div>
        ) : (
          sorted.map(anomaly => (
            <div key={anomaly.id} className="p-4 hover:bg-[#111d35] transition-colors">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium text-slate-200 font-mono">{anomaly.spacecraft_name}</span>
                  <SeverityBadge severity={anomaly.severity} />
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-500 flex-shrink-0">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(anomaly.timestamp)}
                </div>
              </div>
              <div className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                {anomaly.anomaly_type.replace('_', ' ').toUpperCase()}: {anomaly.explanation.slice(0, 120)}...
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="text-[10px] text-slate-500">
                  Confidence: <span className="text-slate-300">{(anomaly.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="text-slate-600">·</div>
                <div className="text-[10px] text-slate-500">
                  Param: <span className="text-slate-300 font-mono">{anomaly.parameter}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
