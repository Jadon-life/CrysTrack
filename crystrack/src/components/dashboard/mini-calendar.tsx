'use client';

import {monthCells} from '@/lib/rhythm/logic';
import {dateKeyForInstant} from '@/lib/reminders';
import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function startOfCalendar(month: Date) {
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const mondayIndex = (first.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1 - mondayIndex));
}

function dateKey(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function MiniCalendar({ eventDates = [],todayDay,timezone='UTC' }: { eventDates?: string[];todayDay?:string;timezone?:string }) {
  const [month, setMonth] = useState(() => new Date(`${todayDay||dateKeyForInstant(new Date(),timezone)}T12:00:00Z`));
  const today = new Date(`${todayDay||dateKeyForInstant(new Date(),timezone)}T12:00:00Z`);
  const eventKeys = useMemo(() => new Set(eventDates.map((value) => dateKeyForInstant(new Date(value),timezone))), [eventDates,timezone]);

  const days = useMemo(() => {
    const start = startOfCalendar(month);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      return date;
    });
  }, [month]);

  const move = (delta: number) => {
    setMonth((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + delta, 1)));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="dashboard-panel-title text-sm">Calendar</p>
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-white">
            {month.toLocaleDateString([], { month: 'long', year: 'numeric',timeZone:'UTC' })}
          </p>
          <button type="button" onClick={() => move(-1)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-white/5 text-[var(--theme-text-muted)]"><ChevronLeft className="w-4 h-4" /></button>
          <button type="button" onClick={() => move(1)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-white/5 text-[var(--theme-text-muted)]"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-2 text-center">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
          <span key={label} className="text-xs text-[var(--theme-text-muted)]">{label}</span>
        ))}
        {days.map((date) => {
          const key = dateKey(date);
          const isToday = dateKey(today) === key;
          const inMonth = date.getUTCMonth() === month.getUTCMonth();
          const hasEvent = eventKeys.has(key);

          return (
            <div key={key} className="relative h-8 grid place-items-center">
              <span className={`w-7 h-7 rounded-full grid place-items-center text-xs ${
                isToday
                  ? 'bg-[var(--theme-primary)] text-white shadow-lg shadow-black/20'
                  : inMonth
                    ? 'text-white'
                    : 'text-white/30'
              }`}>
                {date.getUTCDate()}
              </span>
              {hasEvent && !isToday && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-[var(--theme-accent)]" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
