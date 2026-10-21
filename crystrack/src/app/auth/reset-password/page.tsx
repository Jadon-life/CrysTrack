'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GlassCard } from '@/components/shared/glass-card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { isRestrictedPreview } from '@/lib/preview/mode';

export default function ResetPasswordPage() {
  // Preview is synthetic and read-only; never create a real Auth client here.
  if (isRestrictedPreview()) {
    return <GlassCard padding="lg"><h1 className="text-2xl font-bold">Demo only</h1>
      <p className="mt-3 text-sm">Account recovery is unavailable in the read-only CrysTrack demo.</p>
      <Link className="mt-4 inline-flex text-sm underline" href="/">Back to the demo</Link>
    </GlassCard>;
  }
  return <LiveResetPasswordPage />;
}

function LiveResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data: { user }, error: authError }) => {
      if (active) setStatus(!authError && user ? 'ready' : 'unavailable');
    }).catch(() => { if (active) setStatus('unavailable'); });
    return () => { active = false; };
  }, [supabase]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (working || status !== 'ready') return;
    setError('');
    setMessage('');
    if (password.length < 8 || password.length > 128 || password !== confirm) {
      setError('Use a password of 8–128 characters and confirm it exactly.');
      return;
    }
    setWorking(true);
    try {
      // Never trust the route parameter alone. Supabase verifies the recovered
      // cookie-backed owner session before allowing a password change.
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setStatus('unavailable');
        setError('This recovery session is no longer available. Request a new link.');
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError('Could not update your password. Please try again or request a new link.');
        return;
      }
      setPassword('');
      setConfirm('');
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setMessage('Password changed. Please sign out of this session before signing in again.');
        return;
      }
      router.replace('/auth');
      router.refresh();
    } catch {
      setError('Could not update your password. Check your connection and try again.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <GlassCard padding="lg" className="w-full">
      <h1 className="text-2xl font-bold text-white">Choose a new password</h1>
      {status === 'checking' ? (
        <p className="mt-4 text-sm text-white/80" role="status">Checking your recovery link…</p>
      ) : status === 'unavailable' ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-white/80" role="alert">This recovery link is invalid, expired, or the session is unavailable.</p>
          <Link href="/auth" className="inline-flex min-h-11 items-center text-sm text-[var(--theme-primary)] underline">Request another recovery link</Link>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-white/80">Choose a new password for your signed-in account.</p>
          {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
          {message && <p role="status" className="mt-3 text-sm text-emerald-300">{message}</p>}
          <form onSubmit={save} className="mt-6 space-y-4">
            <div>
              <label htmlFor="crys-new-password" className="mb-2 block text-sm text-white">New password</label>
              <input id="crys-new-password" type="password" autoComplete="new-password"
                value={password} onChange={event => setPassword(event.target.value)}
                minLength={8} maxLength={128} required
                className="w-full rounded-xl border border-white/20 bg-white/10 p-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300" />
            </div>
            <div>
              <label htmlFor="crys-confirm-password" className="mb-2 block text-sm text-white">Confirm new password</label>
              <input id="crys-confirm-password" type="password" autoComplete="new-password"
                value={confirm} onChange={event => setConfirm(event.target.value)}
                minLength={8} maxLength={128} required
                className="w-full rounded-xl border border-white/20 bg-white/10 p-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300" />
            </div>
            <Button type="submit" disabled={working} variant="primary" className="w-full">
              {working ? 'Updating password…' : 'Change password'}
            </Button>
          </form>
          <Link href="/auth" className="mt-5 inline-flex min-h-11 items-center text-sm text-[var(--theme-primary)] underline">Back to sign in</Link>
        </>
      )}
    </GlassCard>
  );
}
