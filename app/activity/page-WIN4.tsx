"use client";

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function RedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) {
      router.replace(`/orchestration?id=${id}`);
    } else {
      router.replace('/orchestration');
    }
  }, [router, searchParams]);

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container items-center justify-center font-headline font-bold uppercase text-sm text-primary animate-pulse">
      Syncing Timeline Updates...
    </div>
  );
}

export default function ActivityRedirectPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container items-center justify-center font-headline font-bold uppercase text-sm text-primary animate-pulse">
        Connecting to Observance Hub...
      </div>
    }>
      <RedirectContent />
    </Suspense>
  );
}
