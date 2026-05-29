'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense, useEffect } from 'react';
import { checkShadowModeAction, toggleShadowModeAction } from '@/app/actions';

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

  // Shadow Mode states
  const [shadowModeActive, setShadowModeActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [showShadowMenu, setShowShadowMenu] = useState(false);

  useEffect(() => {
    async function initShadowStatus() {
      const status = await checkShadowModeAction();
      if (status.active && status.expiresAt) {
        setShadowModeActive(true);
        const remaining = Math.max(0, Math.floor((new Date(status.expiresAt).getTime() - Date.now()) / 1000));
        setTimeLeft(remaining);
      } else {
        setShadowModeActive(false);
        setTimeLeft(0);
      }
    }
    initShadowStatus();
    
    const interval = setInterval(async () => {
      const status = await checkShadowModeAction();
      if (status.active && status.expiresAt) {
        setShadowModeActive(true);
        const remaining = Math.max(0, Math.floor((new Date(status.expiresAt).getTime() - Date.now()) / 1000));
        setTimeLeft(remaining);
      } else {
        if (shadowModeActive) {
          setShadowModeActive(false);
          setTimeLeft(0);
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [shadowModeActive]);

  useEffect(() => {
    if (!shadowModeActive || timeLeft <= 0) return;
    const timer = setTimeout(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          toggleShadowModeAction(false);
          setShadowModeActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [shadowModeActive, timeLeft]);

  const handleEnableShadow = async (mins: number) => {
    const res = await toggleShadowModeAction(true, mins);
    if (res.success && res.expiresAt) {
      setShadowModeActive(true);
      const remaining = Math.max(0, Math.floor((new Date(res.expiresAt).getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
      setShowShadowMenu(false);
    }
  };

  const handleDisableShadow = async () => {
    const res = await toggleShadowModeAction(false);
    if (res.success) {
      setShadowModeActive(false);
      setTimeLeft(0);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

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
            {/* Shadow Mode Control */}
            <div className="relative flex items-center">
              {shadowModeActive ? (
                <div className="flex items-center gap-2 bg-error text-on-error px-3 py-1.5 font-headline font-black text-xs uppercase neo-border animate-pulse shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                  <span className="material-symbols-outlined text-sm">visibility_off</span>
                  SHADOW ACTIVE: {formatTime(timeLeft)}
                  <button onClick={handleDisableShadow} className="ml-2 font-mono font-bold hover:underline bg-black/20 px-1 text-[10px]">EXIT</button>
                </div>
              ) : (
                <button 
                  onClick={() => setShowShadowMenu(!showShadowMenu)}
                  className="bg-background neo-border px-3 py-1.5 font-headline font-bold text-xs uppercase text-primary hover:bg-secondary hover:text-on-secondary transition-colors"
                  title="Enter Private Shadow Mode (Untraced)"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">visibility_off</span>
                    SHADOW
                  </span>
                </button>
              )}
              
              {showShadowMenu && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-background border-4 border-primary p-3.5 neo-shadow-lg z-50 text-xs">
                  <h4 className="font-headline font-black uppercase text-primary border-b-2 border-primary pb-1.5 mb-2.5">Shadow Mode Setup</h4>
                  <p className="font-body text-[10px] text-on-surface-variant mb-3 leading-relaxed">Runs in stealth mode. Message histories, tool execution logs, and workspace telemetry events are NOT logged.</p>
                  
                  <div className="space-y-2">
                    <label className="block text-[9px] font-black uppercase text-on-surface-variant font-mono">Stealth Time Limit</label>
                    <div className="grid grid-cols-3 gap-1">
                      {[2, 5, 10].map(mins => (
                        <button 
                          key={mins}
                          onClick={() => handleEnableShadow(mins)}
                          className="bg-surface neo-border py-1 font-headline font-bold text-[10px] hover:bg-primary hover:text-on-primary transition-all"
                        >
                          {mins}m
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {children || (
              <>
                <div className="flex items-center gap-2 bg-surface neo-border-sm px-3 py-1.5 font-headline font-bold text-xs uppercase text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-black animate-pulse inline-block"></span>
                  <span>System: Online</span>
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
          {shadowModeActive && (
            <div className="bg-error text-on-error px-2 py-1 font-headline font-black text-[9px] uppercase neo-border animate-pulse mr-1">
              SHADOW: {formatTime(timeLeft)}
            </div>
          )}
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
                <li><Link href={getHrefWithParam('/')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Dashboard</Link></li>
                <li><Link href={getHrefWithParam('/supr-chat')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Supr-Chat</Link></li>
                <li><Link href={getHrefWithParam('/orchestration')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Observance Hub</Link></li>
                <li><Link href={getHrefWithParam('/agents')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Agents</Link></li>
                <li><Link href={getHrefWithParam('/reasoning')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Reasoning Core</Link></li>
                <li><Link href={getHrefWithParam('/skills')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Skills</Link></li>
                <li><Link href={getHrefWithParam('/cron-jobs')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Cron Jobs</Link></li>
                <li className="border-t-2 border-outline-variant pt-2 mt-2"><Link href={getHrefWithParam('/code')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary text-sm">Code Workspace</Link></li>
                <li><Link href={getHrefWithParam('/research')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary text-sm">Research Library</Link></li>
                <li><Link href={getHrefWithParam('/library')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary text-sm">Universal Library</Link></li>
                <li><Link href={getHrefWithParam('/mission-packet')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary text-sm">Project Report</Link></li>
                <li><Link href={getHrefWithParam('/help')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary text-sm">Help</Link></li>
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

