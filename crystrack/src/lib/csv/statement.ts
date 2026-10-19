import { z } from 'zod';
import { dayKeySchema } from '../daily-records';
import { budgetCategorySchema, limitSchema, exactAmountSchema } from '../budgets';
import { decimal, kobo } from '../budget-money';
export const CSV_LIMITS = { bytes: 1048576, rows: 500, columns: 40, field: 2000 } as const;
export const delimiters = [',', ';', '\t', '|'] as const;
export type Delimiter = (typeof delimiters)[number];
export type Mapping = Partial<
  Record<
    | 'date'
    | 'description'
    | 'amount'
    | 'debit'
    | 'credit'
    | 'type'
    | 'currency'
    | 'category'
    | 'reference'
    | 'account'
    | 'balance',
    number
  >
>;
export type DateConvention = 'iso' | 'dmy' | 'mdy';
const cleanText = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((s) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s), 'Unsupported control character');
export const sourceKeySchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,59}$/);
const reference = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_.:/ -]+$/)
  .nullable();
export const statementDateSchema = z.string().refine((s) => {
  if (dayKeySchema.safeParse(s).success) return s >= '1900-01-01';
  return (
    /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-](0\d|1[0-4]):[0-5]\d)$/.test(
      s,
    ) &&
    dayKeySchema.safeParse(s.slice(0, 10)).success &&
    Number.isFinite(Date.parse(s)) &&
    s.slice(0, 10) >= '1900-01-01'
  );
}, 'Use a valid ISO day or timestamp with an explicit offset');
export const csvRowSchema = z
  .object({
    row: z.number().int().min(1).max(500),
    date: statementDateSchema,
    description: cleanText,
    amount: limitSchema,
    type: z.enum(['income', 'expense']),
    currency: z.literal('NGN'),
    category: budgetCategorySchema,
    reference,
    account: z
      .string()
      .trim()
      .max(100)
      .regex(/^[^\x00-\x1f\x7f]*$/)
      .nullable(),
    keepDuplicate: z.boolean(),
  })
  .strict();
export type CsvRow = z.infer<typeof csvRowSchema>;
export const csvReviewRequestSchema = z
  .object({
    source: sourceKeySchema,
    fileHash: z.string().regex(/^[a-f0-9]{64}$/),
    timezone: z.string().min(1).max(100),
    rows: z.array(csvRowSchema).min(1).max(500),
  })
  .strict()
  .refine(
    (v) => new Set(v.rows.map((r) => r.row)).size === v.rows.length,
    'Duplicate file row identity',
  );
export const csvImportRequestSchema = z
  .object({
    ...csvReviewRequestSchema.innerType().shape,
    batchId: z.string().uuid(),
    reviewToken: z.string().regex(/^[a-f0-9]{64}$/),
    confirmed: z.literal(true),
  })
  .strict()
  .refine(
    (v) => new Set(v.rows.map((r) => r.row)).size === v.rows.length,
    'Duplicate file row identity',
  );
