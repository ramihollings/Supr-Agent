// scripts/fix-auth-ui.mjs
// Security + UX fixes:
//   1. Hide the Sidebar / chrome on /login so the login form covers
//      the whole screen.
//   2. Add a /api/auth/logout endpoint that clears the session cookie.
//   3. Surface the logout in the Sidebar so the user can invalidate
//      a session they suspect is compromised.
import { readFileSync, writeFileSync } from 'node:fs';

// --- 1) RootLayout: hide chrome on /login. ----------------------------------
const layoutPath = 'app/layout.tsx';
let layoutSrc = readFileSync(layoutPath, 'utf-8');

const oldLayout = `import type {Metadata} from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { UiModeProvider } from '@/components/UiModeProvider';
import { ToastProvider } from '@/components/ToastProvider';`;

const newLayout = `import type {Metadata} from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { headers } from 'next/headers';
import { Sidebar } from '@/components/Sidebar';
import { UiModeProvider } from '@/components/UiModeProvider';
import { ToastProvider } from '@/components/ToastProvider';`;

if (layoutSrc.includes(oldLayout) && !layoutSrc.includes('headers()')) {
    layoutSrc = layoutSrc.replace(oldLayout, newLayout);
}

const oldRootLayout = `export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning className={\`\${inter.variable} \${spaceGrotesk.variable}\`}>
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: \`
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
        \`}} />
      </head>
      <body suppressHydrationWarning className="bg-background text-on-background font-body min-h-screen flex flex-col md:flex-row antialiased selection:bg-primary-container selection:text-on-primary-container">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:bg-primary focus:text-on-primary focus:px-4 focus:py-2 focus:rounded focus:shadow-lg"
        >
          Skip to main content
        </a>
        <UiModeProvider>
          <ToastProvider>
            <Sidebar />
            <main id="main-content" tabIndex={-1} className="flex-1 min-w-0">
              {children}
            </main>
          </ToastProvider>
        </UiModeProvider>
      </body>
    </html>
  );
}`;

const newRootLayout = `export default async function RootLayout({children}: {children: React.ReactNode}) {
  // SECURITY + UX: when the user is on /login or any other auth
  // page, hide the Sidebar and other chrome so the login form
  // covers the whole viewport. Without this, the login form was
  // rendered to the right of the sidebar, leaving the sidebar
  // visible (and clickable) on the unauthenticated /login page.
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') || hdrs.get('x-invoke-path') || '';
  const isAuthPage = pathname === '/login' || pathname.startsWith('/api/');
  return (
    <html lang="en" suppressHydrationWarning className={\`\${inter.variable} \${spaceGrotesk.variable}\`}>
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: \`
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
        \`}} />
      </head>
      <body suppressHydrationWarning className={\`bg-background text-on-background font-body min-h-screen flex flex-col \${isAuthPage ? '' : 'md:flex-row'} antialiased selection:bg-primary-container selection:text-on-primary-container\`}>
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
}`;

if (layoutSrc.includes(oldRootLayout) && !layoutSrc.includes('isAuthPage')) {
    layoutSrc = layoutSrc.replace(oldRootLayout, newRootLayout);
}

writeFileSync(layoutPath, layoutSrc, 'utf-8');
console.log('OK: app/layout.tsx hides chrome on /login');

// --- 2) Login page: ensure the form covers the full viewport. -----
const loginPath = 'app/login/page.tsx';
let loginSrc = readFileSync(loginPath, 'utf-8');

const oldLoginWrapper = `  return (
    <div className="flex-1 min-h-screen bg-surface-container flex flex-col items-center justify-center p-4 md:p-8 selection:bg-primary-container selection:text-on-primary-container">
      <div className="max-w-md w-full bg-background border-4 border-primary shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-8 relative overflow-hidden">`;

const newLoginWrapper = `  return (
    <div className="fixed inset-0 w-screen h-screen bg-surface-container flex flex-col items-center justify-center p-4 md:p-8 selection:bg-primary-container selection:text-on-primary-container overflow-y-auto">
      <div className="max-w-md w-full bg-background border-4 border-primary shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-8 relative overflow-hidden my-auto">`;

if (loginSrc.includes(oldLoginWrapper) && !loginSrc.includes('fixed inset-0')) {
    loginSrc = loginSrc.replace(oldLoginWrapper, newLoginWrapper);
}

const oldLoadingWrapper = `  if (isSecured === null) {
    return (
      <div className="flex-1 min-h-screen bg-surface-container flex flex-col items-center justify-center p-4 md:p-8">
        <div className="max-w-md w-full bg-background border-4 border-primary shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-8 text-center">
          <p className="font-headline font-bold text-sm uppercase text-primary animate-pulse">Checking Node clearance...</p>
        </div>
      </div>
    );
  }`;

const newLoadingWrapper = `  if (isSecured === null) {
    return (
      <div className="fixed inset-0 w-screen h-screen bg-surface-container flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto">
        <div className="max-w-md w-full bg-background border-4 border-primary shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-8 text-center my-auto">
          <p className="font-headline font-bold text-sm uppercase text-primary animate-pulse">Checking Node clearance...</p>
        </div>
      </div>
    );
  }`;

if (loginSrc.includes(oldLoadingWrapper) && !loginSrc.includes('h-screen bg-surface-container flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto">')) {
    loginSrc = loginSrc.replace(oldLoadingWrapper, newLoadingWrapper);
}

const oldSuspenseFallback = `    <Suspense fallback={
      <div className="flex-1 min-h-screen bg-surface-container flex flex-col items-center justify-center p-4 md:p-8">
        <div className="max-w-md w-full bg-background border-4 border-primary shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-8 text-center">
          <p className="font-headline font-bold text-sm uppercase text-primary animate-pulse">Initializing Decryption...</p>
        </div>
      </div>
    }>`;

const newSuspenseFallback = `    <Suspense fallback={
      <div className="fixed inset-0 w-screen h-screen bg-surface-container flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto">
        <div className="max-w-md w-full bg-background border-4 border-primary shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-8 text-center my-auto">
          <p className="font-headline font-bold text-sm uppercase text-primary animate-pulse">Initializing Decryption...</p>
        </div>
      </div>
    }>`;

if (loginSrc.includes(oldSuspenseFallback) && !loginSrc.includes('h-screen bg-surface-container flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto">')) {
    loginSrc = loginSrc.replace(oldSuspenseFallback, newSuspenseFallback);
}

writeFileSync(loginPath, loginSrc, 'utf-8');
console.log('OK: app/login/page.tsx covers full viewport');

// --- 3) Add /api/auth/logout endpoint. ---------------------------------------
const logoutDir = 'app/api/auth/logout';
const logoutRoute = logoutDir + '/route.ts';
const logoutContent = `import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';
import { requireApiAuth } from '@/lib/auth';
import { telemetry } from '@/lib/telemetry';

export const dynamic = 'force-dynamic';

// POST /api/auth/logout
// Clears the session cookie. Requires the request to currently be
// authenticated so a stolen session cookie can't be used to log the
// victim out as a denial-of-service primitive.
export async function POST(request: Request) {
  const authError = await requireApiAuth(request);
  if (authError) return authError;
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  telemetry.info('auth.logout', { at: new Date().toISOString() });
  return response;
}
`;

import { mkdirSync } from 'node:fs';
mkdirSync(logoutDir, { recursive: true });
writeFileSync(logoutRoute, logoutContent, 'utf-8');
console.log('OK: /api/auth/logout endpoint added');
