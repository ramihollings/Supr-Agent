'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export function TopNav({ title = "Dashboard", children }: { title?: string, children?: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id');
  const [showNotificationToast, setShowNotificationToast] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
                <button 
                  onClick={() => handleRedirect('/settings')}
                  className="bg-background neo-border px-4 py-2 font-headline font-bold uppercase hover:bg-primary hover:text-on-primary transition-colors duration-100 active:translate-x-1 active:translate-y-1"
                >
                  Autonomous Engine
                </button>
                <button 
                  onClick={() => handleRedirect('/mission-control')}
                  className="bg-primary text-on-primary neo-border px-4 py-2 font-headline font-bold uppercase hover:bg-primary-container hover:text-on-primary-container transition-colors duration-100 active:translate-x-1 active:translate-y-1"
                >
                  Project Active
                </button>
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
                <li><Link href={getHrefWithParam('/')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Dashboard</Link></li>
                <li><Link href={getHrefWithParam('/mission-control')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Control Center</Link></li>
                <li><Link href={getHrefWithParam('/orchestration')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Observance Hub</Link></li>
                <li><Link href={getHrefWithParam('/activity')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Updates</Link></li>
                <li><Link href={getHrefWithParam('/agents')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Task Force</Link></li>
                <li><Link href={getHrefWithParam('/reasoning')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Strategic Plan</Link></li>
                <li><Link href={getHrefWithParam('/skills')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Skills</Link></li>
                <li><Link href={getHrefWithParam('/cron-jobs')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Cron Jobs</Link></li>
                <li className="border-t-2 border-outline-variant pt-2 mt-2"><Link href={getHrefWithParam('/code')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary text-sm">Code Workspace</Link></li>
                <li><Link href={getHrefWithParam('/research')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary text-sm">Research Library</Link></li>
                <li><Link href={getHrefWithParam('/mission-packet')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary text-sm">Project Report</Link></li>
                <li><Link href={getHrefWithParam('/help')} onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary text-sm">Help</Link></li>
             </ul>
          </div>
        )}
      </nav>
    </>
  );
}
