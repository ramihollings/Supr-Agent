import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { orchestrateMission } from '@/lib/orchestrator';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        // Initialize the Supr agent using local Google ADK CLI via uvx
        const agentProcess = spawn('uvx', [
          'google-agents', 
          'run', 
          '.agents/supr.md', 
          '--prompt', 
          prompt,
          '--json'
        ], {
          cwd: process.cwd(),
          shell: process.platform === 'win32'
        });

        const sendJSON = (obj: any) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        };

        let hasOutput = false;

        agentProcess.stdout.on('data', (data) => {
          hasOutput = true;
          const text = data.toString();
          const lines = text.split('\n').filter((l: string) => l.trim() !== '');
          for (const line of lines) {
            try {
              JSON.parse(line);
              controller.enqueue(encoder.encode(line + '\n'));
            } catch {
              sendJSON({ type: 'message', content: line });
            }
          }
        });

        agentProcess.on('close', async (code) => {
          if (!hasOutput || code !== 0) {
            // Use the Autonomous Orchestrator for the fallback path
            const response = await orchestrateMission('m1', prompt);
            sendJSON({ type: 'message', content: response });
            
            setTimeout(() => {
              sendJSON({
                type: 'activity',
                event: {
                  id: Date.now().toString(),
                  agentName: 'Supr',
                  action: 'Orchestrated next mission step',
                  status: 'Success',
                  timestamp: new Date().toLocaleTimeString()
                }
              });
              controller.close();
            }, 500);
          } else {
            controller.close();
          }
        });
        
        agentProcess.on('error', (err) => {
            console.error('Failed to spawn agent process:', err);
            sendJSON({ type: 'message', content: 'Supr: Failed to execute backend process. Check terminal logs.' });
            controller.close();
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to initialize agent' }), { status: 500 });
  }
}
