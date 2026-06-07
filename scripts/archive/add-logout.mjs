// scripts/add-logout.mjs
// Add an "End Session" button to the Sidebar so the user can
// invalidate their session. Inserts right before the closing </nav>
// in SidebarContent.
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'components/Sidebar.tsx';
let src = readFileSync(path, 'utf-8');

if (src.includes('End Session')) {
    console.log('SKIP: End Session button already present');
    process.exit(0);
}

const navClose = src.lastIndexOf('</nav>');
if (navClose === -1) {
    console.error('Could not find closing </nav> in Sidebar');
    process.exit(1);
}

// Find the last `</div>` before </nav> — that's the nav container's
// last child. We insert the logout button block before that </div>
// close so it sits at the bottom of the nav, after the rest of the
// nav content.
const insertAt = navClose;
const logoutBlock = `
      <div className="mt-4 pt-4 border-t-4 border-primary">
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

src = src.substring(0, insertAt) + logoutBlock + src.substring(insertAt);
writeFileSync(path, src, 'utf-8');
console.log('OK: Sidebar has an "End Session" button');
