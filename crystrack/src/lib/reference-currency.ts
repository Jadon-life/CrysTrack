import { decimal, exactMoney, kobo } from './budget-money';

export type ConversionUnit = 'NGN' | 'USD';

/**
 * Indicative display calculator only. Inputs must already be exact decimal text.
 * NEVER use a quoted conversion as a financial ledger/settlement amount.
 * One positive rate means NGN per $1, so both directions use identical quotes.
 */
export function convertReferenceAmount(
  rawAmount: string,
  from: ConversionUnit,
  usdNgn: number | null | undefined,
): { source: string; target: string; quote: string; unit: ConversionUnit } | null {
  if (from !== 'NGN' && from !== 'USD') return null;
  if (typeof usdNgn !== 'number' || !Number.isFinite(usdNgn) || usdNgn <= 0) return null;
  const rate = String(usdNgn);
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$/.test(rate)) return null;
  const [whole, fraction = ''] = rate.split('.');
  const scale = BigInt(10) ** BigInt(fraction.length);
  const quote = BigInt(whole) * scale + BigInt(fraction || '0');
  if (quote <= BigInt(0)) return null;
  try {
    // Reject negative values here because this is a one-time calculator,
    // not a sign-changing refund or a bill settlement authoring tool.
    if (rawAmount.startsWith('-')) return null;
    const inputCents = kobo(rawAmount);
    const outputCents = from === 'NGN'
      ? (inputCents * scale + quote / BigInt(2)) / quote
      : (inputCents * quote + scale / BigInt(2)) / scale;
    const to: ConversionUnit = from === 'NGN' ? 'USD' : 'NGN';
    const amount = decimal(outputCents);
    return {
      source: exactMoney(rawAmount, from),
      target: exactMoney(amount, to),
      quote: rate,
      unit: to,
    };
  } catch {
    return null;
  }
}
