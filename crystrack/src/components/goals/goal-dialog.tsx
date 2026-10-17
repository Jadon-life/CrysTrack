'use client';
import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export function GoalDialog({
  isOpen,
  onClose,
  title,
  onSubmit,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onSubmit: () => Promise<void>;
  children: React.ReactNode;
}) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  const ref = useRef<HTMLDivElement>(null),
    busy = useRef(false),
    titleId = useId();
  const [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    queueMicrotask(() => setError(''));
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy.current) {
        e.preventDefault();
        close.current();
      }
      if (e.key === 'Tab') {
        const nodes = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ) || [],
        ).filter((el) => el.getClientRects().length > 0);
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (!first) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', key);
      if(previous?.isConnected) previous.focus();
      else document.querySelector<HTMLButtonElement>('.goal-workspace button')?.focus();
    };
  }, [isOpen]);
  if (!isOpen) return null;
  return createPortal(
    <div className="goal-modal-layer">
      <div
        className="goal-modal-scrim"
        onClick={() => {
          if (!busy.current) onClose();
        }}
      />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="goal-dialog"
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            disabled={loading}
            aria-label="Close panel"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy.current) return;
            busy.current = true;
            setLoading(true);
            setError('');
            try {
              await onSubmit();
              onClose();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : 'Please try again.',
              );
            } finally {
              busy.current = false;
              setLoading(false);
            }
          }}
        >
          <fieldset disabled={loading}>{children}</fieldset>
          {error && (
            <p role="alert" className="goal-error">
              {error}
            </p>
          )}
          <footer>
            <button type="button" disabled={loading} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Save'}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
