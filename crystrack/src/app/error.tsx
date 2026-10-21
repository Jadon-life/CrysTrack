'use client';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[65vh] w-full max-w-2xl items-center justify-center px-4">
      <section role="alert" className="crys-glass-card w-full rounded-3xl border border-white/15 p-7 text-center sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-primary)]">CrysTrack</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">Something didn&apos;t load</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--theme-text-muted)]">
          Your information hasn&apos;t been changed here. You can try opening this page again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="glass-button-primary mt-6 inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
