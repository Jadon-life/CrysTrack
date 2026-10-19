'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { moneyPresentation, type MoneyMode } from '@/lib/money-presentation';

export function MoneyAmount({
  amount,
  currency = 'NGN',
  rate,
  mode = 'everyday',
  inspect = true,
}: {
  amount: string | number;
  currency?: 'NGN' | 'USD';
  rate?: number | null;
  mode?: MoneyMode;
  inspect?: boolean;
}) {
  const view = moneyPresentation(amount, currency, rate, { mode });
  if (!view.approximate || !inspect)
    return (
      <span
        className="tabular-nums"
        title={view.detail}
        aria-label={`${view.text}. ${view.detail}`}
      >
        {view.text}
      </span>
    );
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={`Inspect ${view.text}. ${view.detail}`}
          title="Inspect amount"
          className="min-h-10 max-w-full rounded-md text-left tabular-nums underline decoration-dotted decoration-white/40 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
        >
          {view.text}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/25 bg-slate-950 p-5 text-white shadow-2xl">
          <Dialog.Title className="text-lg font-semibold">Amount details</Dialog.Title>
          <Dialog.Description className="mt-3 text-sm text-slate-100 tabular-nums">
            {view.detail}
          </Dialog.Description>
          <p className="mt-3 text-sm text-slate-200">
            Rounded and indicative displays are for reading only. Displayed approximations may not
            add up; recorded amounts and calculations stay unchanged.
          </p>
          <Dialog.Close className="mt-4 min-h-10 rounded-lg border border-white/25 px-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200">
            Close details
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
