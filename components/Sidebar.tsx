'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { MissionWizard } from './MissionWizard';

const navItems = [
  { href: '/', icon: 'dashboard', label: 'Dashboard' },
  { href: '/mission-control', icon: 'insights', label: 'Control Center' },
  { href: '/activity', icon: 'history', label: 'Updates' },
  { href: '/agents', icon: 'smart_toy', label: 'Task Force' },
  { href: '/reasoning', icon: 'psychology', label: 'Strategic Plan' },
  { href: '/skills', icon: 'construction', label: 'Skills' },
  { href: '/cron-jobs', icon: 'schedule', label: 'Cron Jobs' },
];

const bottomItems = [
  { href: '/code', icon: 'code', label: 'Code Workspace' },
  { href: '/research', icon: 'travel_explore', label: 'Research Library' },
  { href: '/mission-packet', icon: 'inventory_2', label: 'Project Report' },
  { href: '/settings', icon: 'settings', label: 'Settings' },
  { href: '/help', icon: 'help_outline', label: 'Help' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id');
  const [showWizard, setShowWizard] = useState(false);

  const handleNewMission = () => {
    setShowWizard(true);
  };

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const getHrefWithParam = (href: string) => {
    if (!projectId) return href;
    return `${href}?id=${projectId}`;
  };

  return (
    <>
      {showWizard && <MissionWizard onClose={() => setShowWizard(false)} />}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 border-r-4 border-primary z-40 bg-background shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
        <div className="p-6 border-b-4 border-primary">
          <Link href={getHrefWithParam('/')} className="font-headline text-3xl font-black text-primary uppercase tracking-tighter hover:text-tertiary transition-colors flex items-center gap-2">
            <Image src="/supr_logo.svg" alt="Supr Logo" width={36} height={36} className="shrink-0" />
            Supr
          </Link>
        </div>
        
        <div className="p-4 border-b-4 border-primary flex items-center space-x-3 bg-surface-container">
          <div className="w-10 h-10 border-2 border-primary bg-primary-fixed flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary">account_circle</span>
          </div>
          <div className="overflow-hidden">
            <p className="font-headline font-bold text-sm truncate text-primary uppercase">Manager</p>
            <p className="font-body text-xs text-on-surface-variant truncate font-bold uppercase">Active Session</p>
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto flex flex-col py-4 gap-1 px-2">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={getHrefWithParam(item.href)}
                className={`flex items-center gap-3 px-4 py-3 font-body font-bold uppercase text-sm transition-all active:translate-x-0.5 active:translate-y-0.5 border-2 ${
                  isActive(item.href)
                    ? 'bg-primary text-on-primary border-primary shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]'
                    : 'text-primary border-transparent hover:bg-surface-container hover:border-outline-variant'
                }`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="border-t-4 border-primary p-2">
          <ul className="space-y-1 mb-4">
            {bottomItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={getHrefWithParam(item.href)}
                  className={`flex items-center gap-3 px-4 py-3 font-body font-bold uppercase text-sm transition-all active:translate-x-0.5 active:translate-y-0.5 border-2 ${
                    isActive(item.href)
                      ? 'bg-primary text-on-primary border-primary shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]'
                      : 'text-primary border-transparent hover:bg-surface-container hover:border-outline-variant'
                  }`}
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="relative">
            <button
              onClick={handleNewMission}
              className="w-full bg-primary text-on-primary font-headline font-bold uppercase py-3 border-2 border-primary hover:bg-primary-fixed hover:text-primary transition-colors duration-100 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none mb-2 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              New Project
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
