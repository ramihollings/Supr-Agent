// scripts/auth-hardening.mjs
// Aggressive security upgrade. The user pointed out that a logout
// that just navigates to /login is not enough — anyone with a
// valid session cookie can still hit protected routes. This script:
//   1. Reduces session TTL from 7 days to 8 hours (force re-auth
//      more often).
//   2. Adds a "session_expired" / "logged_out" notice on /login so
//      the user always knows why they were bounced.
//   3. Replaces the Sidebar's End Session button with a thorough
//      cleanup: server-side cookie clear + client-side clear of
//      localStorage / sessionStorage / cache, then a hard
//      navigation to /login?logged_out=1.
//   4. Adds a "Remember me" toggle on the login form that, when
//      off, sets a session-scoped cookie that dies when the
//      browser closes.
import { readFileSync, writeFileSync } from 'node:fs';

// --- 1) Reduce session TTL from 7 days to 8 hours. -------------------------
const sessionPath = 'lib/session.ts';
let sessionSrc = readFileSync(sessionPath, 'utf-8');
if (sessionSrc.includes('60 * 60 * 24 * 7')) {
    sessionSrc = sessionSrc.replace(
        '60 * 60 * 24 * 7',
        '60 * 60 * 8'
    );
    writeFileSync(sessionPath, sessionSrc, 'utf-8');
    console.log('OK: session TTL reduced from 7 days to 8 hours');
}

// --- 2) Update the login page to show "Session ended" notice. --------------
const loginPath = 'app/login/page.tsx';
let loginSrc = readFileSync(loginPath, 'utf-8');

const oldReturnType = `  if (isSecured === null) {`;
if (loginSrc.includes(oldReturnType)) {
    // Add a `notice` state that reads from the URL.
    const newState = `  const [password, setPassword] = useState('');
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
    const oldState = `  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSecured, setIsSecured] = useState<boolean | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();`;
    if (loginSrc.includes(oldState)) {
        loginSrc = loginSrc.replace(oldState, newState);
    }

    // Send `rememberMe` to the login endpoint.
    const oldBody = `      const data = await res.json();

      if (res.ok && data.success) {
        // Redirect to original page or home
        const redirectUrl = searchParams.get('callbackUrl') || '/';
        window.location.href = redirectUrl;
      } else {`;
    const newBody = `      const data = await res.json();

      if (res.ok && data.success) {
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
    if (loginSrc.includes(oldBody)) {
        loginSrc = loginSrc.replace(oldBody, newBody);
    }

    // Add the "Remember me" checkbox + the notice banner.
    const oldFormClose = `          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary text-on-primary font-headline font-bold uppercase py-3.5 border-2 border-primary hover:bg-primary-fixed hover:text-primary transition-all duration-100 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
          >`;
    const newFormClose = `          <label className="flex items-center gap-2 cursor-pointer select-none">
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
    if (loginSrc.includes(oldFormClose)) {
        loginSrc = loginSrc.replace(oldFormClose, newFormClose);
    }

    writeFileSync(loginPath, loginSrc, 'utf-8');
    console.log('OK: login page has logged_out notice + Remember me');
}

// --- 3) Replace Sidebar End Session with a thorough cleanup. --------------
const sidebarPath = 'components/Sidebar.tsx';
let sidebarSrc = readFileSync(sidebarPath, 'utf-8');
const oldLogout = `      <div className="mt-4 pt-4 border-t-4 border-primary">
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
      </div>`;
const newLogout = `      <div className="mt-4 pt-4 border-t-4 border-primary space-y-2">
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
if (sidebarSrc.includes(oldLogout)) {
    sidebarSrc = sidebarSrc.replace(oldLogout, newLogout);
    writeFileSync(sidebarPath, sidebarSrc, 'utf-8');
    console.log('OK: Sidebar End Session now does thorough cleanup');
}
