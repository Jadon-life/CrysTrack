'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Root layout might itself be unavailable. No providers, private error
  // messages, network calls, or app data are accessed from this fallback.
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#071523', color: '#f8fbff', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ display: 'grid', minHeight: '100vh', placeItems: 'center', padding: '24px' }}>
          <section role="alert" style={{
            width: '100%', maxWidth: 500, padding: '32px', borderRadius: 24,
            border: '1px solid rgba(255,255,255,0.24)', background: 'rgba(17,37,56,0.88)',
            boxSizing: 'border-box', textAlign: 'center',
          }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#93d5ff' }}>CRYSTRACK</p>
            <h1 style={{ fontSize: 24, margin: '16px 0 0' }}>CrysTrack couldn&apos;t open</h1>
            <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.7, color: '#d3dce5' }}>
              Please try again. If this continues, you can reopen CrysTrack in your browser.
            </p>
            <button onClick={reset} type="button" style={{
              marginTop: 24, minHeight: 44, padding: '10px 24px', fontSize: 14,
              border: '1px solid rgba(255,255,255,0.45)', borderRadius: 999,
              background: '#24475e', color: '#fff', cursor: 'pointer',
            }}>
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
