'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAuth } from '@/components/layout/auth-provider';
import { GlassCard } from '@/components/shared/glass-card';
import { Button } from '@/components/ui/button';
import { isRestrictedPreview } from '@/lib/preview/mode';
import { budgetCategories } from '@/lib/budgets';
import { exactMoney } from '@/lib/budget-money';
import {
  CSV_LIMITS,
  parseCsv,
  isLedgerArchive,
  detectDelimiter,
  suggestMapping,
  mappedRow,
  observedCurrency,
  csvRowSchema,
  csvContextSchema,
  csvReviewRequestSchema,
  csvImportRequestSchema,
  csvReviewSchema,
  csvReceiptSchema,
  sourceKeySchema,
  type CsvRow,
  type CsvReview,
  type Mapping,
  type Delimiter,
  type DateConvention,
} from '@/lib/csv/statement';
import { z } from 'zod';
const control =
  'mt-1 min-h-10 w-full min-w-0 rounded-xl border border-white/25 bg-slate-950/95 px-3 py-2 text-sm text-white [color-scheme:dark] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200';
type Context = z.infer<typeof csvContextSchema>;
type Receipt = z.infer<typeof csvReceiptSchema>;
type Intent = z.infer<typeof csvImportRequestSchema>;
const storeKey = (u: string) => 'crystrack-csv-pending:' + u;
function remember(u: string, id: string | null) {
  try {
    if (id) sessionStorage.setItem(storeKey(u), id);
    else sessionStorage.removeItem(storeKey(u));
  } catch {
    /* File-row/reference constraints still protect retries if session storage is unavailable. */
  }
}
export function CsvTools({ onChange }: { onChange: () => Promise<void> }) {
  const { user } = useAuth();
  return user ? (
    <OwnedCsv key={user.id} owner={user.id} onChange={onChange} />
  ) : (
    <p className="scenic-readable-strip text-sm">Checking your workspace…</p>
  );
}
function OwnedCsv({ owner, onChange }: { owner: string; onChange: () => Promise<void> }) {
  const [context, setContext] = useState<Context | null>(null),
    [open, setOpen] = useState(false),
    [error, setError] = useState(''),
    [receipt, setReceipt] = useState<Receipt | null>(null),
    [pending, setPending] = useState<string | null>(null),
    [checking, setChecking] = useState(false),
    [exporting, setExporting] = useState(false),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [notes, setNotes] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const a = new AbortController();
    void (async () => {
      try {
        const r = await fetch('/api/wealth/csv/context', { cache: 'no-store', signal: a.signal });
        if (!r.ok) throw Error();
        const c = csvContextSchema.parse(await r.json());
        if (!alive.current) return;
        setContext(c);
        setFrom(c.today.slice(0, 8) + '01');
        setTo(c.today);
        let id: string | null = null;
        try {
          id = sessionStorage.getItem(storeKey(owner));
        } catch {}
        if (id && z.string().uuid().safeParse(id).success) setPending(id);
      } catch {
        if (!a.signal.aborted)
          setError('CSV context is unavailable. No import or export is assumed.');
      }
    })();
    return () => {
      alive.current = false;
      a.abort();
    };
  }, [owner]);
  async function recover(id = pending) {
    if (!id) return;
    setChecking(true);
    setError('');
    try {
      const r = await fetch('/api/wealth/csv/imports?id=' + id, { cache: 'no-store' });
      if (!r.ok) throw Error();
      const data = await r.json();
      if (!alive.current) return;
      if (data) {
        setReceipt(csvReceiptSchema.parse(data));
        remember(owner, null);
        setPending(null);
        void onChange();
      } else
        setError(
          'Import is not confirmed. It may still be processing. Check again or deliberately review the same file; file-row and reference guards remain in place.',
        );
    } catch {
      if (alive.current)
        setError('Import receipt is unavailable. No payment or import is assumed.');
    } finally {
      if (alive.current) setChecking(false);
    }
  }
  async function exportCsv() {
    if (!context || exporting || isRestrictedPreview()) return;
    setExporting(true);
    setError('');
    try {
      const q = new URLSearchParams({ from, to, notes: String(notes) }),
        r = await fetch('/api/wealth/csv/export?' + q, { cache: 'no-store' });
      if (!r.ok || !r.headers.get('Content-Type')?.startsWith('text/csv')) throw Error();
      const blob = await r.blob();
      if (!alive.current) return;
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = `crystrack-ledger-${from}-${to}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (alive.current)
        setError(
          'Export is unavailable or exceeds its bounds. Choose up to 366 days and 10,000 entries; narrow the interval. Nothing is truncated or assumed exported.',
        );
    } finally {
      if (alive.current) setExporting(false);
    }
  }
  return (
    <section
      data-testid="csv-tools"
      aria-labelledby="csv-tools-title"
      className="space-y-4 min-w-0"
    >
      <GlassCard padding="md">
        <div
          data-testid="csv-reading-surface"
          className="rounded-xl border border-white/15 bg-slate-950/80 p-4 text-white"
        >
          <h2 id="csv-tools-title" className="text-xl font-semibold">
            CSV statement tools
          </h2>
          <p className="mt-2 text-sm text-slate-100">
            Bring reviewed NGN transactions into Wealth, or keep a complete copy of your ledger.
            Everyday tracking stays in Overview.
          </p>
          <p className="mt-2 text-sm text-slate-100">
            No automatic import. Your file is parsed in this browser; only explicitly selected,
            confirmed rows are saved. Historical imports earn no Crystal Shards and never confirm
            bills or expected money.
          </p>
          {context && (
            <p className="mt-2 text-sm">
              Saved scheduling timezone: {context.timezone} · {context.today}
            </p>
          )}
          <Button
            id="csv-import-button"
            className="mt-4"
            onClick={() => setOpen(true)}
            disabled={!context || Boolean(pending) || isRestrictedPreview()}
          >
            Import CSV
          </Button>
          <p className="mt-2 text-xs text-slate-200">
            UTF-8 CSV · up to 1 MiB / 500 transactions. These are supported formats, not a promise
            of compatibility with every bank or fintech exporter. Use only a trusted statement you
            intend to record.
          </p>
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-slate-950/95 p-3 text-sm text-amber-100">
              {error}
            </p>
          )}
          {pending && (
            <div className="mt-3 text-sm">
              <p>
                A previous confirmation needs its persisted receipt checked. No second import is
                assumed.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button id="csv-receipt-button" disabled={checking} onClick={() => void recover()}>
                  Check import receipt
                </Button>
                <Button
                  variant="ghost"
                  disabled={checking}
                  onClick={() => {
                    remember(owner, null);
                    setPending(null);
                    setError(
                      'Review the same file again. Already imported file rows and references will be flagged; do not rename the source to bypass them.',
                    );
                  }}
                >
                  Review a file again
                </Button>
              </div>
            </div>
          )}
          {receipt && (
            <p role="status" className="mt-3 text-sm text-cyan-100 tabular-nums">
              Confirmed import: {receipt.count} transactions · income {exactMoney(receipt.income)} ·
              expenses {exactMoney(receipt.expense)}. No spending shards added.
            </p>
          )}
        </div>
      </GlassCard>
      <GlassCard padding="md">
        <div className="rounded-xl border border-white/15 bg-slate-950/80 p-4 text-white">
          <h3 className="text-lg font-semibold">Export your ledger</h3>
          <p className="mt-2 text-sm text-slate-100">
            Inclusive saved-zone dates, all flow kinds, exact NGN and ISO instants. Up to 366 days /
            10,000 records; larger scopes fail clearly. Notes are off by default. Spreadsheet
            formulas are neutralized.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Export from
              <input
                className={control}
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Export through
              <input
                className={control}
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <label className="mt-3 flex min-h-10 items-center gap-3 text-sm">
            <input
              className="h-5 w-5 shrink-0"
              type="checkbox"
              checked={notes}
              onChange={(e) => setNotes(e.target.checked)}
            />
            Include private notes in my download
          </label>
          <Button
            className="mt-3"
            disabled={!context || !from || !to || from > to || exporting || isRestrictedPreview()}
            onClick={() => void exportCsv()}
          >
            {exporting ? 'Preparing complete export…' : 'Export CSV'}
          </Button>
          <p className="mt-2 text-xs text-slate-200">
            CSV is an archive of existing entries, including protected bill/import origins. Do not
            import it again as new transactions.
          </p>
        </div>
      </GlassCard>
      {open && context && (
        <ImportDialog
          context={context}
          onClose={() => {
            setOpen(false);
            void recover();
          }}
          onPending={(id) => {
            remember(owner, id);
            setPending(id);
          }}
          onConfirmed={(r) => {
            remember(owner, null);
            setPending(null);
            setReceipt(r);
            setOpen(false);
            void onChange();
            window.dispatchEvent(new Event('crystrack-activity-updated'));
          }}
        />
      )}
    </section>
  );
}
type Draft = { data: Record<string, unknown>; selected: boolean; initialIssue?: string };
function ImportDialog({
  context,
  onClose,
  onPending,
  onConfirmed,
}: {
  context: Context;
  onClose: () => void;
  onPending: (id: string) => void;
  onConfirmed: (r: Receipt) => void;
}) {
  const [text, setText] = useState(''),
    [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null),
    [delimiter, setDelimiter] = useState<Delimiter>(','),
    [map, setMap] = useState<Mapping>({}),
    [mode, setMode] = useState<'signed' | 'split'>('signed'),
    [convention, setConvention] = useState<DateConvention>('iso'),
    [source, setSource] = useState(''),
    [fileHash, setFileHash] = useState(''),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [review, setReview] = useState<CsvReview | null>(null),
    [reviewStale, setReviewStale] = useState(false),
    [error, setError] = useState(''),
    [working, setWorking] = useState(false),
    [intent, setIntent] = useState<Intent | null>(null),
    [page, setPage] = useState(0),
    [currencyConfirmed, setCurrencyConfirmed] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const generation = useRef(0),
    locked = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const frozen = working || Boolean(intent);
  const validations = useMemo(
    () =>
      drafts.map((d) =>
        d.initialIssue ||
        (typeof d.data.date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(d.data.date) &&
          d.data.date > context.today)
          ? csvRowSchema.safeParse({})
          : csvRowSchema.safeParse(d.data),
      ),
    [drafts, context.today],
  );
  const selected: CsvRow[] = drafts.flatMap((d, i) => {
    const v = validations[i];
    return d.selected && v.success ? [v.data] : [];
  });
  const invalidSelected = drafts.some((d, i) => d.selected && !validations[i].success);
  const mappingOk =
    parsed &&
    map.date !== undefined &&
    map.description !== undefined &&
    (!parsed.headers.some((h) => /^(currency|ccy|transaction currency)$/i.test(h.trim())) ||
      map.currency !== undefined) &&
    (mode === 'signed'
      ? map.amount !== undefined
      : map.debit !== undefined && map.credit !== undefined) &&
    new Set(Object.values(map).filter((v) => v !== undefined)).size ===
      Object.values(map).filter((v) => v !== undefined).length &&
    !(['amount', 'debit', 'credit'] as const).some(
      (k) => map[k] !== undefined && /balance/i.test(parsed.headers[map[k]!]),
    );
  const eligible =
    mappingOk &&
    currencyConfirmed &&
    selected.length > 0 &&
    !invalidSelected &&
    sourceKeySchema.safeParse(source).success;
  const proof = review ? new Map(review.rows.map((r) => [r.row, r])) : null;
  function invalidate() {
    generation.current++;
    setReview(null);
    setReviewStale(false);
    setConfirmed(false);
    setError('');
  }
  function rebuild(
    p: NonNullable<typeof parsed>,
    m: Mapping,
    kind: typeof mode,
    conv: DateConvention,
  ) {
    invalidate();
    setPage(0);
    setDrafts(
      p.rows.map((cells, i) => {
        try {
          return { data: mappedRow(cells, p.headers, m, kind, conv, i + 1), selected: false };
        } catch {
          const get = (k: keyof Mapping) => (m[k] === undefined ? '' : cells[m[k]!] || '');
          return {
            selected: false,
            initialIssue:
              'This mapped row needs correction. Review its date, direction, amount, currency and columns, then explicitly accept the corrected values.',
            data: {
              row: i + 1,
              date: get('date'),
              description: get('description'),
              amount: kind === 'signed' ? get('amount') : get('debit') || get('credit'),
              type:
                get('type') ||
                (kind === 'split' && get('credit') && !get('debit') ? 'income' : 'expense'),
              currency: observedCurrency(cells, p.headers, m),
              category: get('category') || 'Other',
              reference: get('reference') || null,
              account: get('account') || null,
              keepDuplicate: false,
            },
          };
        }
      }),
    );
  }
  async function fileChosen(file: File | undefined) {
    if (!file || frozen) return;
    invalidate();
    const fileGeneration = generation.current;
    setWorking(true);
    setParsed(null);
    setDrafts([]);
    setText('');
    setFileHash('');
    try {
      if (file.size > CSV_LIMITS.bytes || !file.name.toLowerCase().endsWith('.csv'))
        throw Error('Choose a UTF-8 .csv up to 1 MiB.');
      const bytes = await file.arrayBuffer(),
        raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        delim = detectDelimiter(raw),
        p = parseCsv(raw, delim),
        m = suggestMapping(p.headers),
        kind = m.debit !== undefined && m.credit !== undefined ? 'split' : 'signed';
      if (isLedgerArchive(p.headers)) {
        setError(
          'This CrysTrack ledger archive already represents recorded entries. Keep it for your records; do not import it as new money.',
        );
        return;
      }
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (n) =>
        n.toString(16).padStart(2, '0'),
      ).join('');
      if (!alive.current || generation.current !== fileGeneration) return;
      setText(raw);
      setFileHash(hash);
      setParsed(p);
      setDelimiter(delim);
      setMap(m);
      setMode(kind);
      setCurrencyConfirmed(false);
      rebuild(p, m, kind, convention);
    } catch {
      if (alive.current && generation.current === fileGeneration)
        setError(
          'CSV could not be read. Use valid UTF-8, quoting, matching columns and the 1 MiB / 500-row / 40-column limits. No rows were saved.',
        );
    } finally {
      if (alive.current) setWorking(false);
    }
  }
  function edit(i: number, key: string, value: unknown) {
    invalidate();
    setDrafts((ds) =>
      ds.map((d, j) => (j === i ? { ...d, data: { ...d.data, [key]: value } } : d)),
    );
  }
  async function check() {
    if (!eligible || frozen) return;
    const gen = generation.current;
    setReviewStale(true);
    setWorking(true);
    setError('');
    try {
      const payload = csvReviewRequestSchema.parse({
        source,
        fileHash,
        timezone: context.timezone,
        rows: selected,
      });
      const r = await fetch('/api/wealth/csv/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw Error();
      const v = csvReviewSchema.parse(await r.json());
      if (alive.current && generation.current === gen) {
        setReview(v);
        setReviewStale(false);
      }
    } catch {
      if (alive.current && generation.current === gen)
        setError(
          'Review is unavailable or contains unsupported/future rows. Check dates, source and saved timezone; no rows were saved.',
        );
    } finally {
      if (alive.current) setWorking(false);
    }
  }
  async function send(v: Intent) {
    if (locked.current || isRestrictedPreview()) return;
    locked.current = true;
    setWorking(true);
    setError('');
    setIntent(v);
    onPending(v.batchId);
    try {
      const r = await fetch('/api/wealth/csv/imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v),
      });
      if (!r.ok) throw Error();
      const ack = csvReceiptSchema.parse(await r.json());
      if (ack.batchId !== v.batchId || ack.count !== v.rows.length) throw Error();
      if (alive.current) onConfirmed(ack);
    } catch {
      if (alive.current)
        setError(
          'Import is not confirmed. Retry this exact selection or close and check its persisted receipt. No second batch is assumed.',
        );
    } finally {
      locked.current = false;
      if (alive.current) setWorking(false);
    }
  }
  const canConfirm =
    review &&
    !reviewStale &&
    eligible &&
    confirmed &&
    !review.rows.some(
      (r) =>
        r.duplicate || (r.possible > 0 && !selected.find((s) => s.row === r.row)?.keepDuplicate),
    );
  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o && !working) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const button = document.getElementById('csv-import-button') as HTMLButtonElement | null;
            if (button && !button.disabled) button.focus();
            else document.getElementById('csv-receipt-button')?.focus();
          }}
          onEscapeKeyDown={(e) => {
            if (working) e.preventDefault();
          }}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed left-1/2 top-[4dvh] z-[71] flex max-h-[92dvh] w-[calc(100vw_-_1rem)] max-w-[1400px] -translate-x-1/2 flex-col overflow-y-auto [&_button]:min-h-10 [&_button]:shrink-0 rounded-2xl border border-white/25 bg-slate-950/95 p-4 text-white shadow-xl sm:p-6"
        >
          <Dialog.Title className="text-xl font-semibold">Review a CSV statement</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-slate-200">
            Nothing is imported until you explicitly confirm. Import actual income/expenses only;
            savings, debts and internal transfers use their existing Wealth tools. Date-only rows
            use {context.timezone} midnight, not an invented bank payment time. Correct mistakes
            now; confirmed imports are immutable and cannot be undone here.
          </Dialog.Description>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="ghost" disabled={working} onClick={onClose}>
              {intent ? 'Close and check receipt' : 'Cancel import'}
            </Button>
          </div>
          {error && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-amber-200/30 bg-slate-950 p-3 text-sm text-amber-100"
            >
              {error}
            </p>
          )}
          {intent ? (
            <div className="mt-4">
              <p className="text-sm">
                The exact reviewed selection is retained in memory for safe retry. A refresh retains
                only its batch identifier for receipt recovery.
              </p>
              <Button className="mt-3" disabled={working} onClick={() => void send(intent)}>
                Retry exact import
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm">
                  Choose CSV
                  <input
                    data-testid="statement-file"
                    className={control}
                    disabled={frozen}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => void fileChosen(e.target.files?.[0])}
                  />
                </label>
                <label className="text-sm">
                  Statement source key
                  <input
                    className={control}
                    disabled={frozen}
                    aria-label="Statement source key"
                    aria-describedby="csv-source-help"
                    value={source}
                    placeholder="bank-current"
                    maxLength={60}
                    onChange={(e) => {
                      invalidate();
                      setSource(e.target.value);
                    }}
                  />
                  <span id="csv-source-help" className="text-xs text-slate-200">
                    Stable lowercase account key. Do not rename it to bypass duplicate references.
                  </span>
                </label>
                <label className="text-sm">
                  Date convention
                  <select
                    aria-label="Date convention"
                    className={control}
                    disabled={frozen}
                    value={convention}
                    onChange={(e) => {
                      const v = e.target.value as DateConvention;
                      setConvention(v);
                      if (parsed) rebuild(parsed, map, mode, v);
                    }}
                  >
                    <option value="iso">ISO only · choose DMY/MDY for slash dates</option>
                    <option value="dmy">Day / Month / Year</option>
                    <option value="mdy">Month / Day / Year</option>
                  </select>
                </label>
                <label className="text-sm">
                  Delimiter
                  <select
                    aria-label="Delimiter"
                    className={control}
                    disabled={!text || frozen}
                    value={delimiter}
                    onChange={(e) => {
                      const v = e.target.value as Delimiter;
                      invalidate();
                      setDelimiter(v);
                      try {
                        const p = parseCsv(text, v),
                          m = suggestMapping(p.headers);
                        setParsed(p);
                        setMap(m);
                        rebuild(p, m, mode, convention);
                      } catch {
                        setParsed(null);
                        setDrafts([]);
                        setError(
                          'This delimiter does not form a valid bounded CSV. Choose the correct delimiter.',
                        );
                      }
                    }}
                  >
                    {[
                      [',', 'Comma'],
                      [';', 'Semicolon'],
                      ['\t', 'Tab'],
                      ['|', 'Pipe'],
                    ].map(([v, n]) => (
                      <option key={n} value={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Amount layout
                  <select
                    aria-label="Amount layout"
                    className={control}
                    disabled={frozen}
                    value={mode}
                    onChange={(e) => {
                      const v = e.target.value as typeof mode;
                      const m = { ...map };
                      if (v === 'split') delete m.amount;
                      else {
                        delete m.debit;
                        delete m.credit;
                      }
                      setMap(m);
                      setMode(v);
                      if (parsed) rebuild(parsed, m, v, convention);
                    }}
                  >
                    <option value="signed">
                      Signed amount · negative expense, positive income
                    </option>
                    <option value="split">Separate Debit / Credit</option>
                  </select>
                </label>
              </div>
              {parsed && (
                <>
                  <h3 className="mt-5 text-lg font-semibold">Column mapping</h3>
                  <p className="mt-1 text-xs text-slate-200">
                    Changing mapping/date convention resets row corrections and selections. Balance
                    is ignored. Exported ledger archives must not be imported again.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {(
                      [
                        'date',
                        'description',
                        ...(mode === 'signed' ? ['amount'] : ['debit', 'credit']),
                        'type',
                        'currency',
                        'category',
                        'reference',
                        'account',
                        'balance',
                      ] as (keyof Mapping)[]
                    ).map((key) => (
                      <label key={key} className="text-sm">
                        Map {key}
                        <select
                          aria-label={'Map ' + key}
                          disabled={frozen}
                          className={control}
                          value={map[key] ?? ''}
                          onChange={(e) => {
                            const m = { ...map };
                            if (e.target.value === '') delete m[key];
                            else m[key] = Number(e.target.value);
                            setMap(m);
                            rebuild(parsed, m, mode, convention);
                          }}
                        >
                          <option value="">Not mapped</option>
                          {parsed.headers.map((h, i) => (
                            <option key={i} value={i}>
                              {i + 1}: {h}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-slate-200 break-words [overflow-wrap:anywhere]">
                    First-row mapping preview:{' '}
                    {parsed.headers.map((h, i) => `${h}: ${parsed.rows[0][i]}`).join(' · ')}
                  </p>
                  <label className="mt-4 flex min-h-10 items-center gap-3 text-sm">
                    <input
                      className="h-5 w-5 shrink-0"
                      type="checkbox"
                      checked={currencyConfirmed}
                      disabled={frozen}
                      onChange={(e) => {
                        invalidate();
                        setCurrencyConfirmed(e.target.checked);
                      }}
                    />
                    I have checked that this statement records NGN, not USD or another currency
                  </label>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      disabled={frozen || !currencyConfirmed || !mappingOk}
                      onClick={() => {
                        invalidate();
                        setDrafts((ds) =>
                          ds.map((d, i) => ({ ...d, selected: validations[i].success })),
                        );
                      }}
                    >
                      Select valid rows
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={frozen}
                      onClick={() => {
                        invalidate();
                        setDrafts((ds) => ds.map((d) => ({ ...d, selected: false })));
                      }}
                    >
                      Exclude all rows
                    </Button>
                    <p role="status" className="text-sm tabular-nums">
                      {drafts.length} total · {validations.filter((r) => r.success).length} valid ·{' '}
                      {validations.filter((r) => !r.success).length} invalid · {selected.length}{' '}
                      chosen
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {drafts.slice(page * 20, page * 20 + 20).map((d, offset) => {
                      const i = page * 20 + offset,
                        v = validations[i],
                        p = proof?.get(i + 1);
                      return (
                        <article
                          key={i}
                          aria-label={'Statement row ' + (i + 1)}
                          className="min-w-0 rounded-xl border border-white/20 bg-slate-950/95 p-4 text-sm"
                        >
                          <h4 className="font-semibold">Row {i + 1}</h4>
                          <label className="mt-2 flex min-h-10 items-center gap-3">
                            <input
                              type="checkbox"
                              className="h-5 w-5 shrink-0"
                              checked={d.selected}
                              disabled={frozen || !currencyConfirmed}
                              onChange={(e) => {
                                invalidate();
                                setDrafts((ds) =>
                                  ds.map((x, j) =>
                                    j === i ? { ...x, selected: e.target.checked } : x,
                                  ),
                                );
                              }}
                            />
                            Include row {i + 1}
                          </label>
                          <p className="text-xs text-slate-200">
                            {v.success
                              ? 'Valid NGN row'
                              : d.initialIssue ||
                                (typeof d.data.date === 'string' &&
                                /^\d{4}-\d{2}-\d{2}$/.test(d.data.date) &&
                                d.data.date > context.today
                                  ? 'Future date: only recorded transactions can be imported.'
                                  : v.error.issues[0]?.message) ||
                                'Review this row'}{' '}
                            · {String(d.data.currency)}
                            {d.data.reference ? '' : ' · No reference: duplicate proof is limited'}
                          </p>
                          {d.initialIssue && (
                            <Button
                              className="mt-2"
                              variant="ghost"
                              disabled={frozen || !csvRowSchema.safeParse(d.data).success}
                              onClick={() => {
                                invalidate();
                                setDrafts((ds) =>
                                  ds.map((x, j) =>
                                    j === i
                                      ? { ...x, initialIssue: undefined, selected: false }
                                      : x,
                                  ),
                                );
                              }}
                            >
                              Use my corrected row values
                            </Button>
                          )}
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {(
                              ['date', 'description', 'amount', 'reference', 'account'] as const
                            ).map((key) => (
                              <label key={key}>
                                {key === 'amount' ? 'Amount NGN' : key}
                                {key === 'description' ? (
                                  <textarea
                                    aria-label="description"
                                    className={control + ' resize-y'}
                                    rows={2}
                                    disabled={frozen}
                                    value={String(d.data.description ?? '')}
                                    onChange={(e) => edit(i, 'description', e.target.value)}
                                  />
                                ) : (
                                  <input
                                    aria-label={key === 'amount' ? 'Amount NGN' : key}
                                    className={control + (key === 'amount' ? ' tabular-nums' : '')}
                                    disabled={frozen}
                                    value={String(d.data[key] ?? '')}
                                    onChange={(e) =>
                                      edit(
                                        i,
                                        key,
                                        e.target.value ||
                                          (['reference', 'account'].includes(key) ? null : ''),
                                      )
                                    }
                                  />
                                )}
                              </label>
                            ))}
                            <label>
                              Transaction type
                              <select
                                aria-label="Transaction type"
                                className={control}
                                disabled={frozen}
                                value={String(d.data.type)}
                                onChange={(e) => edit(i, 'type', e.target.value)}
                              >
                                <option value="expense">Expense</option>
                                <option value="income">Income</option>
                              </select>
                            </label>
                            <label>
                              Category
                              <select
                                aria-label="Category"
                                className={control}
                                disabled={frozen}
                                value={String(d.data.category)}
                                onChange={(e) => edit(i, 'category', e.target.value)}
                              >
                                {budgetCategories.map((c) => (
                                  <option key={c}>{c}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                          {p && (
                            <div className="mt-3 rounded-lg border border-white/20 p-2">
                              <p>
                                {p.duplicate
                                  ? 'Already imported file row / duplicate reference — exclude it'
                                  : p.possible
                                    ? `${p.possible} possible duplicate(s)${p.billMatch ? ' including a protected bill payment' : ''}. Exclude already-counted payments.`
                                    : 'No duplicate evidence found; this is not a bank-authenticity guarantee.'}
                              </p>
                              {p.possible > 0 && !p.duplicate && (
                                <label className="mt-2 flex min-h-10 items-center gap-3">
                                  <input
                                    type="checkbox"
                                    className="h-5 w-5 shrink-0"
                                    checked={Boolean(d.data.keepDuplicate)}
                                    onChange={(e) => {
                                      generation.current++;
                                      setConfirmed(false);
                                      setReviewStale(true);
                                      setDrafts((ds) =>
                                        ds.map((x, j) =>
                                          j === i
                                            ? {
                                                ...x,
                                                data: {
                                                  ...x.data,
                                                  keepDuplicate: e.target.checked,
                                                },
                                              }
                                            : x,
                                        ),
                                      );
                                    }}
                                  />
                                  Keep this intended transaction despite the warning; check selected
                                  rows again
                                </label>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      disabled={page === 0 || frozen}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous rows
                    </Button>
                    <span className="text-sm">
                      Page {page + 1} of {Math.ceil(drafts.length / 20)} · all rows are available
                    </span>
                    <Button
                      variant="ghost"
                      disabled={(page + 1) * 20 >= drafts.length || frozen}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next rows
                    </Button>
                  </div>
                  <Button
                    className="mt-5"
                    disabled={!eligible || frozen}
                    onClick={() => void check()}
                  >
                    {working ? 'Checking…' : 'Check selected rows'}
                  </Button>
                  {review && (
                    <div className="mt-4 rounded-xl border border-cyan-200/30 bg-slate-950/95 p-4">
                      <h3 className="font-semibold">Authoritative duplicate review</h3>
                      {reviewStale && (
                        <p role="status" className="mt-2 text-sm text-amber-100">
                          Review changed. Check selected rows again before confirming.
                        </p>
                      )}
                      <p className="mt-2 tabular-nums text-sm">
                        {review.rows.length} chosen ·{' '}
                        {review.rows.filter((r) => r.duplicate).length} blocked duplicates ·{' '}
                        {review.rows.filter((r) => r.possible > 0).length} possible duplicates ·
                        income {exactMoney(review.income)} · expenses {exactMoney(review.expense)}
                      </p>
                      <p className="mt-2 text-sm">
                        {review.today} · {review.timezone}. Nothing saved yet. Exclude hard
                        duplicates; keeping a fuzzy match needs its row acknowledgement and another
                        check. No automatic bill/expected-money linking.
                      </p>
                      <label className="mt-3 flex min-h-10 items-center gap-3 text-sm">
                        <input
                          className="h-5 w-5 shrink-0"
                          type="checkbox"
                          checked={confirmed}
                          onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        I reviewed every chosen row and want these actual NGN entries added once
                      </label>
                      <Button
                        className="mt-3"
                        disabled={!canConfirm || frozen}
                        onClick={() => {
                          if (!review) return;
                          const v = csvImportRequestSchema.parse({
                            batchId: crypto.randomUUID(),
                            source,
                            fileHash,
                            timezone: context.timezone,
                            rows: selected,
                            reviewToken: review.token,
                            confirmed: true,
                          });
                          void send(v);
                        }}
                      >
                        Confirm import
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
