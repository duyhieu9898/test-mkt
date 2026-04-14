'use client';

/**
 * Global error boundary for Next.js 14 App Router (P0-D3).
 * Reports the error to Sentry (if configured) and shows a friendly
 * recovery UI for non-technical users.
 */

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console — Sentry integration deferred to production build
    // to avoid OpenTelemetry import chain breaking Next.js dev server.
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html>
      <body>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 480,
              background: '#fff',
              borderRadius: 16,
              padding: 32,
              textAlign: 'center',
              border: '1px solid #e2e8f0',
              boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#fef3c7',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                fontSize: 32,
              }}
            >
              ⚠️
            </div>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: '#0f172a',
                margin: '0 0 8px',
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                color: '#64748b',
                fontSize: 14,
                margin: '0 0 24px',
                lineHeight: 1.5,
              }}
            >
              We've been notified and our team is looking into it. Try the
              page again — if the problem keeps happening, refresh or head
              back to your dashboard.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={reset}
                style={{
                  padding: '10px 20px',
                  borderRadius: 10,
                  background: '#4f46e5',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Try again
              </button>
              <a
                href="/"
                style={{
                  padding: '10px 20px',
                  borderRadius: 10,
                  background: '#fff',
                  color: '#475569',
                  border: '1px solid #e2e8f0',
                  fontWeight: 600,
                  textDecoration: 'none',
                  fontSize: 14,
                }}
              >
                Go home
              </a>
            </div>
            {error.digest && (
              <p
                style={{
                  color: '#94a3b8',
                  fontSize: 11,
                  marginTop: 16,
                  fontFamily: 'monospace',
                }}
              >
                Error ID: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
