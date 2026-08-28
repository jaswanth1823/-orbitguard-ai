'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Shield, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Contains a number', met: /\d/.test(password) },
    { label: 'Contains uppercase', met: /[A-Z]/.test(password) },
  ];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1">
      {checks.map(({ label, met }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className={`w-1 h-1 rounded-full flex-shrink-0 ${met ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          <span className={`text-[11px] ${met ? 'text-emerald-400' : 'text-slate-600'}`}>{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Client-side validation — mirrors the PasswordStrength checks
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!/\d/.test(password)) {
      setError('Password must contain at least one number.');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError('Password must contain at least one uppercase letter.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (
        msg.includes('already registered') ||
        msg.includes('already been registered') ||
        msg.includes('user already') ||
        msg.includes('email address is already')
      ) {
        setError('An account with this email already exists. Please sign in instead.');
      } else if (msg.includes('password') && (msg.includes('weak') || msg.includes('short') || msg.includes('length'))) {
        setError('Password does not meet Supabase requirements. Try a longer, more complex password.');
      } else if (msg.includes('invalid email') || msg.includes('valid email') || msg.includes('email format')) {
        setError('Please enter a valid email address.');
      } else if (msg.includes('anon key') || msg.includes('apikey') || msg.includes('api key') || msg.includes('not configured') || msg.includes('supabase')) {
        setError('Authentication service is not configured. Contact your administrator.');
      } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
        setError('Network error. Please check your connection and try again.');
      } else {
        // Always show the real Supabase error so it can be diagnosed
        setError(authError.message);
      }
      setLoading(false);
      return;
    }

    // signUp succeeded — check if email confirmation is required.
    // When confirmation is enabled, data.session is null and data.user.confirmed_at is absent.
    if (data.user && !data.session) {
      // Email confirmation required — show the check-your-email screen
      setSuccess(true);
    } else if (data.session) {
      // Email confirmation disabled — user is immediately signed in
      setSuccess(true);
    } else {
      // Unexpected: no user and no error (e.g. duplicate signup when confirm is off)
      setError('Account may already exist. Try signing in or use "Forgot password".');
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#080d1a] flex items-center justify-center px-4">
        <div
          className="fixed inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        <div className="relative z-10 w-full max-w-md">
          <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-7 h-7 text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-100 mb-2">Check your email</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              A confirmation link has been sent to{' '}
              <span className="text-slate-200 font-medium">{email}</span>. Click the link to activate
              your OrbitGuard AI account.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
            >
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080d1a] flex items-center justify-center px-4 py-8">
      {/* Background grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mb-4">
            <Shield className="w-7 h-7 text-blue-400" />
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-100 tracking-tight">OrbitGuard AI</div>
            <div className="text-sm text-blue-400 font-medium tracking-widest mt-0.5 uppercase">
              Mission Control Platform
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#0f1a2e] border border-[#1e2d4a] rounded-xl p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-100">Create your account</h2>
            <p className="text-sm text-slate-400 mt-1">Join OrbitGuard AI Mission Control</p>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-xs font-medium text-slate-400 mb-1.5">
                Full name
              </label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Mission Controller"
                className="w-full bg-[#080d1a] border border-[#1e2d4a] text-slate-200 rounded-lg px-3.5 py-2.5 text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-400 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@orbitguard.ai"
                className="w-full bg-[#080d1a] border border-[#1e2d4a] text-slate-200 rounded-lg px-3.5 py-2.5 text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#080d1a] border border-[#1e2d4a] text-slate-200 rounded-lg px-3.5 py-2.5 pr-10 text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-xs font-medium text-slate-400 mb-1.5">
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`w-full bg-[#080d1a] border text-slate-200 rounded-lg px-3.5 py-2.5 pr-10 text-sm placeholder-slate-600 focus:outline-none focus:ring-1 transition ${
                    confirmPassword && confirmPassword !== password
                      ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20'
                      : 'border-[#1e2d4a] focus:border-blue-500/50 focus:ring-blue-500/20'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && confirmPassword !== password && (
                <p className="mt-1 text-[11px] text-red-400">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors mt-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">
              Sign in
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-600">
          OrbitGuard AI — Mission Control Platform &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
