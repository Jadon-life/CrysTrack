'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WealthDisplayCurrency } from '@/config/experience';
import type { ExchangeRateSnapshot } from '@/lib/wealth';

const CURRENCY_KEY = 'crystrack-wealth-display-currency-v1';
const RATE_KEY = 'crystrack-wealth-rate-v1';
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

function readCachedRate(): ExchangeRateSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(RATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Number.isFinite(Number(parsed?.usdNgn))) return null;
    return {
      usdNgn: Number(parsed.usdNgn),
      ngnUsd: Number(parsed.ngnUsd || 1 / Number(parsed.usdNgn)),
      updatedAt: parsed.updatedAt || null,
      nextUpdateAt: parsed.nextUpdateAt || null,
      provider: parsed.provider || 'ExchangeRate-API',
      stale: Date.now() - Number(parsed.cachedAt || 0) > STALE_AFTER_MS,
    };
  } catch {
    return null;
  }
}

export function useWealthCurrency() {
  const [currency, setCurrencyState] = useState<WealthDisplayCurrency>('NGN');
  const [rate, setRate] = useState<ExchangeRateSnapshot | null>(null);
  const [loadingRate, setLoadingRate] = useState(true);

  useEffect(() => {
    const storedCurrency = window.localStorage.getItem(CURRENCY_KEY);
    if (storedCurrency === 'USD' || storedCurrency === 'NGN') setCurrencyState(storedCurrency);
    const cached = readCachedRate();
    if (cached) setRate(cached);

    fetch('/api/exchange-rate', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('rate unavailable');
        return response.json();
      })
      .then((data) => {
        const snapshot: ExchangeRateSnapshot = {
          usdNgn: Number(data.usdNgn),
          ngnUsd: Number(data.ngnUsd),
          updatedAt: data.updatedAt || null,
          nextUpdateAt: data.nextUpdateAt || null,
          provider: data.provider || 'ExchangeRate-API',
          stale: false,
        };
        setRate(snapshot);
        window.localStorage.setItem(RATE_KEY, JSON.stringify({ ...snapshot, cachedAt: Date.now() }));
      })
      .catch(() => {
        setRate((current) => current ? { ...current, stale: true } : null);
      })
      .finally(() => setLoadingRate(false));
  }, []);

  const setCurrency = useCallback((next: WealthDisplayCurrency) => {
    setCurrencyState(next);
    window.localStorage.setItem(CURRENCY_KEY, next);
  }, []);

  return { currency, setCurrency, rate, loadingRate };
}
