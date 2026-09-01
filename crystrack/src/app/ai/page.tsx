import { AIResponseRenderer } from '@/components/ai/ai-response-renderer';

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BrainCircuit, Loader2, MessageSquarePlus, Send, Trash2 } from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';
import { Button } from '@/components/ui/button';
import { del, fetcher, post } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export default function AiPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const loadConversations = async (selectId?: string | null) => {
    const rows = await fetcher('/api/ai/conversations', { cache: 'no-store' });
    setConversations(rows);
    const nextId = selectId ?? activeId ?? rows[0]?.id ?? null;
    setActiveId(nextId);
    return nextId;
  };

  const loadMessages = async (id: string) => {
    const data = await fetcher(`/api/ai/conversations/${id}`, { cache: 'no-store' });
    setMessages(data.messages || []);
  };

  useEffect(() => {
    loadConversations()
      .catch((error) => setStatus(error?.message || 'Could not load AI conversations'))
      .finally(() => setLoading(false));
    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    void loadMessages(activeId).catch((error) => setStatus(error?.message || 'Could not load conversation'));
  }, [activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const createConversation = async () => {
    try {
      const created = await post('/api/ai/conversations', { title: 'New conversation' });
      await loadConversations(created.id);
      setMessages([]);
      setStatus('');
    } catch (error: any) {
      setStatus(error?.message || 'Could not create conversation');
    }
  };

  const deleteConversation = async (id: string) => {
    if (!window.confirm('Delete this AI conversation? This removes only the chat, not your CrysTrack activity.')) return;
    try {
      await del(`/api/ai/conversations/${id}`);
      const next = await loadConversations(activeId === id ? null : activeId);
      if (!next) setMessages([]);
    } catch (error: any) {
      setStatus(error?.message || 'Could not delete conversation');
    }
  };

  const sendMessage = async () => {
    const text = message.trim();
    if (!text || sending) return;

    setMessage('');
    setSending(true);
    setStatus('');

    const optimistic: Message = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);

    try {
      const response = await post('/api/ai/chat', { conversationId: activeId, message: text });
      const conversationId = response.conversation?.id || activeId;
      if (conversationId && conversationId !== activeId) setActiveId(conversationId);
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimistic.id),
        response.userMessage,
        response.assistantMessage,
      ]);
      await loadConversations(conversationId);
    } catch (error: any) {
      setStatus(error?.message || 'CrysTrack AI is temporarily unavailable');
      if (activeId) await loadMessages(activeId).catch(() => undefined);
      await loadConversations(activeId).catch(() => undefined);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-primary)]">CrysTrack Intelligence</p>
        <h1 className="text-2xl font-bold text-white mt-1">AI</h1>
        <p className="text-sm text-[var(--theme-text-muted)] mt-1">Ask about your routines, goals, assignments, Wealth and the relationships between them. This chat is read-only.</p>
        <p className="text-[11px] text-[var(--theme-text-muted)] mt-2">CrysTrack does not send your email, authentication IDs, credentials, private transaction notes or debt counterparties to the AI context.</p>
      </div>

      {status && <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{status}</div>}

      <div className="grid min-h-[620px] grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <GlassCard padding="sm" className="h-fit lg:sticky lg:top-24">
          <Button variant="default" className="w-full" onClick={() => void createConversation()}>
            <MessageSquarePlus className="w-4 h-4 mr-1.5" /> New chat
          </Button>
          <div className="mt-3 max-h-72 space-y-1 overflow-y-auto lg:max-h-[540px]">
            {conversations.map((conversation) => (
              <div key={conversation.id} className={cn('group flex items-center gap-1 rounded-xl border', activeId === conversation.id ? 'border-white/15 bg-white/[0.08]' : 'border-transparent hover:bg-white/[0.04]')}>
                <button type="button" onClick={() => setActiveId(conversation.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                  <p className="truncate text-xs font-medium text-white">{conversation.title}</p>
                  <p className="mt-0.5 text-[10px] text-[var(--theme-text-muted)]">{new Date(conversation.updated_at).toLocaleDateString()}</p>
                </button>
                <button type="button" onClick={() => void deleteConversation(conversation.id)} className="mr-2 rounded-lg p-1.5 text-slate-500 opacity-0 transition group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-300" aria-label="Delete conversation">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {!loading && conversations.length === 0 && <p className="px-3 py-5 text-center text-xs text-[var(--theme-text-muted)]">No saved conversations yet.</p>}
          </div>
        </GlassCard>

        <GlassCard padding="none" className="flex min-h-[620px] flex-col overflow-hidden">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-[var(--theme-primary)]" /><p className="text-sm font-semibold text-white">Read-only CrysTrack AI</p></div>
            <p className="mt-1 text-[11px] text-[var(--theme-text-muted)]">It can analyze your data but cannot create, edit or delete CrysTrack activity.</p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {loading ? (
              <div className="grid h-full min-h-80 place-items-center"><Loader2 className="w-7 h-7 animate-spin text-[var(--theme-primary)]" /></div>
            ) : messages.length === 0 ? (
              <div className="grid min-h-80 place-items-center text-center">
                <div className="max-w-md">
                  <BrainCircuit className="mx-auto h-9 w-9 text-[var(--theme-primary)]" />
                  <p className="mt-3 text-sm font-semibold text-white">Ask CrysTrack about your own patterns</p>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--theme-text-muted)]">For example: what is hurting my consistency, which goal needs attention, how has my spending changed, or what should I prioritize this week?</p>
                </div>
              </div>
            ) : messages.map((item) => (
              <div key={item.id} className={cn('flex', item.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap', item.role === 'user' ? 'bg-[var(--theme-primary)] text-slate-950' : 'border border-white/10 bg-black/25 text-white/90')}>
                  {item.content}
                </div>
              </div>
            ))}
            {sending && <div className="flex justify-start"><div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-xs text-[var(--theme-text-muted)]"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing your CrysTrack data…</div></div>}
            <div ref={endRef} />
          </div>

          <div className="border-t border-white/10 p-3 sm:p-4">
            <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-black/20 p-2">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                maxLength={4000}
                rows={2}
                placeholder="Ask about your CrysTrack activity…"
                className="min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-slate-500"
              />
              <button type="button" onClick={() => void sendMessage()} disabled={!message.trim() || sending} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-primary)] text-slate-950 disabled:opacity-40" aria-label="Send message">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
