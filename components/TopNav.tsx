import Link from 'next/link';

export function TopNav({ title = "Mission Control", children }: { title?: string, children?: React.ReactNode }) {
  return (
    <>
      {/* Desktop TopNav (Optional, mostly absolute for specific pages like Mission Dashboard) */}
      <nav className="hidden lg:flex bg-background text-primary justify-between items-center w-full px-6 py-4 border-b-4 border-primary z-30 sticky top-0">
        <div className="flex items-center gap-4">
          {/* Title or Breadcrumb space */}
          <span className="text-primary font-bold font-headline uppercase tracking-tight text-xl">{title}</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            {children || (
              <>
                <button className="bg-background neo-border px-4 py-2 font-headline font-bold uppercase hover:bg-primary hover:text-primary-fixed transition-colors duration-100 active:translate-x-1 active:translate-y-1">Autonomous Mode</button>
                <button className="bg-primary text-primary-fixed neo-border px-4 py-2 font-headline font-bold uppercase hover:bg-primary-container hover:text-on-primary-container transition-colors duration-100 active:translate-x-1 active:translate-y-1">Mission Active</button>
              </>
            )}
          </div>
          <div className="flex gap-4 border-l-4 border-primary pl-6">
            <Link href="/settings" aria-label="Settings" className="hover:text-tertiary transition-colors">
              <span className="material-symbols-outlined">settings</span>
            </Link>
            <button aria-label="Notifications" className="hover:text-tertiary transition-colors">
              <span className="material-symbols-outlined">notifications</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile TopNav */}
      <nav className="lg:hidden flex justify-between items-center w-full px-4 py-4 border-b-4 border-primary sticky top-0 bg-background z-50">
        <div className="font-headline text-2xl font-black uppercase tracking-tighter text-primary">Supr</div>
        <div className="flex items-center gap-2 text-primary">
          <Link href="/settings" className="p-2 border-2 border-transparent hover:bg-primary hover:text-primary-fixed transition-colors active:translate-x-1 active:translate-y-1">
            <span className="material-symbols-outlined">settings</span>
          </Link>
          <button className="p-2 border-2 border-transparent hover:bg-primary hover:text-primary-fixed transition-colors active:translate-x-1 active:translate-y-1">
            <span className="material-symbols-outlined">menu</span>
          </button>
        </div>
      </nav>
    </>
  );
}
