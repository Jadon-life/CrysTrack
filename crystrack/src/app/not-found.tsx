import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[65vh] w-full max-w-2xl items-center justify-center px-4">
      <section className="crys-glass-card w-full rounded-3xl border border-white/15 p-7 text-center sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-primary)]">CrysTrack</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">This page isn't here</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--theme-text-muted)]">
          The link may have moved. Your saved information is still in your account.
        </p>
        <Link href="/" className="glass-button-primary mt-6 inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          Back to Today
        </Link>
      </section>
    </main>
  );
}
