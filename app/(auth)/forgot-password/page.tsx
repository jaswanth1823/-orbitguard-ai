'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Shield, Loader2, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
    } else {
      setSent(true);
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
          {sent ? (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              </div>
              <h2 className="text-lg font-semibold text-slate-100 mb-2">Reset link sent</h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                If <span className="text-slate-200 font-medium">{email}</span> is registered, you&apos;ll
                receive a password reset link shortly.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-block text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
              >
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-slate-100">Reset your password</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Enter your email and we&apos;ll send a reset link.
                </p>
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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-slate-500">
                Remember your password?{' '}
                <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors font-medium">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-600">
          OrbitGuard AI — Mission Control Platform &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
