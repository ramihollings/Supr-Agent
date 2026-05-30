import { NextRequest } from 'next/server';
import { getActiveProvider } from '@/lib/providers/model';
import { PermissionEngine } from '@/lib/services/governance';
import { addActivityLog, getActiveMission } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';
import dbClient from '@/lib/database/db_client';

export const dynamic = 'force-dynamic';

function extractRequestedAction(prompt: string) {
  const lower = prompt.toLowerCase();
  if (/\b(deploy|release|production|prod)\b/.test(lower)) {
    return { name: 'Production Modification', requiredTier: 'Root' as const, riskLevel: 'Critical' as const };
  }
  if (/\b(delete|remove|destroy|drop|truncate|wipe)\b/.test(lower)) {
    return { name: 'Destructive Data Operation', requiredTier: 'Root' as const, riskLevel: 'Critical' as const };
  }
  if (/\b(slack|github|gmail|webhook|external api)\b/.test(lower)) {
    return { name: 'External Connector Action', requiredTier: 'External_Act' as const, riskLevel: 'High' as const };
  }
  if (/\b(run|execute|sandbox|terminal|shell)\b/.test(lower)) {
    return { name: 'Sandbox Execution', requiredTier: 'Execute' as const, riskLevel: 'High' as const };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

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
          const requestedAction = extractRequestedAction(prompt);
          if (requestedAction) {
            const decision = PermissionEngine.evaluateAction(
              { id: 'a1', name: 'Supr', permissionTier: 'Execute', isPermanent: true },
              requestedAction
            );

            if (decision.status === 'RequiresApproval') {
              const approvalId = `gate-${Date.now()}`;
              if (mission) {
                await dbClient.execute(
                  `INSERT INTO Approvals (id, mission_id, requesting_agent_id, action, required_permission, risk_level, reason, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  [approvalId, mission.id, 'a1', requestedAction.name, requestedAction.requiredTier, requestedAction.riskLevel, decision.reason, 'pending']
                );
              }
              sendJSON({
                type: 'message',
                approvalRequest: {
                  id: approvalId,
                  requestingAgent: 'Supr',
                  action: requestedAction.name,
                  riskLevel: requestedAction.riskLevel,
                  permission: requestedAction.requiredTier,
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
            const provider = await getActiveProvider('supr');
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
