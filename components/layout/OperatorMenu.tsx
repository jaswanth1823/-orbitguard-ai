'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  ChevronDown,
  LogOut,
  LogIn,
  X,
  MonitorCheck,
  UserCircle,
  SlidersHorizontal,
  Radio,
  Loader2,
  Eye,
  EyeOff,
  UserX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClickOutside, useFocusTrap } from '@/lib/hooks';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

type ModalType = 'account' | 'status' | 'signout' | 'signin' | null;

// ── Small modals rendered inline ─────────────────────────────────────────────

function AccountModal({ onClose, user }: { onClose: () => void; user: SupabaseUser | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose, true);
  useFocusTrap(ref, true);

  // Guest mode view
  if (!user) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label="Account"
          className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl w-[360px] shadow-2xl shadow-black/60"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d4a]">
            <span className="text-sm font-semibold text-slate-200">Account</span>
            <button onClick={onClose} aria-label="Close" className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-[#1e2d4a] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-slate-700/30 border border-slate-600/30 flex items-center justify-center flex-shrink-0">
                <UserX className="w-7 h-7 text-slate-400" />
              </div>
              <div>
                <div className="text-base font-semibold text-slate-100">Guest Operator</div>
                <div className="text-xs text-slate-400 font-medium">Unauthenticated Session</div>
                <div className="text-xs text-slate-500 mt-0.5">No account linked</div>
              </div>
            </div>
            <div className="bg-[#080d1a] border border-[#1e2d4a] rounded-lg p-3">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                You are browsing as a <span className="text-slate-200 font-medium">Guest Operator</span>. All features are fully available. Sign in to save mission profiles, telemetry logs, and chat history permanently.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Role', value: 'Guest Operator' },
                { label: 'Access', value: 'Full — Read/Write' },
                { label: 'Storage', value: 'Session Only' },
                { label: 'Session', value: 'GUEST · LOCAL' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#080d1a] border border-[#1e2d4a] rounded-lg p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
                  <div className="text-xs font-medium text-slate-300">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayName = user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Mission Operator';
  const displayEmail = user.email ?? '';

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl w-[360px] shadow-2xl shadow-black/60"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d4a]">
          <span className="text-sm font-semibold text-slate-200">Account</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-[#1e2d4a] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
              <User className="w-7 h-7 text-blue-400" />
            </div>
            <div>
              <div className="text-base font-semibold text-slate-100">{displayName}</div>
              <div className="text-xs text-blue-400 font-medium">Mission Control Operator</div>
              <div className="text-xs text-slate-500 mt-0.5">{displayEmail}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            {[
              { label: 'Role', value: 'Flight Controller' },
              { label: 'Shift', value: 'Alpha — Day' },
              { label: 'Clearance', value: 'Level 3' },
              { label: 'Session', value: 'AUTHENTICATED · SUPABASE' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[#080d1a] border border-[#1e2d4a] rounded-lg p-3">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
                <div className="text-xs font-medium text-slate-200">{value}</div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}

function SystemStatusModal({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose, true);
  useFocusTrap(ref, true);

  const items = [
    { label: 'AI Engine', value: 'Demo Mode', color: 'text-amber-400', dot: 'bg-amber-400' },
    { label: 'Telemetry', value: 'Simulation Active', color: 'text-blue-400', dot: 'bg-blue-400' },
    { label: 'Anomaly Detection', value: 'Operational', color: 'text-emerald-400', dot: 'bg-emerald-400' },
    { label: 'API Routes', value: '7 / 7 online', color: 'text-emerald-400', dot: 'bg-emerald-400' },
    { label: 'Database', value: 'Not configured', color: 'text-slate-500', dot: 'bg-slate-600' },
    { label: 'Vector Search', value: 'Keyword fallback', color: 'text-blue-400', dot: 'bg-blue-400' },
  ];

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="System Status"
        className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl w-[380px] shadow-2xl shadow-black/60"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d4a]">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-slate-200">System Status</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-[#1e2d4a] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-2">
          {items.map(({ label, value, color, dot }) => (
            <div
              key={label}
              className="flex items-center justify-between py-2 border-b border-[#1e2d4a] last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', dot)} />
                <span className="text-xs text-slate-400">{label}</span>
              </div>
              <span className={cn('text-xs font-medium', color)}>{value}</span>
            </div>
          ))}
        </div>
        <div className="px-5 pb-4">
          <p className="text-[11px] text-slate-500">
            Configure credentials in{' '}
            <a href="/settings" onClick={onClose} className="text-blue-400 hover:text-blue-300">
              Settings
            </a>{' '}
            to enable IBM Granite and live database.
          </p>
        </div>
      </div>
    </div>
  );
}

function SignOutModal({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useClickOutside(ref, onClose, true);
  useFocusTrap(ref, true);

  async function handleSignOut() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      // Stay on dashboard in guest mode — no redirect to /login
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign out failed. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Sign out"
        className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl w-[340px] shadow-2xl shadow-black/60"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center flex-shrink-0">
              <LogOut className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-200">Sign out</div>
              <div className="text-xs text-slate-500 mt-0.5">Continue as Guest Operator</div>
            </div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            You will be signed out of OrbitGuard AI and returned to Guest Operator mode. All features remain available without an account.
          </p>
          {error && (
            <p className="text-xs text-red-400 leading-relaxed">{error}</p>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs text-slate-300 bg-[#0a1120] border border-[#1e2d4a] hover:bg-[#111d35] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSignOut}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-red-300 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sign In Modal (inline, no page redirect) ──────────────────────────────────

export function SignInModal({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');

  // Sign in state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sign up extras
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useClickOutside(ref, onClose, true);
  useFocusTrap(ref, true);

  function resetForm() {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFullName('');
    setError(null);
    setSuccessMsg(null);
    setShowPassword(false);
  }

  function switchTab(t: 'signin' | 'signup') {
    setTab(t);
    resetForm();
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
        setError('Invalid email or password.');
      } else if (msg.includes('rate limit') || msg.includes('too many')) {
        setError('Too many attempts. Please wait a moment.');
      } else {
        setError('Sign in failed. Please try again.');
      }
      setLoading(false);
    } else {
      router.refresh();
      onClose();
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        setError('An account with this email already exists.');
      } else {
        setError(authError.message);
      }
      setLoading(false);
    } else if (data.user && !data.session) {
      setSuccessMsg(`Confirmation sent to ${email}. Check your inbox.`);
      setLoading(false);
    } else {
      router.refresh();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
        className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl w-[380px] shadow-2xl shadow-black/60"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d4a]">
          <div className="flex items-center gap-2">
            <LogIn className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-slate-200">Sign In — Optional</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-[#1e2d4a] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info banner */}
        <div className="mx-5 mt-4 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            <span className="text-blue-400 font-medium">Authentication is optional.</span> Sign in to save mission profiles and telemetry logs permanently. You can close this and keep using OrbitGuard as a Guest Operator.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex mx-5 mt-4 bg-[#080d1a] border border-[#1e2d4a] rounded-lg overflow-hidden">
          {(['signin', 'signup'] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={cn(
                'flex-1 py-2 text-xs font-medium transition-colors',
                tab === t
                  ? 'bg-blue-600/20 text-blue-400 border-b-2 border-blue-500'
                  : 'text-slate-500 hover:text-slate-300',
              )}
            >
              {t === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        <div className="p-5 pt-4 space-y-3">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">{error}</div>
          )}
          {successMsg && (
            <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400">{successMsg}</div>
          )}

          {tab === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Email</label>
                <input
                  type="email" required autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@orbitguard.ai"
                  className="w-full bg-[#080d1a] border border-[#1e2d4a] text-slate-200 rounded-lg px-3 py-2 text-xs placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'} required autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#080d1a] border border-[#1e2d4a] text-slate-200 rounded-lg px-3 py-2 pr-9 text-xs placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition"
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2 text-xs transition-colors">
                {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Full Name</label>
                <input
                  type="text" autoComplete="name"
                  value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="Mission Controller"
                  className="w-full bg-[#080d1a] border border-[#1e2d4a] text-slate-200 rounded-lg px-3 py-2 text-xs placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Email</label>
                <input
                  type="email" required autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@orbitguard.ai"
                  className="w-full bg-[#080d1a] border border-[#1e2d4a] text-slate-200 rounded-lg px-3 py-2 text-xs placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'} required autoComplete="new-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full bg-[#080d1a] border border-[#1e2d4a] text-slate-200 rounded-lg px-3 py-2 pr-9 text-xs placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition"
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Confirm Password</label>
                <input
                  type="password" required autoComplete="new-password"
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#080d1a] border border-[#1e2d4a] text-slate-200 rounded-lg px-3 py-2 text-xs placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition"
                />
              </div>
              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2 text-xs transition-colors">
                {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                {loading ? 'Creating account…' : 'Create Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Dropdown menu ─────────────────────────────────────────────────────────────

interface OperatorMenuProps {
  open: boolean;
  onClose: () => void;
  user: SupabaseUser | null;
}

export function OperatorMenu({ open, onClose, user }: OperatorMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [modal, setModal] = useState<ModalType>(null);

  useClickOutside(menuRef, onClose, open);
  useFocusTrap(menuRef, open);

  function openModal(type: ModalType) {
    onClose();
    setModal(type);
  }

  function closeModal() {
    setModal(null);
  }

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Guest Operator';
  const displaySub = user ? 'Mission Control' : 'Guest Mode — All Access';

  const menuItems = [
    {
      icon: UserCircle,
      label: 'Account',
      sublabel: user ? 'Profile & credentials' : 'Guest session info',
      action: () => openModal('account'),
    },
    {
      icon: SlidersHorizontal,
      label: 'Preferences',
      sublabel: 'Navigate to settings',
      action: () => { onClose(); router.push('/settings'); },
    },
    {
      icon: MonitorCheck,
      label: 'System Status',
      sublabel: 'AI & data pipeline health',
      action: () => openModal('status'),
    },
  ];

  return (
    <>
      {/* Modals — rendered outside the dropdown */}
      {modal === 'account' && <AccountModal onClose={closeModal} user={user} />}
      {modal === 'status' && <SystemStatusModal onClose={closeModal} />}
      {modal === 'signout' && <SignOutModal onClose={closeModal} />}
      {modal === 'signin' && <SignInModal onClose={closeModal} />}

      {/* Dropdown */}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Operator menu"
          className="fixed z-[200] top-14 right-4 w-[240px]"
        >
          {/* Arrow */}
          <div className="absolute -top-1.5 right-[14px] w-3 h-3 bg-[#0f1a2e] border-l border-t border-[#1e2d4a] rotate-45" />

          <div className="relative bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
            {/* Identity header */}
            <div className="px-4 py-3 border-b border-[#1e2d4a] flex items-center gap-3">
              <div className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                user
                  ? 'bg-blue-600/20 border border-blue-500/30'
                  : 'bg-slate-700/30 border border-slate-600/30'
              )}>
                {user
                  ? <User className="w-4 h-4 text-blue-400" />
                  : <UserX className="w-4 h-4 text-slate-400" />
                }
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-100 truncate">{displayName}</div>
                <div className={cn('text-[10px] font-medium', user ? 'text-blue-400' : 'text-slate-500')}>
                  {displaySub}
                </div>
              </div>
            </div>

            {/* Menu items */}
            <div className="py-1.5">
              {menuItems.map(({ icon: Icon, label, sublabel, action }) => (
                <button
                  key={label}
                  role="menuitem"
                  onClick={action}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#111d35] transition-colors group focus-visible:outline-none focus-visible:bg-[#111d35]"
                >
                  <Icon className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors flex-shrink-0" />
                  <div>
                    <div className="text-xs font-medium text-slate-300 group-hover:text-slate-100 transition-colors leading-snug">
                      {label}
                    </div>
                    <div className="text-[10px] text-slate-600 leading-snug">{sublabel}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Divider + sign in/out */}
            <div className="border-t border-[#1e2d4a] py-1.5">
              {user ? (
                <button
                  role="menuitem"
                  onClick={() => openModal('signout')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-red-500/5 transition-colors group focus-visible:outline-none focus-visible:bg-red-500/5"
                >
                  <LogOut className="w-4 h-4 text-slate-600 group-hover:text-red-400 transition-colors flex-shrink-0" />
                  <span className="text-xs font-medium text-slate-400 group-hover:text-red-400 transition-colors">
                    Sign out
                  </span>
                </button>
              ) : (
                <button
                  role="menuitem"
                  onClick={() => openModal('signin')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-blue-500/5 transition-colors group focus-visible:outline-none focus-visible:bg-blue-500/5"
                >
                  <LogIn className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition-colors flex-shrink-0" />
                  <div>
                    <div className="text-xs font-medium text-slate-400 group-hover:text-blue-400 transition-colors leading-snug">
                      Sign In <span className="text-[10px] text-slate-600">(Optional)</span>
                    </div>
                    <div className="text-[10px] text-slate-600 leading-snug">Save profiles & logs</div>
                  </div>
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </>
  );
}

// ── Trigger button (exported for TopBar) ─────────────────────────────────────

interface OperatorTriggerProps {
  open: boolean;
  onClick: () => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
  user: SupabaseUser | null;
}

export function OperatorTrigger({ open, onClick, buttonRef, user }: OperatorTriggerProps) {
  const label = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Guest Operator';

  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="menu"
      aria-label="Operator menu"
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500',
        open
          ? 'text-slate-200 bg-[#1a2d4a]'
          : 'text-slate-400 hover:text-slate-200 hover:bg-[#111d35]',
      )}
    >
      <div className={cn(
        'w-6 h-6 rounded-full flex items-center justify-center',
        user
          ? 'bg-blue-600/30 border border-blue-500/30'
          : 'bg-slate-700/40 border border-slate-600/30'
      )}>
        {user
          ? <User className="w-3 h-3 text-blue-400" />
          : <UserX className="w-3 h-3 text-slate-400" />
        }
      </div>
      <span className={cn('text-xs', user ? 'text-slate-300' : 'text-slate-500')}>{label}</span>
      <ChevronDown
        className={cn('w-3 h-3 transition-transform duration-150', open && 'rotate-180')}
      />
    </button>
  );
}
