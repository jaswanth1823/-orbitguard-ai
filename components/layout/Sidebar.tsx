'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Satellite,
  AlertTriangle,
  Bot,
  Brain,
  Settings,
  Radio,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/satellites', label: 'Satellites', icon: Satellite },
  { href: '/anomalies', label: 'Anomalies', icon: AlertTriangle },
  { href: '/mission-copilot', label: 'Mission Copilot', icon: Bot },
  { href: '/mission-intelligence', label: 'Intelligence', icon: Brain },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface AIStatus {
  provider: 'watsonx' | 'demo';
  configured: boolean;
  fields: {
    api_key: string;
    project_id: string;
    model_id: string;
  };
}

export function Sidebar() {
  const pathname = usePathname();
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ai/health')
      .then((r) => r.json())
      .then((data: AIStatus) => {
        if (!cancelled) setAiStatus(data);
      })
      .catch(() => {
        // If health check fails, leave null → shows loading state
      });
    return () => { cancelled = true; };
  }, []);

  const isWatsonx = aiStatus?.provider === 'watsonx';
  const isLoading = aiStatus === null;

  return (
    <aside className="w-[220px] min-h-screen bg-[#0a1120] border-r border-[#1e2d4a] flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-[#1e2d4a]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <Shield className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-100 leading-none">OrbitGuard</div>
            <div className="text-[10px] text-blue-400 font-medium tracking-wider leading-none mt-0.5">AI</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">
          Operations
        </div>
        <ul className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    active
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#111d35]'
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* AI Status */}
      <div className="px-3 py-4 border-t border-[#1e2d4a]">
        <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">AI Engine</span>
          </div>

          {isLoading ? (
            <>
              <div className="text-xs text-slate-500 font-medium">Checking…</div>
              <div className="text-[10px] text-slate-600 mt-0.5">Loading AI status</div>
            </>
          ) : isWatsonx ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                <span className="text-xs text-emerald-400 font-medium">IBM Granite</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {aiStatus?.fields?.model_id ?? 'watsonx.ai connected'}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                <span className="text-xs text-amber-400 font-medium">Demo Mode</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Configure watsonx for live AI</div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
