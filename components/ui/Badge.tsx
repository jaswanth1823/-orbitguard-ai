import { cn, getStatusBg, getSeverityBg } from '@/lib/utils';
import { SpacecraftStatus, AnomalySeverity } from '@/lib/types';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

export function Badge({ children, className }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border',
      className
    )}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: SpacecraftStatus }) {
  return (
    <Badge className={getStatusBg(status)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', {
        'bg-emerald-400': status === 'nominal',
        'bg-amber-400': status === 'warning',
        'bg-red-400 status-indicator-critical': status === 'critical',
        'bg-slate-400': status === 'offline',
        'bg-blue-400': status === 'maintenance',
      })} />
      {status.toUpperCase()}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: AnomalySeverity }) {
  return (
    <Badge className={getSeverityBg(severity)}>
      {severity.toUpperCase()}
    </Badge>
  );
}

export function HealthBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-400'
    : score >= 60 ? 'bg-amber-400/10 border-amber-400/30 text-amber-400'
    : score >= 40 ? 'bg-orange-400/10 border-orange-400/30 text-orange-400'
    : 'bg-red-400/10 border-red-400/30 text-red-400';
  return <Badge className={color}>{score}%</Badge>;
}
