import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
const native = createRequire(import.meta.url),
  cache = new Map();
function load(f) {
  f = path.resolve(f);
  if (cache.has(f)) return cache.get(f).exports;
  const mod = { exports: {} };
  cache.set(f, mod);
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(fs.readFileSync(f, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
  )(
    (n) => (n.startsWith('.') ? load(path.resolve(path.dirname(f), n + '.ts')) : native(n)),
    mod,
    mod.exports,
  );
  return mod.exports;
}
const {
  parseCsv,
  detectDelimiter,
  suggestMapping,
  mappedRow,
  observedCurrency,
  dateCell,
  moneyCell,
  csvCell,
  ledgerCsv,
  isLedgerArchive,
  csvReviewRequestSchema,
  csvImportRequestSchema,
} = load('src/lib/csv/statement.ts');
const fixture = (n) => fs.readFileSync('tests/fixtures/csv/' + n, 'utf8');
test('real CSV quoting, escaped quotes, multiline CRLF, UTF8 BOM and four selected delimiters', () => {
  const t =
    '\uFEFF Date ; Description ;Amount\r\n2026-10-01;"Synthetic, \"\"quoted\"\"\nsecond line";-10.01\r\n';
  assert.equal(detectDelimiter(t), ';');
  const p = parseCsv(t, ';');
  assert.deepEqual(p.headers, ['Date', 'Description', 'Amount']);
  assert.equal(p.rows[0][1], 'Synthetic, "quoted"\nsecond line');
  for (const d of [',', ';', '\t', '|']) {
    assert.equal(detectDelimiter('Date' + d + 'Amount\n2026-10-01' + d + '1.00'), d);
    assert.equal(parseCsv('a' + d + 'b\n1' + d + '2', d).rows.length, 1);
  }
});
test('empty, oversized, malformed, inconsistent and resource-heavy CSV fails without partial rows', () => {
  for (const [s, d] of [
    ['', ','],
    ['a,b', ','],
    ['a,b\n"open,1', ','],
    ['a,b\n1,2,3', ','],
    ['a,b\n1,"x"bad', ','],
    ['a,b\n' + 'x'.repeat(2001) + ',1', ','],
    ['a,b\n1,\0', ','],
    ['a,b\n' + '1,2\n'.repeat(501), ','],
    ['a,b\n' + 'x'.repeat(1048577), ','],
  ])
    assert.throws(() => parseCsv(s, d));
});
test('signed amount mapping uses exact NGN and excludes balance; split Debit/Credit handles zeros correctly', () => {
  let p = parseCsv(fixture('synthetic-signed-ngn.csv'), ',');
  let m = suggestMapping(p.headers);
  let a = mappedRow(p.rows[0], p.headers, m, 'signed', 'iso', 1);
  assert.equal(a.amount, '2500.25');
  assert.equal(a.type, 'expense');
  assert.equal(a.reference, 'SYN-001');
  assert.equal(mappedRow(p.rows[1], p.headers, m, 'signed', 'iso', 2).type, 'income');
  assert.throws(() =>
    mappedRow(
      p.rows[0],
      p.headers,
      { ...m, amount: m.balance, balance: undefined },
      'signed',
      'iso',
      1,
    ),
  );
  p = parseCsv(fixture('synthetic-debit-credit-ngn.csv'), ';');
  m = suggestMapping(p.headers);
  a = mappedRow(p.rows[0], p.headers, m, 'split', 'dmy', 1);
  assert.equal(a.amount, '450.10');
  assert.equal(a.date, '2026-10-01');
  assert.equal(mappedRow(p.rows[1], p.headers, m, 'split', 'dmy', 2).type, 'income');
  const bad = [...p.rows[0]];
  bad[m.credit] = '1';
  assert.throws(() => mappedRow(bad, p.headers, m, 'split', 'dmy', 1));
});
test('date convention must be explicit, leap validity and offset timestamp precision survive', () => {
  assert.throws(() => dateCell('01/02/2026', 'iso'));
  assert.equal(dateCell('01/02/2026', 'dmy'), '2026-02-01');
  assert.equal(dateCell('01/02/2026', 'mdy'), '2026-01-02');
  assert.throws(() => dateCell('29/02/2026', 'dmy'));
  assert.equal(dateCell('29/02/2028', 'dmy'), '2028-02-29');
  assert.equal(
    dateCell('2026-10-01T00:00:00.123456+01:00', 'iso'),
    '2026-10-01T00:00:00.123456+01:00',
  );
  assert.throws(() => dateCell('2026-10-01T00:00:00', 'iso'));
});
test('strict monetary parsing rejects coercion, FX, exponent, negative zero, malformed grouping and precision', () => {
  for (const s of [
    'NaN',
    'Infinity',
    '1e3',
    '-0',
    '-0.00',
    '0',
    '1.001',
    '10,00',
    '10000000000',
    'USD 20',
    '$20',
    '(200.00)',
    '01.00',
  ])
    assert.throws(() => moneyCell(s));
  assert.throws(() => moneyCell('-₦20')); // Sign-before-symbol is unsupported, never coerced.
});
test('positive exact cents and separated grouping never use raw floating arithmetic', () => {
  assert.deepEqual(moneyCell('₦ 2,500.25'), { amount: '2500.25', negative: false });
  assert.deepEqual(moneyCell('-2500.25'), { amount: '2500.25', negative: true });
  assert.equal(moneyCell('9999999999.99').amount, '9999999999.99');
});
test('spreadsheet formula protection covers all untrusted text, quotes/newlines and hidden prefixes', () => {
  for (const s of [
    '=1+1',
    '+SUM(A1)',
    '-2+3',
    '@SUM(A1)',
    '\ttext',
    '\u200b=1',
    '\u0001=1',
    '\u007f@SUM(A1)',
    '\uFEFF+1',
  ])
    assert.ok(csvCell(s).startsWith('"\''));
  assert.equal(csvCell('a"b\nc'), '"a""b\nc"');
  assert.equal(csvCell('2500.25', false), '"2500.25"');
  const output = ledgerCsv(
    [
      {
        id: '11111111-1111-4111-8111-111111111111',
        date: '2026-10-01T00:00:00+00:00',
        type: 'expense',
        amount: '20.01',
        category: 'Food',
        source: '=HYPERLINK("x")',
        note: 'secret synthetic note',
        origin: 'csv',
      },
    ],
    false,
  );
  assert.ok(output.startsWith('\uFEFF'));
  assert.ok(!output.includes('secret synthetic'));
  assert.ok(output.includes('"\'=HYPERLINK'));
  assert.equal(parseCsv(output, ',').rows.length, 1);
  assert.equal(isLedgerArchive(parseCsv(output, ',').headers), true);
});
test('envelopes strictly reject forged owner/award/origin/amount types and require explicit confirmation', () => {
  const p = parseCsv(fixture('synthetic-signed-ngn.csv'), ','),
    row = mappedRow(p.rows[0], p.headers, suggestMapping(p.headers), 'signed', 'iso', 1),
    base = {
      source: 'synthetic-current',
      fileHash: 'a'.repeat(64),
      timezone: 'Africa/Lagos',
      rows: [row],
    };
  assert.ok(csvReviewRequestSchema.safeParse(base).success);
  for (const v of [
    { ...base, user_id: 'other' },
    { ...base, rows: [{ ...row, import_batch_id: 'bad' }] },
    { ...base, rows: [row, row] },
    { ...base, rows: [{ ...row, amount: 20 }] },
    { ...base, rows: [{ ...row, currency: 'USD' }] },
  ])
    assert.equal(csvReviewRequestSchema.safeParse(v).success, false);
  assert.equal(
    csvImportRequestSchema.safeParse({
      ...base,
      batchId: '11111111-1111-4111-8111-111111111111',
      reviewToken: 'a'.repeat(64),
      confirmed: false,
    }).success,
    false,
  );
});

test('bounded authenticated-write JSON reader caps streamed bytes, rejects wrong origins and invalid UTF8', async () => {
  const { boundedJson } = load('src/lib/csv/server.ts');
  const request = (body, headers = {}) =>
    new Request('http://127.0.0.1/api/wealth/csv/imports', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    });
  assert.deepEqual(await boundedJson(request('{"confirmed":true}')), { confirmed: true });
  assert.deepEqual(
    await boundedJson(
      new Request('http://localhost/api/wealth/csv/imports', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          host: '127.0.0.1:3456',
          origin: 'http://127.0.0.1:3456',
        },
        body: '{}',
      }),
    ),
    {},
  );
  for (const r of [
    request('{}', { origin: 'https://untrusted.example.invalid' }),
    request('{}', { 'content-type': 'text/plain' }),
    request('x'.repeat(1048577)),
    request(new Uint8Array([0xff, 0xfe, 0x7b, 0x7d])),
  ])
    await assert.rejects(() => boundedJson(r));
});

test('known foreign currency cannot be hidden by unmapping its column or treated as NGN during correction', () => {
  const p = parseCsv(
      'Date,Description,Amount,Currency\n2026-10-01,Synthetic foreign,20.01,USD',
      ',',
    ),
    m = suggestMapping(p.headers);
  assert.throws(() => mappedRow(p.rows[0], p.headers, m, 'signed', 'iso', 1));
  delete m.currency;
  assert.throws(() => mappedRow(p.rows[0], p.headers, m, 'signed', 'iso', 1));
  assert.equal(observedCurrency(p.rows[0], p.headers, m), 'USD');
});
