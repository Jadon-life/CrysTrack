'use client';

import React, { useState, useEffect } from 'react';
import { GlassCard } from '@/components/shared/glass-card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CreateModal } from '@/components/shared/create-modal';
import { fetcher, post } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Plus, Wallet, TrendingUp, TrendingDown, PiggyBank, Target, ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';

export default function FinancePage() {
  const [targets, setTargets] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateTarget, setShowCreateTarget] = useState(false);
  const [showCreateEntry, setShowCreateEntry] = useState(false);
  const [newTarget, setNewTarget] = useState({ title: '', targetAmount: '', deadline: '', description: '' });
  const [newEntry, setNewEntry] = useState({ type: 'saving', amount: '', date: '', source: '', category: '', targetId: '' });

  useEffect(() => {
    loadFinance();
  }, []);

  const loadFinance = async () => {
    setLoading(true);
    try {
      const data = await fetcher('/api/finance');
      setTargets(data.targets || []);
      setEntries(data.entries || []);
    } catch (e) {
      console.error('Failed to load finance data', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTarget = async () => {
    if (!newTarget.title.trim()) throw new Error('Title is required');
    if (!newTarget.targetAmount) throw new Error('Target amount is required');
    await post('/api/finance/targets', {
      title: newTarget.title,
      targetAmount: parseFloat(newTarget.targetAmount),
      deadline: newTarget.deadline || null,
      description: newTarget.description,
    });
    await loadFinance();
    setNewTarget({ title: '', targetAmount: '', deadline: '', description: '' });
  };

  const handleCreateEntry = async () => {
    if (!newEntry.amount) throw new Error('Amount is required');
    await post('/api/finance/entries', {
      type: newEntry.type,
      amount: parseFloat(newEntry.amount),
      date: newEntry.date || new Date().toISOString(),
      source: newEntry.source,
      category: newEntry.category,
      targetId: newEntry.targetId || null,
    });
    await loadFinance();
    setNewEntry({ type: 'saving', amount: '', date: '', source: '', category: '', targetId: '' });
  };

  const totalIncome = entries.filter((e: any) => e.type === 'income').reduce((sum: number, e: any) => sum + parseFloat(e.amount), 0);
  const totalExpenses = entries.filter((e: any) => e.type === 'expense').reduce((sum: number, e: any) => sum + parseFloat(e.amount), 0);
  const totalSavings = entries.filter((e: any) => e.type === 'saving').reduce((sum: number, e: any) => sum + parseFloat(e.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Finance</h1>
          <p className="text-sm text-slate-400 mt-1">Track savings, income, and expenses</p>
        </div>
        <div className="flex gap-2">
          <Button variant="default" onClick={() => setShowCreateEntry(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Entry
          </Button>
          <Button variant="primary" onClick={() => setShowCreateTarget(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Target
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GlassCard padding="md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Total Income</p>
              <p className="text-xl font-bold text-emerald-400">{formatCurrency(totalIncome)}</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard padding="md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <TrendingDown className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Total Expenses</p>
              <p className="text-xl font-bold text-red-400">{formatCurrency(totalExpenses)}</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard padding="md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <PiggyBank className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Saved This Month</p>
              <p className="text-xl font-bold text-blue-400">{formatCurrency(totalSavings)}</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Savings Targets</h2>
        {targets.length === 0 && !loading && (
          <GlassCard padding="lg" className="text-center py-8 mb-4">
            <p className="text-slate-400">No savings targets yet. Create one to start tracking!</p>
          </GlassCard>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {targets.map((target: any, index: number) => {
            const current = parseFloat(target.current_amount || 0);
            const goal = parseFloat(target.target_amount || 1);
            const percent = Math.round((current / goal) * 100);
            return (
              <GlassCard key={target.id} hover padding="md" className="animate-enter" style={{ animationDelay: `${index * 100}ms` }}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-blue-400" />
                    <h3 className="font-semibold text-white">{target.title}</h3>
                  </div>
                </div>
                <p className="text-sm text-slate-400 mb-4">{target.description}</p>
                <div className="mb-3">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-slate-400">{formatCurrency(current)}</span>
                    <span className="text-blue-400 font-medium">{percent}%</span>
                  </div>
                  <Progress value={percent} className="h-2 bg-white/10" />
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>of {formatCurrency(goal)}</span>
                    <span>{formatCurrency(goal - current)} remaining</span>
                  </div>
                </div>
                {target.deadline && <div className="text-xs text-slate-500">Target: {formatDate(target.deadline)}</div>}
              </GlassCard>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Recent Entries</h2>
        {entries.length === 0 && !loading && (
          <GlassCard padding="lg" className="text-center py-8">
            <p className="text-slate-400">No entries yet. Add your first income or expense!</p>
          </GlassCard>
        )}
        <GlassCard padding="sm">
          <div className="space-y-2">
            {entries.map((entry: any) => (
              <div key={entry.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', entry.type === 'income' ? 'bg-emerald-500/10' : entry.type === 'expense' ? 'bg-red-500/10' : 'bg-blue-500/10')}>
                    {entry.type === 'income' ? <ArrowUpRight className="w-4 h-4 text-emerald-400" /> : entry.type === 'expense' ? <ArrowDownRight className="w-4 h-4 text-red-400" /> : <PiggyBank className="w-4 h-4 text-blue-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{entry.source || entry.category || 'Entry'}</p>
                    <p className="text-xs text-slate-500">{entry.category} • {formatDate(entry.date)}</p>
                  </div>
                </div>
                <span className={cn('text-sm font-semibold', entry.type === 'income' ? 'text-emerald-400' : entry.type === 'expense' ? 'text-red-400' : 'text-blue-400')}>
                  {entry.type === 'expense' ? '-' : '+'}{formatCurrency(parseFloat(entry.amount))}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <CreateModal isOpen={showCreateTarget} onClose={() => setShowCreateTarget(false)} title="Create Savings Target" onSubmit={handleCreateTarget}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Target Name *</label>
            <input value={newTarget.title} onChange={e => setNewTarget({...newTarget, title: e.target.value})} placeholder="e.g. Emergency Fund" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Target Amount *</label>
            <input type="number" value={newTarget.targetAmount} onChange={e => setNewTarget({...newTarget, targetAmount: e.target.value})} placeholder="10000" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Deadline</label>
            <input type="date" value={newTarget.deadline} onChange={e => setNewTarget({...newTarget, deadline: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
            <textarea value={newTarget.description} onChange={e => setNewTarget({...newTarget, description: e.target.value})} placeholder="What is this target for?" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 resize-none h-20" />
          </div>
        </div>
      </CreateModal>

      <CreateModal isOpen={showCreateEntry} onClose={() => setShowCreateEntry(false)} title="Add Money Entry" onSubmit={handleCreateEntry}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Type</label>
            <select value={newEntry.type} onChange={e => setNewEntry({...newEntry, type: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50">
              <option value="income" className="bg-slate-900">Income</option>
              <option value="expense" className="bg-slate-900">Expense</option>
              <option value="saving" className="bg-slate-900">Saving</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Amount *</label>
            <input type="number" step="0.01" value={newEntry.amount} onChange={e => setNewEntry({...newEntry, amount: e.target.value})} placeholder="0.00" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Date</label>
            <input type="date" value={newEntry.date} onChange={e => setNewEntry({...newEntry, date: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Source / Description</label>
            <input value={newEntry.source} onChange={e => setNewEntry({...newEntry, source: e.target.value})} placeholder="e.g. Salary, Grocery Store" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Category</label>
            <input value={newEntry.category} onChange={e => setNewEntry({...newEntry, category: e.target.value})} placeholder="e.g. Work, Food, Savings" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50" />
          </div>
          {newEntry.type === 'saving' && targets.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Link to Target (optional)</label>
              <select value={newEntry.targetId} onChange={e => setNewEntry({...newEntry, targetId: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50">
                <option value="" className="bg-slate-900">None (General Savings)</option>
                {targets.map((t: any) => <option key={t.id} value={t.id} className="bg-slate-900">{t.title}</option>)}
              </select>
            </div>
          )}
        </div>
      </CreateModal>
    </div>
  );
}
