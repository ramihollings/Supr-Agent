'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service like Sentry or Axiom
    console.error('Application Error:', error);
  }, [error]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-surface-container p-4">
      <div className="bg-background neo-border neo-shadow-lg p-8 max-w-lg w-full text-center space-y-6">
        <div className="w-20 h-20 bg-error-container text-error rounded-full mx-auto flex items-center justify-center neo-border">
          <AlertTriangle className="w-10 h-10" />
        </div>
        
        <div className="space-y-2">
          <h2 className="font-headline text-3xl font-black uppercase tracking-tighter text-primary">System Failure</h2>
          <p className="font-body text-on-surface-variant font-bold uppercase text-sm">Operation could not be completed safely.</p>
        </div>

        <div className="bg-surface-container p-4 neo-border border-dashed text-left">
          <p className="font-mono text-xs text-error overflow-auto max-h-32">
            {error.message || 'An unknown runtime error occurred within the Supervisor kernel.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => reset()}
            className="flex-1 bg-primary text-on-primary neo-border py-3 px-6 font-headline font-bold uppercase hover:bg-tertiary transition-all active:translate-x-1 active:translate-y-1 flex items-center justify-center gap-2"
          >
            <RefreshCcw className="w-5 h-5" /> Reboot Kernel
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="flex-1 bg-background text-primary neo-border py-3 px-6 font-headline font-bold uppercase hover:bg-surface-variant transition-all active:translate-x-1 active:translate-y-1"
          >
            Safe Mode
          </button>
        </div>

        <p className="font-body text-[10px] text-on-surface-variant/50 uppercase">
          If this persist, please contact Human Engineering via the Help portal.
        </p>
      </div>
    </div>
  );
}