export const csvContextSchema = z.object({ today: dayKeySchema, timezone: z.string() });
export const csvReceiptSchema = z
  .object({
    batchId: z.string().uuid(),
    count: z.number().int().positive().max(500),
    income: exactAmountSchema,
    expense: exactAmountSchema,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const csvReviewSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  today: dayKeySchema,
  timezone: z.string(),
  rows: z
    .array(
      z.object({
        row: z.number().int(),
        date: z.string(),
        duplicate: z.boolean(),
        possible: z.number().int().nonnegative(),
        billMatch: z.boolean(),
        referenceMissing: z.boolean(),
      }),
    )
    .max(500),
  income: exactAmountSchema,
  expense: exactAmountSchema,
});
export type CsvReview = z.infer<typeof csvReviewSchema>;
export function parseCsv(
  text: string,
  delimiter: Delimiter,
  purpose: 'import' | 'archive' = 'import',
): { headers: string[]; rows: string[][] } {
  if (new TextEncoder().encode(text).length > (purpose === 'archive' ? 16777216 : CSV_LIMITS.bytes))
    throw Error('CSV exceeds 1 MiB. Split the statement before importing.');
  text = text.replace(/^\uFEFF/, '');
  if (!text.trim()) throw Error('Choose a CSV with a header and transactions.');
  const records: string[][] = [];
  let fields: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  const pushField = () => {
    if (field.length > (purpose === 'archive' ? 8192 : CSV_LIMITS.field))
      throw Error('A CSV field exceeds 2,000 characters.');
    fields.push(field);
    if (fields.length > 40) throw Error('CSV exceeds 40 columns.');
    field = '';
    closed = false;
  };
  const pushRow = () => {
    pushField();
    if (fields.some((f) => f.trim() !== '')) {
      records.push(fields);
      if (records.length > (purpose === 'archive' ? 10001 : 501))
        throw Error('CSV exceeds 500 transactions. Split it before importing.');
    }
    fields = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\0') throw Error('NUL characters are not supported.');
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === delimiter) pushField();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      pushRow();
    } else if (c === '"') {
      if (field !== '' || closed) throw Error('Malformed CSV quoting.');
      quoted = true;
    } else if (closed) {
      if (!/[ \t]/.test(c)) throw Error('Unexpected text after a quoted field.');
    } else field += c;
    if (field.length > (purpose === 'archive' ? 8192 : 2000))
      throw Error('A CSV field exceeds 2,000 characters.');
  }
  if (quoted) throw Error('Unterminated CSV quote.');
  if (field || fields.length || closed) pushRow();
  if (records.length < 2) throw Error('CSV needs at least one transaction.');
  const headers = records.shift()!.map(
    (h, i) =>
      h
        .trim()
        .replace(/[\x00-\x1f\x7f]/g, ' ')
        .slice(0, 100) || 'Column ' + (i + 1),
  );
  if (headers.length < 2) throw Error('Select the delimiter that separates the CSV columns.');
  if (records.some((r) => r.length !== headers.length))
    throw Error('Column counts differ. Correct the CSV structure or delimiter.');
  return { headers, rows: records };
}
export function isLedgerArchive(headers: string[]) {
  return headers.some((h) => /^entry[_ ]id$/i.test(h)) && headers.some((h) => /^origin$/i.test(h));
}
export function detectDelimiter(text: string): Delimiter {
  const candidates = delimiters
    .map((d) => {
      try {
        return { d, n: parseCsv(text, d).headers.length };
      } catch {
        return { d, n: 0 };
      }
    })
    .sort((a, b) => b.n - a.n);
  return candidates[0].n > 1 ? candidates[0].d : ',';
}
export function suggestMapping(headers: string[]): Mapping {
  const aliases: Record<keyof Mapping, RegExp> = {
    date: /^(date|transaction date|posted date)$/,
    description: /^(description|narration|details|source)$/,
    amount: /^(amount|signed amount)$/,
    debit: /^(debit|debits|withdrawal)$/,
    credit: /^(credit|credits|deposit)$/,
    type: /^(type|flow_kind|flow kind|direction)$/,
    currency: /^(currency|ccy|transaction currency)$/,
    category: /^category$/,
    reference: /^(reference|transaction id|transaction reference)$/,
    account: /^(account|account\/source|account name)$/,
    balance: /^(balance|running balance)$/,
  };
  const result: Mapping = {};
  for (const [key, re] of Object.entries(aliases)) {
    const i = headers.findIndex((h) => re.test(h.toLowerCase().trim()));
    if (i >= 0) result[key as keyof Mapping] = i;
  }
  return result;
}
export function dateCell(raw: string, convention: DateConvention): string {
  const s = raw.trim();
  if (statementDateSchema.safeParse(s).success) return s;
  const m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s);
  if (!m || convention === 'iso')
    throw Error('Choose DMY or MDY explicitly for slash/numeric dates.');
  const day = convention === 'dmy' ? m[1] : m[2],
    month = convention === 'dmy' ? m[2] : m[1];
  const d = `${m[3]}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return statementDateSchema.parse(d);
}
export function moneyCell(raw: string, allowZero = false): { amount: string; negative: boolean } {
  let s = raw.trim();
  if (!s) throw Error('Amount is missing.');
  s = s.replace(/^(NGN\s+|₦\s*)/i, '');
  if (!/^[+-]?(?:0|[1-9]\d{0,9}|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(s))
    throw Error('Use exact NGN, valid thousands grouping and at most two decimals.');
  const negative = s.startsWith('-');
  s = s.replace(/^[+-]/, '').replaceAll(',', '');
  const n = kobo(s);
  if (
    n >= BigInt(1000000000000) ||
    n < BigInt(0) ||
    (!allowZero && n === BigInt(0)) ||
    (negative && n === BigInt(0))
  )
    throw Error('Use a positive amount below ₦10 billion; negative zero is not supported.');
  return { amount: decimal(n), negative };
}
export function observedCurrency(cells: string[], headers: string[], map: Mapping) {
  const known = headers
    .flatMap((h, i) =>
      /^(currency|ccy|transaction currency)$/i.test(h.trim())
        ? [cells[i].trim().toUpperCase()]
        : [],
    )
    .filter(Boolean);
  return (
    known.find((c) => c !== 'NGN') ||
    (map.currency === undefined ? '' : cells[map.currency].trim().toUpperCase()) ||
    'NGN'
  );
}
export function mappedRow(
  cells: string[],
  headers: string[],
  map: Mapping,
  mode: 'signed' | 'split',
  convention: DateConvention,
  row: number,
): CsvRow {
  const get = (k: keyof Mapping) => (map[k] === undefined ? '' : cells[map[k]!]!.trim());
  const required: (keyof Mapping)[] =
    mode === 'signed'
      ? ['date', 'description', 'amount']
      : ['date', 'description', 'debit', 'credit'];
  if (required.some((k) => map[k] === undefined)) throw Error('Map all required columns.');
  if (
    headers.some((h) => /^(currency|ccy|transaction currency)$/i.test(h.trim())) &&
    map.currency === undefined
  )
    throw Error('Map the statement currency column.');
  const chosen = Object.values(map).filter((v) => v !== undefined);
  if (new Set(chosen).size !== chosen.length)
    throw Error('Map each selected column to one role only.');
  if (
    ['amount', 'debit', 'credit'].some(
      (k) =>
        map[k as keyof Mapping] !== undefined && /balance/i.test(headers[map[k as keyof Mapping]!]),
    )
  )
    throw Error('Balance columns are not transaction amounts.');
  let amount: string, type: 'income' | 'expense';
  if (mode === 'signed') {
    const n = moneyCell(get('amount'));
    amount = n.amount;
    type = n.negative ? 'expense' : 'income';
    const t = get('type').toLowerCase();
    if (t) {
      const wanted = ['expense', 'debit'].includes(t)
        ? 'expense'
        : ['income', 'credit'].includes(t)
          ? 'income'
          : null;
      if (!wanted)
        throw Error('Only actual income/expense is supported; exclude savings and transfers.');
      if (n.negative && wanted === 'income')
        throw Error('Signed amount contradicts transaction type.');
      type = wanted;
    }
  } else {
    const d = moneyCell(get('debit') || '0', true),
      c = moneyCell(get('credit') || '0', true);
    if (d.negative || c.negative || kobo(d.amount) > BigInt(0) === kobo(c.amount) > BigInt(0))
      throw Error('Use exactly one positive Debit or Credit, not both.');
    type = kobo(d.amount) > BigInt(0) ? 'expense' : 'income';
    amount = type === 'expense' ? d.amount : c.amount;
    if (
      get('type') &&
      ![type, type === 'expense' ? 'debit' : 'credit'].includes(get('type').toLowerCase())
    )
      throw Error('Debit/Credit conflicts with transaction type.');
  }
  return csvRowSchema.parse({
    row,
    date: dateCell(get('date'), convention),
    description: get('description'),
    amount,
    type,
    currency: observedCurrency(cells, headers, map),
    category: get('category') || 'Other',
    reference: get('reference') || null,
    account: get('account') || null,
    keepDuplicate: false,
  });
}
// All untrusted text, including leading control/format characters, is neutralized.
export function csvCell(value: string, untrusted = true) {
  let s = value;
  if (untrusted && (/^[\s\p{Cf}]*[=+\-@]/u.test(s) || /^[\t\r\n]/.test(s))) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export const exportQuerySchema = z
  .object({
    from: dayKeySchema,
    to: dayKeySchema,
    notes: z.enum(['true', 'false']).default('false'),
  })
  .strict()
  .refine((v) => v.from <= v.to, 'End follows start');
export const exportRowSchema = z.object({
  id: z.string().uuid(),
  date: z.string().datetime({ offset: true }),
  type: z.string(),
  amount: limitSchema,
  category: z.string(),
  source: z.string(),
  note: z.string().optional(),
  origin: z.string(),
});
export function ledgerCsv(rows: z.infer<typeof exportRowSchema>[], notes: boolean) {
  const headers = [
    'Date',
    'Flow Kind',
    'Amount',
    'Currency',
    'Category',
    'Source',
    ...(notes ? ['Note'] : []),
    'Entry ID',
    'Origin',
  ];
  return (
    '\uFEFF' +
    headers.map((s) => csvCell(s)).join(',') +
    '\r\n' +
    rows
      .map((r) =>
        [
          csvCell(r.date, false),
          csvCell(r.type),
          csvCell(r.amount, false),
          csvCell('NGN'),
          csvCell(r.category),
          csvCell(r.source),
          ...(notes ? [csvCell(r.note || '')] : []),
          csvCell(r.id),
          csvCell(r.origin),
        ].join(','),
      )
      .join('\r\n') +
    '\r\n'
  );
}
