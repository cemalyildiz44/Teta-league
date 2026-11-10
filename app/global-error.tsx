'use client'; // Error boundaries must be Client Components

// Replaces the root layout when the layout itself fails, so it renders its own document and cannot rely on
// globals.css, fonts or the header. Inline styles keep it independent of everything that might have broken.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#050a0f',
          color: '#ffffff',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          textAlign: 'center',
          padding: '24px 16px',
        }}
      >
        <title>Bir şeyler ters gitti | TETA League</title>
        <div style={{ maxWidth: 560 }}>
          <p style={{ color: '#00e5ff', fontSize: 11, fontWeight: 900, letterSpacing: '0.3em', margin: '0 0 16px' }}>
            TETA LEAGUE
          </p>
          <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: '0.08em', margin: '0 0 12px' }}>BİR ŞEYLER TERS GİTTİ</h1>
          <p style={{ color: '#a0b0c0', fontSize: 15, lineHeight: 1.6, margin: '0 0 28px' }}>
            Site şu anda yüklenemedi. Lütfen tekrar deneyin; sorun devam ederse birkaç dakika sonra yeniden ziyaret edin.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                padding: '12px 24px',
                borderRadius: 12,
                border: 0,
                background: '#00e5ff',
                color: '#050a0f',
                fontWeight: 900,
                fontSize: 13,
                letterSpacing: '0.05em',
                cursor: 'pointer',
              }}
            >
              TEKRAR DENE
            </button>
            {/* A plain <a> forces a full reload, which is what we want when the root layout is broken */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                padding: '12px 24px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 13,
                letterSpacing: '0.05em',
                textDecoration: 'none',
              }}
            >
              ANA SAYFA
            </a>
          </div>
          {error.digest && <p style={{ marginTop: 28, fontSize: 11, color: '#4b5563', fontFamily: 'monospace' }}>Hata kodu: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
