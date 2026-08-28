'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, X, CheckCheck, AlertTriangle, Info, Zap } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useClickOutside, useFocusTrap } from '@/lib/hooks';
import type { Anomaly, AnomalySeverity } from '@/lib/types';

// ── Notification model ────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  severity: AnomalySeverity | 'info';
  spacecraft: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

// Convert anomalies → notifications; add static system messages
function anomaliesToNotifications(anomalies: Anomaly[]): AppNotification[] {
  const fromAnomalies: AppNotification[] = anomalies
    .filter(a => a.is_active)
    .sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.severity] - order[b.severity];
    })
    .slice(0, 6)
    .map(a => ({
      id: a.id,
      severity: a.severity,
      spacecraft: a.spacecraft_name,
      title: `${a.anomaly_type.replace(/_/g, ' ')} anomaly detected`,
      message: a.explanation.length > 120 ? a.explanation.slice(0, 117) + '…' : a.explanation,
      timestamp: a.timestamp,
      read: false,
    }));

  const systemMessages: AppNotification[] = [
    {
      id: 'sys-telemetry-ok',
      severity: 'info',
      spacecraft: 'All spacecraft',
      title: 'Telemetry pipeline nominal',
      message: 'All 5 spacecraft are transmitting telemetry. Next scheduled downlink in 47 minutes.',
      timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      read: false,
    },
  ];

  return [...fromAnomalies, ...systemMessages];
}

// ── Icon helper ───────────────────────────────────────────────────────────────

function NotifIcon({ severity }: { severity: AppNotification['severity'] }) {
  if (severity === 'critical')
    return <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />;
  if (severity === 'high')
    return <Zap className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />;
  if (severity === 'medium')
    return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5 opacity-80" />;
  if (severity === 'low')
    return <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />;
  return <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />;
}

function severityLabel(s: AppNotification['severity']): string {
  if (s === 'info') return 'INFO';
  return s.toUpperCase();
}

function severityLabelClass(s: AppNotification['severity']): string {
  if (s === 'critical') return 'text-red-400';
  if (s === 'high') return 'text-orange-400';
  if (s === 'medium') return 'text-amber-400';
  if (s === 'low') return 'text-blue-400';
  return 'text-slate-400';
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement>;
  /** Called with the total unread count after each anomaly fetch */
  onCountResolved?: (count: number) => void;
}

export function NotificationPanel({ open, onClose, anchorRef, onCountResolved }: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  useClickOutside(panelRef, onClose, open);
  useFocusTrap(panelRef, open);

  // Fetch real anomaly data whenever the panel opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/anomalies')
      .then(r => r.json())
      .then(data => {
        const notifs = anomaliesToNotifications(data.anomalies ?? []);
        setNotifications(notifs);
        // Report unread count back to TopBar so it can update the bell badge
        // without a second independent fetch.
        onCountResolved?.(notifs.filter(n => !n.read).length);
      })
      .catch(() => {
        // Fallback: generate from static demo anomalies on client
        setNotifications([
          {
            id: 'fallback-01',
            severity: 'critical',
            spacecraft: 'ORBIT-01',
            title: 'Power-system anomaly detected',
            message:
              'Battery voltage is significantly below nominal while power consumption is elevated. Correlated thermal load increase observed.',
            timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
            read: false,
          },
          {
            id: 'fallback-02',
            severity: 'medium',
            spacecraft: 'ORBIT-02',
            title: 'Thermal variation detected',
            message: 'Internal temperature showing increased orbital variation. Within safe limits.',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            read: false,
          },
          {
            id: 'fallback-03',
            severity: 'medium',
            spacecraft: 'ORBIT-05',
            title: 'Signal strength degradation',
            message: 'Signal strength degradation at apoapsis passages. Ground station tracking may need adjustment.',
            timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
            read: false,
          },
          {
            id: 'fallback-sys',
            severity: 'info',
            spacecraft: 'All spacecraft',
            title: 'Telemetry pipeline nominal',
            message: 'All 5 spacecraft are transmitting telemetry. Simulation data active.',
            timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
            read: false,
          },
        ]);
      })
      .finally(() => setLoading(false));
  }, [open, onCountResolved]);

  const unreadCount = notifications.filter(n => !n.read).length;

  function markRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  if (!open) return null;

  return (
    // Portal-style absolute positioning relative to viewport via fixed
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Notifications"
      // Position: fixed so it escapes overflow:hidden on app shell
      className="fixed z-[200] top-14 right-[88px] w-[380px] max-w-[calc(100vw-24px)]"
    >
      {/* Arrow pointer */}
      <div className="absolute -top-1.5 right-[52px] w-3 h-3 bg-[#0f1a2e] border-l border-t border-[#1e2d4a] rotate-45" />

      <div className="relative bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2d4a]">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-slate-200">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded hover:bg-blue-600/10"
              >
                <CheckCheck className="w-3 h-3" />
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close notifications"
              className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-[#1e2d4a] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[420px] overflow-y-auto divide-y divide-[#1e2d4a]">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <div className="w-4 h-4 border border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
              Loading notifications…
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No notifications
            </div>
          ) : (
            notifications.map(n => (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={cn(
                  'w-full text-left px-4 py-3 transition-colors flex gap-3 group',
                  n.read
                    ? 'hover:bg-[#111d35] opacity-60'
                    : 'hover:bg-[#111d35] bg-blue-600/[0.04]',
                )}
              >
                {/* Unread dot */}
                <div className="flex-shrink-0 mt-[5px] relative">
                  <NotifIcon severity={n.severity} />
                  {!n.read && (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
                  )}
                </div>

                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className={cn('text-[10px] font-bold', severityLabelClass(n.severity))}>
                      {severityLabel(n.severity)}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{n.spacecraft}</span>
                  </div>
                  <div className="text-xs font-medium text-slate-200 leading-snug mb-0.5">
                    {n.title}
                  </div>
                  <div className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                    {n.message}
                  </div>
                  <div className="text-[10px] text-slate-600 mt-1">
                    {formatRelativeTime(n.timestamp)}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="px-4 py-2.5 border-t border-[#1e2d4a] flex items-center justify-between">
            <span className="text-[10px] text-slate-600">
              {unreadCount === 0 ? 'All caught up' : `${unreadCount} unread`}
            </span>
            <a
              href="/anomalies"
              onClick={onClose}
              className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all anomalies →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bell button (exported so TopBar can get a ref to it) ─────────────────────

interface NotificationBellProps {
  unreadCount: number;
  open: boolean;
  onClick: () => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
}

export function NotificationBell({ unreadCount, open, onClick, buttonRef }: NotificationBellProps) {
  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      aria-label={`Notifications${unreadCount > 0 ? ` — ${unreadCount} unread` : ''}`}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={cn(
        'relative p-2 rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500',
        open
          ? 'text-slate-200 bg-[#1a2d4a]'
          : 'text-slate-400 hover:text-slate-200 hover:bg-[#111d35]',
      )}
    >
      <Bell className="w-4 h-4" />
      {/* Badge — hidden when zero */}
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-[#0a1120]"
        />
      )}
    </button>
  );
}
