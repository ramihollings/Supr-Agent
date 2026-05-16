import Link from 'next/link';
import Image from 'next/image';

export function Sidebar() {
  return (
    <nav className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 border-r-4 border-primary z-40 bg-background shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
      <div className="p-6 border-b-4 border-primary">
        <h2 className="text-3xl font-black text-primary uppercase font-headline tracking-tighter">Supr</h2>
      </div>
      <div className="p-4 border-b-4 border-primary flex items-center space-x-3 bg-surface-container">
        <div className="w-10 h-10 border-2 border-primary bg-primary-fixed flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-primary">account_circle</span>
        </div>
        <div className="overflow-hidden">
          <p className="font-headline font-bold text-sm truncate text-primary uppercase">Supervisor</p>
          <p className="font-body text-xs text-on-surface-variant truncate font-bold uppercase">Active Session</p>
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto flex flex-col py-4 gap-1 px-2">
        <li>
          <Link href="/" className="flex items-center gap-3 px-4 py-3 text-primary bg-transparent hover:bg-surface-container font-body font-bold uppercase text-sm hover:text-primary transition-all active:translate-x-0.5 active:translate-y-0.5 border-2 border-transparent">
            <span className="material-symbols-outlined">dashboard</span>
            <span>Workspace</span>
          </Link>
        </li>
        <li>
          <Link href="/mission-control" className="flex items-center gap-3 px-4 py-3 text-primary bg-transparent hover:bg-surface-container font-body font-bold uppercase text-sm hover:text-primary transition-all active:translate-x-0.5 active:translate-y-0.5 border-2 border-transparent">
            <span className="material-symbols-outlined">insights</span>
            <span>Glidepath</span>
          </Link>
        </li>
        <li>
          <Link href="/activity" className="flex items-center gap-3 px-4 py-3 text-primary bg-transparent hover:bg-surface-container font-body font-bold uppercase text-sm hover:text-primary transition-all active:translate-x-0.5 active:translate-y-0.5 border-2 border-transparent">
            <span className="material-symbols-outlined">history</span>
            <span>Activity</span>
          </Link>
        </li>
        <li>
          <Link href="/agents" className="flex items-center gap-3 px-4 py-3 text-primary bg-transparent hover:bg-surface-container font-body font-bold uppercase text-sm hover:text-primary transition-all active:translate-x-0.5 active:translate-y-0.5 border-2 border-transparent">
            <span className="material-symbols-outlined">smart_toy</span>
            <span>Agents</span>
          </Link>
        </li>
        <li>
          <Link href="/reasoning" className="flex items-center gap-3 px-4 py-3 text-primary bg-transparent hover:bg-surface-container font-body font-bold uppercase text-sm hover:text-primary transition-all active:translate-x-0.5 active:translate-y-0.5 border-2 border-transparent">
            <span className="material-symbols-outlined">psychology</span>
            <span>Reasoning</span>
          </Link>
        </li>
      </ul>
      <div className="border-t-4 border-primary p-2">
        <ul className="space-y-1 mb-4">
          <li>
            <Link href="/code" className="flex items-center gap-3 px-4 py-3 text-primary bg-transparent hover:bg-surface-container font-body font-bold uppercase text-sm hover:text-primary transition-all active:translate-x-0.5 active:translate-y-0.5 border-2 border-transparent">
              <span className="material-symbols-outlined">code</span>
              <span>Code</span>
            </Link>
          </li>
          <li>
            <Link href="/research" className="flex items-center gap-3 px-4 py-3 text-primary bg-transparent hover:bg-surface-container font-body font-bold uppercase text-sm hover:text-primary transition-all active:translate-x-0.5 active:translate-y-0.5 border-2 border-transparent">
              <span className="material-symbols-outlined">travel_explore</span>
              <span>Research</span>
            </Link>
          </li>
          <li>
            <Link href="/mission-packet" className="flex items-center gap-3 px-4 py-3 text-primary bg-transparent hover:bg-surface-container font-body font-bold uppercase text-sm hover:text-primary transition-all active:translate-x-0.5 active:translate-y-0.5 border-2 border-transparent">
              <span className="material-symbols-outlined">inventory_2</span>
              <span>Mission Packet</span>
            </Link>
          </li>
          <li>
            <Link href="/settings" className="flex items-center gap-3 px-4 py-3 text-primary bg-transparent hover:bg-surface-container font-body font-bold uppercase text-sm hover:text-primary transition-all active:translate-x-0.5 active:translate-y-0.5 border-2 border-transparent">
              <span className="material-symbols-outlined">settings</span>
              <span>Settings</span>
            </Link>
          </li>
          <li>
            <Link href="/help" className="flex items-center gap-3 px-4 py-3 text-primary bg-transparent hover:bg-surface-container font-body font-bold uppercase text-sm hover:text-primary transition-all active:translate-x-0.5 active:translate-y-0.5 border-2 border-transparent">
              <span className="material-symbols-outlined">help_outline</span>
              <span>Help</span>
            </Link>
          </li>
        </ul>
        <button className="w-full bg-primary text-on-primary font-headline font-bold uppercase py-3 border-2 border-primary hover:bg-primary-fixed hover:text-primary transition-colors duration-100 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none mb-2">
          New Mission
        </button>
      </div>
    </nav>
  );
}
