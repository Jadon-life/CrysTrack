export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[1560px] px-3 py-6 sm:px-5 lg:px-7" aria-busy="true" aria-label="Loading your CrysTrack workspace">
      <div className="crys-glass-card rounded-3xl p-5 sm:p-7" role="status" aria-live="polite">
        <p className="text-sm font-medium text-white">Opening your workspace…</p>
        <div className="mt-5 grid grid-cols-1 gap-4 motion-safe:animate-pulse md:grid-cols-3" aria-hidden="true">
          <div className="h-44 rounded-2xl bg-white/10" />
          <div className="h-44 rounded-2xl bg-white/10" />
          <div className="h-44 rounded-2xl bg-white/10" />
        </div>
      </div>
    </main>
  );
}
