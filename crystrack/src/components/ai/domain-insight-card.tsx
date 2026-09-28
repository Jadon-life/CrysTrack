'use client';

import React, {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  BrainCircuit,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { GlassCard } from '@/components/shared/glass-card';

const LABELS: Record<string, string> = {
  tasks: 'Routine Intelligence',
  goals: 'Goal Intelligence',
  assignments:
    'Assignment Intelligence',
  overview:
    'Cross-domain Intelligence',
};

type TaskCurrentSnapshot = {
  scheduled: number;
  completed: number;
  pending: number;
  skipped: number;
  missed: number;
};

export function DomainInsightCard({
  domain,
}: {
  domain:
    | 'tasks'
    | 'goals'
    | 'assignments'
    | 'overview';
}) {
  const [insight, setInsight] =
    useState<any>(null);

  const [loading, setLoading] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    configured,
    setConfigured,
  ] = useState(true);

  const [
    currentSnapshot,
    setCurrentSnapshot,
  ] =
    useState<TaskCurrentSnapshot | null>(
      null,
    );

  const [
    currentDate,
    setCurrentDate,
  ] = useState<string | null>(null);

  const [
    generatedAt,
    setGeneratedAt,
  ] = useState<string | null>(null);

  const [warning, setWarning] =
    useState('');

  const [error, setError] =
    useState('');

  const requestSequence =
    useRef(0);

  const refresh = async (
    showSpinner = false,
    force = false,
  ) => {
    const requestId =
      requestSequence.current + 1;

    requestSequence.current =
      requestId;

    if (showSpinner) {
      setRefreshing(true);
    }

    setError('');

    try {
      const suffix =
        force ? '?force=1' : '';

      const response =
        await fetch(
          `/api/ai/domain/${domain}${suffix}`,
          {
            method: 'POST',
            cache: 'no-store',
          },
        );

      const data =
        await response
          .json()
          .catch(() => null);

      if (
        requestId !==
        requestSequence.current
      ) {
        return;
      }

      if (!response.ok) {
        setError(
          data?.error ||
            'Unable to refresh intelligence right now.',
        );
        return;
      }

      setInsight(
        data?.insight || null,
      );

      setConfigured(
        data?.configured !== false,
      );

      setCurrentSnapshot(
        data?.currentSnapshot ||
          null,
      );

      setCurrentDate(
        data?.currentDate || null,
      );

      setGeneratedAt(
        data?.generatedAt || null,
      );

      setWarning(
        data?.warning ||
          (
            data?.stale
              ? 'Fresh analysis is unavailable; showing the latest saved insight.'
              : ''
          ),
      );
    } catch (
      refreshError: any
    ) {
      if (
        requestId ===
        requestSequence.current
      ) {
        setError(
          refreshError?.message ||
            'Unable to refresh intelligence right now.',
        );
      }
    } finally {
      if (
        showSpinner &&
        requestId ===
          requestSequence.current
      ) {
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        await refresh(
          false,
          false,
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const onActivityUpdated =
      () => {
        void refresh(
          false,
          true,
        );
      };

    window.addEventListener(
      'crystrack-activity-updated',
      onActivityUpdated,
    );

    void load();

    return () => {
      cancelled = true;

      window.removeEventListener(
        'crystrack-activity-updated',
        onActivityUpdated,
      );
    };

    // Domain is fixed for the lifetime of each mounted page card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  const updatedAtLabel =
    generatedAt &&
    !Number.isNaN(
      new Date(
        generatedAt,
      ).getTime(),
    )
      ? new Date(
          generatedAt,
        ).toLocaleTimeString(
          [],
          {
            hour: '2-digit',
            minute: '2-digit',
          },
        )
      : null;

  return (
    <GlassCard padding="md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-[var(--theme-primary)]" />
            <p className="text-sm font-semibold text-white">
              {LABELS[domain] ||
                'CrysTrack Intelligence'}
            </p>
          </div>

          <p className="text-[11px] text-[var(--theme-text-muted)] mt-1">
            {domain === 'tasks'
              ? 'Current routine state first, then recent pattern analysis.'
              : 'Important observations only. CrysTrack reuses unchanged analysis when the underlying data has not changed.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            void refresh(
              true,
              true,
            )
          }
          disabled={refreshing}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[var(--theme-text-muted)] hover:text-white hover:bg-white/[0.08] disabled:opacity-50"
          aria-label="Refresh AI insight"
        >
          {refreshing
            ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )
            : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
        </button>
      </div>

      {domain === 'tasks' &&
        currentSnapshot && (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/10 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--theme-primary)]">
                Today
                {currentDate
                  ? ` · ${currentDate}`
                  : ''}
              </p>

              {updatedAtLabel && (
                <span className="text-[10px] text-[var(--theme-text-muted)]">
                  Updated{' '}
                  {updatedAtLabel}
                </span>
              )}
            </div>

            <p className="mt-1.5 text-xs text-white/85">
              {currentSnapshot.completed}{' '}
              of{' '}
              {currentSnapshot.scheduled}{' '}
              complete
              {currentSnapshot.pending >
              0
                ? ` · ${currentSnapshot.pending} pending`
                : ''}
              {currentSnapshot.skipped >
              0
                ? ` · ${currentSnapshot.skipped} skipped`
                : ''}
              {currentSnapshot.missed >
              0
                ? ` · ${currentSnapshot.missed} missed`
                : ''}
            </p>
          </div>
        )}

      {warning && (
        <p className="mt-3 text-[11px] text-amber-200">
          {warning}
        </p>
      )}

      {error && (
        <p className="mt-3 text-[11px] text-red-300">
          {error}
        </p>
      )}

      {loading && !insight
        ? (
            <div className="flex items-center gap-2 py-4 text-xs text-[var(--theme-text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading current
              intelligence…
            </div>
          )
        : !configured &&
            !insight
          ? (
              <p className="text-xs text-amber-200 mt-4">
                AI is not configured
                for this deployment.
              </p>
            )
          : insight
            ? (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-white">
                    {
                      insight.headline
                    }
                  </p>

                  <p className="text-xs leading-relaxed text-white/85 mt-2">
                    {
                      insight.summary
                    }
                  </p>

                  {Array.isArray(
                    insight.observations,
                  ) &&
                    insight
                      .observations
                      .length >
                      0 && (
                      <div className="mt-3 space-y-1.5">
                        {insight.observations
                          .slice(
                            0,
                            3,
                          )
                          .map(
                            (
                              item: string,
                              index: number,
                            ) => (
                              <p
                                key={
                                  index
                                }
                                className="text-[11px] leading-relaxed text-[var(--theme-text-muted)]"
                              >
                                •{' '}
                                {
                                  item
                                }
                              </p>
                            ),
                          )}
                      </div>
                    )}

                  {Array.isArray(
                    insight.actions,
                  ) &&
                    insight
                      .actions
                      .length >
                      0 && (
                      <div className="mt-3 border-t border-white/10 pt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--theme-primary)]">
                          Suggested focus
                        </p>

                        <p className="text-xs text-white mt-1">
                          {
                            insight
                              .actions[0]
                          }
                        </p>
                      </div>
                    )}
                </div>
              )
            : (
                <p className="text-xs text-[var(--theme-text-muted)] mt-4">
                  No AI observation
                  yet. CrysTrack will
                  generate one as
                  activity becomes
                  available.
                </p>
              )}
    </GlassCard>
  );
}
