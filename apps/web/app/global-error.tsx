'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Global error boundary for root-level errors
 * This catches errors that happen in layout.tsx or Context Providers
 * which the regular error.tsx cannot catch.
 * 
 * Note: This component MUST include <html> and <body> tags as it replaces
 * the entire root layout when an error occurs.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Log the error to console for debugging
    console.error('Critical system error:', error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-white antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center px-4">
          <div className="w-full max-w-md rounded-lg bg-gray-900 p-8 shadow-lg border border-gray-800">
            <div className="text-center">
              <h1 className="mb-4 text-2xl font-bold text-red-400">
                Critical System Error
              </h1>
              <p className="mb-6 text-gray-300">
                A critical error occurred that prevented the application from loading.
                Please reload the application.
              </p>
              {error.message && (
                <p className="mb-6 rounded bg-red-950/50 border border-red-900/50 p-3 text-sm text-red-300 font-mono break-all">
                  {error.message}
                </p>
              )}
              <div className="flex gap-4">
                <button
                  onClick={reset}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                >
                  Reload App
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 rounded-lg bg-gray-700 px-4 py-2 font-semibold text-white transition-colors hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                >
                  Hard Reload
                </button>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

