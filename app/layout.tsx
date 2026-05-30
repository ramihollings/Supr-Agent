import type {Metadata} from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' });

export const metadata: Metadata = {
  title: 'Supr - Orchestrator',
  description: 'Supervisor Agent Workspace for Governed AI Teams',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var theme = localStorage.getItem('supr_theme') || 'neobrutalist';
              var palette = localStorage.getItem('supr_palette') || 'classic';
              document.documentElement.className = 'theme-' + theme + ' palette-' + palette + ' ' + document.documentElement.className;
            } catch (e) {}
          })()
        `}} />
      </head>
      <body suppressHydrationWarning className="bg-background text-on-background font-body min-h-screen flex flex-col md:flex-row antialiased selection:bg-primary-container selection:text-on-primary-container">
        <Sidebar />
        {children}
      </body>
    </html>
  );
}
