'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function startOfCalendar(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayIndex = (first.getDay() + 6) % 7;
  return new Date(first.getFullYear(), first.getMonth(), 1 - mondayIndex);
}

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function MiniCalendar({ eventDates = [] }: { eventDates?: string[] }) {
  const [month, setMonth] = useState(() => new Date());
  const today = new Date();
  const eventKeys = useMemo(() => new Set(eventDates.map((value) => dateKey(new Date(value)))), [eventDates]);

  const days = useMemo(() => {
    const start = startOfCalendar(month);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);

  const move = (delta: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="dashboard-panel-title text-sm">Calendar</p>
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-white">
            {month.toLocaleDateString([], { month: 'long', year: 'numeric' })}
          </p>
          <button type="button" onClick={() => move(-1)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-white/5 text-[var(--theme-text-muted)]"><ChevronLeft className="w-4 h-4" /></button>
          <button type="button" onClick={() => move(1)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-white/5 text-[var(--theme-text-muted)]"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-2 text-center">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
          <span key={label} className="text-[10px] text-[var(--theme-text-muted)]">{label}</span>
        ))}
        {days.map((date) => {
          const key = dateKey(date);
          const isToday = dateKey(today) === key;
          const inMonth = date.getMonth() === month.getMonth();
          const hasEvent = eventKeys.has(key);

          return (
            <div key={key} className="relative h-8 grid place-items-center">
              <span className={`w-7 h-7 rounded-full grid place-items-center text-[11px] ${
                isToday
                  ? 'bg-[var(--theme-primary)] text-white shadow-lg shadow-black/20'
                  : inMonth
                    ? 'text-white'
                    : 'text-white/30'
              }`}>
                {date.getDate()}
              </span>
              {hasEvent && !isToday && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-[var(--theme-accent)]" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
