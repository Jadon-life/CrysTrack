'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isRestrictedPreview } from '@/lib/preview/mode';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { GlassCard } from '@/components/shared/glass-card';
import { Button } from '@/components/ui/button';
import { Diamond, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function AuthPage() {
  if (isRestrictedPreview()) return <GlassCard padding="lg"><h1 className="text-2xl font-bold">Explore CrysTrack</h1><p className="my-4 text-sm">Synthetic read-only demo. No sign-in, signup or personal data is connected.</p><Link className="text-blue-300 underline" href="/">Enter the demo</Link></GlassCard>;
  return <LiveAuthPage />;
}
function LiveAuthPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isSignUp, setIsSignUp] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const resetRedirect = () => {
    const target = new URL('/api/auth/callback', window.location.origin);
    target.searchParams.set('next', '/auth/reset-password');
    return target.toString();
  };

  const resendConfirmation = async () => {
    if (loading || !email.trim()) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: new URL('/api/auth/callback', window.location.origin).toString() },
      });
      setMessage('If a confirmation is pending, check your email for a new link.');
    } catch {
      setError('Could not request another confirmation right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (forgotPassword) {
        // A generic response avoids revealing whether this email is registered.
        await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: resetRedirect(),
        });
        setMessage('If this address has an account, check your email for recovery steps.');
      } else if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
        });
        if (error) throw error;
        setMessage('Check your email for a confirmation link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/');
        router.refresh();
      }
    } catch (err: any) {
      setError('Could not complete this request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="flex justify-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-xl shadow-blue-500/20">
          <Diamond className="w-8 h-8 text-white" />
        </div>
      </div>

      <GlassCard padding="lg" className="w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white">
            {forgotPassword ? 'Reset your password' : isSignUp ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {forgotPassword ? 'We will email a recovery link if the address is registered.' : isSignUp ? 'Start tracking your progress' : 'Sign in to continue'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                required
              />
            </div>
          </div>

          {!forgotPassword && <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-10 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          </div>}
          {!forgotPassword && !isSignUp && (
            <button type="button" onClick={() => { setForgotPassword(true); setError(''); setMessage(''); }}
              className="text-sm font-medium text-[var(--theme-primary)] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Forgot password?
            </button>
          )}
          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {loading ? 'Please wait...' : forgotPassword ? 'Send recovery link' : isSignUp ? 'Create Account' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          {isSignUp && !forgotPassword && email.trim() && (
            <button type="button" disabled={loading} onClick={() => void resendConfirmation()}
              className="mb-3 block w-full text-sm font-medium text-[var(--theme-primary)] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white">
              Resend confirmation email
            </button>
          )}
          <button type="button"
            onClick={() => { if (forgotPassword) setForgotPassword(false); else setIsSignUp(!isSignUp); setError(''); setMessage(''); }}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            {forgotPassword ? 'Back to sign in' : isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
