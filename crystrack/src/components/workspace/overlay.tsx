'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
/** Radix portals escape the shell clip, trap focus, restore triggers and hide background content. */
export function WorkspaceOverlay({
  open,
  onClose,
  title,
  children,
  position = 'center',
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  position?: 'center' | 'corner' | 'drawer';
  busy?: boolean;
}) {
  const previous = useRef<HTMLElement | null>(null),
    content = useRef<HTMLDivElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="workspace-overlay-scrim" />
        <Dialog.Content
          ref={content}
          className={'workspace-overlay workspace-overlay--' + position}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          onOpenAutoFocus={(event) => {
            previous.current = document.activeElement as HTMLElement | null;
            const input = content.current?.querySelector<HTMLElement>(
              'input:not([type=checkbox]),textarea,select',
            );
            if (input) {
              event.preventDefault();
              input.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (previous.current?.isConnected) previous.current.focus();
          }}
          aria-describedby={undefined}
        >
          <header className="workspace-overlay-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close
              disabled={busy}
              aria-label="Close panel"
              className="workspace-icon-button"
            >
              <X size={18} />
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
