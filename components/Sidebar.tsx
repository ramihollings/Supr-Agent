'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
import { MissionWizard } from './MissionWizard';
import { useUiMode, UiMode } from './UiModeProvider';

const navItems = [
  { href: '/', icon: 'dashboard', label: 'Dashboard', minMode: 'mobile' },
  { href: '/supr-chat', icon: 'chat', label: 'Supr-Chat', minMode: 'mobile' },
  { href: '/orchestration', icon: 'visibility', label: 'Observability', minMode: 'pro' },
  { href: '/supervisor', icon: 'admin_panel_settings', label: 'Supervisor', minMode: 'pro' },
  { href: '/agents', icon: 'smart_toy', label: 'Agents', minMode: 'pro' },
  { href: '/skills', icon: 'construction', label: 'Skills', minMode: 'pro' },
  { href: '/reasoning', icon: 'psychology', label: 'Reasoning Core', minMode: 'dev' },
  { href: '/cron-jobs', icon: 'schedule', label: 'Cron Jobs', minMode: 'dev' },
];

const bottomItems = [
  { href: '/project-report', icon: 'inventory_2', label: 'Project Report', minMode: 'pro' },
  { href: '/code', icon: 'code', label: 'Code', minMode: 'dev' },
  { href: '/research', icon: 'travel_explore', label: 'Research', minMode: 'dev' },
  { href: '/library', icon: 'folder_open', label: 'Library', minMode: 'dev' },
  { href: '/settings', icon: 'settings', label: 'Settings', minMode: 'mobile' },
  { href: '/help', icon: 'help_outline', label: 'Help', minMode: 'mobile' },
];

const modeWeights: Record<UiMode, number> = {
  mobile: 1,
  pro: 2,
  dev: 3,
};

function SidebarSkeleton() {
  return (
    <nav className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 border-r-4 border-primary z-40 bg-background shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
      <div className="p-6 border-b-4 border-primary">
        <div className="font-headline text-3xl font-black text-primary uppercase tracking-tighter flex items-center gap-2">
          <Image src="/supr_logo.svg" alt="Supr Logo" width={36} height={36} className="shrink-0" />
          Supr
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="font-headline text-xs font-bold uppercase text-primary animate-pulse">Initializing System...</p>
      </div>
    </nav>
  );
}

function SidebarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id');
  const [showWizard, setShowWizard] = useState(false);
  const { mode, setMode } = useUiMode();

  const handleNewMission = () => {
    setShowWizard(true);
  };

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const getHrefWithParam = (href: string) => {
    if (!projectId) return href;
    return `${href}?id=${projectId}`;
  };

  const currentWeight = modeWeights[mode];
  const filteredNavItems = navItems.filter(item => modeWeights[item.minMode as UiMode] <= currentWeight);
  const filteredBottomItems = bottomItems.filter(item => modeWeights[item.minMode as UiMode] <= currentWeight);

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

        <ul className="flex-1 overflow-y-auto flex flex-col py-4 gap-1 px-2" aria-label="Primary navigation">
          {filteredNavItems.map((item) => (
            <li key={item.href}>
              <Link
                href={getHrefWithParam(item.href)}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={`flex items-center gap-3 px-4 py-3 font-body font-bold uppercase text-sm transition-all active:translate-x-0.5 active:translate-y-0.5 border-2 ${
                  isActive(item.href)
                    ? 'bg-primary text-on-primary border-primary shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]'
                    : 'text-primary border-transparent hover:bg-surface-container hover:border-outline-variant'
                }`}
              >
                <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="border-t-4 border-primary p-2 flex flex-col">
          <ul className="space-y-1 mb-2" aria-label="Secondary navigation">
            {filteredBottomItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={getHrefWithParam(item.href)}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={`flex items-center gap-3 px-4 py-3 font-body font-bold uppercase text-sm transition-all active:translate-x-0.5 active:translate-y-0.5 border-2 ${
                    isActive(item.href)
                      ? 'bg-primary text-on-primary border-primary shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]'
                      : 'text-primary border-transparent hover:bg-surface-container hover:border-outline-variant'
                  }`}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          
          <div className="bg-surface-container border border-outline-variant p-2 mb-2" role="radiogroup" aria-label="Interface level">
            <p className="px-2 py-1 text-[9px] font-bold uppercase text-on-surface-variant tracking-wider">Interface level</p>
            <div className="flex">
              {([
                { id: 'mobile' as const, label: 'Essential', desc: 'Show only the basics' },
                { id: 'pro' as const, label: 'Pro', desc: 'Show supervisor and agent tools' },
                { id: 'dev' as const, label: 'Dev', desc: 'Show all technical views' },
              ]).map((m) => (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={mode === m.id}
                  title={m.desc}
                  onClick={() => setMode(m.id)}
                  className={`flex-1 text-[10px] font-bold uppercase py-1.5 transition-colors ${
                    mode === m.id
                      ? 'bg-primary text-on-primary border border-primary'
                      : 'text-on-surface-variant hover:text-primary border border-transparent'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <button
              onClick={handleNewMission}
              className="w-full bg-primary text-on-primary font-headline font-bold uppercase py-3 border-2 border-primary hover:bg-primary-fixed hover:text-primary transition-colors duration-100 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              New Project
            </button>
          </div>
        </div>
      
      <div className="mt-4 pt-4 border-t-4 border-primary space-y-2">
        <p className="font-body text-[9px] text-on-surface-variant uppercase font-bold tracking-wider text-center leading-relaxed">
          Always-on autonomous supervisor.
          <br />
          Sessions persist for up to 7 days.
        </p>
      </div>
</nav>
    </>
  );
}

export function Sidebar() {
  return (
    <Suspense fallback={<SidebarSkeleton />}>
      <SidebarContent />
    </Suspense>
  );
}
