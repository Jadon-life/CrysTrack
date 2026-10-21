'use client';

import { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { isRestrictedPreview } from '@/lib/preview/mode';
import type { ExchangeRateSnapshot } from '@/lib/wealth';
import { convertReferenceAmount, type ConversionUnit } from '@/lib/reference-currency';

export function WealthCurrencyConverter({
  rate,
  loadingRate,
}: {
  rate: ExchangeRateSnapshot | null;
  loadingRate: boolean;
}) {
  const [from, setFrom] = useState<ConversionUnit>('NGN');
  const [amount, setAmount] = useState('1000');
  // The demo must not fetch hosted FX. Show a clearly-labelled fake example
  // so the calculator can be tried on the isolated synthetic Preview.
  const synthetic = isRestrictedPreview();
  const usdNgn = synthetic ? 1600 : rate?.usdNgn;
  const converted = useMemo(
    () => convertReferenceAmount(amount, from, usdNgn),
    [amount, from, usdNgn],
  );
  const quoteAvailable = typeof usdNgn === 'number' && Number.isFinite(usdNgn) && usdNgn > 0;
  const target = from === 'NGN' ? 'USD' : 'NGN';

  return (
    <GlassCard padding="md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="dashboard-panel-title text-sm">Naira ↔ dollar calculator</h2>
          <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
            Convert either way using one reference rate. This does not exchange or record money.
          </p>
        </div>
        <span className="rounded-full border border-white/20 bg-black/25 px-3 py-1 text-xs text-white/85">
          {synthetic ? 'Demo example rate' : rate?.stale ? 'Cached rate' : quoteAvailable ? 'Reference rate' : 'Rate unavailable'}
        </span>
      </div>
      <div className="mt-4 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div>
          <label htmlFor="wealth-convert-input" className="mb-1.5 block text-xs font-semibold text-white">
            {from === 'NGN' ? 'Nigerian naira (₦)' : 'US dollars ($)'}
          </label>
          <input
            id="wealth-convert-input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={event => setAmount(event.target.value)}
            placeholder={from === 'NGN' ? 'e.g. 2500.50' : 'e.g. 5.00'}
            aria-describedby="wealth-convert-hint"
            className="w-full rounded-xl border border-white/20 bg-black/20 px-3 py-2.5 text-sm text-white outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
          />
        </div>
        <button
          type="button"
          onClick={() => { setFrom(target); setAmount(''); }}
          aria-label={`Swap conversion direction to ${target}`}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/25 bg-white/10 text-white hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
        >
          <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-semibold text-white">{target === 'USD' ? 'US dollars ($)' : 'Nigerian naira (₦)'}</p>
          <output htmlFor="wealth-convert-input" aria-live="polite" aria-atomic="true" className="block min-h-11 break-words rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm font-semibold text-white tabular-nums">
            {converted ? `≈ ${converted.target}` : !quoteAvailable ? '—' : !amount ? 'Enter an amount' : 'Check amount (up to 2 decimals)'}
          </output>
        </div>
      </div>
      <p id="wealth-convert-hint" className="mt-3 text-xs leading-relaxed text-slate-200">
        {synthetic
          ? 'Synthetic illustration only: $1 = ₦1,600. This is not a live or tradeable quote.'
          : quoteAvailable
            ? `Indicative $1 = ₦${usdNgn!.toLocaleString('en-NG', { maximumFractionDigits: 6 })}. ${rate?.stale ? 'Cached quote, may be outdated.' : 'Live reference provider quote; actual exchange services may differ.'}`
            : loadingRate ? 'Loading the reference rate…' : 'Reference rate unavailable. No conversion is guessed.'}
        {' '}All actual CrysTrack Money entries are recorded in NGN; converting a display does not change your balance.
      </p>
    </GlassCard>
  );
}
