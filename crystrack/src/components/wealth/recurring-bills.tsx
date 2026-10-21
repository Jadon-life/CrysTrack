'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAuth } from '@/components/layout/auth-provider';
import { GlassCard } from '@/components/shared/glass-card';
import { CalmDisclosure } from '@/components/shared/calm-disclosure';
import { Button } from '@/components/ui/button';
import {
  billMutationResultSchema,
  billViewSchema,
  billFieldsSchema,
  billWriteSchema,
  type BillView,
  type BillItem,
  type BillWrite,
  type BillFields,
  type BillOccurrence,
} from '@/lib/bills';
import { budgetCategories } from '@/lib/budgets';
import { exactMoney } from '@/lib/budget-money';
import { isRestrictedPreview } from '@/lib/preview/mode';
import { latestDailyRead, nextDailyBoundary } from '@/lib/today-streak';
import { moneyPresentation, editableMoney, manualMoneyHint } from '@/lib/money-presentation';
import type { ExchangeRateSnapshot } from '@/lib/wealth';
const input =
  'mt-1 min-h-10 w-full [color-scheme:dark] rounded-xl border border-white/25 bg-slate-950/90 px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200';
const states = {
  due_soon: 'Due soon · payment not confirmed',
  overdue: 'Overdue · payment not confirmed',
  planned: 'Planned · payment not confirmed',
  paid: 'Paid',
  not_confirmed: 'Not confirmed',
  canceled: 'Canceled plan',
};
type Editor = {
  action: BillWrite['action'];
  id: string;
  revision: number;
  timezone: string;
  occurrence?: BillOccurrence;
};
interface Props {
  currency: 'NGN' | 'USD';
  rate: ExchangeRateSnapshot | null;
  ledgerRevision: number;
  onChange: () => Promise<void>;
}
export function RecurringBills(props: Props) {
  const { user } = useAuth();
  return user ? (
    <OwnedBills key={user.id} {...props} />
  ) : (
    <p className="scenic-readable-strip text-sm">Checking your workspace…</p>
  );
}
function OwnedBills({ currency, rate, ledgerRevision, onChange }: Props) {
  const [selected, setSelected] = useState<string | null>(null),
    [page, setPage] = useState(0),
    [token, setToken] = useState<string | null>(null),
    [version, setVersion] = useState(0);
  const [view, setView] = useState<BillView | null>(null),
    [busy, setBusy] = useState(true),
    [writing, setWriting] = useState(false),
    [error, setError] = useState(''),
    [writeError, setWriteError] = useState(''),
    [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null),
    [fields, setFields] = useState<BillFields>({
      title: '',
      category: 'Subscriptions',
      merchant: '',
      amount: '',
      frequency: 'monthly',
      firstDue: '',
      endDate: null,
      reminderEnabled: false,
    }),
    [actual, setActual] = useState(''),
    [uncertain, setUncertain] = useState<BillWrite | null>(null);
  const reads = useRef(latestDailyRead()),
    mounted = useRef(true),
    locked = useRef(false),
    returnFocus = useRef<HTMLElement | null>(null),
    focusAfter = useRef<string | null>(null);
  const reload = useCallback(() => {
    setBusy(true);
    setView(null);
    setPage(0);
    setToken(null);
    setVersion((v) => v + 1);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const session = reads.current,
      request = session.start();
    void (async () => {
      await Promise.resolve();
      if (!request.isCurrent()) return;
      setBusy(true);
      setView(null);
      setError('');
      try {
        const query = new URLSearchParams({ page: String(page) });
        if (selected) query.set('id', selected);
        if (token) query.set('revision', token);
        const r = await fetch('/api/wealth/bills?' + query, {
          cache: 'no-store',
          signal: request.signal,
        });
        if (r.status === 409 && page > 0) {
          if (request.isCurrent()) {
            setNotice('Plans changed. We’re refreshing the first page.');
            reload();
          }
          return;
        }
        if (!r.ok)
          throw Error('Bill records are unavailable. No payment or planned totals are assumed.');
        const data = billViewSchema.parse(await r.json());
        if (request.isCurrent()) setView(data);
      } catch (e) {
        if (request.isCurrent())
          setError(
            e instanceof Error && e.message.startsWith('Bill records')
              ? e.message
              : 'Bill records are not confirmed. Please refresh.',
          );
      } finally {
        if (request.isCurrent()) setBusy(false);
      }
    })();
    return () => session.cancel();
  }, [selected, page, token, version, ledgerRevision, reload]);
  useEffect(() => {
    if (isRestrictedPreview()) return;
    const update = () => {
      if (document.visibilityState !== 'hidden') reload();
    };
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('crystrack-activity-updated', update);
    return () => {
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('crystrack-activity-updated', update);
    };
  }, [reload]);
  useEffect(() => {
    if (!view || isRestrictedPreview()) return;
    const timer = setTimeout(reload, nextDailyBoundary(view.timezone));
    return () => clearTimeout(timer);
  }, [view, reload]);
  useEffect(() => {
    if (busy || writing || !focusAfter.current) return;
    const node = document.getElementById(focusAfter.current) as HTMLButtonElement | null;
    if (node && !node.disabled) node.focus();
    else document.getElementById('bill-refresh')?.focus();
    focusAfter.current = null;
  }, [busy, writing, view]);
  const money = (value: string) => moneyPresentation(value, currency, rate?.usdNgn).text;
  const open = (
    button: HTMLElement,
    action: Editor['action'],
    b?: BillItem,
    o?: BillOccurrence,
  ) => {
    if (!view) return;
    returnFocus.current = button;
    setWriteError('');
    setEditor({
      action,
      id: b?.id ?? crypto.randomUUID(),
      revision: b?.revision ?? 0,
      timezone: view.timezone,
      occurrence: o,
    });
    setFields(
      b
        ? {
            title: b.title,
            category: b.category,
            merchant: b.merchant,
            amount: editableMoney(b.amount),
            frequency: b.frequency,
            firstDue: b.firstDue,
            endDate: b.endDate,
            reminderEnabled: b.reminderEnabled,
          }
        : {
            title: '',
            category: 'Subscriptions',
            merchant: null,
            amount: '',
            frequency: 'monthly',
            firstDue: view.today,
            endDate: null,
            reminderEnabled: false,
          },
    );
    setActual(o ? editableMoney(o.expected) : '');
  };
  const close = () => {
    if (!locked.current) {
      setEditor(null);
      setWriteError('');
    }
  };
  const submit = async (intent: BillWrite) => {
    if (locked.current || isRestrictedPreview()) return;
    locked.current = true;
    focusAfter.current = 'bill-edit-' + intent.id;
    setWriting(true);
    setWriteError('');
    let ambiguous = true;
    try {
      const r = await fetch('/api/wealth/bills', {
        method: intent.action === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intent),
      });
      if (!r.ok) {
        ambiguous = r.status >= 500;
        throw Error(
          r.status === 409
            ? 'This bill or scheduling context changed. Refresh and review before continuing.'
            : 'This change is not confirmed. Review the refreshed records.',
        );
      }
      const ack = billMutationResultSchema.parse(await r.json());
      if (
        ack.id !== intent.id ||
        ack.revision <= intent.revision ||
        (intent.action === 'pay' && !ack.entryId)
      )
        throw Error(
          'The response is not confirmed. Review the refreshed records or retry this exact action.',
        );
      ambiguous = false;
      if (mounted.current) {
        setEditor(null);
        setUncertain(null);
        setNotice(
          intent.action === 'pay'
            ? 'Payment confirmed from its expense record. It was recorded once; no spending shards were added.'
            : 'Bill plan saved. No money was automatically deducted.',
        );
        if (intent.action === 'create') setSelected(intent.id);
      }
    } catch (e) {
      if (mounted.current) {
        setEditor(null);
        setUncertain(ambiguous ? intent : null);
        setWriteError(
          e instanceof Error && /^(This bill|This change|The response)/.test(e.message)
            ? e.message
            : 'Confirmation was interrupted. Payment is not confirmed; review refreshed records or retry this exact action.',
        );
      }
    } finally {
      locked.current = false;
      if (mounted.current) {
        setWriting(false);
        reload();
        if (intent.action === 'pay') {
          void onChange();
          window.dispatchEvent(new Event('crystrack-activity-updated'));
        }
      }
    }
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editor || !view) return;
    let values: BillWrite['fields'] = {};
    if (editor.action === 'create' || editor.action === 'edit') {
      const parsed = billFieldsSchema.safeParse(fields);
      if (!parsed.success) {
        setWriteError(
          'Check the title, category, calendar dates and positive NGN amount with at most two decimals.',
        );
        return;
      }
      values = parsed.data;
    } else if (editor.action === 'pay') {
      values = {
        occurrenceId: editor.occurrence!.id,
        occurrenceRevision: editor.occurrence!.revision,
        actualAmount: actual,
      };
    }
    const candidate = { ...editor, requestId: crypto.randomUUID(), fields: values };
    delete (candidate as Partial<Editor>).occurrence;
    // Full validation is repeated by the API and transaction; never coerce money to Number.
    const parsed = billWriteSchema.safeParse(candidate);
    if (!parsed.success) {
      setWriteError('Review the positive NGN amount and bill details before confirming.');
      return;
    }
    void submit(parsed.data);
  };
  const canWrite = !busy && !writing && !uncertain && !isRestrictedPreview();
  return (
    <section
      data-testid="recurring-bills"
      aria-labelledby="bills-heading"
      className="space-y-4 min-w-0"
    >
      <GlassCard padding="md">
        <div
          data-testid="bill-reading-surface"
          className="rounded-xl border border-white/15 bg-slate-950/80 p-4"
        >
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 id="bills-heading" className="text-xl font-semibold text-white">
                Bills & subscriptions
              </h2>

            </div>
            <div className="flex flex-wrap gap-2">
              <Button id="bill-refresh" variant="ghost" onClick={reload} disabled={writing}>
                Refresh bills
              </Button>
              <Button
                disabled={!view || !canWrite}
                onClick={(e) => open(e.currentTarget, 'create')}
              >
                Add bill
              </Button>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-100">Bills never auto-charge. Mark as paid opens a confirmation; only confirmed payments record an expense.</p>
          {view && (
            <>
              <p className="mt-2 text-sm text-white">
                {view.today} · {view.timezone}
              </p>
              <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm tabular-nums text-white">
                <div>
                  <dt>Next 7 days · planned</dt>
                  <dd className="font-semibold">{money(view.plans.seven)}</dd>
                </div>
                <div>
                  <dt>Next 30 days · planned</dt>
                  <dd className="font-semibold">{money(view.plans.thirty)}</dd>
                </div>
                <div>
                  <dt>Overdue · not confirmed</dt>
                  <dd>{view.plans.overdue}</dd>
                </div>
              </dl>
            </>
          )}
          <CalmDisclosure title="How bill plans work" description="Forecasts, month-end dates and payment history" className="mt-3" testId="bill-planning-help">
          <p className="mt-3 text-sm text-slate-100">
            No automatic charges. Plans below are not added to Overview’s safe-to-spend or month-end
            forecast, which uses Expected money. Keep one planning source for each obligation; don’t
            also confirm the same payment there.
          </p>
          <p className="mt-3 text-xs text-slate-200">
            Due records extend 30 days ahead. Month-end dates clamp then return to the original day.
            Missed payments stay open. Cancel is permanent; paid entries stay recorded. Record only
            actual refunds separately in Wealth.
          </p>
          </CalmDisclosure>
          <p role="status" className="mt-2 text-sm text-cyan-100">
            {busy ? 'Checking authoritative plans and payment proof…' : notice}
          </p>
          {(error || writeError) && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-amber-200/30 bg-slate-950/90 p-3 text-sm text-amber-100"
            >
              {error || writeError}
            </p>
          )}
          {uncertain && (
            <div className="mt-3 text-sm text-white">
              <p>Confirmation was interrupted. No second payment is assumed.</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Button disabled={writing} onClick={() => void submit(uncertain)}>
                  Retry exact bill action
                </Button>
                <Button
                  variant="ghost"
                  disabled={!view || writing}
                  onClick={() => {
                    setUncertain(null);
                    setWriteError('');
                  }}
                >
                  Use refreshed bill records
                </Button>
              </div>
            </div>
          )}
        </div>
      </GlassCard>
      {view && (
        <>
          {selected && (
            <Button
              variant="ghost"
              disabled={writing}
              onClick={() => {
                setSelected(null);
                reload();
              }}
            >
              All bills
            </Button>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {view.items.map((b) => (
              <GlassCard key={b.id} padding="md">
                <article
                  aria-label={b.title + ' bill'}
                  className="rounded-xl border border-white/15 bg-slate-950/80 p-4 text-white"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <h3 className="text-base font-semibold break-words">{b.title}</h3>
                    <span className="text-xs">{b.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-200 break-words">
                    {b.category} · {b.frequency}
                    {b.merchant ? ' · ' + b.merchant : ''}
                  </p>
                  <p className="mt-3 text-xl tabular-nums font-semibold">
                    {money(b.next?.expected ?? b.amount)}{' '}
                    <span className="text-xs font-normal">
                      {b.next ? 'expected for this due date' : 'recurrence estimate'}
                    </span>
                  </p>
                  {b.next && b.next.expected !== b.amount && (
                    <p className="mt-1 text-sm tabular-nums">
                      Future recurrence estimate: {money(b.amount)}
                    </p>
                  )}
                  <p className="mt-2 text-sm">
                    {b.next
                      ? 'Next due ' + b.next.dueDay + ' · ' + states[b.next.status]
                      : 'No further due plans in this window.'}
                  </p>
                  <p className="mt-1 text-xs text-slate-200">
                    {b.paidCount} confirmed payments ·{' '}
                    {b.reminderEnabled
                      ? 'Reminders requested; delivery not confirmed'
                      : 'Reminders off'}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {b.status !== 'canceled' && (
                      <>
                        <Button
                          id={'bill-edit-' + b.id}
                          aria-label={'Edit ' + b.title}
                          variant="ghost"
                          disabled={!canWrite}
                          onClick={(e) => open(e.currentTarget, 'edit', b)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={!canWrite}
                          onClick={(e) =>
                            open(e.currentTarget, b.status === 'active' ? 'pause' : 'resume', b)
                          }
                          aria-label={(b.status === 'active' ? 'Pause ' : 'Resume ') + b.title}
                        >
                          {b.status === 'active' ? 'Pause' : 'Resume'}
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={!canWrite}
                          onClick={(e) => open(e.currentTarget, 'cancel', b)}
                          aria-label={'Cancel ' + b.title}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                    {b.status === 'active' &&
                      b.next &&
                      ['overdue', 'due_soon', 'planned'].includes(b.next.status) && (
                        <Button
                          disabled={!canWrite}
                          onClick={(e) => open(e.currentTarget, 'pay', b, b.next!)}
                          aria-label={'Mark ' + b.title + ' as paid'}
                        >
                          Mark as paid
                        </Button>
                      )}
                    {!selected && (
                      <Button
                        variant="ghost"
                        disabled={writing}
                        onClick={() => {
                          setSelected(b.id);
                          reload();
                        }}
                        aria-label={'Due history: ' + b.title}
                      >
                        Due history
                      </Button>
                    )}
                  </div>
                </article>
              </GlassCard>
            ))}
          </div>
          {view.items.length === 0 && (
            <GlassCard padding="md">
              <p className="text-sm text-white">
                No recurring bills yet. Add one when it helps; nothing will be charged
                automatically.
              </p>
            </GlassCard>
          )}
          {selected && (
            <GlassCard padding="md">
              <div className="rounded-xl bg-slate-950/85 p-4 text-white">
                <h3 className="text-lg font-semibold">Due & payment history</h3>
                <ul className="mt-3 divide-y divide-white/15">
                  {view.occurrences.map((o) => (
                    <li key={o.id} className="py-3 text-sm">
                      <p>
                        {o.dueDay} · {states[o.status]} ·{' '}
                        <span className="tabular-nums">{money(o.actual ?? o.expected)}</span>
                      </p>
                      <p className="text-xs text-slate-200">
                        {o.title} · {o.timezone}
                        {o.paidAt
                          ? ' · Recorded ' +
                            new Intl.DateTimeFormat('en-GB', {
                              timeZone: o.timezone,
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }).format(new Date(o.paidAt))
                          : ''}
                      </p>
                    </li>
                  ))}
                </ul>
                {!view.occurrences.length && (
                  <p className="text-sm">No captured due records in this window.</p>
                )}
              </div>
            </GlassCard>
          )}
          <div className="scenic-readable-strip flex flex-wrap gap-3 justify-between items-center text-sm">
            <Button
              variant="ghost"
              disabled={busy || writing || page === 0}
              onClick={() => {
                setToken(view.revision);
                setPage((p) => p - 1);
              }}
            >
              Previous bills page
            </Button>
            <p>
              Page {page + 1} · up to 20 {selected ? 'due records' : 'bills'}
            </p>
            <Button
              variant="ghost"
              disabled={busy || writing || !view.hasMore}
              onClick={() => {
                setToken(view.revision);
                setPage((p) => p + 1);
              }}
            >
              More bills
            </Button>
          </div>
        </>
      )}
      {editor && (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" />
            <Dialog.Content
              onEscapeKeyDown={(e) => {
                if (writing) e.preventDefault();
              }}
              onInteractOutside={(e) => {
                if (writing) e.preventDefault();
              }}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                if (returnFocus.current?.isConnected) returnFocus.current.focus();
                else document.getElementById('bill-refresh')?.focus();
              }}
              className="fixed left-1/2 top-1/2 z-[71] max-h-[90dvh] w-[calc(100vw_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/25 bg-slate-950/95 p-6 text-white shadow-xl focus:outline-none"
            >
              <Dialog.Title className="text-lg font-semibold">
                {editor.action === 'create'
                  ? 'Add bill'
                  : editor.action === 'edit'
                    ? 'Edit bill'
                    : editor.action === 'pay'
                      ? 'Confirm actual payment'
                      : editor.action === 'cancel'
                        ? 'Cancel future bill plans'
                        : editor.action === 'pause'
                          ? 'Pause bill plans'
                          : 'Resume bill plans'}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-slate-200">
                {editor.action === 'pay'
                  ? 'Confirm only money you have actually paid. One expense will be recorded at server payment time. No spending shards.'
                  : editor.action === 'cancel'
                    ? 'Cancel is permanent. Unpaid plans stop; paid history and expenses stay intact.'
                    : 'Bill definitions are plans, not automatic charges. Saved scheduling timezone: ' +
                      editor.timezone}
              </Dialog.Description>
              <form onSubmit={save} className="mt-4 space-y-3">
                {(editor.action === 'create' || editor.action === 'edit') && (
                  <>
                    <label className="block text-sm">
                      Bill title
                      <input
                        autoFocus
                        required
                        maxLength={120}
                        value={fields.title}
                        onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
                        className={input}
                      />
                    </label>
                    <label className="block text-sm">
                      Category
                      <select
                        aria-label="Category"
                        value={fields.category}
                        onChange={(e) => setFields((f) => ({ ...f, category: e.target.value }))}
                        className={input}
                      >
                        {budgetCategories.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      Merchant (optional)
                      <input
                        maxLength={100}
                        value={fields.merchant ?? ''}
                        onChange={(e) =>
                          setFields((f) => ({ ...f, merchant: e.target.value || null }))
                        }
                        className={input}
                      />
                    </label>
                    <label className="block text-sm">
                      Expected amount (NGN)
                      <input
                        required
                        inputMode="decimal"
                        placeholder="e.g. 2500"
                        value={fields.amount}
                        onChange={(e) => setFields((f) => ({ ...f, amount: e.target.value }))}
                        className={input + ' tabular-nums'}
                      />
                    </label>
                    <p className="text-xs text-slate-200">{manualMoneyHint}</p>
                    <label className="block text-sm">
                      Recurrence
                      <select
                        aria-label="Recurrence"
                        value={fields.frequency}
                        onChange={(e) =>
                          setFields((f) => ({
                            ...f,
                            frequency: e.target.value as BillFields['frequency'],
                          }))
                        }
                        className={input}
                      >
                        {['weekly', 'monthly', 'quarterly', 'yearly'].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      First due date
                      <input
                        required
                        type="date"
                        value={fields.firstDue}
                        onChange={(e) => setFields((f) => ({ ...f, firstDue: e.target.value }))}
                        className={input}
                      />
                    </label>
                    <label className="block text-sm">
                      End date (optional)
                      <input
                        type="date"
                        value={fields.endDate ?? ''}
                        onChange={(e) =>
                          setFields((f) => ({ ...f, endDate: e.target.value || null }))
                        }
                        className={input}
                      />
                    </label>
                    <label className="flex min-h-10 items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={fields.reminderEnabled}
                        onChange={(e) =>
                          setFields((f) => ({ ...f, reminderEnabled: e.target.checked }))
                        }
                        className="h-5 w-5"
                      />
                      Remind me at 09:00 on the due day via my default Push/Telegram channels
                    </label>
                    <p className="text-xs text-slate-200">
                      DND applies. Missing or ambiguous delivery is not confirmed and is not
                      automatically retried. Schedule changes must start tomorrow or later; past due
                      snapshots stay intact.
                    </p>
                  </>
                )}
                {editor.action === 'pay' && (
                  <>
                    <p className="text-sm">
                      Due {editor.occurrence!.dueDay} · {editor.occurrence!.title} · expected{' '}
                      {exactMoney(editor.occurrence!.expected)} NGN
                    </p>
                    <label className="block text-sm">
                      Actual amount paid (NGN)
                      <input
                        autoFocus
                        required
                        inputMode="decimal"
                        value={actual}
                        onChange={(e) => setActual(e.target.value)}
                        className={input + ' tabular-nums'}
                      />
                    </label>
                    <label className="flex min-h-10 items-center gap-3 text-sm">
                      <input type="checkbox" required className="h-5 w-5" />I have actually paid
                      this bill
                    </label>
                    <p className="text-xs text-slate-200">
                      Payment history cannot be undone here. Record only a genuine refund
                      separately; do not confirm the same payment in Expected money.
                    </p>
                  </>
                )}
                {writeError && (
                  <p role="alert" className="text-sm text-amber-100">
                    {writeError}
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="ghost" disabled={writing} onClick={close}>
                    Keep current plan
                  </Button>
                  <Button type="submit" disabled={writing || busy || !view || Boolean(uncertain)}>
                    {writing
                      ? 'Confirming…'
                      : editor.action === 'pay'
                        ? 'Confirm paid expense'
                        : editor.action === 'cancel'
                          ? 'Cancel bill permanently'
                          : editor.action === 'pause'
                            ? 'Pause bill'
                            : editor.action === 'resume'
                              ? 'Resume bill'
                              : 'Save bill'}
                  </Button>
                </div>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </section>
  );
}
