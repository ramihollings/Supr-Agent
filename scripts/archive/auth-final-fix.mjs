// scripts/auth-final-fix.mjs
// Final auth UX fix: dedicated /login layout that doesn't render
// the Sidebar at all, plus a Logout button in the Sidebar so the
// user can invalidate their session.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// 1) Create app/login/layout.tsx — minimal, no Sidebar.
const loginLayoutPath = 'app/login/layout.tsx';
const loginLayout = `import type { Metadata } from 'next';

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
`;
mkdirSync('app/login', { recursive: true });
writeFileSync(loginLayoutPath, loginLayout, 'utf-8');
console.log('OK: app/login/layout.tsx created (chrome-free auth surface)');

// 2) Revert app/layout.tsx to its original (server, no headers()
//    check) so the /login child layout wins.
const layoutPath = 'app/layout.tsx';
let layoutSrc = readFileSync(layoutPath, 'utf-8');

if (layoutSrc.includes("const hdrs = await headers()")) {
    // Revert to original.
    const newLayout = `import type {Metadata} from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { UiModeProvider } from '@/components/UiModeProvider';
import { ToastProvider } from '@/components/ToastProvider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' });

export const metadata: Metadata = {
  title: 'Supr - Orchestrator',
  description: 'Supervisor Agent Workspace for Governed AI Teams',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
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

    // Find the entire async function and replace it.
    const startMarker = 'export default async function RootLayout';
    const endMarker = '}\n';
    const startIdx = layoutSrc.indexOf(startMarker);
    if (startIdx !== -1) {
        // Find the matching close — we walk braces from the function start.
        const fnStart = layoutSrc.indexOf('(', startIdx) + 1;
        let depth = 0;
        let i = layoutSrc.indexOf('{', fnStart);
        for (; i < layoutSrc.length; i += 1) {
            if (layoutSrc[i] === '{') depth += 1;
            else if (layoutSrc[i] === '}') {
                depth -= 1;
                if (depth === 0) break;
            }
        }
        // Replace from the import line of "headers" through the closing brace.
        const headerImportIdx = layoutSrc.indexOf("import { headers }");
        const endIdx = i + 1;
        if (headerImportIdx !== -1 && endIdx > headerImportIdx) {
            layoutSrc = layoutSrc.substring(0, headerImportIdx) + newLayout + layoutSrc.substring(endIdx);
        }
    }
    writeFileSync(layoutPath, layoutSrc, 'utf-8');
    console.log('OK: app/layout.tsx reverted (no async pathname check)');
}

// 3) Revert app/login/page.tsx to use a simpler container.
//    The dedicated login layout already strips the Sidebar, so the
//    page just needs the form.
const loginPath = 'app/login/page.tsx';
let loginSrc = readFileSync(loginPath, 'utf-8');
if (loginSrc.includes('fixed inset-0')) {
    // Simplify the form container so it doesn't fight the dedicated
    // layout's <div className="min-h-screen">.
    loginSrc = loginSrc.replace(
        /<div className="fixed inset-0 w-screen h-screen bg-surface-container flex flex-col items-center justify-center p-4 md:p-8 selection:bg-primary-container selection:text-on-primary-container overflow-y-auto">/g,
        '<div className="w-full min-h-screen bg-surface-container flex flex-col items-center justify-center p-4 md:p-8 selection:bg-primary-container selection:text-on-primary-container">'
    );
    // Same for the loading and suspense wrappers.
    loginSrc = loginSrc.replace(
        /<div className="fixed inset-0 w-screen h-screen bg-surface-container flex flex-col items-center justify-center p-4 md:p-8 overflow-y-auto">/g,
        '<div className="w-full min-h-screen bg-surface-container flex flex-col items-center justify-center p-4 md:p-8">'
    );
    writeFileSync(loginPath, loginSrc, 'utf-8');
    console.log('OK: app/login/page.tsx simplified (dedicated layout owns the viewport)');
}

// 4) Add a Logout button to the Sidebar so the user can invalidate
//    their session.
const sidebarPath = 'components/Sidebar.tsx';
let sidebarSrc = readFileSync(sidebarPath, 'utf-8');
if (!sidebarSrc.includes('handleLogout') && !sidebarSrc.includes('/api/auth/logout')) {
    // Find the closing </aside> tag and insert a footer block before
    // it. We look for the last `</nav>` and append after it.
    const navCloseIdx = sidebarSrc.lastIndexOf('</nav>');
    if (navCloseIdx !== -1) {
        const insertAt = sidebarSrc.indexOf('</aside>', navCloseIdx);
        if (insertAt !== -1) {
            const logoutBlock = `
      <div className="mt-auto pt-4 border-t-4 border-primary">
        <button
          type="button"
          onClick={async () => {
            try {
              await fetch('/api/auth/logout', { method: 'POST' });
            } catch {}
            window.location.href = '/login';
          }}
          className="w-full bg-error text-on-error font-headline font-bold uppercase py-2 px-3 border-2 border-primary hover:bg-tertiary hover:text-on-tertiary transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center justify-center gap-2"
          title="End the current session and return to the Security Gate"
        >
          <span className="material-symbols-outlined text-[16px]">logout</span>
          <span>End Session</span>
        </button>
      </div>
`;
            sidebarSrc = sidebarSrc.substring(0, insertAt) + logoutBlock + sidebarSrc.substring(insertAt);
            writeFileSync(sidebarPath, sidebarSrc, 'utf-8');
            console.log('OK: Sidebar has an "End Session" button');
        }
    }
}
