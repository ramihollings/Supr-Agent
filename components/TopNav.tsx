'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { fetchConnectorHealthAction } from '@/app/actions';
import { useUiMode } from './UiModeProvider';

function TopNavSkeleton({ title }: { title: string }) {
  return (
    <>
      {/* Desktop Skeleton */}
      <nav className="hidden lg:flex bg-background text-primary justify-between items-center w-full px-6 py-4 border-b-4 border-primary z-30 sticky top-0 h-[77px]">
        <div className="flex items-center gap-4">
          <span className="text-primary font-bold font-headline uppercase tracking-tight text-xl">{title}</span>
        </div>
      </nav>
      {/* Mobile Skeleton */}
      <nav className="lg:hidden flex justify-between items-center w-full px-4 py-4 border-b-4 border-primary sticky top-0 bg-background z-50 h-[77px]">
        <span className="font-headline text-2xl font-black uppercase tracking-tighter text-primary flex items-center gap-2">
          Supr
        </span>
      </nav>
    </>
  );
}

function TopNavContent({ title = "Dashboard", children }: { title?: string, children?: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id');
  const [showNotificationToast, setShowNotificationToast] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [systemMode, setSystemMode] = useState('Live Runtime');
  const { mode } = useUiMode();

  useEffect(() => {
    fetchConnectorHealthAction().then((connectors) => {
      const connected = connectors.filter((connector: any) => connector.configured).length;
      if (connected === 0) {
        setSystemMode('Live Runtime');
      } else {
        setSystemMode(connected === connectors.length ? 'Live + Channels' : 'Live + Partial Channels');
      }
    });
  }, []);

  const handleNotificationClick = () => {
    setShowNotificationToast(true);
    setTimeout(() => setShowNotificationToast(false), 2000);
  };

  const getHrefWithParam = (href: string) => {
    if (!projectId) return href;
    return `${href}?id=${projectId}`;
  };

  const handleRedirect = (path: string) => {
    router.push(getHrefWithParam(path));
  };

  return (
    <>
      {/* Desktop TopNav */}
      <nav className="hidden lg:flex bg-background text-primary justify-between items-center w-full px-6 py-4 border-b-4 border-primary z-30 sticky top-0">
        <div className="flex items-center gap-4">
          <span className="text-primary font-bold font-headline uppercase tracking-tight text-xl">{title}</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            {children || (
              <>
                <div className="flex items-center gap-2 bg-surface neo-border-sm px-3 py-1.5 font-headline font-bold text-xs uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-black animate-pulse inline-block"></span>
                  <span>{systemMode}</span>
                </div>
                <div className="flex items-center gap-2 bg-surface neo-border-sm px-3 py-1.5 font-headline font-bold text-xs uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                  <span className="material-symbols-outlined text-xs text-primary font-bold">verified_user</span>
                  <span>Autopilot: Active</span>
                </div>
              </>
            )}
          </div>
          <div className="flex gap-4 border-l-4 border-primary pl-6">
            <Link href={getHrefWithParam('/settings')} aria-label="Settings" className="hover:text-tertiary transition-colors">
              <span className="material-symbols-outlined">settings</span>
            </Link>
            <div className="relative">
              <button 
                onClick={handleNotificationClick}
                aria-label="Notifications" 
                className="hover:text-tertiary transition-colors"
              >
                <span className="material-symbols-outlined">notifications</span>
              </button>
              {showNotificationToast && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-surface-container-high border-2 border-primary p-2 text-[10px] font-bold uppercase text-center neo-shadow z-50">
                  No new notifications ✓
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile TopNav */}
      <nav className="lg:hidden flex justify-between items-center w-full px-4 py-4 border-b-4 border-primary sticky top-0 bg-background z-50">
        <Link href={getHrefWithParam('/')} className="font-headline text-2xl font-black uppercase tracking-tighter text-primary flex items-center gap-2">
          <Image src="/supr_logo.svg" alt="Supr Logo" width={28} height={28} />
          Supr
        </Link>
        <div className="flex items-center gap-2 text-primary">
          <Link href={getHrefWithParam('/settings')} className="p-2 border-2 border-transparent hover:bg-primary hover:text-on-primary transition-colors active:translate-x-1 active:translate-y-1">
            <span className="material-symbols-outlined">settings</span>
          </Link>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 border-2 border-transparent hover:bg-primary hover:text-on-primary transition-colors active:translate-x-1 active:translate-y-1"
          >
            <span className="material-symbols-outlined">{isMobileMenuOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
        
        {isMobileMenuOpen && (
          <div className="absolute top-full left-0 right-0 bg-background border-b-4 border-primary p-4 z-50 neo-shadow-lg">
             <ul className="flex flex-col gap-2">
                {[
                  { href: '/', label: 'Dashboard', minMode: 'mobile' },
                  { href: '/supr-chat', label: 'Supr-Chat', minMode: 'mobile' },
                  { href: '/orchestration', label: 'Observability', minMode: 'pro' },
                  { href: '/supervisor', label: 'Supervisor', minMode: 'pro' },
                  { href: '/agents', label: 'Agents', minMode: 'pro' },
                  { href: '/reasoning', label: 'Reasoning Core', minMode: 'dev' },
                  { href: '/skills', label: 'Skills', minMode: 'pro' },
                  { href: '/cron-jobs', label: 'Cron Jobs', minMode: 'dev' },
                  { href: '/code', label: 'Code', minMode: 'dev', isBottom: true },
                  { href: '/research', label: 'Research', minMode: 'dev', isBottom: true },
                  { href: '/library', label: 'Library', minMode: 'dev', isBottom: true },
                  { href: '/mission-packet', label: 'Project Report', minMode: 'pro', isBottom: true },
                  { href: '/help', label: 'Help', minMode: 'mobile', isBottom: true },
                ].filter(item => {
                   const weights: Record<string, number> = { mobile: 1, pro: 2, dev: 3 };
                   return weights[item.minMode] <= weights[mode];
                }).map((item, idx, arr) => {
                   const isFirstBottom = item.isBottom && !arr[idx - 1]?.isBottom;
                   return (
                     <li key={item.href} className={isFirstBottom ? "border-t-2 border-outline-variant pt-2 mt-2" : ""}>
                       <Link href={getHrefWithParam(item.href)} onClick={() => setIsMobileMenuOpen(false)} className={`block py-2 font-headline font-bold uppercase hover:text-tertiary ${item.isBottom ? 'text-sm' : ''}`}>
                         {item.label}
                       </Link>
                     </li>
                   );
                })}
             </ul>
          </div>
        )}
      </nav>
    </>
  );
}

export function TopNav({ title = "Dashboard", children }: { title?: string, children?: React.ReactNode }) {
  return (
    <Suspense fallback={<TopNavSkeleton title={title} />}>
      <TopNavContent title={title}>{children}</TopNavContent>
    </Suspense>
  );
}
