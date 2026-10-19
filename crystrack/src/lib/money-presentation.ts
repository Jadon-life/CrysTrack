// Display only. Never send these formatted/rounded values to a financial writer.
import { decimal, exactMoney, indicativeUsd, kobo } from './budget-money';

export type MoneyMode = 'everyday' | 'summary' | 'statement';
export const manualMoneyHint =
  'Start with whole naira, e.g. 2500. If needed, enter kobo with up to two decimal places; precision is kept.';

function source(value: string | number) {
  if (typeof value === 'string') return { amount: decimal(kobo(value)), rounded: false };
  // Legacy dashboards already supply Number totals. Do not turn them into new
  // accounting authority or hide sub-kobo drift as an exact source value.
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100)
    throw Error('Unrepresentable display total');
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(value));
  if (!match) throw Error('Invalid display total');
  const digits = match[2] + (match[3] ?? '');
  const point = match[2].length + Number(match[4] ?? 0);
  const whole = point <= 0 ? '0' : digits.slice(0, point).padEnd(point, '0');
  const fraction = point <= 0 ? '0'.repeat(-point) + digits : digits.slice(point);
  const cents = fraction.padEnd(2, '0').slice(0, 2);
  const remainder = fraction.slice(2);
  const magnitude =
    BigInt(whole) * BigInt(100) +
    BigInt(cents) +
    (Number(remainder[0] ?? 0) >= 5 ? BigInt(1) : BigInt(0));
  return {
    amount: decimal(match[1] ? -magnitude : magnitude),
    rounded: /[1-9]/.test(remainder),
  };
}

export function moneyPresentation(
  value: string | number,
  currency: 'NGN' | 'USD' = 'NGN',
  usdNgn?: number | null,
  options: { mode?: MoneyMode; sign?: boolean } = {},
) {
  try {
    const canonical = source(value);
    const usd = currency === 'USD' ? indicativeUsd(canonical.amount, usdNgn ?? undefined) : null;
    const available = currency !== 'USD' || usd !== null;
    const unit = currency === 'USD' && available ? 'USD' : 'NGN';
    const amount = usd ?? canonical.amount;
    const n = kobo(amount),
      magnitude = n < BigInt(0) ? -n : n;
    const fraction = magnitude % BigInt(100) !== BigInt(0);
    const roundedWhole = unit === 'NGN' && options.mode === 'summary' && fraction;
    const exact = exactMoney(amount, unit);
    let text = roundedWhole
      ? `${n < BigInt(0) ? '−' : ''}₦${new Intl.NumberFormat('en-NG').format((magnitude + BigInt(50)) / BigInt(100))}`
      : unit === 'NGN' && !fraction && options.mode !== 'statement'
        ? exact.slice(0, -3)
        : exact;
    if (options.sign && n > BigInt(0)) text = '+' + text;
    const approximate = roundedWhole || canonical.rounded || unit === 'USD';
    if (approximate) text = (unit === 'USD' ? '≈ ' : '≈') + text;
    if (!available) text += ' · USD unavailable';
    const canonicalText = exactMoney(canonical.amount);
    const detail = canonical.rounded
      ? `Existing numeric summary at two-decimal display precision: ${canonicalText}. This is not an exact ledger total.`
      : `Exact NGN amount: ${canonicalText}.`;
    return {
      text,
      approximate,
      exact: canonical.rounded ? null : canonicalText,
      detail:
        unit === 'USD' ? `Indicative USD: ${exact}. ${detail} NGN remains canonical.` : detail,
    };
  } catch {
    return {
      text: '—',
      approximate: false,
      exact: null,
      detail: 'Exact amount unavailable. No amount is assumed to be zero.',
    };
  }
}

export function editableMoney(value: string) {
  const normalized = decimal(kobo(value));
  return normalized.endsWith('.00') ? normalized.slice(0, -3) : normalized;
}
