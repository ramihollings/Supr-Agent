import { NextRequest } from 'next/server';
import { getActiveMission, getMissionById } from '@/lib/db';
import { Mission } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  const projectId = req.nextUrl.searchParams.get('id');
  let lastMissionHash = '';

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const fetchProject = async (): Promise<Mission | undefined> => {
        if (projectId) {
          return await getMissionById(projectId);
        }
        return await getActiveMission();
      };

      // Initial send
      const initialMission = await fetchProject();
      if (initialMission) {
        lastMissionHash = JSON.stringify(initialMission);
        send(initialMission);
      }

      const interval = setInterval(async () => {
        try {
          const mission = await fetchProject();
          if (!mission) return;

          const currentHash = JSON.stringify(mission);
          if (currentHash !== lastMissionHash) {
            lastMissionHash = currentHash;
            send(mission);
          }
        } catch (error) {
          console.error('SSE Stream Error:', error);
        }
      }, 2000); // Poll every 2 seconds

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
