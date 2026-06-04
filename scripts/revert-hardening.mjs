// scripts/revert-hardening.mjs
// Revert the auth hardening that broke the always-on assumption.
// The Supr agent is a long-running orchestrator — sessions should
// not aggressively expire, and there should be no "End Session"
// button in the UI. The auth flow is only for the initial setup
// (first-boot password) and as a defense-in-depth check at the
// proxy; once authed, the dashboard should be live indefinitely.
import { readFileSync, writeFileSync } from 'node:fs';

// --- 1) Restore session TTL to its original 7-day value. ------------------
const sessionPath = 'lib/session.ts';
let sessionSrc = readFileSync(sessionPath, 'utf-8');
if (sessionSrc.includes('60 * 60 * 8')) {
    sessionSrc = sessionSrc.replace('60 * 60 * 8', '60 * 60 * 24 * 7');
    writeFileSync(sessionPath, sessionSrc, 'utf-8');
    console.log('OK: session TTL restored to 7 days (long-running agent)');
}

// --- 2) Remove the "End Session" button from the Sidebar. -----------------
const sidebarPath = 'components/Sidebar.tsx';
let sidebarSrc = readFileSync(sidebarPath, 'utf-8');

const oldLogout = `      <div className="mt-4 pt-4 border-t-4 border-primary space-y-2">
        <button
          type="button"
          onClick={async () => {
            // SECURITY: thorough end-of-session cleanup. We:
            // 1. POST to /api/auth/logout so the server clears
            //    the session cookie via clearSessionCookie().
            // 2. Clear any session-scoped browser storage.
            // 3. Force a hard navigation to /login?logged_out=1
            //    so the user gets a clear "your session ended"
            //    confirmation (and so any in-memory React state
            //    is reset — \`window.location.href\` is a full
            //    page load, not a SPA navigation).
            try {
              await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
            } catch {}
            try {
              localStorage.removeItem('supr_theme');
              localStorage.removeItem('supr_palette');
              localStorage.removeItem('supr_no_persist');
            } catch {}
            try {
              sessionStorage.clear();
            } catch {}
            // Clear any in-memory caches that might leak the
            // session across tabs.
            try {
              if (typeof caches !== 'undefined') {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
              }
            } catch {}
            // The hash trick (\`#clean\`) plus \`replaceState\` is
            // a belt-and-braces way to prevent the back button
            // from re-entering the now-unauthenticated app.
            window.location.replace('/login?logged_out=1');
          }}
          className="w-full bg-error text-on-error font-headline font-bold uppercase py-2 px-3 border-2 border-primary hover:bg-tertiary hover:text-on-tertiary transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center justify-center gap-2"
          title="End the current session and return to the Security Gate"
        >
          <span className="material-symbols-outlined text-[16px]">logout</span>
          <span>End Session</span>
        </button>
        <p className="font-body text-[9px] text-on-surface-variant uppercase font-bold tracking-wider text-center leading-relaxed">
          Clears cookies, local cache, and forces re-authentication.
        </p>
      </div>`;

const newFooter = `      <div className="mt-4 pt-4 border-t-4 border-primary space-y-2">
        <p className="font-body text-[9px] text-on-surface-variant uppercase font-bold tracking-wider text-center leading-relaxed">
          Always-on autonomous supervisor.
          <br />
          Sessions persist for up to 7 days.
        </p>
      </div>`;

if (sidebarSrc.includes(oldLogout)) {
    sidebarSrc = sidebarSrc.replace(oldLogout, newFooter);
    writeFileSync(sidebarPath, sidebarSrc, 'utf-8');
    console.log('OK: Sidebar End Session button removed (long-running agent)');
}

// --- 3) Revert the login page hardening. ---------------------------------
//    We keep the auth flow itself, but remove the
//    Remember-me + logged_out notice since the session is now
//    a long-lived one.
const loginPath = 'app/login/page.tsx';
let loginSrc = readFileSync(loginPath, 'utf-8');

// Revert the state additions (rememberMe, notice).
const hardenedState = `  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSecured, setIsSecured] = useState<boolean | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Show a confirmation notice when the user just ended their
  // session or was bounced because the session expired.
  const notice = searchParams.get('logged_out') === '1'
    ? 'Your session has ended. Please re-enter the master access key to continue.'
    : searchParams.get('expired') === '1'
    ? 'Your session expired due to inactivity. Please re-enter the master access key to continue.'
    : null;`;

const originalState = `  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSecured, setIsSecured] = useState<boolean | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();`;

if (loginSrc.includes(hardenedState)) {
    loginSrc = loginSrc.replace(hardenedState, originalState);
    console.log('OK: login state reverted (no rememberMe, no notice)');
}

// Revert the body change.
const hardenedBody = `      if (res.ok && data.success) {
        // If "Remember me" is off, the server sets a session-
        // scoped cookie that dies when the browser closes. We
        // also clear it on a full reload so a stolen device
        // can't re-use the cookie.
        if (!rememberMe) {
          try {
            sessionStorage.setItem('supr_no_persist', '1');
          } catch {}
        }
        // Redirect to original page or home
        const redirectUrl = searchParams.get('callbackUrl') || '/';
        window.location.href = redirectUrl;
      } else {`;

const originalBody = `      if (res.ok && data.success) {
        // Redirect to original page or home
        const redirectUrl = searchParams.get('callbackUrl') || '/';
        window.location.href = redirectUrl;
      } else {`;

if (loginSrc.includes(hardenedBody)) {
    loginSrc = loginSrc.replace(hardenedBody, originalBody);
    console.log('OK: login body reverted (no rememberMe flag)');
}

// Remove the Remember-me checkbox + the notice banner that was
// injected before the submit button.
const hardenedButton = `          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 accent-primary border-2 border-primary"
            />
            <span className="font-body text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Remember me on this device
            </span>
          </label>
          {notice && (
            <div className="bg-tertiary-container border-2 border-tertiary p-3 text-xs font-body font-bold text-on-tertiary-container uppercase flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span>{notice}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary text-on-primary font-headline font-bold uppercase py-3.5 border-2 border-primary hover:bg-primary-fixed hover:text-primary transition-all duration-100 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
          >`;

const originalButton = `          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary text-on-primary font-headline font-bold uppercase py-3.5 border-2 border-primary hover:bg-primary-fixed hover:text-primary transition-all duration-100 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
          >`;

if (loginSrc.includes(hardenedButton)) {
    loginSrc = loginSrc.replace(hardenedButton, originalButton);
    console.log('OK: Remember-me + notice banner removed from login form');
}

writeFileSync(loginPath, loginSrc, 'utf-8');
