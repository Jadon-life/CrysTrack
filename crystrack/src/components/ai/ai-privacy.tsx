'use client';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { useAuth } from '@/components/layout/auth-provider';
import { Button } from '@/components/ui/button';
import { aiPrivacySchema, AI_PRIVACY_POLICY, type AiPrivacy } from '@/lib/ai/privacy';
import { isRestrictedPreview } from '@/lib/preview/mode';

type State = AiPrivacy & { configured: boolean };
const EVENT = 'crystrack-ai-privacy-changed';
export function announceAiPrivacy() {
  window.dispatchEvent(new Event(EVENT));
  try {
    localStorage.setItem(EVENT, String(Date.now()));
  } catch {
    /* privacy authority never depends on storage */
  }
}
export function useAiPrivacy() {
  const { user } = useAuth(),
    owner = user?.id;
  const [bundle, setBundle] = useState<{ owner: string; state: State } | null>(null),
    [error, setError] = useState('');
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const generation = ++sequence.current;
    setBundle(null);
    if (!owner) return;
    try {
      const response = await fetch('/api/ai/privacy', { cache: 'no-store' });
      if (!response.ok)
        throw new Error('AI permissions are unavailable. AI stays off until verified.');
      const data = await response.json(),
        state = aiPrivacySchema.parse(
          data && Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'configured')),
        );
      if (generation === sequence.current) {
        setBundle({ owner, state: { ...state, configured: data.configured === true } });
        setError('');
      }
    } catch {
      if (generation === sequence.current) {
        setBundle(null);
        setError('AI permissions are unavailable. AI stays off until verified.');
      }
    }
  }, [owner]);
  useEffect(() => {
    const counter = sequence;
    queueMicrotask(() => void refresh());
    const changed = () => void refresh();
    const storage = (e: StorageEvent) => {
      if (e.key === EVENT) changed();
    };
    window.addEventListener(EVENT, changed);
    window.addEventListener('focus', changed);
    window.addEventListener('storage', storage);
    return () => {
      counter.current++;
      window.removeEventListener(EVENT, changed);
      window.removeEventListener('focus', changed);
      window.removeEventListener('storage', storage);
    };
  }, [refresh]);
  return { state: bundle && bundle.owner === owner ? bundle.state : null, error, refresh };
}
export function AiPrivacyNotice({ wealth = false }: { wealth?: boolean }) {
  const { state, error } = useAiPrivacy();
  return (
    <div
      role="status"
      className="rounded-xl border border-white/20 bg-slate-950/85 p-3 text-sm leading-relaxed text-slate-100"
      data-testid="ai-privacy-notice"
    >
      {error ||
        (!state
          ? 'Checking AI permissions…'
          : !state.enabled
            ? 'AI is off. Your activity stays local to CrysTrack; no AI provider request is made.'
            : wealth && !state.wealthEnabled
              ? 'Wealth sharing is off. Local calculations still work.'
              : !state.configured
                ? 'AI is enabled, but no provider is configured on this server.'
                : 'AI is enabled for permitted context. Requests use OpenRouter and its selected model providers.')}
      <Link
        className="mt-1 inline-flex min-h-10 items-center rounded-md px-1 text-cyan-200 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
        href="/settings#ai-privacy"
      >
        Review AI & Privacy
      </Link>
    </div>
  );
}
const explanation = (
  <>
    <p>
      AI requests are processed by OpenRouter and potentially its selected model providers. Routing
      requests ask for restricted retention, but CrysTrack cannot guarantee provider-wide
      non-retention.
    </p>
    <p>
      Automatic activity context contains saved-zone dates, counts, completion states and numeric
      progress. Private titles, descriptions, check-in reflections, notes, credentials, identity and
      GPS are excluded. AI cannot judge qualitative evidence that you have not shared.
    </p>
    <p>
      Anything you type in AI chat is included, with eligible history from the same permission
      version. Do not enter secrets, identity, account or contact details. We cannot recognize every
      kind of sensitive information in text.
    </p>
    <p>
      Wealth sharing is a separate, optional choice. It permits exact aggregate NGN totals and
      category patterns, never raw bank statements, transaction notes, references, account IDs or
      debt counterparties. Wealth OFF does not remove financial information you choose to type into
      chat.
    </p>
    <p>
      Analysis is requested through chat, analysis controls, or an explicit check-in on a goal with
      AI coaching selected. Navigation only reads local history. Turning AI off blocks future
      requests. Data already transmitted cannot be recalled; in-flight cancellation is best effort.
      New results are not saved after permission changes.
    </p>
  </>
);
export function AiPrivacyControls() {
  const { state, error, refresh } = useAiPrivacy(),
    { user } = useAuth();
  const ownerRef = useRef(user?.id);
  useLayoutEffect(() => {
    ownerRef.current = user?.id;
  }, [user?.id]);
  const [dialogOwner, setDialogOwner] = useState<string | undefined>(undefined);
  const [dialog, setDialog] = useState<'ai' | 'wealth' | 'clear' | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [preview, setPreview] = useState<{
      owner: string | undefined;
      revision: number;
      data: unknown;
    } | null>(null),
    [reviewing, setReviewing] = useState(false);
  const trigger = useRef<HTMLElement | null>(null),
    attempt = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    if (location.hash === '#ai-privacy') document.getElementById('ai-privacy')?.focus();
  }, []);
  const open = (kind: 'ai' | 'wealth' | 'clear', element: HTMLElement) => {
    trigger.current = element;
    setDialogOwner(user?.id);
    setConfirmed(false);
    setDialog(kind);
    setStatus('');
  };
  const change = async (enabled: boolean, wealth: boolean, clear = false) => {
    if (!state || busy || isRestrictedPreview()) return;
    const currentOwner = user?.id;
    const key = JSON.stringify([currentOwner, state.revision, enabled, wealth, clear]);
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setStatus('');
    setPreview(null);
    try {
      const body = clear
        ? {
            expectedRevision: state.revision,
            requestId: attempt.current.id,
            confirm: 'DELETE_LOCAL_AI',
          }
        : {
            enabled,
            wealthEnabled: wealth,
            expectedRevision: state.revision,
            requestId: attempt.current.id,
            policy: AI_PRIVACY_POLICY,
          };
      const response = await fetch('/api/ai/privacy', {
          method: clear ? 'DELETE' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Privacy change was not confirmed. Refresh before retrying.');
      if (currentOwner !== ownerRef.current) return;
      attempt.current = null;
      announceAiPrivacy();
      await refresh();
      setStatus(
        clear
          ? 'Local AI conversations and saved insights cleared. Provider records cannot be erased here.'
          : enabled
            ? 'AI permission updated. Sharing applies only to the approved scope.'
            : 'AI is off. Future provider requests are blocked.',
      );
      setDialog(null);
    } catch (e: any) {
      setStatus(e?.message || 'Privacy change was not confirmed.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const review = async () => {
    const reviewOwner = ownerRef.current,
      revision = state?.revision;
    setReviewing(true);
    setPreview(null);
    try {
      const r = await fetch('/api/ai/privacy/context?domain=overview', { cache: 'no-store' }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Context unavailable');
      if (reviewOwner !== ownerRef.current || revision == null) return;
      setPreview({ owner: reviewOwner, revision, data: d });
      setStatus('Review only: no AI provider request was made.');
    } catch {
      setStatus('The current payload could not be verified. No AI provider request was made.');
    } finally {
      setReviewing(false);
    }
  };
  return (
    <section
      id="ai-privacy"
      tabIndex={-1}
      data-testid="ai-privacy-controls"
      className="space-y-4 rounded-2xl border border-white/20 bg-slate-950/85 p-4 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
    >
      <h3 className="text-lg font-semibold text-white">AI & Privacy</h3>
      <p className="text-sm leading-relaxed">
        AI is optional and off by default. If enabled, OpenRouter and its selected model providers
        receive your chat text and limited task, goal and assignment counts, states and numeric
        progress. Wealth requires a separate choice. Do not type private information or credentials.
      </p>
      {error && (
        <p role="alert" className="text-sm text-amber-100">
          {error}
        </p>
      )}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 p-3">
          <div>
            <p className="font-semibold">Use external AI</p>
            <p className="text-xs text-slate-200">Off by default, including existing accounts.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Use external AI"
            aria-checked={!!state?.enabled}
            disabled={!state || busy || isRestrictedPreview()}
            onClick={(e) =>
              state?.enabled ? void change(false, false) : open('ai', e.currentTarget)
            }
            className="inline-flex min-h-10 min-w-16 items-center justify-center rounded-lg border border-cyan-200/50 px-3 text-sm font-semibold text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:opacity-50"
          >
            {state?.enabled ? 'On' : 'Off'}
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 p-3">
          <div>
            <p className="font-semibold">Include my Wealth data</p>
            <p className="text-xs text-slate-200">
              Optional aggregate money context; defaults off.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Include my Wealth data"
            aria-checked={!!state?.wealthEnabled}
            disabled={!state?.enabled || busy || isRestrictedPreview()}
            onClick={(e) =>
              state?.wealthEnabled ? void change(true, false) : open('wealth', e.currentTarget)
            }
            className="inline-flex min-h-10 min-w-16 items-center justify-center rounded-lg border border-cyan-200/50 px-3 text-sm font-semibold text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:opacity-50"
          >
            {state?.wealthEnabled ? 'On' : 'Off'}
          </button>
        </div>
      </div>
      <details className="rounded-xl border border-white/15 px-3">
        <summary className="min-h-10 cursor-pointer list-inside py-3 text-sm font-semibold text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200">
          How context and providers work
        </summary>
        <div className="space-y-3 pb-3 text-sm leading-relaxed">{explanation}</div>
      </details>
      {state?.enabled && !state.configured && (
        <p role="status" className="text-sm text-amber-100">
          AI is not configured on this server. Permission does not mean a provider request
          succeeded.
        </p>
      )}
      <Button
        variant="outline"
        disabled={!state || reviewing || busy}
        onClick={() => void review()}
      >
        {reviewing ? 'Checking context…' : 'Review what AI receives'}
      </Button>
      {preview != null && preview.owner === user?.id && preview.revision === state?.revision && (
        <div className="space-y-2 text-sm">
          <p>
            Actual current automatic context; no provider call. Chat messages and eligible history
            are added when you explicitly send.
          </p>
          <pre
            aria-label="Current automatic AI context"
            tabIndex={0}
            className="max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/50 p-3 text-xs text-slate-100"
          >
            {JSON.stringify(preview.data, null, 2)}
          </pre>
        </div>
      )}
      <div className="space-y-3 border-t border-white/15 pt-4">
        <h4 className="text-sm font-semibold">Local AI history</h4>
        <p className="text-sm leading-relaxed">
          CrysTrack stores conversations and generated insights in your account. Clearing them
          removes those local records and embedded AI analysis, not your tasks, goals, check-ins,
          money or rewards. It cannot erase copies already processed or retained by OpenRouter or a
          model provider.
        </p>
        <Button
          variant="outline"
          disabled={!state || busy || isRestrictedPreview()}
          onClick={(e) => open('clear', e.currentTarget)}
        >
          Clear local AI history
        </Button>
      </div>
      {status && (
        <p role="status" className="rounded-xl bg-black/40 p-3 text-sm text-cyan-100">
          {status}
        </p>
      )}
      <Dialog.Root
        open={dialog !== null && dialogOwner === user?.id}
        onOpenChange={(v) => {
          if (!v && !busy) setDialog(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" />
          <Dialog.Content
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              trigger.current?.focus();
            }}
            onEscapeKeyDown={(e) => {
              if (busy) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              if (busy) e.preventDefault();
            }}
            className="fixed left-1/2 top-1/2 z-[101] max-h-[90dvh] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/25 bg-slate-950 p-5 text-slate-100 shadow-2xl"
          >
            <Dialog.Title className="text-lg font-semibold text-white">
              {dialog === 'clear'
                ? 'Clear local AI history'
                : dialog === 'wealth'
                  ? 'Allow Wealth context?'
                  : 'Enable external AI?'}
            </Dialog.Title>
            <Dialog.Description className="mt-3 text-sm leading-relaxed">
              {dialog === 'clear'
                ? 'This deletes your local AI conversations, messages and saved insights. Your source activity and finances stay intact. It does not delete data held by external providers.'
                : dialog === 'wealth'
                  ? 'Future approved requests may include exact aggregate NGN balances, income, spending, savings, due debt and category patterns. Individual transaction details, notes and bank statements stay excluded.'
                  : 'You choose to send your chat text and limited task, goal and assignment counts, states and numeric progress to OpenRouter and its selected model providers. Private source notes and reflections are excluded; do not type secrets or identity details. Wealth requires a separate choice. Provider retention cannot be guaranteed, and already transmitted data cannot be recalled.'}
            </Dialog.Description>
            <form
              className="mt-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (confirmed && dialogOwner === user?.id)
                  void change(
                    dialog === 'clear' ? !!state?.enabled : true,
                    dialog === 'wealth' || (dialog === 'clear' && !!state?.wealthEnabled),
                    dialog === 'clear',
                  );
              }}
            >
              <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border border-white/20 p-3 text-sm">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="h-5 w-5 accent-cyan-400"
                />
                {dialog === 'clear'
                  ? 'Remove my local AI conversations and saved insights'
                  : dialog === 'wealth'
                    ? 'I allow this optional Wealth scope'
                    : 'I understand and choose to enable external AI'}
              </label>
              <div className="flex flex-wrap justify-end gap-3">
                <Dialog.Close asChild>
                  <Button type="button" variant="ghost" disabled={busy}>
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button type="submit" variant="primary" disabled={!confirmed || busy}>
                  {busy
                    ? 'Confirming…'
                    : dialog === 'clear'
                      ? 'Delete local AI history'
                      : 'Confirm permission'}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
