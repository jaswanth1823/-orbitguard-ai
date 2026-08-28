'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      // Map Supabase errors to user-friendly messages
      const msg = authError.message.toLowerCase();
      if (msg.includes('invalid login') || msg.includes('invalid credentials') || msg.includes('email not confirmed')) {
        setError('Invalid email or password. Please try again.');
      } else if (msg.includes('too many requests') || msg.includes('rate limit')) {
        setError('Too many attempts. Please wait a moment and try again.');
      } else if (msg.includes('network') || msg.includes('fetch')) {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError('Sign in failed. Please try again.');
      }
      setLoading(false);
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-[#080d1a] flex items-center justify-center px-4">
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
            <h2 className="text-lg font-semibold text-slate-100">Sign in to your account</h2>
            <p className="text-sm text-slate-400 mt-1">Access your mission monitoring dashboard</p>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-xs font-medium text-slate-400">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
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
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors mt-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">
              Create account
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[11px] text-slate-600">
          OrbitGuard AI — Mission Control Platform &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
