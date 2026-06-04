import type { Metadata } from 'next';

// Auth pages are intentionally chrome-free: no Sidebar, no Toast
// provider noise, no theme palette — just the bare auth surface so
// the user cannot accidentally interact with anything else while
// the session is being established.
export const metadata: Metadata = {
  title: 'Supr — Security Gate',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full">
      {children}
    </div>
  );
}
