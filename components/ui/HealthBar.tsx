import { cn, getHealthBg } from '@/lib/utils';

interface HealthBarProps {
  score: number;
  label?: string;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function HealthBar({
  score,
  label,
  showValue = true,
  size = 'md',
  className,
}: HealthBarProps) {
  const height = size === 'sm' ? 'h-1' : size === 'lg' ? 'h-3' : 'h-2';
  const color = getHealthBg(score);

  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-xs text-slate-400">{label}</span>}
          {showValue && (
            <span
              className="text-xs font-mono font-medium"
              style={{ color }}
            >
              {score}%
            </span>
          )}
        </div>
      )}
      <div className={cn('w-full bg-[#1a2a42] rounded-full overflow-hidden', height)}>
        <div
          className="rounded-full transition-all duration-500"
          style={{
            width: `${Math.max(0, Math.min(100, score))}%`,
            height: '100%',
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}66`,
          }}
        />
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  change?: number;
  status?: 'nominal' | 'warning' | 'critical';
  className?: string;
}

export function MetricCard({ label, value, unit, change, status, className }: MetricCardProps) {
  const statusColor =
    status === 'nominal' ? 'text-emerald-400' :
    status === 'warning' ? 'text-amber-400' :
    status === 'critical' ? 'text-red-400' : 'text-slate-300';

  return (
    <div className={cn('bg-[#0f1a2e] border border-[#1e2d4a] rounded-lg p-3', className)}>
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={cn('text-xl font-mono font-bold', statusColor)}>
        {value}
        {unit && <span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>}
      </div>
      {change !== undefined && (
        <div className={cn(
          'text-[10px] mt-1 font-medium',
          change > 0 ? 'text-emerald-400' : change < 0 ? 'text-red-400' : 'text-slate-500'
        )}>
          {change > 0 ? '+' : ''}{change.toFixed(1)}% from baseline
        </div>
      )}
    </div>
  );
}
