'use client';

import { AiPrivacyNotice, useAiPrivacy, announceAiPrivacy } from '@/components/ai/ai-privacy';
import { useAuth } from '@/components/layout/auth-provider';
import { AIResponseRenderer } from '@/components/ai/ai-response-renderer';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const privacy=useAiPrivacy(),{user}=useAuth();
  const ownerRef=useRef(user?.id);useLayoutEffect(()=>{ownerRef.current=user?.id},[user?.id]);
  const permissionRef=useRef(privacy.state);useLayoutEffect(()=>{permissionRef.current=privacy.state},[privacy.state]);
  const [loadedOwner,setLoadedOwner]=useState<string|undefined>(undefined);
  const [messageOwner,setMessageOwner]=useState<string|undefined>(undefined);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async (selectId?: string | null) => {
    const expectedOwner=ownerRef.current,expectedRevision=permissionRef.current?.revision;
    const rows = await fetcher('/api/ai/conversations', { cache: 'no-store' });
    if(expectedOwner!==ownerRef.current||expectedRevision!==permissionRef.current?.revision)return null;
    setLoadedOwner(expectedOwner);
    setConversations(rows);
    const preferred=selectId??activeId;
    const nextId = rows.some((r:Conversation)=>r.id===preferred)?preferred:rows[0]?.id??null;
    setActiveId(nextId);
    return nextId;
  }, [activeId]);

  const loadMessages = useCallback(async (id: string) => {
    const expectedOwner=ownerRef.current,expectedRevision=permissionRef.current?.revision;
    const data = await fetcher(`/api/ai/conversations/${id}`, { cache: 'no-store' });
    if(expectedOwner!==ownerRef.current||expectedRevision!==permissionRef.current?.revision)return;
    setMessageOwner(expectedOwner);
    setMessages(data.messages || []);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setMessages([]);setActiveId(null);setConversations([]);setLoading(true);
      loadConversations()
        .catch((error) => setStatus(error?.message || 'Could not load AI conversations'))
        .finally(() => setLoading(false));
    });

    // Initial load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id,privacy.state?.revision]);

  useEffect(() => {
    if (!activeId) return;

    queueMicrotask(() => {
      void loadMessages(activeId).catch(
        (error) => setStatus(error?.message || 'Could not load conversation'),
      );
    });
  }, [activeId, loadMessages]);

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
    if (!window.confirm('Delete this local AI conversation? Your CrysTrack activity stays intact. This cannot delete copies processed or retained by external providers.')) return;
    try {
      await del(`/api/ai/conversations/${id}`);
      announceAiPrivacy();
      const next = await loadConversations(activeId === id ? null : activeId);
      if (!next) setMessages([]);
    } catch (error: any) {
      setStatus(error?.message || 'Could not delete conversation');
    }
  };

  const sendMessage = async () => {
    const text = message.trim();
    if (!text || sending || !privacy.state?.enabled || !privacy.state.configured) return;
    const expectedOwner=ownerRef.current,expectedRevision=privacy.state.revision;

    setMessage('');
    setSending(true);
    setStatus('');

    const optimistic: Message = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessageOwner(expectedOwner);
    setMessages((current) => [...current, optimistic]);

    try {
      const response = await post('/api/ai/chat', { conversationId: activeId, message: text });
      if(expectedOwner!==ownerRef.current||expectedRevision!==permissionRef.current?.revision)return;
      const conversationId = response.conversation?.id || activeId;
      if (conversationId && conversationId !== activeId) setActiveId(conversationId);
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimistic.id),
        response.userMessage,
        response.assistantMessage,
      ]);
      await loadConversations(conversationId);
    } catch (error: any) {
      if(expectedOwner!==ownerRef.current)return;
      setMessages(current=>current.filter(item=>item.id!==optimistic.id));setMessage(text);
      setStatus(error?.message || 'CrysTrack AI is temporarily unavailable');
      if (activeId) await loadMessages(activeId).catch(() => undefined);
      await loadConversations(activeId).catch(() => undefined);
    } finally {
      setSending(false);
    }
  };

  const ownMessages=messageOwner===user?.id?messages:[];
  const ownConversations=loadedOwner===user?.id?conversations:[];
  return (
    <div className="space-y-5 pb-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-primary)]">CrysTrack Intelligence</p>
        <h1 className="text-2xl font-bold text-white mt-1">AI</h1>
        <p className="text-sm text-[var(--theme-text-muted)] mt-1">Discuss permitted activity patterns. Automatic Wealth context requires its separate permission. AI chat cannot change your CrysTrack activity.</p>
        <p className="text-xs text-[var(--theme-text-muted)] mt-2">Messages you choose to send go to OpenRouter and its selected providers. Automatic context excludes private text and identity. Do not type secrets or identifying details. AI output can be incorrect.</p>
      </div>

      <AiPrivacyNotice/>
      <p className="rounded-xl bg-slate-950/80 p-3 text-xs text-slate-100">Saved conversations below are local history with their original dates. Viewing or deleting them does not send a provider request. Old messages are not automatically re-sent after permissions change.</p>
      {status && <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{status}</div>}

      <div className="grid min-h-[620px] grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <GlassCard padding="sm" className="h-fit lg:sticky lg:top-24">
          <Button variant="default" className="w-full" disabled={!privacy.state?.enabled} onClick={() => void createConversation()}>
            <MessageSquarePlus className="w-4 h-4 mr-1.5" /> New chat
          </Button>
          <div className="mt-3 max-h-72 space-y-1 overflow-y-auto lg:max-h-[540px]">
            {ownConversations.map((conversation) => (
              <div key={conversation.id} className={cn('group flex items-center gap-1 rounded-xl border', activeId === conversation.id ? 'border-white/15 bg-white/[0.08]' : 'border-transparent hover:bg-white/[0.04]')}>
                <button type="button" onClick={() => setActiveId(conversation.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                  <p className="truncate text-xs font-medium text-white">{conversation.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--theme-text-muted)]">{new Date(conversation.updated_at).toLocaleDateString()}</p>
                </button>
                <button type="button" onClick={() => void deleteConversation(conversation.id)} className="mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-200 hover:bg-red-500/10 hover:text-red-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200" aria-label="Delete conversation">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {!loading && ownConversations.length === 0 && <p className="px-3 py-5 text-center text-xs text-[var(--theme-text-muted)]">No saved conversations yet.</p>}
          </div>
        </GlassCard>

        <GlassCard padding="none" className="flex min-h-[620px] flex-col overflow-hidden">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-[var(--theme-primary)]" /><p className="text-sm font-semibold text-white">Read-only CrysTrack AI</p></div>
            <p className="mt-1 text-xs text-[var(--theme-text-muted)]">It can analyze your data but cannot create, edit or delete CrysTrack activity.</p>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {loading ? (
              <div className="grid h-full min-h-80 place-items-center"><Loader2 className="w-7 h-7 animate-spin text-[var(--theme-primary)]" /></div>
            ) : ownMessages.length === 0 ? (
              <div className="grid min-h-80 place-items-center text-center">
                <div className="max-w-md">
                  <BrainCircuit className="mx-auto h-9 w-9 text-[var(--theme-primary)]" />
                  <p className="mt-3 text-sm font-semibold text-white">Ask CrysTrack about your own patterns</p>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--theme-text-muted)]">For example: what is hurting my consistency, which goal needs attention, how has my spending changed, or what should I prioritize this week?</p>
                </div>
              </div>
            ) : ownMessages.map((item) => (
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
                aria-label="AI chat message"
                disabled={!privacy.state?.enabled||!privacy.state.configured}
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
              <button type="button" onClick={() => void sendMessage()} disabled={!message.trim() || sending || !privacy.state?.enabled || !privacy.state.configured} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-primary)] text-slate-950 disabled:opacity-40" aria-label="Send message">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
