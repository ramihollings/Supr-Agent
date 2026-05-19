import { NextRequest } from 'next/server';
import { getActiveProvider } from '@/lib/providers/model';
import { PermissionEngine } from '@/lib/services/governance';
import { addActivityLog, getActiveMission } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        const sendJSON = (obj: any) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        };

        try {
          const mission = await getActiveMission();
          
          // 1. Governance Interception Check
          // (Simulated based on keywords for demo. In production, this runs against structured tool calls from the LLM)
          const lowerPrompt = prompt.toLowerCase();
          if (lowerPrompt.includes('deploy') || lowerPrompt.includes('delete') || lowerPrompt.includes('drop')) {
            const decision = PermissionEngine.evaluateAction(
              { id: 'a1', name: 'Supr', permissionTier: 'Execute', isPermanent: true },
              { name: 'Production Modification', requiredTier: 'Root', riskLevel: 'Critical' }
            );

            if (decision.status === 'RequiresApproval') {
              sendJSON({
                type: 'message',
                approvalRequest: {
                  id: `gate-${Date.now()}`,
                  requestingAgent: 'Supr',
                  action: 'Production Modification',
                  riskLevel: 'Critical',
                  permission: 'Root',
                  reason: decision.reason,
                  suprRecommendation: 'High-risk action intercepted. Human verification required before proceeding.'
                }
              });
              
              if (mission) {
                await addActivityLog(mission.id, {
                  eventType: 'approval',
                  actor: 'Supr',
                  actorIcon: 'psychology',
                  summary: 'Requested Root approval for critical action.',
                  detail: decision.reason
                });
              }
              
              controller.close();
              return;
            }
          }

          // 2. LLM Generation
          try {
            const provider = getActiveProvider('supr');
            const systemContext = mission ? `Active Mission: ${mission.name}. Objective: ${mission.objective}` : 'No active mission.';
            
            const responseText = await provider.generateContent(prompt, {
              systemInstruction: `You are Supr, the lead orchestrator AI. Respond concisely. Be direct and analytical. Use a neo-brutalist, pragmatic tone. ${systemContext}`
            });

            sendJSON({ type: 'message', content: responseText });
          } catch (llmError: any) {
            console.error("LLM Generation Error:", llmError);
            sendJSON({ 
              type: 'message', 
              content: `[FALLBACK MODE] I acknowledge your command: "${prompt}". Please configure GEMINI_API_KEY or BACKUP_LLM_API_KEY to enable live model generation. Error: ${llmError.message}` 
            });
          }
          
          // 3. Persist Activity
          if (mission) {
            await addActivityLog(mission.id, {
              eventType: 'supr_decision',
              actor: 'Supr',
              actorIcon: 'psychology',
              summary: 'Responded to command channel.',
              detail: prompt.substring(0, 100)
            });
          }

        } catch (err: any) {
           console.error("API Pipeline Error:", err);
           sendJSON({ type: 'message', content: `[SYSTEM ERROR] Pipeline failed: ${err.message}` });
        }
        
        controller.close();
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
    console.error('Outer API Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process request' }), { status: 500 });
  }
}
