'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAuth } from '@/components/layout/auth-provider';
import { GlassCard } from '@/components/shared/glass-card';
import { Button } from '@/components/ui/button';
import { isRestrictedPreview } from '@/lib/preview/mode';
import {
  budgetViewSchema,
  budgetSetSchema,
  monthLabel,
  shiftMonth,
  type BudgetView,
  type CategoryBudget,
  type BudgetSet,
} from '@/lib/budgets';
import { budgetSignal, progressWidth } from '@/lib/budget-money';
import { latestDailyRead, nextDailyBoundary } from '@/lib/today-streak';
import { moneyPresentation, editableMoney, manualMoneyHint } from '@/lib/money-presentation';
import type { ExchangeRateSnapshot } from '@/lib/wealth';
const inputClass =
  'min-h-10 w-full rounded-xl border border-white/25 bg-slate-950/80 px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200';
type Intent = {
  method: 'POST' | 'PATCH' | 'DELETE';
  body: Omit<BudgetSet, 'limit'> & { limit?: string };
};
export function MonthlyBudgets({
  currency,
  rate,
  ledgerRevision,
}: {
  currency: 'NGN' | 'USD';
  rate: ExchangeRateSnapshot | null;
  ledgerRevision: number;
}) {
  const { user } = useAuth();
  return user ? (
    <OwnedBudgets key={user.id} currency={currency} rate={rate} ledgerRevision={ledgerRevision} />
  ) : (
    <p className="scenic-readable-strip text-sm">Checking your workspace…</p>
  );
}
function OwnedBudgets({
  currency,
  rate,
  ledgerRevision,
}: {
  currency: 'NGN' | 'USD';
  rate: ExchangeRateSnapshot | null;
  ledgerRevision: number;
}) {
  const [month, setMonth] = useState<string | null>(null),
    [generation, setGeneration] = useState(0);
  const [view, setView] = useState<BudgetView | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [writeError, setWriteError] = useState(''),
    [notice, setNotice] = useState('');
  const [editorContext, setEditorContext] = useState<{ month: string; timezone: string } | null>(
    null,
  );
  const [editor, setEditor] = useState<CategoryBudget | null>(null),
    [limit, setLimit] = useState(''),
    [removing, setRemoving] = useState(false),
    [writing, setWriting] = useState(false);
  const [uncertain, setUncertain] = useState<Intent | null>(null);
  const reads = useRef(latestDailyRead()),
    mounted = useRef(true),
    locked = useRef(false),
    restoreFocus = useRef<HTMLElement | null>(null);
  const focusAfterRead = useRef<string | null>(null);
  const reload = useCallback(() => {
    setBusy(true);
    setView(null);
    setGeneration((g) => g + 1);
  }, []);
  useEffect(() => {
    if (busy || writing || !focusAfterRead.current) return;
    const action = document.getElementById(focusAfterRead.current) as HTMLButtonElement | null;
    if (action && !action.disabled) action.focus();
    else document.getElementById('budget-refresh')?.focus();
    focusAfterRead.current = null;
  }, [busy, writing, view]);
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
        const response = await fetch('/api/wealth/budgets' + (month ? '?month=' + month : ''), {
          cache: 'no-store',
          signal: request.signal,
        });
        if (!response.ok)
          throw Error(
            'Budgets are unavailable. Refresh when you’re ready; no spending totals are assumed.',
          );
        const data = budgetViewSchema.parse(await response.json());
        if (request.isCurrent()) setView(data);
      } catch (e) {
        if (request.isCurrent())
          setError(
            e instanceof Error && e.message.startsWith('Budgets are')
              ? e.message
              : 'Budget evidence could not be verified. Please refresh.',
          );
      } finally {
        if (request.isCurrent()) setBusy(false);
      }
    })();
    return () => session.cancel();
  }, [month, generation, ledgerRevision]);
  useEffect(() => {
    if (isRestrictedPreview()) return;
    const refresh = () => {
      if (document.visibilityState !== 'hidden') reload();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('crystrack-activity-updated', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('crystrack-activity-updated', refresh);
    };
  }, [reload]);
  useEffect(() => {
    if (!view || isRestrictedPreview()) return;
    const timer = setTimeout(reload, nextDailyBoundary(view.timezone));
    return () => clearTimeout(timer);
  }, [view, reload]);
  const money = (value: string) => moneyPresentation(value, currency, rate?.usdNgn).text;
  const close = () => {
    if (locked.current) return;
    setEditor(null);
    setWriteError('');
  };
  const submit = async (intent: Intent) => {
    if (locked.current || isRestrictedPreview()) return;
    focusAfterRead.current = 'budget-action-' + intent.body.category;
    locked.current = true;
    setWriting(true);
    setNotice('');
    setWriteError('');
    let ambiguous = true;
    try {
      const response = await fetch('/api/wealth/budgets', {
        method: intent.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intent.body),
      });
      ambiguous = response.status >= 500;
      if (!response.ok)
        throw Error(
          response.status === 409
            ? 'This budget or month changed. Refresh and review before trying again.'
            : 'The change was not confirmed. Review the refreshed budget before continuing.',
        );
      await response.json();
      if (mounted.current) {
        setUncertain(null);
        setEditor(null);
        setNotice(
          intent.method === 'DELETE'
            ? 'Limit removed. Your expenses and savings are unchanged.'
            : 'Limit saved. Spending stays flexible; budgets never block a transaction.',
        );
      }
    } catch (e) {
      if (mounted.current) {
        setUncertain(ambiguous ? intent : null);
        setWriteError(
          e instanceof Error ? e.message : 'Confirmation was interrupted. Refresh before retrying.',
        );
        setEditor(null);
      }
    } finally {
      locked.current = false;
      if (mounted.current) {
        setWriting(false);
        reload();
      }
    }
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!view || !editor || !editorContext || uncertain) return;
    const body = {
      month: editorContext.month,
      category: editor.category,
      revision: editor.revision,
      timezone: editorContext.timezone,
      requestId: crypto.randomUUID(),
    };
    if (removing) {
      void submit({ method: 'DELETE', body });
      return;
    }
    const parsed = budgetSetSchema.safeParse({ ...body, limit });
    if (!parsed.success) {
      setWriteError('Enter a positive NGN limit, with no more than two decimal places.');
      return;
    }
    void submit({ method: editor.revision === 0 ? 'POST' : 'PATCH', body: parsed.data });
  };
  return (
    <section
      data-testid="monthly-budgets"
      aria-labelledby="budget-heading"
      className="space-y-4 min-w-0"
    >
      <GlassCard padding="md">
        <div
          data-testid="budget-reading-surface"
          className="rounded-xl border border-white/15 bg-slate-950/80 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="budget-heading" className="text-xl font-semibold text-white">
                Monthly category budgets
              </h2>
              <p className="mt-1 text-sm text-slate-100">
                A little direction for your spending, with room for real life.
              </p>
            </div>
            <Button id="budget-refresh" variant="ghost" onClick={reload} disabled={writing}>
              Refresh budgets
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <Button
              variant="ghost"
              disabled={!view || view.month <= view.minimum || writing || isRestrictedPreview()}
              onClick={() => view && setMonth(shiftMonth(view.month, -1))}
            >
              Previous month
            </Button>
            <Button
              variant="primary"
              disabled={writing}
              onClick={() => {
                setMonth(null);
                reload();
              }}
            >
              This month
            </Button>
            <Button
              variant="ghost"
              disabled={
                !view || view.month >= view.currentMonth || writing || isRestrictedPreview()
              }
              onClick={() => view && setMonth(shiftMonth(view.month, 1))}
            >
              Next month
            </Button>
          </div>
          {view && (
            <>
              <p className="mt-3 text-base font-semibold text-white">
                {monthLabel(view.month)} · {view.timezone}
              </p>
              <p className="mt-1 text-sm text-slate-100">
                {view.month === view.currentMonth
                  ? 'Limits cover the full calendar month, including spending before you set them.'
                  : 'Historical comparison · limits are read-only and are never backfilled.'}
              </p>
            </>
          )}
          <p className="mt-2 text-xs leading-relaxed text-slate-100">
            NGN is your ledger currency. USD is an indicative, read-only conversion. Actual expenses
            count once; moving money to savings, repayments and pending expected flows do not count
            as spending. An expense in the Savings category still counts.
          </p>
          <p role="status" className="mt-2 text-sm text-cyan-100">
            {busy ? 'Checking complete monthly spending…' : notice}
          </p>
          {(error || writeError) && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-amber-200/30 bg-slate-950/85 p-3 text-sm text-amber-100"
            >
              {error || writeError}
            </p>
          )}
          {uncertain && (
            <div className="mt-3 rounded-xl bg-slate-950/85 p-3 text-sm text-white">
              <p>
                Confirmation was interrupted. Retry the exact request or continue from the refreshed
                budget.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button disabled={writing} onClick={() => void submit(uncertain)}>
                  Retry budget change
                </Button>
                <Button
                  variant="ghost"
                  disabled={writing || busy || !view}
                  onClick={() => {
                    setUncertain(null);
                    setWriteError('');
                    setNotice('Ready to continue from the refreshed limits.');
                  }}
                >
                  Use refreshed budget
                </Button>
              </div>
            </div>
          )}
        </div>
      </GlassCard>
      {!busy && view && (
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {view.items.map((b) => {
            const signal = budgetSignal(b.spent, b.limit);
            return (
              <GlassCard key={b.category} padding="md" className="min-w-0">
                <article
                  aria-label={b.category + ' budget'}
                  className="rounded-xl border border-white/15 bg-slate-950/80 p-4 text-white"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <h3 className="text-base font-semibold">{b.category}</h3>
                    <span className="text-xs text-slate-200">
                      {b.entryCount} {b.entryCount === 1 ? 'expense' : 'expenses'}
                    </span>
                  </div>
                  <dl className="mt-3 space-y-2 text-sm tabular-nums break-words">
                    <div>
                      <dt className="text-slate-200">Spent this month</dt>
                      <dd className="text-lg font-semibold">{money(b.spent)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-200">Monthly limit</dt>
                      <dd>{b.limit === null ? 'No budget set' : money(b.limit)}</dd>
                    </div>
                    {b.limit !== null && (
                      <>
                        <div>
                          <dt className="text-slate-200">Amount left</dt>
                          <dd>
                            {money(b.left!)} · {b.percentUsed}% used
                          </dd>
                        </div>
                        <div>
                          <dt className="sr-only">Budget utilization</dt>
                          <dd>
                            <div
                              role="meter"
                              aria-label={b.category + ' budget used'}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Number.parseFloat(progressWidth(b.spent, b.limit))}
                              aria-valuetext={b.percentUsed + ' percent used'}
                              className="h-2 overflow-hidden rounded-full bg-white/10"
                            >
                              <div
                                className="h-full rounded-full bg-cyan-300 motion-safe:transition-[width] motion-safe:duration-200"
                                style={{ width: progressWidth(b.spent, b.limit) }}
                              />
                            </div>
                          </dd>
                        </div>
                      </>
                    )}
                  </dl>
                  <p className="mt-3 text-sm text-slate-100">
                    {signal === 'over'
                      ? 'Over this limit. You can adjust your plan; transactions stay available.'
                      : signal === 'near'
                        ? 'Approaching this limit. A quick check-in may help.'
                        : signal === 'within'
                          ? 'Room in this category.'
                          : 'Set a limit when it feels useful.'}
                  </p>
                  {b.createdAt && (
                    <p className="mt-2 text-xs text-slate-200">
                      Set{' '}
                      {new Intl.DateTimeFormat('en-GB', {
                        timeZone: view.timezone,
                        dateStyle: 'medium',
                      }).format(new Date(b.createdAt))}
                      {b.removedAt ? ' · removed' : ''}.{' '}
                      {b.updatedAt !== b.createdAt
                        ? 'Updated ' +
                          new Intl.DateTimeFormat('en-GB', {
                            timeZone: view.timezone,
                            dateStyle: 'medium',
                          }).format(new Date(b.updatedAt!)) +
                          '.'
                        : ''}
                    </p>
                  )}
                  {view.month === view.currentMonth && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        disabled={writing || Boolean(uncertain) || isRestrictedPreview()}
                        id={'budget-action-' + b.category}
                        aria-label={(b.active ? 'Edit ' : 'Set ') + b.category + ' budget'}
                        onClick={(e) => {
                          restoreFocus.current = e.currentTarget;
                          setEditorContext({ month: view.month, timezone: view.timezone });
                          setEditor(b);
                          setLimit(b.limit === null ? '' : editableMoney(b.limit));
                          setRemoving(false);
                          setWriteError('');
                        }}
                      >
                        {b.active ? 'Edit limit' : 'Set limit'}
                      </Button>
                      {b.active && (
                        <Button
                          variant="ghost"
                          disabled={writing || Boolean(uncertain) || isRestrictedPreview()}
                          aria-label={'Remove ' + b.category + ' budget'}
                          onClick={(e) => {
                            restoreFocus.current = e.currentTarget;
                            setEditorContext({ month: view.month, timezone: view.timezone });
                            setEditor(b);
                            setRemoving(true);
                            setWriteError('');
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  )}
                </article>
              </GlassCard>
            );
          })}
        </div>
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
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                const prior = restoreFocus.current;
                if (prior?.isConnected) prior.focus();
                else document.getElementById('budget-refresh')?.focus();
              }}
              onEscapeKeyDown={(e) => {
                if (writing) e.preventDefault();
              }}
              onInteractOutside={(e) => {
                if (writing) e.preventDefault();
              }}
              className="fixed left-1/2 top-1/2 z-[71] max-h-[90dvh] w-[calc(100vw_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/25 bg-slate-950/95 p-6 text-white shadow-xl focus:outline-none"
            >
              <Dialog.Title className="text-lg font-semibold">
                {removing ? 'Remove' : 'Set'} {editor.category} budget
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-slate-200">
                {removing
                  ? 'Remove this month’s limit only. Transactions, savings and earned shards stay intact.'
                  : 'Enter the monthly limit in NGN, even when viewing indicative USD. This does not reserve or move money.'}
              </Dialog.Description>
              {editorContext && (
                <p className="mt-2 text-sm text-slate-200">
                  {monthLabel(editorContext.month)} · {editorContext.timezone}
                </p>
              )}
              <form onSubmit={save} className="mt-4 space-y-4">
                {!removing && (
                  <label className="block text-sm">
                    Monthly limit (NGN)
                    <input
                      autoFocus
                      inputMode="decimal"
                      type="text"
                      required
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                      className={inputClass + ' mt-2 tabular-nums'}
                      aria-describedby="budget-limit-help"
                    />
                    <span id="budget-limit-help" className="mt-1 block text-xs text-slate-200">
                      {manualMoneyHint} Applies to the whole month.
                    </span>
                  </label>
                )}
                {writeError && (
                  <p role="alert" className="text-sm text-amber-100">
                    {writeError}
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="ghost" disabled={writing} onClick={close}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={writing || busy || !view || Boolean(uncertain)}>
                    {writing ? 'Saving…' : removing ? 'Remove limit' : 'Save limit'}
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
