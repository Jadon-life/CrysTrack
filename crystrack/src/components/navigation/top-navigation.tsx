'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  ChevronDown,
  Cloud,
  CloudRain,
  Diamond,
  LogOut,
  MapPin,
  Menu,
  Monitor,
  Moon,
  Settings,
  Sun,
  User,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/components/layout/auth-provider';
import { useTheme } from '@/components/layout/theme-provider';
import { weatherLabel } from '@/lib/environment';
import { cn } from '@/lib/utils';
import { navItems, navItemIsActive } from './nav-items';

function WeatherIcon({ weather }: { weather: string }) {
  if (weather === 'rain' || weather === 'storm') return <CloudRain className="w-4 h-4" />;
  if (weather === 'cloudy' || weather === 'fog' || weather === 'snow') return <Cloud className="w-4 h-4" />;
  return <Sun className="w-4 h-4" />;
}

function ThemeControl() {
  const { preference, setPreference } = useTheme();
  const items = [
    { value: 'adaptive' as const, icon: Monitor, label: 'Auto' },
    { value: 'light' as const, icon: Sun, label: 'Light' },
    { value: 'dark' as const, icon: Moon, label: 'Dark' },
  ];

  return (
    <div className="topnav-theme" aria-label="Theme mode">
      {items.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => void setPreference(value)}
          className={cn('topnav-theme__button', preference === value && 'is-active')}
          title={label}
          aria-label={`Use ${label.toLowerCase()} theme`}
          aria-pressed={preference === value}
        >
          <Icon className="w-4 h-4" />
          {value === 'adaptive' && <span className="hidden xl:inline">Auto</span>}
        </button>
      ))}
    </div>
  );
}

