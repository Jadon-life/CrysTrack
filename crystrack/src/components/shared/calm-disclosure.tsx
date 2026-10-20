'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Presentation only: opening a section never invokes an application action. */
export function CalmDisclosure({
  title,
  description,
  children,
  testId,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details
      data-calm-disclosure
      data-testid={testId}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className={cn(
        'group min-w-0 rounded-2xl border border-white/15 bg-slate-950/70 text-white',
        className,
      )}
    >
      <summary
        aria-expanded={expanded}
        className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 text-white hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 [&::-webkit-details-marker]:hidden"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          {description && (
            <span className="mt-1 block text-xs leading-relaxed text-slate-200">{description}</span>
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 shrink-0 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="space-y-4 border-t border-white/10 p-3 sm:p-4">
        {expanded ? children : null}
      </div>
    </details>
  );
}
