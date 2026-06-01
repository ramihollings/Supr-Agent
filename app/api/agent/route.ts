import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { routeIntakeToProjectFlow } from '@/lib/runtime/project-flow';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  try {
    const { prompt, projectId } = await req.json();
    const content = String(prompt || '').trim();
    if (!content) {
      return new Response(JSON.stringify({ error: 'Prompt is required.' }), { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendJSON = (obj: any) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        };

        try {
          const routed = await routeIntakeToProjectFlow({
            source: 'api',
            content,
            projectId: projectId || null,
            actorId: 'supr-chat',
          });
          sendJSON({
            type: 'message',
            content: routed.success
              ? `Supr routed this into Project Flow.\n${routed.response}`
              : `Project Flow routing failed: ${routed.error}`,
            flowRunId: routed.flowRunId,
            missionId: routed.missionId,
            commandId: routed.commandId,
          });
        } catch (error: any) {
          sendJSON({ type: 'message', content: `[SYSTEM ERROR] Project Flow routing failed: ${error.message || String(error)}` });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Agent API Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process request' }), { status: 500 });
  }
}
