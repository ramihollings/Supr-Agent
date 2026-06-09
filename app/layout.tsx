import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { UiModeProvider } from '@/components/UiModeProvider';
import { ToastProvider } from '@/components/ToastProvider';
import { headers } from 'next/headers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' });

export const metadata: Metadata = {
  title: 'Supr - Orchestrator',
  description: 'Supervisor Agent Workspace for Governed AI Teams',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') || hdrs.get('x-invoke-path') || '';
  const isAuthPage = pathname === '/login' || pathname.startsWith('/api/');

  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{
          __html: `
          (function() {
            try {
              var theme = localStorage.getItem('supr_theme') || 'supr-clean';
              var palette = localStorage.getItem('supr_palette') || 'classic';
              var allowedThemes = ['supr-clean', 'neobrutalist', 'openclaw', 'hermes', 'google-neural', 'crt', 'cyberpunk', 'minimalist', 'design-notion', 'design-verge', 'design-carbon'];
              var allowedPalettes = ['classic', 'cyberpunk-neon', 'nordic-frost', 'forest-moss', 'vintage-orange', 'matrix-digital', 'sunset-glow', 'ocean-breeze', 'royal-velvet', 'sakura-pastel', 'minimal-monochrome', 'desert-cactus', 'corporate-tech', 'toxic-spill', 'warm-autumn', 'design-notion', 'design-verge'];
              
              if (allowedThemes.indexOf(theme) === -1) theme = 'supr-clean';
              if (allowedPalettes.indexOf(palette) === -1) palette = 'classic';
              
              document.documentElement.className = 'theme-' + theme + ' palette-' + palette + ' ' + document.documentElement.className;
            } catch (e) {}
          })()
          `
        }} />
      </head>
      <body suppressHydrationWarning className={`bg-background text-on-background font-body min-h-screen flex flex-col ${isAuthPage ? '' : 'md:flex-row'} antialiased selection:bg-primary-container selection:text-on-primary-container`}>
        <a 
          href="#main-content" 
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:bg-primary focus:text-on-primary focus:px-4 focus:py-2 focus:rounded focus:shadow-lg"
        >
          Skip to main content
        </a>
        <UiModeProvider>
          <ToastProvider>
            {!isAuthPage && <Sidebar />}
            <main id="main-content" tabIndex={-1} className={isAuthPage ? 'flex-1 w-full' : 'flex-1 min-w-0'}>
              {children}
            </main>
          </ToastProvider>
        </UiModeProvider>
      </body>
    </html>
  );
}
