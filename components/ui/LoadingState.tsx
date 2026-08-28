import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-10 h-10' : 'w-6 h-6';
  return (
    <div
      className={cn(
        'border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin',
        sizeClass,
        className
      )}
    />
  );
}

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({ message = 'Loading data...', className }: LoadingStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-16', className)}>
      <LoadingSpinner size="lg" />
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}

export function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded', className)} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl p-5 space-y-3">
      <SkeletonLine className="h-4 w-1/3" />
      <SkeletonLine className="h-3 w-1/2" />
      <SkeletonLine className="h-8 w-full" />
      <SkeletonLine className="h-3 w-2/3" />
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <div className="w-12 h-12 rounded-full bg-red-400/10 border border-red-400/30 flex items-center justify-center">
        <span className="text-red-400 text-xl">!</span>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-slate-200">Error loading data</p>
        <p className="text-xs text-slate-400 mt-1">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs text-blue-400 hover:text-blue-300 underline transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-10 h-10 rounded-full bg-slate-700/30 border border-[#1e2d4a] flex items-center justify-center mb-3">
        <span className="text-slate-500 text-lg">∅</span>
      </div>
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}
