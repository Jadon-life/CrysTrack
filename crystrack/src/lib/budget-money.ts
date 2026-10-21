// Budget authority is decimal text / integer kobo. Never convert ledger totals to Number.
export function kobo(value: string): bigint {
  if (!/^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value) || value.length > 64)
    throw new Error('Invalid exact monetary amount');
  const negative = value.startsWith('-');
  const [whole, part = ''] = (negative ? value.slice(1) : value).split('.');
  const result = BigInt(whole) * BigInt(100) + BigInt(part.padEnd(2, '0'));
  return negative ? -result : result;
}
export function decimal(value: bigint): string {
  const n = value < BigInt(0) ? -value : value;
  return `${value < BigInt(0) ? '-' : ''}${n / BigInt(100)}.${String(n % BigInt(100)).padStart(2, '0')}`;
}
export function exactMoney(value: string, currency: 'NGN' | 'USD' = 'NGN'): string {
  const n = kobo(value),
    magnitude = n < BigInt(0) ? -n : n;
  return `${n < BigInt(0) ? '−' : ''}${currency === 'NGN' ? '₦' : '$'}${new Intl.NumberFormat('en-NG').format(magnitude / BigInt(100))}.${String(magnitude % BigInt(100)).padStart(2, '0')}`;
}
// Existing provider's quoted NGN per USD is indicative, never stored as ledger currency.
export function indicativeUsd(ngn: string, usdNgn: number | undefined): string | null {
  if (usdNgn === undefined || !Number.isFinite(usdNgn) || usdNgn <= 0) return null;
  const quote = String(usdNgn);
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$/.test(quote)) return null;
  const [whole, fraction = ''] = quote.split('.');
  const scale = BigInt(10) ** BigInt(fraction.length);
  const rate = BigInt(whole) * scale + BigInt(fraction || '0');
  const amount = kobo(ngn),
    magnitude = amount < BigInt(0) ? -amount : amount;
  const cents = (magnitude * scale + rate / BigInt(2)) / rate;
  return decimal(amount < BigInt(0) ? -cents : cents);
}
export function budgetSignal(spent: string, limit: string | null) {
  if (limit === null) return 'unset' as const;
  const s = kobo(spent),
    l = kobo(limit);
  if (l <= BigInt(0) || s < BigInt(0)) throw new Error('Invalid budget comparison');
  return s > l
    ? ('over' as const)
    : s * BigInt(100) >= l * BigInt(80)
      ? ('near' as const)
      : ('within' as const);
}
export function usedPercent(spent: string, limit: string): string {
  const s = kobo(spent),
    l = kobo(limit);
  if (l <= BigInt(0) || s < BigInt(0)) throw new Error('Invalid budget percentage');
  // Percentage with two decimals; integer half-up rounding matches PostgreSQL NUMERIC.
  return decimal((s * BigInt(10000) + l / BigInt(2)) / l);
}
export function progressWidth(spent: string, limit: string) {
  const p = kobo(usedPercent(spent, limit));
  return `${decimal(p > BigInt(10000) ? BigInt(10000) : p)}%`;
}
