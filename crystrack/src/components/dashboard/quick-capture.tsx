'use client';

import Link from 'next/link';
import { CheckSquare, CircleDollarSign, ClipboardList, Target } from 'lucide-react';

const items = [
  { label: 'Task', href: '/tasks', icon: CheckSquare, tone: 'text-emerald-300 bg-emerald-500/10' },
  { label: 'Goal', href: '/goals', icon: Target, tone: 'text-sky-300 bg-sky-500/10' },
  { label: 'Assignment', href: '/assignments', icon: ClipboardList, tone: 'text-orange-300 bg-orange-500/10' },
  { label: 'Money', href: '/finance', icon: CircleDollarSign, tone: 'text-violet-300 bg-violet-500/10' },
];

export function QuickCapture() {
  return (
    <div>
      <p className="dashboard-panel-title text-sm mb-4">Quick Capture</p>
      <div className="grid grid-cols-4 gap-2">
        {items.map(({ label, href, icon: Icon, tone }) => (
          <Link key={label} href={href} className="group text-center">
            <span className={`w-11 h-11 mx-auto rounded-xl grid place-items-center border border-white/10 ${tone} transition-transform group-hover:-translate-y-0.5`}>
              <Icon className="w-5 h-5" />
            </span>
            <span className="block mt-2 text-[10px] font-medium text-white/90">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
