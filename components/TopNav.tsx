'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function TopNav({ title = "Mission Control", children }: { title?: string, children?: React.ReactNode }) {
  const router = useRouter();
  const [showNotificationToast, setShowNotificationToast] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleNotificationClick = () => {
    setShowNotificationToast(true);
    setTimeout(() => setShowNotificationToast(false), 2000);
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
                  onClick={() => router.push('/settings')}
                  className="bg-background neo-border px-4 py-2 font-headline font-bold uppercase hover:bg-primary hover:text-on-primary transition-colors duration-100 active:translate-x-1 active:translate-y-1"
                >
                  Autonomous Mode
                </button>
                <button 
                  onClick={() => router.push('/mission-control')}
                  className="bg-primary text-on-primary neo-border px-4 py-2 font-headline font-bold uppercase hover:bg-primary-container hover:text-on-primary-container transition-colors duration-100 active:translate-x-1 active:translate-y-1"
                >
                  Mission Active
                </button>
              </>
            )}
          </div>
          <div className="flex gap-4 border-l-4 border-primary pl-6">
            <Link href="/settings" aria-label="Settings" className="hover:text-tertiary transition-colors">
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
        <Link href="/" className="font-headline text-2xl font-black uppercase tracking-tighter text-primary">Supr</Link>
        <div className="flex items-center gap-2 text-primary">
          <Link href="/settings" className="p-2 border-2 border-transparent hover:bg-primary hover:text-on-primary transition-colors active:translate-x-1 active:translate-y-1">
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
                <li><Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Workspace</Link></li>
                <li><Link href="/mission-control" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Mission Control</Link></li>
                <li><Link href="/activity" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Activity</Link></li>
                <li><Link href="/agents" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary">Agents</Link></li>
                <li><Link href="/code" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary text-sm">Code Lab</Link></li>
                <li><Link href="/research" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 font-headline font-bold uppercase hover:text-tertiary text-sm">Research Hub</Link></li>
             </ul>
          </div>
        )}
      </nav>
    </>
  );
}
