'use client';
import React, { useState } from 'react';
import { WorkspaceOverlay } from '@/components/workspace/overlay';
import { Button } from '@/components/ui/button';
export function CreateModal({
  isOpen,
  onClose,
  title,
  onSubmit,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  onSubmit: (data: any) => Promise<void>;
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  return (
    <WorkspaceOverlay
      open={isOpen}
      onClose={onClose}
      title={title}
      busy={loading}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (loading) return;
          setLoading(true);
          setError('');
          try {
            await onSubmit(event);
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Please try again.');
          } finally {
            setLoading(false);
          }
        }}
      >
        <fieldset disabled={loading}>{children}</fieldset>
        {error && (
          <p role="alert" className="workspace-form-error">
            {error}
          </p>
        )}
        <footer className="workspace-form-actions">
          <Button
            type="button"
            variant="ghost"
            disabled={loading}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Saving…' : 'Save'}
          </Button>
        </footer>
      </form>
    </WorkspaceOverlay>
  );
}
