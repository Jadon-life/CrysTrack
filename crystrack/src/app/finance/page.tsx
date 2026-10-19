'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BrainCircuit,
  CalendarClock,
  CircleDollarSign,
  HandCoins,
  Loader2,
  Plus,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { Button } from '@/components/ui/button';
import { MoneyAmount } from '@/components/wealth/money-amount';
import { manualMoneyHint, editableMoney, moneyPresentation } from '@/lib/money-presentation';
import { CsvTools } from '@/components/wealth/csv-tools';
import { RecurringBills } from '@/components/wealth/recurring-bills';
import { MonthlyBudgets } from '@/components/wealth/monthly-budgets';
import { CreateModal } from '@/components/shared/create-modal';
import { EXPERIENCE_CONFIG } from '@/config/experience';
import { fetcher, patch, post } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { suggestCategory } from '@/lib/wealth';
import { reportSchema } from '@/lib/wealth-report';
import { nextDailyBoundary } from '@/lib/today-streak';
import { useWealthCurrency } from '@/lib/wealth-currency';

const emptyData = {
  entries: [] as any[],
  targets: [] as any[],
  debts: [] as any[],
  expectedFlows: [] as any[],
  summary: null as any,
  cashflow: [] as any[],
  reporting: null as any,
};

export default function WealthPage() {
  const [data, setData] = useState(emptyData);
  const [ledgerRevision,setLedgerRevision] = useState(0);
  const [wealthView,setWealthView] = useState<'overview'|'budgets'|'bills'|'csv'>('overview');
  const readGeneration=useRef(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const { currency, setCurrency, rate, loadingRate } = useWealthCurrency();

  const [showEntry, setShowEntry] = useState(false);
  const expenseIntent = useRef<{key:string;id:string;date:string}|null>(null);
  const [showTarget, setShowTarget] = useState(false);
  const [showDebt, setShowDebt] = useState(false);
  const [showExpected, setShowExpected] = useState(false);
  const [repayingDebt, setRepayingDebt] = useState<any>(null);
  const [confirmingFlow, setConfirmingFlow] = useState<any>(null);

  const [entry, setEntry] = useState({
    flowKind: 'expense',
    amount: '',
    date: '',
    source: '',
    category: '',
    note: '',
    targetId: '',
  });
  const [target, setTarget] = useState({ title: '', targetAmount: '', deadline: '', description: '' });
  const [debt, setDebt] = useState({ kind: 'receivable', counterparty: '', amount: '', dueDate: '', note: '' });
  const [expected, setExpected] = useState({
    direction: 'income',
    title: '',
    category: '',
    amountMin: '',
    amountMax: '',
    frequency: 'monthly',
    expectedOn: '',
    timingHint: '',
    note: '',
  });
  const [repaymentAmount, setRepaymentAmount] = useState('');
  const [actualAmount, setActualAmount] = useState('');
  const [aiInsight, setAiInsight] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async (analyze = true) => {
    const generation=++readGeneration.current;
    setLoading(true);setData(emptyData);
    try {
      const nextData = reportSchema.parse(await fetcher('/api/wealth', { cache: 'no-store' }));
      if (generation!==readGeneration.current) return;
      setData(nextData);setStatus('');
      setLedgerRevision(n=>n+1);
      if(analyze)void fetcher('/api/ai/domain/wealth', { method: 'POST' }).then(setAiInsight).catch(() => null);
    } catch (error: any) {
      if(generation===readGeneration.current){setData(emptyData);setStatus('Wealth is temporarily unavailable. Refresh to verify your balances; no records were changed.');}
    } finally {
      if(generation===readGeneration.current)setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const money = (value: number | string) =>
    moneyPresentation(value, currency, rate?.usdNgn, {}).text;

  const summary = data.summary;
  const series = useMemo(() => data.cashflow.map(m=>({...m,income:Number(m.income),expenses:Number(m.expenses),incomeExact:m.income,expensesExact:m.expenses})), [data.cashflow]);
  const categoryData = useMemo(() => (summary?.categoryPatterns || []).slice(0,5).map((item:any)=>({name:item.category,value:Number(item.current),exact:item.current})),[summary]);
  useEffect(()=>{const generationState=readGeneration;const refresh=()=>{if(document.visibilityState!=='hidden')void load(false);};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);generationState.current++;};},[load]);
  useEffect(()=>{if(!data.reporting)return;const t=setTimeout(()=>void load(false),nextDailyBoundary(data.reporting.timezone));return()=>clearTimeout(t);},[data.reporting,load]);


  const saveEntry = async () => {
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than zero');

    const key = JSON.stringify(entry);
    if (!expenseIntent.current || expenseIntent.current.key !== key) expenseIntent.current = {key,id:crypto.randomUUID(),date:entry.date || new Date().toISOString()};
    await post('/api/finance/entries', {
      ...entry,
      amount,
      targetId: entry.targetId || null,
      date: entry.flowKind === 'expense' ? expenseIntent.current.date : entry.date || new Date().toISOString(),
      ...(entry.flowKind === 'expense' ? {requestId:expenseIntent.current.id} : {}),
    });
    expenseIntent.current = null;
    setEntry({ flowKind: 'expense', amount: '', date: '', source: '', category: '', note: '', targetId: '' });
    await load();
  };

  const saveTarget = async () => {
    await post('/api/finance/targets', {
      title: target.title,
      targetAmount: Number(target.targetAmount),
      deadline: target.deadline || null,
      description: target.description,
    });
    setTarget({ title: '', targetAmount: '', deadline: '', description: '' });
    await load();
  };

  const saveDebt = async () => {
    await post('/api/wealth/debts', {
      ...debt,
      amount: Number(debt.amount),
      dueDate: debt.dueDate || null,
    });
    setDebt({ kind: 'receivable', counterparty: '', amount: '', dueDate: '', note: '' });
    await load();
  };

  const repayDebt = async () => {
    if (!repayingDebt) return;
    await patch('/api/wealth/debts', {
      debtId: repayingDebt.id,
      amount: Number(repaymentAmount),
    });
    setRepayingDebt(null);
    setRepaymentAmount('');
    await load();
  };

  const saveExpected = async () => {
    await post('/api/wealth/expected', {
      ...expected,
      amountMin: Number(expected.amountMin),
      amountMax: expected.amountMax ? Number(expected.amountMax) : null,
      expectedOn: expected.expectedOn || null,
    });
    setExpected({
      direction: 'income',
      title: '',
      category: '',
      amountMin: '',
      amountMax: '',
      frequency: 'monthly',
      expectedOn: '',
      timingHint: '',
      note: '',
    });
    await load();
  };

  const confirmFlow = async () => {
    if (!confirmingFlow) return;
    await patch('/api/wealth/expected', {
      flowId: confirmingFlow.id,
      action: 'confirm',
      actualAmount: Number(actualAmount),
    });
    setConfirmingFlow(null);
    setActualAmount('');
    await load();
  };

  const refreshInsight = async () => {
    setAiLoading(true);
    try {
      setAiInsight(await fetcher('/api/ai/domain/wealth', { method: 'POST' }));
    } catch (error: any) {
      setStatus(error?.message || 'AI insight is unavailable');
    } finally {
      setAiLoading(false);
    }
  };

  const categorySuggestion = suggestCategory(entry.source, data.entries);
  const categories = EXPERIENCE_CONFIG.wealth.categories;



  return (
    <div className="space-y-5 pb-8">
      <section className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--theme-primary)]">CrysTrack</p>
          <h1 className="dashboard-hero-title text-3xl sm:text-4xl font-semibold mt-1">Wealth</h1>
          <p className="dashboard-hero-copy text-sm mt-2">Know where your money is going, what is changing, and what is actually safe to spend.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="wealth-segmented" aria-label="Wealth display currency">
            <button type="button" onClick={() => setCurrency('NGN')} className={currency === 'NGN' ? 'is-active' : ''}>₦ NGN</button>
            <button type="button" onClick={() => setCurrency('USD')} className={currency === 'USD' ? 'is-active' : ''}>$ USD</button>
          </div>
          <Button variant="default" onClick={() => setShowEntry(true)}><Plus className="w-4 h-4 mr-1.5" />Money entry</Button>
          <Button variant="primary" onClick={() => setShowExpected(true)}><CalendarClock className="w-4 h-4 mr-1.5" />Expected money</Button>
        </div>
      </section>

      {status && <div className="rounded-xl border border-[var(--theme-border)] bg-black/25 px-4 py-3 text-sm text-white">{status}</div>}

      <section className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--theme-text-muted)]">
        <span className="font-semibold text-white/90">Canonical ledger: NGN</span>
        {rate ? (
          <>
            <span>$1 = ₦{rate.usdNgn.toLocaleString('en-NG', { maximumFractionDigits: 2 })}</span>
            <span>{rate.stale ? 'Cached reference rate' : 'Current reference rate'}</span>
            {rate.updatedAt && <span>Updated {new Date(rate.updatedAt).toLocaleString()}</span>}
            <a className="hover:text-white underline underline-offset-2" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates by ExchangeRate-API</a>
          </>
        ) : <span>{loadingRate ? 'Loading reference exchange rate…' : 'USD conversion unavailable; NGN ledger remains intact.'}</span>}
      </section>

      <div className="scenic-readable-strip flex flex-wrap gap-2" role="group" aria-label="Wealth views">
        <Button variant={wealthView==='overview'?'primary':'ghost'} aria-pressed={wealthView==='overview'} onClick={()=>setWealthView('overview')}>Overview</Button>
        <Button variant={wealthView==='budgets'?'primary':'ghost'} aria-pressed={wealthView==='budgets'} onClick={()=>setWealthView('budgets')}>Budgets</Button>
        <Button variant={wealthView==='bills'?'primary':'ghost'} aria-pressed={wealthView==='bills'} onClick={()=>setWealthView('bills')}>Bills & subscriptions</Button>
        <Button variant={wealthView==='csv'?'primary':'ghost'} aria-pressed={wealthView==='csv'} onClick={()=>setWealthView('csv')}>CSV tools</Button>
      </div>
      {wealthView==='overview'&&!summary ? <GlassCard padding="md"><div role="status" className="text-sm text-white">{loading?'Verifying the complete ledger…':'Wealth is temporarily unavailable. Refresh to verify your balances; no records were changed.'}</div><Button className="mt-3" disabled={loading} onClick={()=>void load(false)}>Refresh Wealth</Button></GlassCard> : wealthView==='csv' ? <CsvTools onChange={load}/> : wealthView==='bills' ? <RecurringBills currency={currency} rate={rate} ledgerRevision={ledgerRevision} onChange={load}/> : wealthView==='budgets'  ? <MonthlyBudgets currency={currency} rate={rate} ledgerRevision={ledgerRevision}/> : <>
      <p className="text-xs text-[var(--theme-text-muted)]" data-testid="wealth-report-status">All {data.reporting?.ledgerCount} recorded transactions · {data.reporting?.month} · {data.reporting?.timezone}. Saved timezone changes re-bucket history without changing records.</p>
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Available', value: summary?.availableBalance || 0, icon: WalletCards, tone: 'text-emerald-300', note: 'Spendable cash from confirmed entries' },
          { label: 'Net cashflow', value: summary?.netSpendableFlow || 0, icon: summary?.netSpendableFlow >= 0 ? TrendingUp : TrendingDown, tone: summary?.netSpendableFlow >= 0 ? 'text-emerald-300' : 'text-red-300', note: 'Income − expenses − savings' },
          { label: 'Saved', value: summary?.savedBalance || 0, icon: ShieldCheck, tone: 'text-sky-300', note: 'Removed from available cash' },
          { label: 'Safe to spend', value: summary?.safeToSpend || 0, icon: Banknote, tone: 'text-amber-300', note: 'After expected outflows & due debt' },
          { label: 'Net position', value: summary?.netPosition || 0, icon: CircleDollarSign, tone: 'text-violet-300', note: 'Available + saved + owed to you − owed' },
        ].map(({ label, value, icon: Icon, tone, note }) => (
          <GlassCard key={label} padding="md">
            <div className="flex items-center justify-between">
              <Icon className={cn('w-5 h-5', tone)} />
              <span className="text-xs text-[var(--theme-text-muted)]">{currency}</span>
            </div>
            <p className="text-xs text-[var(--theme-text-muted)] mt-4">{label}</p>
            <div className="wealth-number text-xl sm:text-2xl font-semibold text-white mt-1 break-words"><MoneyAmount amount={value} currency={currency} rate={rate?.usdNgn} mode="summary" /></div>
            <p className="text-xs leading-relaxed text-[var(--theme-text-muted)] mt-1">{note}</p>
          </GlassCard>
        ))}
      </section>

      <section className="grid xl:grid-cols-12 gap-4">
        <GlassCard padding="md" className="xl:col-span-7">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="dashboard-panel-title text-sm">Cashflow</p>
              <p className="text-xs text-[var(--theme-text-muted)] mt-1">Six-month view of actual recorded money.</p>
            </div>
            <span className="text-xs text-[var(--theme-text-muted)]">This month: {money(summary?.monthIncome || 0)} in · {money(summary?.monthExpenses || 0)} out</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4ade80" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#4ade80" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb7185" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#fb7185" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,.07)" vertical={false} />
                <XAxis dataKey="label" stroke="rgba(255,255,255,.5)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: 'rgba(4,10,20,.94)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 12 }}
                  formatter={(_value: any, name: any, info: any) => money(info.payload[name+'Exact'])}
                />
                <Area type="monotone" dataKey="income" stroke="#4ade80" fill="url(#incomeFill)" strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" stroke="#fb7185" fill="url(#expenseFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard padding="md" className="xl:col-span-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="dashboard-panel-title text-sm flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-[var(--theme-primary)]" /> Wealth Intelligence</p>
              <p className="text-xs text-[var(--theme-text-muted)] mt-1">CrysTrack processes your ledger for patterns; AI receives compact transaction context without identity, credentials, private notes or debt counterparties.</p>
            </div>
            <Button variant="outline" onClick={() => void refreshInsight()} disabled={aiLoading}>
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            </Button>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/15 p-4 mt-4">
            <p className="text-sm font-semibold text-white">{aiInsight?.insight?.headline || 'Current pattern'}</p>
            <p className="text-xs leading-relaxed text-white/85 mt-2">{aiInsight?.insight?.summary || summary?.deterministicRemark}</p>
            {aiInsight?.insight?.observations?.[0] && <p className="text-xs leading-relaxed text-[var(--theme-text-muted)] mt-3">{aiInsight.insight.observations[0]}</p>}
            {aiInsight?.insight?.actions?.[0] && <div className="mt-3 pt-3 border-t border-white/10"><p className="text-xs uppercase tracking-wide text-[var(--theme-primary)]">Next review</p><p className="text-xs text-white mt-1">{aiInsight.insight.actions[0]}</p></div>}
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <p className="text-xs text-[var(--theme-text-muted)]">Savings rate</p>
              <p className="wealth-number text-xl font-semibold text-white mt-1">{summary?.savingsRatePct == null ? '—' : `${Math.round(summary.savingsRatePct)}%`}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <p className="text-xs text-[var(--theme-text-muted)]">Spending pace</p>
              <p className="text-sm font-semibold text-white mt-1 capitalize">{summary?.spendingVelocity || 'insufficient'}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard padding="md" className="xl:col-span-7">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="dashboard-panel-title text-sm">Spending pattern</p>
              <p className="text-xs text-[var(--theme-text-muted)] mt-1">CrysTrack compares your current pace with up to three recent months.</p>
            </div>
            <p className="text-xs text-[var(--theme-text-muted)]">Projected month: {money(summary?.projectedMonthExpenses || 0)}</p>
          </div>

          <div className="grid md:grid-cols-[220px_1fr] gap-5 items-center">
            <div className="h-52">
              {categoryData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} innerRadius={58} outerRadius={82} paddingAngle={2} dataKey="value">
                      {categoryData.map((_: any, index: number) => (
                        <Cell key={index} fill={['#60a5fa', '#4ade80', '#f59e0b', '#a78bfa', '#fb7185'][index % 5]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'rgba(4,10,20,.94)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 12 }}
                      formatter={(_value: any, _name: any, info: any) => money(info.payload.exact)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div className="h-full grid place-items-center text-xs text-[var(--theme-text-muted)]">No expense pattern yet.</div>}
            </div>

            <div className="space-y-2">
              {(summary?.categoryPatterns || []).slice(0, 6).map((item: any) => (
                <div key={item.category} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-white truncate">{item.category}</p>
                      <p className="text-xs text-[var(--theme-text-muted)]">{Math.round(item.sharePct)}% of spending</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-2">
                      <div className="h-full rounded-full bg-[var(--theme-primary)]" style={{ width: `${Math.min(100, item.sharePct)}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="wealth-number text-xs font-semibold text-white">{money(item.current)}</p>
                    <p className={cn('text-xs mt-1', (item.vsBaselinePct ?? 0) > 15 ? 'text-red-300' : (item.vsBaselinePct ?? 0) < -15 ? 'text-emerald-300' : 'text-[var(--theme-text-muted)]')}>
                      {item.vsBaselinePct == null ? 'learning' : `${item.vsBaselinePct > 0 ? '+' : ''}${Math.round(item.vsBaselinePct)}% vs baseline`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        <GlassCard padding="md" className="xl:col-span-5">
          <p className="dashboard-panel-title text-sm">Forecast</p>
          <p className="text-xs text-[var(--theme-text-muted)] mt-1">Expected money never changes your actual balance until you confirm it.</p>

          <div className="rounded-xl border border-white/10 bg-black/12 p-4 mt-4">
            <p className="text-xs uppercase tracking-wide text-[var(--theme-text-muted)]">Projected month-end available</p>
            <p className="wealth-number text-2xl font-semibold text-white mt-2">
              {money(summary?.projectedMonthEndLow || 0)} – {money(summary?.projectedMonthEndHigh || 0)}
            </p>
            <p className="text-xs text-[var(--theme-text-muted)] mt-2">Range reflects unconfirmed expected income/expenses and liabilities due this month.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <p className="text-xs text-[var(--theme-text-muted)]">Owed to you</p>
              <p className="wealth-number text-lg font-semibold text-sky-300 mt-1">{money(summary?.receivables || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 p-3">
              <p className="text-xs text-[var(--theme-text-muted)]">You owe</p>
              <p className="wealth-number text-lg font-semibold text-orange-300 mt-1">{money(summary?.liabilities || 0)}</p>
            </div>
          </div>
        </GlassCard>
      </section>

      <section className="grid xl:grid-cols-2 gap-4">
        <GlassCard padding="md">
          <div className="flex items-center justify-between">
            <div>
              <p className="dashboard-panel-title text-sm">Expected money</p>
              <p className="text-xs text-[var(--theme-text-muted)] mt-1">Exact amount or range; exact date is optional.</p>
            </div>
            <button type="button" onClick={() => setShowExpected(true)} className="text-xs font-semibold text-[var(--theme-primary)]">+ Add expected</button>
          </div>

          <div className="space-y-2 mt-4">
            {data.expectedFlows.filter((item: any) => item.status === 'active').slice(0, 8).map((flow: any) => (
              <div key={flow.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 p-3">
                <div className={cn('w-9 h-9 rounded-xl grid place-items-center', flow.direction === 'income' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300')}>
                  {flow.direction === 'income' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{flow.title}</p>
                  <p className="text-xs text-[var(--theme-text-muted)] mt-1">
                    {money(flow.amount_min)}
                    {flow.amount_max && Number(flow.amount_max) !== Number(flow.amount_min) ? ` – ${money(flow.amount_max)}` : ''}
                    {' · '}{flow.timing_hint || flow.frequency.replace('_', ' ')}
                  </p>
                </div>
                <button type="button" onClick={() => { setConfirmingFlow(flow); setActualAmount(editableMoney(String(flow.amount_min))); }} className="text-xs font-semibold text-[var(--theme-primary)]">
                  {flow.direction === 'income' ? 'Received' : 'Paid'}
                </button>
              </div>
            ))}
            {!data.expectedFlows.some((item: any) => item.status === 'active') && <p className="text-xs text-[var(--theme-text-muted)] py-6 text-center">No expected money added yet.</p>}
          </div>
        </GlassCard>

        <GlassCard padding="md">
          <div className="flex items-center justify-between">
            <div>
              <p className="dashboard-panel-title text-sm">Money owed</p>
              <p className="text-xs text-[var(--theme-text-muted)] mt-1">Receivables and liabilities stay separate from income and normal spending.</p>
            </div>
            <button type="button" onClick={() => setShowDebt(true)} className="text-xs font-semibold text-[var(--theme-primary)]">+ Add debt</button>
          </div>

          <div className="space-y-2 mt-4">
            {data.debts.filter((item: any) => item.status === 'open').slice(0, 8).map((item: any) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 p-3">
                <div className={cn('w-9 h-9 rounded-xl grid place-items-center', item.kind === 'receivable' ? 'bg-sky-500/10 text-sky-300' : 'bg-orange-500/10 text-orange-300')}>
                  <HandCoins className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{item.counterparty}</p>
                  <p className="text-xs text-[var(--theme-text-muted)] mt-1">
                    {item.kind === 'receivable' ? 'Owes you' : 'You owe'} {money(item.outstanding_amount)}
                    {item.due_date ? ` · ${formatDate(item.due_date)}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => { setRepayingDebt(item); setRepaymentAmount(editableMoney(String(item.outstanding_amount))); }} className="text-xs font-semibold text-[var(--theme-primary)]">Repay</button>
              </div>
            ))}
            {!data.debts.some((item: any) => item.status === 'open') && <p className="text-xs text-[var(--theme-text-muted)] py-6 text-center">No open debts or receivables.</p>}
          </div>
        </GlassCard>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="dashboard-panel-title text-sm">Savings goals</p>
            <p className="text-xs text-[var(--theme-text-muted)] mt-1">Savings are removed from available cash but still count toward your net position.</p>
          </div>
          <button type="button" onClick={() => setShowTarget(true)} className="text-xs font-semibold text-[var(--theme-primary)]">+ New goal</button>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.targets.map((item: any) => {
            const current = Number(item.current_amount || 0);
            const targetAmount = Number(item.target_amount || 0);
            const percent = targetAmount > 0 ? Math.max(0, Math.min(100, Math.round((current / targetAmount) * 100))) : 0;
            return (
              <GlassCard key={item.id} padding="md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{item.title}</p>
                    <p className="text-xs text-[var(--theme-text-muted)] mt-1">{item.deadline ? `Target ${formatDate(item.deadline)}` : 'No fixed deadline'}</p>
                  </div>
                  <Target className="w-4 h-4 text-[var(--theme-primary)]" />
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden mt-4">
                  <div className="h-full bg-[var(--theme-primary)] rounded-full" style={{ width: `${percent}%` }} />
                </div>
                <div className="flex justify-between gap-3 mt-2">
                  <p className="wealth-number text-xs text-white">{money(item.current_amount || 0)}</p>
                  <p className="text-xs text-[var(--theme-text-muted)]">{percent}% of {money(item.target_amount || 0)}</p>
                </div>
              </GlassCard>
            );
          })}
          {!data.targets.length && <GlassCard padding="lg" className="md:col-span-2 xl:col-span-3 text-center"><p className="text-xs text-[var(--theme-text-muted)]">No savings goals yet.</p></GlassCard>}
        </div>
      </section>

      <GlassCard padding="md">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="dashboard-panel-title text-sm">Recent money</p>
            <p className="text-xs text-[var(--theme-text-muted)] mt-1">Most recent 14 of all recorded transactions. Balances and charts include the complete ledger; NGN remains canonical.</p>
          </div>
          <button type="button" onClick={() => setShowEntry(true)} className="text-xs font-semibold text-[var(--theme-primary)]">+ Add</button>
        </div>

        <div className="grid lg:grid-cols-2 gap-x-5">
          {data.entries.slice(0, 14).map((item: any) => {
            const kind = String(item.flow_kind || item.type || '');
            const positive = ['income', 'borrow', 'receivable_repayment', 'savings_release'].includes(kind);
            const neutral = kind === 'transfer';
            return (
              <div key={item.id} className="flex items-center gap-3 py-3 border-b border-white/[0.08]">
                <div className={cn(
                  'w-9 h-9 rounded-xl grid place-items-center border border-white/10',
                  positive ? 'bg-emerald-500/10 text-emerald-300' : neutral ? 'bg-white/5 text-white/60' : 'bg-red-500/10 text-red-300',
                )}>
                  {positive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{item.source || item.category || kind.replaceAll('_', ' ')}</p>
                  <p className="text-xs text-[var(--theme-text-muted)] mt-1">{item.category || 'Uncategorised'} · {formatDate(item.date)}</p>
                </div>
                <p className={cn('wealth-number text-xs font-semibold', positive ? 'text-emerald-300' : neutral ? 'text-white/70' : 'text-red-300')}>
                  {positive ? '+' : neutral ? '' : '-'}{money(item.amount)}
                </p>
              </div>
            );
          })}
        </div>
      </GlassCard>

      </>}

      <CreateModal isOpen={showEntry} onClose={() => setShowEntry(false)} title="Add money entry" onSubmit={saveEntry}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-white/85 mb-1.5">Type</label>
            <select value={entry.flowKind} onChange={(event) => setEntry((current) => ({ ...current, flowKind: event.target.value, category: event.target.value.includes('saving') ? 'Savings' : current.category }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white">
              <option value="income" className="bg-slate-950">Income received</option>
              <option value="expense" className="bg-slate-950">Expense</option>
              <option value="saving" className="bg-slate-950">Move to savings</option>
              <option value="savings_release" className="bg-slate-950">Release from savings</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/85 mb-1.5">Amount (NGN) *</label>
            <input aria-label="Amount (NGN)" aria-describedby="manual-money-hint" inputMode="decimal" type="number" min="0.01" step="0.01" value={entry.amount} onChange={(event) => setEntry((current) => ({ ...current, amount: event.target.value }))} placeholder="e.g. 2500" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" required />
            <p id="manual-money-hint" className="mt-2 text-xs text-[var(--theme-text-muted)]">{manualMoneyHint}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/85 mb-1.5">Source / description</label>
            <input
              value={entry.source}
              onChange={(event) => setEntry((current) => ({ ...current, source: event.target.value }))}
              onBlur={() => {
                if (!entry.category && categorySuggestion) setEntry((current) => ({ ...current, category: categorySuggestion }));
              }}
              placeholder="e.g. Salary, Fuel, Groceries"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white"
            />
            {categorySuggestion && !entry.category && <button type="button" onClick={() => setEntry((current) => ({ ...current, category: categorySuggestion }))} className="text-xs text-[var(--theme-primary)] mt-1.5">Use learned category: {categorySuggestion}</button>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/85 mb-1.5">Category</label>
            <select value={entry.category} onChange={(event) => setEntry((current) => ({ ...current, category: event.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white">
              <option value="" className="bg-slate-950">Select category</option>
              {categories.map((category) => <option key={category} value={category} className="bg-slate-950">{category}</option>)}
            </select>
          </div>
          {(entry.flowKind === 'saving' || entry.flowKind === 'savings_release') && data.targets.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-white/85 mb-1.5">Savings goal (optional)</label>
              <select value={entry.targetId} onChange={(event) => setEntry((current) => ({ ...current, targetId: event.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white">
                <option value="" className="bg-slate-950">General savings</option>
                {data.targets.map((item: any) => <option key={item.id} value={item.id} className="bg-slate-950">{item.title}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-white/85 mb-1.5">Date</label>
            <input type="date" value={entry.date} onChange={(event) => setEntry((current) => ({ ...current, date: event.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" />
          </div>
        </div>
      </CreateModal>

      <CreateModal isOpen={showTarget} onClose={() => setShowTarget(false)} title="Create savings goal" onSubmit={saveTarget}>
        <div className="space-y-4">
          <p className="text-xs text-[var(--theme-text-muted)]">{manualMoneyHint}</p>
          <input value={target.title} onChange={(event) => setTarget((current) => ({ ...current, title: event.target.value }))} placeholder="Goal name" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" required />
          <input type="number" step="0.01" inputMode="decimal" value={target.targetAmount} onChange={(event) => setTarget((current) => ({ ...current, targetAmount: event.target.value }))} placeholder="Target amount in NGN" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" required />
          <input type="date" value={target.deadline} onChange={(event) => setTarget((current) => ({ ...current, deadline: event.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" />
          <textarea value={target.description} onChange={(event) => setTarget((current) => ({ ...current, description: event.target.value }))} placeholder="What is this savings goal for?" className="w-full h-20 resize-none bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" />
        </div>
      </CreateModal>

      <CreateModal isOpen={showDebt} onClose={() => setShowDebt(false)} title="Record money owed" onSubmit={saveDebt}>
        <div className="space-y-4">
          <p className="text-xs text-[var(--theme-text-muted)]">{manualMoneyHint}</p>
          <select value={debt.kind} onChange={(event) => setDebt((current) => ({ ...current, kind: event.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white">
            <option value="receivable" className="bg-slate-950">Someone owes me</option>
            <option value="liability" className="bg-slate-950">I owe someone</option>
          </select>
          <input value={debt.counterparty} onChange={(event) => setDebt((current) => ({ ...current, counterparty: event.target.value }))} placeholder="Name" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" required />
          <input type="number" step="0.01" inputMode="decimal" value={debt.amount} onChange={(event) => setDebt((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount in NGN" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" required />
          <input type="date" value={debt.dueDate} onChange={(event) => setDebt((current) => ({ ...current, dueDate: event.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" />
          <textarea value={debt.note} onChange={(event) => setDebt((current) => ({ ...current, note: event.target.value }))} placeholder="Optional note" className="w-full h-20 resize-none bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" />
        </div>
      </CreateModal>

      <CreateModal isOpen={Boolean(repayingDebt)} onClose={() => setRepayingDebt(null)} title={repayingDebt?.kind === 'receivable' ? 'Record repayment received' : 'Record debt repayment'} onSubmit={repayDebt}>
        <div className="space-y-3">
          <p className="text-xs text-[var(--theme-text-muted)]">Outstanding: {repayingDebt ? money(repayingDebt.outstanding_amount) : '—'}</p>
          <input type="number" step="0.01" inputMode="decimal" value={repaymentAmount} onChange={(event) => setRepaymentAmount(event.target.value)} placeholder="Actual repayment amount" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" required />
        </div>
      </CreateModal>

      <CreateModal isOpen={showExpected} onClose={() => setShowExpected(false)} title="Add expected money" onSubmit={saveExpected}>
        <div className="space-y-4">
          <p className="text-xs text-[var(--theme-text-muted)]">{manualMoneyHint}</p>
          <select value={expected.direction} onChange={(event) => setExpected((current) => ({ ...current, direction: event.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white">
            <option value="income" className="bg-slate-950">Expected income</option>
            <option value="expense" className="bg-slate-950">Expected expense</option>
          </select>
          <input value={expected.title} onChange={(event) => setExpected((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Salary, Rent, Freelance payment" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" required />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" step="0.01" inputMode="decimal" value={expected.amountMin} onChange={(event) => setExpected((current) => ({ ...current, amountMin: event.target.value }))} placeholder="Minimum NGN" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" required />
            <input type="number" step="0.01" inputMode="decimal" value={expected.amountMax} onChange={(event) => setExpected((current) => ({ ...current, amountMax: event.target.value }))} placeholder="Maximum NGN (optional)" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" />
          </div>
          <select value={expected.frequency} onChange={(event) => setExpected((current) => ({ ...current, frequency: event.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white">
            <option value="one_off" className="bg-slate-950">One off</option>
            <option value="weekly" className="bg-slate-950">Weekly</option>
            <option value="monthly" className="bg-slate-950">Monthly</option>
            <option value="quarterly" className="bg-slate-950">Quarterly</option>
            <option value="yearly" className="bg-slate-950">Yearly</option>
            <option value="irregular" className="bg-slate-950">Irregular / no fixed schedule</option>
          </select>
          <input type="date" value={expected.expectedOn} onChange={(event) => setExpected((current) => ({ ...current, expectedOn: event.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" />
          <input value={expected.timingHint} onChange={(event) => setExpected((current) => ({ ...current, timingHint: event.target.value }))} placeholder="Timing hint, e.g. last week of the month" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" />
          <select value={expected.category} onChange={(event) => setExpected((current) => ({ ...current, category: event.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white">
            <option value="" className="bg-slate-950">Category (optional)</option>
            {categories.map((category) => <option key={category} value={category} className="bg-slate-950">{category}</option>)}
          </select>
        </div>
      </CreateModal>

      <CreateModal isOpen={Boolean(confirmingFlow)} onClose={() => setConfirmingFlow(null)} title={confirmingFlow?.direction === 'income' ? 'Confirm income received' : 'Confirm expense paid'} onSubmit={confirmFlow}>
        <div className="space-y-3">
          <p className="text-xs text-[var(--theme-text-muted)]">
            Forecast: {confirmingFlow ? money(confirmingFlow.amount_min) : '—'}
            {confirmingFlow?.amount_max && Number(confirmingFlow.amount_max) !== Number(confirmingFlow.amount_min) ? ` – ${money(confirmingFlow.amount_max)}` : ''}
          </p>
          <p className="text-xs text-white/70">The actual amount can be below or above the forecast range. CrysTrack records what really happened.</p>
          <input type="number" step="0.01" inputMode="decimal" value={actualAmount} onChange={(event) => setActualAmount(event.target.value)} placeholder="Actual amount received / paid" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white" required />
        </div>
      </CreateModal>
    </div>
  );
}
