'use client';
import { AvatarXP } from '@/components/gamification/elements';
import { useGamification } from '@/components/gamification/provider';
import Image from 'next/image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  ChevronDown,
  Cloud,
  CloudRain,
  LogOut,
  MapPin,
  Menu,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
  User,
  Zap,
  ArrowUpRight,
} from 'lucide-react';
import { useAuth } from '@/components/layout/auth-provider';
import { useTheme } from '@/components/layout/theme-provider';
import { useRhythm } from '@/components/rhythm/rhythm-provider';
import { weatherLabel } from '@/lib/environment';
import { WorkspaceOverlay } from '@/components/workspace/overlay';
import { navItems } from './nav-items';
import { workspaceRouteTitles } from '@/lib/workspace/design';
function WeatherIcon({ weather }: { weather: string }) {
  return weather === 'rain' || weather === 'storm' ? (
    <CloudRain size={16} />
  ) : ['cloudy', 'fog', 'snow'].includes(weather) ? (
    <Cloud size={16} />
  ) : (
    <Sun size={16} />
  );
}
export function ThemeControl() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="topnav-theme" role="group" aria-label="Theme mode">
      {[
        { value: 'adaptive' as const, icon: Monitor, label: 'Auto' },
        { value: 'light' as const, icon: Sun, label: 'Light' },
        { value: 'dark' as const, icon: Moon, label: 'Dark' },
      ].map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          className={
            'topnav-theme__button' + (preference === value ? ' is-active' : '')
          }
          aria-label={'Use ' + label.toLowerCase() + ' theme'}
          aria-pressed={preference === value}
          onClick={() => void setPreference(value)}
        >
          <Icon size={16} />
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
}
function NotificationMenu() {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<ReminderPreview[]>([]),
    [permission, setPermission] = useState<
      NotificationPermission | 'unsupported'
    >('default'),
    [notice, setNotice] = useState('');
  const { data } = useRhythm();
  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/reminders?limit=8', {
          cache: 'no-store',
        });
        if (response.ok) {
          const result = await response.json();
          if (Array.isArray(result)) setItems(result);
        }
      } catch {
        setNotice('Your reminders could not refresh. Try again shortly.');
      }
    };
    queueMicrotask(() => {
      setPermission(
        typeof Notification === 'undefined'
          ? 'unsupported'
          : Notification.permission,
      );
      void load();
    });
    const timer = setInterval(() => void load(), 60000);
    return () => clearInterval(timer);
  }, []);
  const unread = items.filter((item) => item.status === 'pending').length;
  return (
    <>
      <button
        type="button"
        className="workspace-icon-button workspace-notification-trigger"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="workspace-notification-count">
            {Math.min(unread, 9)}
          </span>
        )}
      </button>
      <WorkspaceOverlay
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        position="corner"
      >
        <p className="workspace-utility-muted">
          Upcoming reminders, in {data?.timezone || 'your saved timezone'}.
        </p>
        {permission !== 'granted' && permission !== 'unsupported' && (
          <button
            className="workspace-notification-row"
            onClick={async () => {
              try {
                const pushModule = await import('@/lib/push'),
                  result = await pushModule.enablePushNotifications();
                setPermission(result.permission);
                setNotice(
                  result.ok
                    ? 'Reminders are ready.'
                    : 'Browser reminders need permission or configuration.',
                );
              } catch {
                setNotice(
                  'Reminders could not connect. You can try again in Settings.',
                );
              }
            }}
          >
            <Zap size={16} /> Enable browser reminders
          </button>
        )}
        {notice && <p role="status">{notice}</p>}
        {items.length ? (
          items.map((item) => (
            <article key={item.id} className="workspace-notification-row">
              <p>{item.title || item.entity_type.replaceAll('_', ' ')}</p>
              <p>
                {new Intl.DateTimeFormat('en', {
                  timeZone: data?.timezone || 'UTC',
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(item.scheduled_for))}
              </p>
            </article>
          ))
        ) : (
          <p className="py-6 workspace-utility-muted">
            You’re all caught up. No upcoming reminders.
          </p>
        )}
        <Link
          href="/settings"
          onClick={() => setOpen(false)}
          className="workspace-history-link"
        >
          Manage reminder preferences <ArrowUpRight size={15} />
        </Link>
      </WorkspaceOverlay>
    </>
  );
}
function ProfileMenu() {
  const { data: gamification, hidden: quiet } = useGamification(),
    { user, signOut } = useAuth(),
    [open, setOpen] = useState(false),
    [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    const loadAvatar = async () => {
      try {
        const response = await fetch('/api/profile', { cache: 'no-store' });
        if (response.ok) {
          const profile = await response.json();
          setAvatarUrl(profile?.avatar_signed_url || null);
        }
      } catch (error) {
        console.error('Could not load profile avatar:', error);
      }
    };
    queueMicrotask(() => void loadAvatar());
    window.addEventListener('crystrack-profile-updated', loadAvatar);
    return () =>
      window.removeEventListener('crystrack-profile-updated', loadAvatar);
  }, []);
  const displayName = useMemo(
    () =>
      String(
        user?.user_metadata?.full_name ||
          user?.user_metadata?.name ||
          user?.email?.split('@')[0] ||
          'Your workspace',
      ),
    [user],
  );
  return (
    <>
      <button
        className="workspace-profile"
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          quiet
            ? 'Open profile'
            : `Open profile, level ${gamification?.level || 1}, ${gamification?.xp || 0} XP`
        }
      >
        <AvatarXP>
          <span className="topnav-avatar overflow-hidden">
            {avatarUrl ? (
              <Image
                unoptimized
                width={32}
                height={32}
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              displayName.slice(0, 1).toUpperCase()
            )}
          </span>
        </AvatarXP>
        <ChevronDown size={14} />
      </button>
      <WorkspaceOverlay
        open={open}
        onClose={() => setOpen(false)}
        title={displayName}
        position="corner"
      >
        <p className="workspace-utility-muted">{user?.email}</p>
        <nav className="workspace-profile-menu" aria-label="Profile actions">
          {!quiet && gamification?.ready && (
            <Link
              href="/insights#achievement-cabinet"
              onClick={() => setOpen(false)}
            >
              Level {gamification.level} · {gamification.xp} XP · Your badges
            </Link>
          )}
          <Link href="/settings" onClick={() => setOpen(false)}>
            <User size={17} /> Profile & preferences
          </Link>
          <Link href="/settings" onClick={() => setOpen(false)}>
            <Settings size={17} /> Settings
          </Link>
          <button onClick={() => void signOut()}>
            <LogOut size={17} /> Sign out
          </button>
        </nav>
        <div className="workspace-profile-theme">
          <p className="workspace-utility-muted">Workspace appearance</p>
          <ThemeControl />
        </div>
      </WorkspaceOverlay>
    </>
  );
}
export function TopNavigation({
  onOpenNavigation,
}: {
  onOpenNavigation: () => void;
}) {
  const pathname = usePathname(),
    { environment, environmentLoading, requestLocation } = useTheme(),
    [command, setCommand] = useState(false),
    [query, setQuery] = useState(''),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommand((value) => !value);
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);
  const results = [
    ...navItems,
    { label: 'History', href: '/history', icon: <ArrowUpRight size={18} /> },
  ].filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase().trim()),
  );
  const closeCommand = () => {
    setCommand(false);
    setQuery('');
    trigger.current?.focus();
  };
  return (
    <>
      <header className="workspace-utility">
        <button
          className="workspace-icon-button workspace-menu-button"
          aria-label="Open navigation"
          onClick={onOpenNavigation}
        >
          <Menu size={19} />
        </button>
        <div className="workspace-breadcrumb">
          <span>Workspace</span>
          <span className="workspace-breadcrumb-divider" aria-hidden="true">
            /
          </span>
          <strong>{workspaceRouteTitles[pathname] || 'Your workspace'}</strong>
        </div>
        <div className="workspace-utility-actions">
          <button
            ref={trigger}
            type="button"
            onClick={() => setCommand(true)}
            className="workspace-search-trigger"
            aria-label="Search workspace pages"
            aria-haspopup="dialog"
          >
            <Search size={16} />
            <span>Find a page…</span>
            <kbd>⌘ K</kbd>
          </button>
          <button
            className="workspace-weather"
            type="button"
            onClick={() => void requestLocation({ prompt: true })}
            aria-label="Refresh weather and location"
            title={
              weatherLabel(environment.weather) +
              ' · ' +
              (environment.city || environment.timezone)
            }
          >
            <WeatherIcon weather={environment.weather} />
            <span>
              {environmentLoading
                ? '…'
                : environment.temperatureC == null
                  ? 'Local'
                  : Math.round(environment.temperatureC) + '°C'}
            </span>
            <MapPin size={13} />
          </button>
          <div className="workspace-theme-desktop">
            <ThemeControl />
          </div>
          <NotificationMenu />
          <ProfileMenu />
        </div>
      </header>
      <WorkspaceOverlay
        open={command}
        onClose={closeCommand}
        title="Find your space"
      >
        <label className="sr-only" htmlFor="workspace-search">
          Search pages
        </label>
        <input
          id="workspace-search"
          className="workspace-command-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tasks, Wealth, Calendar…"
          autoComplete="off"
        />
        <nav className="workspace-command-results" aria-label="Search results">
          {results.map((item) => (
            <Link key={item.href} href={item.href} onClick={closeCommand}>
              {item.icon}
              {item.label}
              <ArrowUpRight size={14} className="ml-auto" />
            </Link>
          ))}
          {!results.length && (
            <p className="py-6 workspace-utility-muted">
              No matching pages. Try another name.
            </p>
          )}
        </nav>
      </WorkspaceOverlay>
    </>
  );
}
