import { DashboardMetrics } from '@/lib/types';
import { AlertTriangle, CheckCircle, XCircle, Activity, Satellite } from 'lucide-react';

interface FleetMetricsBarProps {
  metrics: DashboardMetrics;
}

export function FleetMetricsBar({ metrics }: FleetMetricsBarProps) {
  const items = [
    {
      label: 'Active',
      value: metrics.active_spacecraft,
      icon: Satellite,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10 border-blue-400/20',
    },
    {
      label: 'Nominal',
      value: metrics.healthy_spacecraft,
      icon: CheckCircle,
      color: 'text-emerald-400',
      bg: 'bg-emerald-400/10 border-emerald-400/20',
    },
    {
      label: 'Warning',
      value: metrics.warning_spacecraft,
      icon: AlertTriangle,
      color: 'text-amber-400',
      bg: 'bg-amber-400/10 border-amber-400/20',
    },
    {
      label: 'Critical',
      value: metrics.critical_spacecraft,
      icon: XCircle,
      color: 'text-red-400',
      bg: 'bg-red-400/10 border-red-400/20',
    },
    {
      label: 'Open Anomalies',
      value: metrics.open_anomalies,
      icon: Activity,
      color: metrics.open_anomalies > 0 ? 'text-orange-400' : 'text-slate-400',
      bg: metrics.open_anomalies > 0 ? 'bg-orange-400/10 border-orange-400/20' : 'bg-[#0f1a2e] border-[#1e2d4a]',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map(({ label, value, icon: Icon, color, bg }) => (
        <div
          key={label}
          className={`${bg} border rounded-xl p-4 flex items-center gap-3`}
        >
          <div className={`w-9 h-9 rounded-lg bg-current/10 flex items-center justify-center flex-shrink-0 ${bg}`}>
            <Icon className={`w-4 h-4 ${color}`} />
          </div>
          <div>
            <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
