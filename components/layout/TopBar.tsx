'use client';

import { useState, useEffect, useRef } from 'react';
import { LogIn } from 'lucide-react';
import { formatUTC } from '@/lib/utils';
import { NotificationBell, NotificationPanel } from './NotificationPanel';
import { OperatorTrigger, OperatorMenu, SignInModal } from './OperatorMenu';
import { usePageTitle } from './PageTitleContext';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { DataSourceMode } from '@/lib/types';

// ── Data Source Badge ─────────────────────────────────────────────────────────

function DataSourceBadge({ dataSource }: { dataSource: DataSourceMode }) {
  if (dataSource === 'iss-live') {
    return (
      <div className="flex items-center gap-1.5" title="Streaming real-time ISS position (NORAD 25544) via wheretheiss.at">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[11px] text-emerald-400 font-medium">LIVE TELEMETRY (ISS-25544)</span>
      </div>
    );
  }
  if (dataSource === 'live' || dataSource === 'n2yo') {
    return (
      <div className="flex items-center gap-1.5" title={dataSource === 'n2yo' ? 'Real-time orbital data from N2YO API' : undefined}>
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span className="text-[11px] text-emerald-400 font-medium">LIVE DATA</span>
      </div>
    );
  }
  if (dataSource === 'fallback') {
    return (
      <div className="flex items-center gap-1.5" title="N2YO request failed — showing simulated fallback positions">
        <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
        <span className="text-[11px] text-orange-400 font-medium">FALLBACK DATA</span>
      </div>
    );
  }
  // 'mixed' — Mission Copilot: orbital=N2YO live, telemetry=simulated, AI=Granite
  if (dataSource === 'mixed') {
    return (
      <div className="flex items-center gap-2" title="Orbital: N2YO live · Telemetry: simulated · AI: IBM Granite">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-[11px] text-emerald-400 font-medium">N2YO</span>
        </div>
        <span className="text-[11px] text-[#1e2d4a] font-bold select-none">·</span>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-[11px] text-amber-400 font-medium">SIMULATION</span>
        </div>
        <span className="text-[11px] text-[#1e2d4a] font-bold select-none">·</span>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span className="text-[11px] text-blue-400 font-medium">IBM GRANITE</span>
        </div>
      </div>
    );
  }
  // 'simulated' (default)
  return (
    <div className="flex items-center gap-1.5" title="Showing simulated reference positions">
      <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      <span className="text-[11px] text-amber-400 font-medium">SIMULATION DATA</span>
    </div>
  );
}

export function TopBar() {
  const { state } = usePageTitle();
  const { title, subtitle, dataSource = 'simulated' } = state;

  const [currentTime, setCurrentTime] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);

  // ── Panel open state — mutually exclusive ────────────────────────────────
  const [notifOpen, setNotifOpen] = useState(false);
  const [operatorOpen, setOperatorOpen] = useState(false);

  // Unread count — seeded pessimistically; updated by NotificationPanel on first open
  const [unreadCount, setUnreadCount] = useState(3);

  const bellRef = useRef<HTMLButtonElement>(null);
  const operatorRef = useRef<HTMLButtonElement>(null);

  // UTC clock ticker
  useEffect(() => {
    const update = () => setCurrentTime(formatUTC(new Date()));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // Resolve and keep the Supabase auth user in sync
  useEffect(() => {
    const supabase = createClient();

    // Get the initial session without blocking render
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
    });

    // Keep in sync with sign-in / sign-out events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  function toggleNotif() {
    setNotifOpen(prev => !prev);
    setOperatorOpen(false); // close the other panel
  }

  function closeNotif() {
    setNotifOpen(false);
  }

  function toggleOperator() {
    setOperatorOpen(prev => !prev);
    setNotifOpen(false); // close the other panel
  }

  function closeOperator() {
    setOperatorOpen(false);
  }

  return (
    <header className="h-16 bg-[#0a1120] border-b border-[#1e2d4a] flex items-center justify-between px-6 flex-shrink-0 relative z-10">
      {/* Left: Page title */}
      <div>
        <h1 className="text-base font-semibold text-slate-100">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>

      {/* Right: Indicators */}
      <div className="flex items-center gap-4">
        {/* Data source indicator */}
        <DataSourceBadge dataSource={dataSource} />

        {/* UTC Clock */}
        <div className="font-mono text-xs text-slate-400 bg-[#0f1a2e] border border-[#1e2d4a] rounded px-3 py-1.5">
          {currentTime || '—'}
        </div>

        {/* Sign In button — only shown when not authenticated */}
        {!user && (
          <>
            <button
              onClick={() => setSignInOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-blue-400 border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/15 hover:border-blue-500/50 transition-colors"
            >
              <LogIn className="w-3 h-3" />
              Sign In
              <span className="text-[10px] text-slate-500 font-normal">(Optional)</span>
            </button>
            {signInOpen && <SignInModal onClose={() => setSignInOpen(false)} />}
          </>
        )}

        {/* Notification bell + panel */}
        <NotificationBell
          unreadCount={unreadCount}
          open={notifOpen}
          onClick={toggleNotif}
          buttonRef={bellRef}
        />
        <NotificationPanel
          open={notifOpen}
          onClose={closeNotif}
          anchorRef={bellRef}
          onCountResolved={setUnreadCount}
        />

        {/* Operator trigger + menu */}
        <OperatorTrigger
          open={operatorOpen}
          onClick={toggleOperator}
          buttonRef={operatorRef}
          user={user}
        />
        <OperatorMenu
          open={operatorOpen}
          onClose={closeOperator}
          user={user}
        />
      </div>
    </header>
  );
}