interface ReminderPreview {
  id: string;
  entity_type: string;
  scheduled_for: string;
  status: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ReminderPreview[]>([]);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const containerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const response = await fetch('/api/reminders?limit=8', { cache: 'no-store' });
      if (response.ok) setItems(await response.json());
    } catch {
      // Notification centre can remain empty if the reminder API is unavailable.
    }
  };

  useEffect(() => {
    setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, []);

  const enablePush = async () => {
    const pushModule = await import('@/lib/push');
    const result = await pushModule.enablePushNotifications();
    setPermission(result.permission);
    if (result.ok) void load();
  };

  const unread = items.filter((item) => item.status === 'pending').length;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="topnav-icon-button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && <span className="topnav-badge">{Math.min(unread, 9)}</span>}
      </button>

      {open && (
        <div className="topnav-popover topnav-popover--notifications">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
            <div>
              <p className="text-sm font-semibold text-white">Reminders</p>
              <p className="text-[11px] text-[var(--theme-text-muted)]">Upcoming and recent alerts</p>
            </div>
            <Link href="/settings" className="text-xs text-[var(--theme-primary)] hover:opacity-80">Settings</Link>
          </div>

          {permission !== 'granted' && permission !== 'unsupported' && (
            <div className="m-3 rounded-xl border border-[var(--theme-border)] bg-black/20 p-3">
              <div className="flex gap-2">
                <Zap className="w-4 h-4 text-[var(--theme-primary)] mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">Never miss what matters</p>
                  <p className="text-[11px] leading-relaxed text-[var(--theme-text-muted)] mt-1">Enable browser reminders for tasks, assignments and goal check-ins.</p>
                  <button type="button" onClick={enablePush} className="mt-2 text-xs font-semibold text-[var(--theme-primary)]">Enable reminders</button>
                </div>
              </div>
            </div>
          )}

          <div className="max-h-80 overflow-y-auto p-2">
            {items.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <p className="text-xs text-[var(--theme-text-muted)]">No upcoming reminders.</p>
              </div>
            ) : items.map((item) => (
              <div key={item.id} className="rounded-xl px-3 py-2.5 hover:bg-white/[0.05] transition-colors">
                <div className="flex items-start gap-2.5">
                  <Bell className="w-3.5 h-3.5 text-[var(--theme-primary)] mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white truncate">{item.title || item.entity_type.replace('_', ' ')}</p>
                    <p className="text-[11px] text-[var(--theme-text-muted)] mt-0.5">{new Date(item.scheduled_for).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadAvatar = React.useCallback(async () => {
    try {
      const response = await fetch('/api/profile', { cache: 'no-store' });
      if (!response.ok) return;
      const profile = await response.json();
      setAvatarUrl(profile?.avatar_signed_url || null);
    } catch (error) {
      console.error('Could not load profile avatar:', error);
    }
  }, []);

  useEffect(() => {
    void loadAvatar();

    const onProfileUpdated = () => {
      void loadAvatar();
    };

    window.addEventListener('crystrack-profile-updated', onProfileUpdated);
    return () => {
      window.removeEventListener('crystrack-profile-updated', onProfileUpdated);
    };
  }, [loadAvatar]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, []);

  const displayName = useMemo(() => {
    const metadataName = user?.user_metadata?.full_name || user?.user_metadata?.name;
    if (metadataName) return String(metadataName);
    return user?.email?.split('@')[0] || 'CrysTrack';
  }, [user]);

  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="topnav-profile"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="topnav-avatar overflow-hidden">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              aria-hidden="true"
            />
          ) : (
            initial
          )}
        </span>

        <span className="hidden xl:block min-w-0 text-left">
          <span className="block text-xs font-semibold text-white truncate max-w-28">
            {displayName}
          </span>
          <span className="block text-[10px] text-[var(--theme-text-muted)]">
            Personal
          </span>
        </span>

        <ChevronDown className="w-3.5 h-3.5 text-[var(--theme-text-muted)]" />
      </button>

      {open && (
        <div className="topnav-popover right-0 w-56 p-2">
          <div className="px-3 py-2 border-b border-white/10 mb-1">
            <p className="text-xs font-semibold text-white truncate">{displayName}</p>
            <p className="text-[11px] text-[var(--theme-text-muted)] truncate mt-0.5">
              {user?.email}
            </p>
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="topnav-menu-item"
          >
            <User className="w-4 h-4" /> Profile & preferences
          </Link>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="topnav-menu-item"
          >
            <Settings className="w-4 h-4" /> Settings
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="topnav-menu-item w-full text-left"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function TopNavigation() {
  const pathname = usePathname();
  const { environment, environmentLoading, requestLocation } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const temperature = environment.temperatureC == null ? '--' : `${Math.round(environment.temperatureC)}°C`;
  const location = environment.city || environment.timezone.split('/').pop()?.replaceAll('_', ' ') || 'Local';

  return (
    <>
      <header className="topnav-wrap">
        <div className="topnav-shell">
          <Link href="/" className="topnav-brand" aria-label="CrysTrack home">
            <span className="topnav-brandmark"><Diamond className="w-4 h-4" /></span>
            <span className="font-semibold tracking-tight text-white">CrysTrack</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1" aria-label="Primary navigation">
            {navItems.map((item) => {
              const active = navItemIsActive(pathname, item);
              return (
                <Link key={item.href} href={item.href} className={cn('topnav-link', active && 'is-active')}>
                  <span className="hidden lg:inline-flex">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              className="topnav-weather hidden sm:flex"
              onClick={() => void requestLocation({ prompt: true })}
              title={`${weatherLabel(environment.weather)} · click to refresh location`}
            >
              <WeatherIcon weather={environment.weather} />
              <span className="font-semibold text-white">{temperature}</span>
              <span className="hidden lg:flex items-center gap-1 text-[var(--theme-text-muted)]">
                <MapPin className="w-3 h-3" /> {environmentLoading ? 'Updating…' : location}
              </span>
            </button>
            <ThemeControl />
            <NotificationMenu />
            <ProfileMenu />
            <button type="button" className="topnav-icon-button md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="w-4 h-4" /></button>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-[90] bg-black/55 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute left-3 right-3 top-3 rounded-2xl border border-white/15 bg-[#07101c]/95 p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between px-2 py-2">
              <div className="flex items-center gap-2 text-white font-semibold"><Diamond className="w-4 h-4 text-[var(--theme-primary)]" /> CrysTrack</div>
              <button type="button" className="topnav-icon-button" onClick={() => setMobileOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <nav className="grid grid-cols-2 gap-2 mt-2">
              {navItems.map((item) => {
                const active = navItemIsActive(pathname, item);
                return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={cn('topnav-mobile-link', active && 'is-active')}><span>{item.icon}</span><span>{item.label}</span></Link>;
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
