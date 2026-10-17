/** DECIMAL(12,2) inputs. Financial arithmetic uses integer minor units only. */
export function toKobo(value: string | number): bigint {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match)
    throw new Error("Enter a valid amount with up to two decimal places");
  return (
    BigInt(match[1]) * BigInt(100) + BigInt((match[2] || "").padEnd(2, "0"))
  );
}
export function signedKobo(value: string | number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match)
    throw new Error("Enter a valid amount with up to two decimal places");
  return (
    (match[1] ? -BigInt(1) : BigInt(1)) *
    (BigInt(match[2]) * BigInt(100) + BigInt((match[3] || "").padEnd(2, "0")))
  );
}
export function fromKobo(value: bigint): string {
  const sign = value < BigInt(0) ? "-" : "";
  const amount = value < BigInt(0) ? -value : value;
  return `${sign}${amount / BigInt(100)}.${String(amount % BigInt(100)).padStart(2, "0")}`;
}
/** Half away from zero; deterministic integer rounding, including negative forecasts. */
export function divideMoney(value: bigint, divisor: bigint): bigint {
  if (divisor <= BigInt(0)) throw new Error("A positive divisor is required");
  const sign = value < BigInt(0) ? -BigInt(1) : BigInt(1),
    n = value * sign;
  return sign * ((n + divisor / BigInt(2)) / divisor);
}
export function percentageOf(value: bigint, basisPoints: number): bigint {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000)
    throw new Error("Invalid percentage");
  return divideMoney(value * BigInt(basisPoints), BigInt(10000));
}
export function ratioPercent(value: bigint, total: bigint): number {
  return total === BigInt(0)
    ? 0
    : Number((value * BigInt(10000)) / total) / 100;
}
export function moneyPercent(
  current: string | number,
  target: string | number,
) {
  return Math.min(100, ratioPercent(toKobo(current), toKobo(target)));
}
/** Rate is decimal NGN per USD; converts minor units with rational integer math. */
export function usdCents(kobo: bigint, rate: string | number): bigint {
  const match = /^(\d+)(?:\.(\d{1,10}))?$/.exec(String(rate));
  if (!match) throw new Error("Exchange rate unavailable");
  const scale = BigInt(10) ** BigInt(match[2]?.length || 0);
  const numerator = BigInt(match[1]) * scale + BigInt(match[2] || "0");
  if (!numerator) throw new Error("Exchange rate unavailable");
  return divideMoney(kobo * scale, numerator);
}
export function formatMinor(amount: bigint, symbol = "₦") {
  const negative = amount < BigInt(0),
    n = negative ? -amount : amount;
  return `${negative ? "-" : ""}${symbol}${(n / BigInt(100)).toLocaleString("en-NG")}.${String(n % BigInt(100)).padStart(2, "0")}`;
}
export function formatMoney(value: string | number) {
  return formatMinor(signedKobo(value));
}
