import { decimal, exactMoney, kobo } from './budget-money';

export type InputMoneyCurrency = 'NGN' | 'USD';

/** Authoring conversion into CrysTrack's canonical NGN ledger.
 * No conversions from a cached/invalid quote; never interpret USD as NGN.
 * Fixed point + half-up sub-kobo conversion without floating point money math.
 */
export function sourceAmountToNgn(
  raw: string,
  currency: InputMoneyCurrency,
  usdNgn: number | null | undefined,
  stale = false,
): { ngn: string; origin: string; quote: string | null } | null {
  if (currency !== 'NGN' && currency !== 'USD') return null;
  try {
    const cents = kobo(raw);
    if (cents <= BigInt(0) || cents >= BigInt(1000000000000)) return null;
    if (currency === 'NGN') return { ngn: decimal(cents), origin: exactMoney(raw, 'NGN'), quote: null };
    if (stale || typeof usdNgn !== 'number' || !Number.isFinite(usdNgn) || usdNgn <= 0) return null;
    const text = String(usdNgn);
    if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$/.test(text)) return null;
    const [whole, fraction = ''] = text.split('.');
    const scale = BigInt(10) ** BigInt(fraction.length);
    const rate = BigInt(whole) * scale + BigInt(fraction || '0');
    if (rate <= BigInt(0)) return null;
    const canonical = (cents * rate + scale / BigInt(2)) / scale;
    if (canonical <= BigInt(0) || canonical >= BigInt(1000000000000)) return null;
    return { ngn: decimal(canonical), origin: exactMoney(raw, 'USD'), quote: text };
  } catch {
    return null;
  }
}
