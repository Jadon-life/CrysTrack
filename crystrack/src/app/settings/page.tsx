'use client';

import React, { useState } from 'react';
import { GlassCard } from '@/components/shared/glass-card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  User, Bell, Shield, Palette, MapPin, Database,
  ChevronRight, Moon, Sun, Monitor, Eye, EyeOff
} from 'lucide-react';

const settingsSections = [
  { id: 'profile', label: 'Profile', icon: <User className="w-5 h-5" /> },
  { id: 'reminders', label: 'Reminders', icon: <Bell className="w-5 h-5" /> },
  { id: 'privacy', label: 'Privacy', icon: <Shield className="w-5 h-5" /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette className="w-5 h-5" /> },
  { id: 'location', label: 'Location & Weather', icon: <MapPin className="w-5 h-5" /> },
  { id: 'data', label: 'Data Export', icon: <Database className="w-5 h-5" /> },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('profile');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [weatherEnabled, setWeatherEnabled] = useState(true);
  const [dndEnabled, setDndEnabled] = useState(false);
  const [dndStart, setDndStart] = useState('22:00');
  const [dndEnd, setDndEnd] = useState('07:00');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Manage your account and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Settings Nav */}
        <div className="lg:col-span-1">
          <div className="space-y-1">
            {settingsSections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
                  activeSection === section.id
                    ? 'bg-white/10 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                )}
              >
                <span className={activeSection === section.id ? 'text-blue-400' : 'text-slate-500'}>
                  {section.icon}
                </span>
                <span className="flex-1 text-left">{section.label}</span>
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            ))}
          </div>
        </div>

        {/* Settings Content */}
        <div className="lg:col-span-3">
          {activeSection === 'profile' && (
            <GlassCard padding="lg">
              <h2 className="text-lg font-semibold text-white mb-6">Profile</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Display Name</label>
                  <input
                    type="text"
                    defaultValue="Alex Chen"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                  <input
                    type="email"
                    defaultValue="alex@example.com"
                    disabled
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-500 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Timezone</label>
                  <select className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors">
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern Time</option>
                    <option value="America/Chicago">Central Time</option>
                    <option value="America/Denver">Mountain Time</option>
                    <option value="America/Los_Angeles">Pacific Time</option>
                    <option value="Europe/London">London</option>
                    <option value="Europe/Paris">Paris</option>
                    <option value="Asia/Tokyo">Tokyo</option>
                  </select>
                </div>
                <Button variant="primary" className="mt-2">Save Changes</Button>
              </div>
            </GlassCard>
          )}

          {activeSection === 'reminders' && (
            <GlassCard padding="lg">
              <h2 className="text-lg font-semibold text-white mb-6">Reminders</h2>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Do Not Disturb</p>
                    <p className="text-xs text-slate-400">Silence routine reminders during set hours</p>
                  </div>
                  <button
                    onClick={() => setDndEnabled(!dndEnabled)}
                    className={cn(
                      'w-12 h-6 rounded-full transition-colors relative',
                      dndEnabled ? 'bg-blue-500' : 'bg-white/10'
                    )}
                  >
                    <div className={cn(
                      'w-4 h-4 rounded-full bg-white absolute top-1 transition-all',
                      dndEnabled ? 'left-7' : 'left-1'
                    )} />
                  </button>
                </div>

                {dndEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Start Time</label>
                      <input
                        type="time"
                        value={dndStart}
                        onChange={(e) => setDndStart(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">End Time</label>
                      <input
                        type="time"
                        value={dndEnd}
                        onChange={(e) => setDndEnd(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-slate-500">
                    Note: Assignment overdue alerts will always deliver immediately, even during DND hours.
                  </p>
                </div>
              </div>
            </GlassCard>
          )}

          {activeSection === 'appearance' && (
            <GlassCard padding="lg">
              <h2 className="text-lg font-semibold text-white mb-6">Appearance</h2>
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-medium text-white mb-3">Theme</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'adaptive', label: 'Adaptive', icon: <Monitor className="w-5 h-5" /> },
                      { id: 'dark', label: 'Dark', icon: <Moon className="w-5 h-5" /> },
                      { id: 'light', label: 'Light', icon: <Sun className="w-5 h-5" /> },
                    ].map(theme => (
                      <button
                        key={theme.id}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        <span className="text-slate-400">{theme.icon}</span>
                        <span className="text-xs text-slate-300">{theme.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-white/10">
                  <div>
                    <p className="text-sm font-medium text-white">Reduced Motion</p>
                    <p className="text-xs text-slate-400">Minimize animations and 3D effects</p>
                  </div>
                  <button
                    onClick={() => setReducedMotion(!reducedMotion)}
                    className={cn(
                      'w-12 h-6 rounded-full transition-colors relative',
                      reducedMotion ? 'bg-blue-500' : 'bg-white/10'
                    )}
                  >
                    <div className={cn(
                      'w-4 h-4 rounded-full bg-white absolute top-1 transition-all',
                      reducedMotion ? 'left-7' : 'left-1'
                    )} />
                  </button>
                </div>
              </div>
            </GlassCard>
          )}

          {activeSection === 'location' && (
            <GlassCard padding="lg">
              <h2 className="text-lg font-semibold text-white mb-6">Location & Weather</h2>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Weather Effects</p>
                    <p className="text-xs text-slate-400">Adapt visual atmosphere based on weather</p>
                  </div>
                  <button
                    onClick={() => setWeatherEnabled(!weatherEnabled)}
                    className={cn(
                      'w-12 h-6 rounded-full transition-colors relative',
                      weatherEnabled ? 'bg-blue-500' : 'bg-white/10'
                    )}
                  >
                    <div className={cn(
                      'w-4 h-4 rounded-full bg-white absolute top-1 transition-all',
                      weatherEnabled ? 'left-7' : 'left-1'
                    )} />
                  </button>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <p className="text-sm text-slate-300 mb-2">Current Location</p>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Using browser geolocation (permission required)</span>
                  </div>
                </div>

                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Your precise location is only used to fetch weather data for visual theming. 
                    Location data is not stored permanently and is never shared with third parties.
                  </p>
                </div>
              </div>
            </GlassCard>
          )}

          {activeSection === 'privacy' && (
            <GlassCard padding="lg">
              <h2 className="text-lg font-semibold text-white mb-6">Privacy & Security</h2>
              <div className="space-y-4">
                <Button variant="outline" className="w-full justify-start">
                  <Database className="w-4 h-4 mr-2" />
                  Export All Data
                </Button>
                <Button variant="outline" className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10">
                  <Shield className="w-4 h-4 mr-2" />
                  Delete Account & Data
                </Button>
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-slate-500">
                    Your data is encrypted in transit and at rest. We never store banking credentials or passwords.
                  </p>
                </div>
              </div>
            </GlassCard>
          )}

          {activeSection === 'data' && (
            <GlassCard padding="lg">
              <h2 className="text-lg font-semibold text-white mb-6">Data Export</h2>
              <p className="text-sm text-slate-300 mb-4">
                Download a complete copy of your data in JSON format. This includes all tasks, goals, assignments, and financial records.
              </p>
              <Button variant="primary">
                <Database className="w-4 h-4 mr-2" />
                Export Data
              </Button>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
