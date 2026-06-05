import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { addActivityLog, getActiveMission, getMissionById } from '@/lib/db';
// Direct import of the CloakBrowser-backed web_scrape tool. We avoid
// the registry so we can also reach it before `lib/tools/register.ts`
// has been loaded (and so we don't collide with the lightweight
// `web_scrape` defined in `lib/tools/project-flow.ts`).
import { webScrapeTool } from '@/lib/tools/browser';

export const dynamic = 'force-dynamic';
// CloakBrowser launches its own Chromium process and waits up to 30s
// for `networkidle`. Allow up to 90s for the streaming response.
export const maxDuration = 90;

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      };

      try {
        const body = await req.json().catch(() => ({}));
        const url = typeof body?.url === 'string' ? body.url.trim() : '';
        const selector = typeof body?.selector === 'string' ? body.selector : undefined;
        const missionId: string | undefined = typeof body?.missionId === 'string' ? body.missionId : undefined;

        if (!url) {
          send({ type: 'error', content: 'No URL provided.' });
          controller.close();
          return;
        }
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(url);
        } catch {
          send({ type: 'error', content: `Not a valid URL: ${url}` });
          controller.close();
          return;
        }
        if (!/^https?:$/.test(parsedUrl.protocol)) {
          send({ type: 'error', content: `Unsupported protocol: ${parsedUrl.protocol}` });
          controller.close();
          return;
        }

        const mission = missionId ? await getMissionById(missionId) : await getActiveMission();

        const cloakPath = process.env.CLOAKBROWSER_PATH;
        send({
          type: 'status',
          phase: 'navigating',
          content: cloakPath
            ? `[CLOAKBROWSER] Launching ${safeHost(cloakPath)} -> navigating to ${parsedUrl.href}`
            : `[CLOAKBROWSER] CLOAKBROWSER_PATH is not set; live browsing is disabled.`,
        });

        if (!cloakPath) {
          send({
            type: 'error',
            content: 'CLOAKBROWSER_PATH environment variable is required for live browser scraping. Set it in your environment (e.g. /usr/bin/cloakbrowser) and restart the server.',
          });
          controller.close();
          return;
        }

        const startedAt = Date.now();
        let output: string | { url: string; finalUrl: string; title: string; text: string; html: string; statusCode: number | null; retrievedAt: string };
        try {
          output = await webScrapeTool.execute(
            { url: parsedUrl.href, selector, format: 'both' },
            { agentId: 'a2', missionId: mission?.id },
          ) as typeof output;
        } catch (toolError: any) {
          send({ type: 'error', content: toolError.message || 'CloakBrowser execution failed.' });
          if (mission) {
            await addActivityLog(mission.id, {
              eventType: 'failure',
              actor: 'Research Agent',
              actorIcon: 'travel_explore',
              summary: `CloakBrowser navigation failed: ${parsedUrl.href}`,
              detail: toolError.message || String(toolError),
            });
          }
          controller.close();
          return;
        }

        if (typeof output === 'string') {
          // Legacy text-only response. The Research workspace will fall
          // back to rendering the text inside a <pre> panel since there
          // is no HTML to iframe.
          send({
            type: 'fetched',
            phase: 'fetched',
            url: parsedUrl.href,
            finalUrl: parsedUrl.href,
            title: safeHost(parsedUrl.href),
            text: output,
            html: '',
            statusCode: null,
            durationMs: Date.now() - startedAt,
            fallback: 'text',
          });
        } else {
          send({
            type: 'fetched',
            phase: 'fetched',
            url: output.url,
            finalUrl: output.finalUrl,
            title: output.title,
            text: output.text,
            html: output.html,
            statusCode: output.statusCode,
            durationMs: Date.now() - startedAt,
            retrievedAt: output.retrievedAt,
          });
        }

        if (mission) {
          await addActivityLog(mission.id, {
            eventType: 'agent_action',
            actor: 'Research Agent',
            actorIcon: 'travel_explore',
            summary: `CloakBrowser fetched ${parsedUrl.href}`,
            detail: `CloakBrowser navigated to ${parsedUrl.href} and returned the rendered page via Playwright. Title: "${typeof output === 'string' ? safeHost(parsedUrl.href) : output.title}". Duration: ${Date.now() - startedAt}ms.`,
          });
        }

        send({ type: 'done', phase: 'done' });
      } catch (err: any) {
        send({ type: 'error', content: `CloakBrowser pipeline failed: ${err.message || String(err)}` });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
