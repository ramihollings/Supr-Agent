"use client";

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';

function LoginPageContent() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Redirect to original page or home
        const redirectUrl = searchParams.get('callbackUrl') || '/';
        router.push(redirectUrl);
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('Connection failed. Please check the network.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-surface-container flex flex-col items-center justify-center p-4 md:p-8 selection:bg-primary-container selection:text-on-primary-container">
      <div className="max-w-md w-full bg-background border-4 border-primary shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-8 relative overflow-hidden">
        {/* Decorative corner block */}
        <div className="absolute top-0 right-0 bg-tertiary text-on-tertiary font-headline font-bold text-[10px] uppercase px-4 py-1 border-b-2 border-l-2 border-primary tracking-wider">
          Security Gate v3.5
        </div>

        {/* Logo and Brand */}
        <header className="mb-8 border-b-4 border-primary pb-6 mt-4">
          <div className="flex items-center gap-3">
            <Image src="/supr_logo.svg" alt="Supr Logo" width={48} height={48} className="shrink-0 border-2 border-primary bg-primary-fixed p-1 neo-shadow" />
            <div>
              <h1 className="font-headline text-3xl font-black uppercase tracking-tighter text-primary">Supr</h1>
              <p className="font-body text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Autonomous Supervisor Node</p>
            </div>
          </div>
        </header>

        {/* Info Box */}
        <div className="bg-surface-container-high border-2 border-primary p-4 mb-6 relative">
          <span className="material-symbols-outlined text-secondary absolute top-4 right-4 text-xl">shield_lock</span>
          <h2 className="font-headline font-bold uppercase text-xs text-primary mb-1 tracking-wider">Restricted Workspace</h2>
          <p className="font-body text-xs text-on-surface-variant font-bold leading-relaxed pr-8">
            This supervisor workspace is protected under Governed Autonomy standards. Enter the master access key to establish a secure management session.
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="password" className="block font-headline text-xs font-bold uppercase text-primary mb-2 tracking-wider">
              Master Access Key
            </label>
            <div className="relative">
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-surface border-4 border-primary px-4 py-3 font-mono text-sm placeholder-on-surface-variant focus:outline-none focus:bg-surface-container-low transition-colors neo-shadow-sm focus:translate-x-0.5 focus:translate-y-0.5 focus:shadow-none"
              />
            </div>
          </div>

          {error && (
            <div className="bg-error-container border-2 border-error p-3 text-xs font-body font-bold text-error uppercase flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">warning</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary text-on-primary font-headline font-bold uppercase py-3.5 border-2 border-primary hover:bg-primary-fixed hover:text-primary transition-all duration-100 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            <span className="material-symbols-outlined text-[18px]">key</span>
            <span>{isLoading ? 'Decrypting...' : 'Authorize Session'}</span>
          </button>
        </form>

        <footer className="mt-8 text-center border-t-2 border-outline-variant pt-4">
          <p className="font-body text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">
            Clearance Level 3 • Governed Sandbox enabled
          </p>
        </footer>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 min-h-screen bg-surface-container flex flex-col items-center justify-center p-4 md:p-8">
        <div className="max-w-md w-full bg-background border-4 border-primary shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-8 text-center">
          <p className="font-headline font-bold text-sm uppercase text-primary animate-pulse">Initializing Decryption...</p>
        </div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
