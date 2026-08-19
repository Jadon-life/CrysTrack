'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell, ChevronRight, Database, ExternalLink, MapPin, Monitor, Moon, Palette, Send, Shield, Sun, User, Zap,
} from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/layout/auth-provider';
import { useTheme } from '@/components/layout/theme-provider';
import { enablePushNotifications, getPushSetupStatus, type PushSetupStatus } from '@/lib/push';
import { weatherLabel } from '@/lib/environment';
import { cn } from '@/lib/utils';

const sections = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'location', label: 'Location & Weather', icon: MapPin },
  { id: 'privacy', label: 'Privacy & Data', icon: Shield },
];

const initialPrefs = {
  dnd_enabled: false,
  dnd_start_time: '22:00',
  dnd_end_time: '07:00',
  default_reminder_channels: ['push'] as string[],
  untimed_task_reminder_time: '10:00',
  incomplete_task_reminder_time: '19:00',
};

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { preference, setPreference, reducedMotion, setReducedMotion, environment, environmentLoading, locationPermission, requestLocation } = useTheme();
  const [active, setActive] = useState('profile');
  const [prefs, setPrefs] = useState(initialPrefs);
  const [profile, setProfile] = useState<any>(null);
  const [status, setStatus] = useState('');
  const [pushSetup, setPushSetup] = useState<PushSetupStatus>('permission-required');
  const [telegram, setTelegram] = useState<any>({ connected: false, connection: null });
  const [telegramLinking, setTelegramLinking] = useState(false);

  const load = async () => {
    const [prefsResponse, profileResponse, telegramResponse] = await Promise.all([
      fetch('/api/preferences', { cache: 'no-store' }),
      fetch('/api/profile', { cache: 'no-store' }),
      fetch('/api/telegram/status', { cache: 'no-store' }),
    ]);
    if (prefsResponse.ok) setPrefs({ ...initialPrefs, ...(await prefsResponse.json()) });
    if (profileResponse.ok) setProfile(await profileResponse.json());
    if (telegramResponse.ok) setTelegram(await telegramResponse.json());
  };

  useEffect(() => {
    void load();
    void getPushSetupStatus().then((result) => setPushSetup(result.status));
  }, []);

  useEffect(() => {
    if (!telegramLinking) return;
    const interval = window.setInterval(async () => {
      const response = await fetch('/api/telegram/status', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      setTelegram(data);
      if (data.connected) setTelegramLinking(false);
    }, 4000);
    return () => window.clearInterval(interval);
  }, [telegramLinking]);

  const savePrefs = async () => {
    setStatus('Saving…');
    const response = await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dndEnabled: prefs.dnd_enabled,
        dndStart: prefs.dnd_start_time,
        dndEnd: prefs.dnd_end_time,
        defaultReminderChannels: prefs.default_reminder_channels,
        untimedTaskReminderTime: prefs.untimed_task_reminder_time,
        incompleteTaskReminderTime: prefs.incomplete_task_reminder_time,
      }),
    });
    setStatus(response.ok ? 'Saved' : 'Could not save settings');
    window.setTimeout(() => setStatus(''), 2200);
  };

  const saveProfile = async () => {
    if (!profile) return;

    const displayName = String(profile.display_name || '').trim();

    if (!displayName) {
      setStatus('Display name cannot be empty');
      window.setTimeout(() => setStatus(''), 2600);
      return;
    }

    setStatus('Savingâ€¦');

    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName,
        timezone: profile.timezone,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus(data?.error || 'Could not save profile');
      window.setTimeout(() => setStatus(''), 3200);
      return;
    }

    setProfile(data);
    await refreshUser();
    setStatus('Profile saved');
    window.setTimeout(() => setStatus(''), 2200);
  };

  const enablePush = async () => {
    const result = await enablePushNotifications();
    setPushSetup(result.status);
    setStatus(result.ok ? 'Web Push enabled' : result.error || 'Unable to enable Web Push');
    window.setTimeout(() => setStatus(''), 3000);
  };

  const pushCopy: Record<PushSetupStatus, string> = {
    unsupported: 'Push notifications are not supported on this browser.',
    'permission-required': 'Not enabled on this browser yet.',
    'permission-denied': 'Notifications are blocked in your browser settings.',
    'subscription-missing': 'Permission granted — finish push setup.',
    'subscription-unsynced': 'Browser subscription exists — CrysTrack needs to resync it.',
    subscribed: 'Active on this browser.',
  };

  const connectTelegram = async () => {
    const response = await fetch('/api/telegram/connect', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) { setStatus(data.error || 'Telegram is not configured'); return; }
    window.open(data.url, '_blank', 'noopener,noreferrer');
    setTelegramLinking(true);
    setStatus('Complete the connection in Telegram. CrysTrack is waiting for confirmation…');
  };

  const disconnectTelegram = async () => {
    await fetch('/api/telegram/status', { method: 'DELETE' });
    setTelegram({ connected: false, connection: null });
  };

  const defaultChannel = useMemo(() => {
    const channels = prefs.default_reminder_channels || ['push'];
    return channels.includes('push') && channels.includes('telegram') ? 'both' : channels.includes('telegram') ? 'telegram' : 'push';
  }, [prefs.default_reminder_channels]);

  const setDefaultChannel = (value: string) => setPrefs((current: any) => ({ ...current, default_reminder_channels: value === 'both' ? ['push', 'telegram'] : [value] }));

  return (
    <div className="space-y-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-primary)]">CrysTrack</p><h1 className="text-2xl font-bold text-white mt-1">Settings</h1><p className="text-sm text-[var(--theme-text-muted)] mt-1">Preferences now persist and drive the real adaptive experience.</p></div>
      {status && <div className="rounded-xl border border-[var(--theme-border)] bg-black/20 px-4 py-3 text-sm text-white">{status}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <GlassCard padding="sm" className="lg:col-span-1 h-fit">
          <div className="space-y-1">{sections.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setActive(id)} className={cn('w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all', active === id ? 'bg-white/10 text-white' : 'text-[var(--theme-text-muted)] hover:text-white hover:bg-white/5')}><Icon className="w-4 h-4" /><span className="flex-1 text-left">{label}</span><ChevronRight className="w-4 h-4 opacity-50" /></button>)}</div>
        </GlassCard>

        <div className="lg:col-span-3">
          {active === 'profile' && <GlassCard padding="lg"><h2 className="text-lg font-semibold text-white mb-5">Profile</h2><div className="space-y-4"><div><label className="block text-xs text-[var(--theme-text-muted)] mb-1.5">Display name</label><input value={profile?.display_name || ''} onChange={(e) => setProfile((current: any) => ({ ...(current || {}), display_name: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" /></div><div><label className="block text-xs text-[var(--theme-text-muted)] mb-1.5">Email</label><input value={user?.email || ''} disabled className="w-full bg-white/[0.025] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-500" /></div><div><label className="block text-xs text-[var(--theme-text-muted)] mb-1.5">Home timezone</label><input value={profile?.timezone || ''} onChange={(e) => setProfile((current: any) => ({ ...(current || {}), timezone: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" /></div><Button variant="primary" onClick={() => void saveProfile()}>Save profile</Button></div></GlassCard>}

          {active === 'reminders' && <div className="space-y-4">
            <GlassCard padding="lg"><h2 className="text-lg font-semibold text-white">Notification channels</h2><p className="text-xs text-[var(--theme-text-muted)] mt-1 mb-5">Each reminder can use Web Push, Telegram or both.</p><div className="grid sm:grid-cols-2 gap-3"><div className="rounded-xl border border-white/10 bg-black/10 p-4"><div className="flex items-center gap-2"><Zap className="w-4 h-4 text-[var(--theme-primary)]" /><p className="text-sm font-semibold text-white">Web Push</p></div><p className="text-xs text-[var(--theme-text-muted)] mt-2">{pushCopy[pushSetup]}</p>{pushSetup !== 'subscribed' && <button onClick={() => void enablePush()} className="text-xs font-semibold text-[var(--theme-primary)] mt-3">{pushSetup === 'permission-required' ? 'Enable reminders' : 'Retry setup'}</button>}</div><div className="rounded-xl border border-white/10 bg-black/10 p-4"><div className="flex items-center gap-2"><Send className="w-4 h-4 text-sky-300" /><p className="text-sm font-semibold text-white">Telegram</p></div><p className="text-xs text-[var(--theme-text-muted)] mt-2">{telegram.connected ? `Connected${telegram.connection?.username ? ` as @${telegram.connection.username}` : ''}.` : telegramLinking ? 'Waiting for Telegram confirmation…' : 'Optional external reminder channel.'}</p>{telegram.connected ? <button onClick={() => void disconnectTelegram()} className="text-xs text-red-300 mt-3">Disconnect</button> : <button onClick={() => void connectTelegram()} className="inline-flex items-center gap-1 text-xs font-semibold text-sky-300 mt-3">Connect Telegram <ExternalLink className="w-3 h-3" /></button>}</div></div></GlassCard>
            <GlassCard padding="lg"><h2 className="text-lg font-semibold text-white mb-5">Reminder defaults</h2><div className="space-y-5"><div><label className="block text-xs text-[var(--theme-text-muted)] mb-1.5">Default channel</label><select value={defaultChannel} onChange={(e) => setDefaultChannel(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white"><option value="push" className="bg-slate-950">Web Push</option><option value="telegram" className="bg-slate-950">Telegram</option><option value="both" className="bg-slate-950">Both</option></select></div><div className="grid sm:grid-cols-2 gap-4"><div><label className="block text-xs text-[var(--theme-text-muted)] mb-1.5">Untimed task reminder</label><input type="time" value={prefs.untimed_task_reminder_time} onChange={(e) => setPrefs((current: any) => ({ ...current, untimed_task_reminder_time: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white" /></div><div><label className="block text-xs text-[var(--theme-text-muted)] mb-1.5">Incomplete task reminder</label><input type="time" value={prefs.incomplete_task_reminder_time} onChange={(e) => setPrefs((current: any) => ({ ...current, incomplete_task_reminder_time: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white" /></div></div><div className="border-t border-white/10 pt-4"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-white">Do Not Disturb</p><p className="text-xs text-[var(--theme-text-muted)]">Urgent assignments may bypass DND; ordinary alerts wait.</p></div><button type="button" onClick={() => setPrefs((current: any) => ({ ...current, dnd_enabled: !current.dnd_enabled }))} className={cn('w-11 h-6 rounded-full relative transition-colors', prefs.dnd_enabled ? 'bg-[var(--theme-primary)]' : 'bg-white/10')}><span className={cn('absolute top-1 w-4 h-4 rounded-full bg-white transition-all', prefs.dnd_enabled ? 'left-6' : 'left-1')} /></button></div>{prefs.dnd_enabled && <div className="grid grid-cols-2 gap-3 mt-3"><input type="time" value={prefs.dnd_start_time} onChange={(e) => setPrefs((current: any) => ({ ...current, dnd_start_time: e.target.value }))} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" /><input type="time" value={prefs.dnd_end_time} onChange={(e) => setPrefs((current: any) => ({ ...current, dnd_end_time: e.target.value }))} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" /></div>}</div><Button variant="primary" onClick={() => void savePrefs()}>Save reminder settings</Button></div></GlassCard>
          </div>}

          {active === 'appearance' && <GlassCard padding="lg"><h2 className="text-lg font-semibold text-white mb-5">Appearance</h2><div className="grid grid-cols-3 gap-3">{[{ id: 'adaptive', label: 'Adaptive', icon: Monitor }, { id: 'light', label: 'Light', icon: Sun }, { id: 'dark', label: 'Dark', icon: Moon }].map(({ id, label, icon: Icon }) => <button key={id} onClick={() => void setPreference(id as any)} className={cn('rounded-xl border p-4 flex flex-col items-center gap-2', preference === id ? 'border-[var(--theme-primary)] bg-white/10 text-white' : 'border-white/10 text-[var(--theme-text-muted)]')}><Icon className="w-5 h-5" /><span className="text-xs font-medium">{label}</span></button>)}</div><div className="flex items-center justify-between mt-6 pt-5 border-t border-white/10"><div><p className="text-sm font-medium text-white">Reduced motion</p><p className="text-xs text-[var(--theme-text-muted)]">Reduce environmental and interface motion.</p></div><button type="button" onClick={() => setReducedMotion(!reducedMotion)} className={cn('w-11 h-6 rounded-full relative transition-colors', reducedMotion ? 'bg-[var(--theme-primary)]' : 'bg-white/10')}><span className={cn('absolute top-1 w-4 h-4 rounded-full bg-white transition-all', reducedMotion ? 'left-6' : 'left-1')} /></button></div></GlassCard>}

          {active === 'location' && <GlassCard padding="lg"><h2 className="text-lg font-semibold text-white">Location & weather</h2><p className="text-xs text-[var(--theme-text-muted)] mt-1 mb-5">CrysTrack uses the current device location to adapt local time, sunrise/sunset, weather and routine reminders. Precise coordinates are not stored in your CrysTrack database; the browser sends them directly to the weather/location services and CrysTrack saves only the current city/timezone for reminders.</p><div className="rounded-xl border border-white/10 bg-black/10 p-4"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-white">{environment.city || 'Approximate location'}{environment.countryCode ? `, ${environment.countryCode}` : ''}</p><p className="text-xs text-[var(--theme-text-muted)] mt-1">{environment.timezone} · {environment.temperatureC == null ? '--' : `${Math.round(environment.temperatureC)}°C`} · {weatherLabel(environment.weather)}</p><p className="text-[11px] text-[var(--theme-text-muted)] mt-1">Permission: {locationPermission} · Source: {environment.locationSource}</p></div><Button variant="default" onClick={() => void requestLocation({ prompt: true })}>{environmentLoading ? 'Updating…' : 'Use current location'}</Button></div></div><p className="text-[11px] text-slate-500 mt-4">When you travel, CrysTrack can update after you open the site and location access succeeds. A website cannot continue tracking your physical location after it is closed.</p></GlassCard>}

          {active === 'privacy' && <GlassCard padding="lg"><h2 className="text-lg font-semibold text-white mb-4">Privacy & data</h2><div className="space-y-3"><div className="rounded-xl border border-white/10 bg-black/10 p-4"><div className="flex gap-2"><Shield className="w-4 h-4 text-emerald-300" /><div><p className="text-sm font-medium text-white">Private-first location</p><p className="text-xs text-[var(--theme-text-muted)] mt-1">CrysTrack does not persist precise GPS coordinates in your database. Location requests are sent directly from your browser to the configured weather/geocoding services.</p></div></div></div><Button variant="outline" className="w-full justify-start"><Database className="w-4 h-4 mr-2" /> Export data</Button></div></GlassCard>}
        </div>
      </div>
    </div>
  );
}
