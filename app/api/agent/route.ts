import { NextRequest } from 'next/server';
import { spawn } from 'child_process';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      start(controller) {
        // Initialize the Supr agent using local Google ADK CLI via uvx
        // We instruct it to use the supr.md brain and expect structured JSON back.
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

        // Helper to safely send JSON lines to the client
        const sendJSON = (obj: any) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        };

        // Fallback simulated response if ADK is not found or fails
        let hasOutput = false;

        agentProcess.stdout.on('data', (data) => {
          hasOutput = true;
          const text = data.toString();
          
          // Attempt to parse line by line to stream raw ADK output
          const lines = text.split('\n').filter((l: string) => l.trim() !== '');
          for (const line of lines) {
            try {
              // If it's already JSON, pipe it through
              JSON.parse(line);
              controller.enqueue(encoder.encode(line + '\n'));
            } catch {
              // If it's raw text, wrap it
              sendJSON({ type: 'message', content: line });
            }
          }
        });

        agentProcess.stderr.on('data', (data) => {
          console.error(`Agent Process Log: ${data.toString()}`);
        });

        agentProcess.on('close', (code) => {
          // If the process closed without output (e.g. uvx not installed), send a simulated fallback
          if (!hasOutput || code !== 0) {
            sendJSON({ 
              type: 'message', 
              content: 'Supr: Reaching out via the CLI failed or returned no response. Ensure `google-adk` is installed. Fallback mode activated. Processing command: "' + prompt + '"' 
            });
            
            // Send a simulated activity event
            setTimeout(() => {
              sendJSON({
                type: 'activity',
                event: {
                  id: Date.now().toString(),
                  agentName: 'Supr',
                  action: 'Processed command locally',
                  status: 'Success',
                  timestamp: new Date().toLocaleTimeString()
                }
              });
              controller.close();
            }, 1000);
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
