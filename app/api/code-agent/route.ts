import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { addActivityLog, addArtifact, updateArtifact, recordFailure, resolveFailure, getActiveMission, getMissionById } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';
import { createAgentAction, evaluateAgentAction } from '@/lib/runtime/agent-actions';
import { runAgentRuntimeAction } from '@/lib/runtime/agent-runtime-runner';
import { getActiveProvider } from '@/lib/providers/model';
import { getRuntimeMode, hasConfiguredModelProvider } from '@/lib/runtime/runtime-mode';

export const dynamic = 'force-dynamic';

type CodePatchPlan = {
  diagnosis: string;
  patchSummary: string;
  fixedCode: string;
  changed: boolean;
};

function stripJsonFence(value: string) {
  return value.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
}

async function proposeCodePatch(input: {
  filename: string;
  fileContent: string;
  researchContext?: string;
  validationFeedback?: string;
  attempt?: number;
}): Promise<CodePatchPlan> {
  const mode = await getRuntimeMode();
  if (!await hasConfiguredModelProvider()) {
    if (mode === 'real') {
      throw new Error('Code Agent requires a configured model provider in real runtime mode.');
    }
    return {
      diagnosis: 'No model provider is configured, so Code Agent preserved the file and marked the run as demo/offline.',
      patchSummary: 'No patch proposed without a model provider.',
      fixedCode: input.fileContent,
      changed: false,
    };
  }

  const provider = await getActiveProvider('code');
  const prompt = [
    `File: ${input.filename}`,
    '',
    'Current content:',
    '```',
    input.fileContent,
    '```',
    '',
    input.researchContext ? `Research context:\n${input.researchContext}` : 'Research context: none',
    '',
    input.validationFeedback ? `Previous validation failure:\n${input.validationFeedback}` : 'Previous validation failure: none',
    '',
    `Attempt: ${input.attempt || 1}`,
    '',
    'Return strict JSON only with this shape:',
    '{"diagnosis":"...","patchSummary":"...","fixedCode":"complete file contents"}',
    'Do not omit unchanged parts of the file. If no change is needed, fixedCode must exactly equal the current content and patchSummary must say why.',
  ].join('\n');

  const raw = await provider.generateContent(prompt, {
    systemInstruction: 'You are Supr Code Agent. Produce a complete, safe code patch as JSON only. No markdown.',
    temperature: 0.1,
    maxOutputTokens: 4000,
  });
  const parsed = JSON.parse(stripJsonFence(raw));
  const fixedCode = typeof parsed.fixedCode === 'string' ? parsed.fixedCode : input.fileContent;
  return {
    diagnosis: typeof parsed.diagnosis === 'string' ? parsed.diagnosis : 'Code Agent returned no diagnosis.',
    patchSummary: typeof parsed.patchSummary === 'string' ? parsed.patchSummary : 'Code Agent patch proposal.',
    fixedCode,
    changed: fixedCode !== input.fileContent,
  };
}

function readRuntimeWorkspaceFile(filename: string) {
  const safeName = path.basename(filename).trim();
  if (!safeName || safeName !== filename || safeName.startsWith('.') || safeName.includes('\0')) return null;
  const dir = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'supr_workspaces');
  const target = path.resolve(dir, safeName);
  if (!target.startsWith(dir + path.sep) || !fs.existsSync(target)) return null;
  return fs.readFileSync(target, 'utf-8');
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildValidationCommand(filename: string, content: string) {
  const safeName = path.basename(filename).trim();
  if (!safeName || safeName !== filename || safeName.startsWith('.') || safeName.includes('\0')) {
    throw new Error('Invalid validation filename.');
  }
  const encoded = Buffer.from(content, 'utf-8').toString('base64');
  const stagedFile = shellQuote(safeName);
  const stage = `printf %s ${shellQuote(encoded)} | base64 -d > ${stagedFile}`;
  const ext = path.extname(safeName).toLowerCase();

  if (ext === '.py') {
    return `${stage} && python -m py_compile ${stagedFile} && python - <<'PY'\nprint('validation_ok: python syntax')\nPY`;
  }
  if (ext === '.js' || ext === '.cjs' || ext === '.mjs') {
    return `${stage} && node --check ${stagedFile} && node -e "console.log('validation_ok: javascript syntax')"`;
  }
  if (ext === '.json') {
    return `${stage} && node -e "JSON.parse(require('fs').readFileSync(${JSON.stringify(safeName)}, 'utf8')); console.log('validation_ok: json parse')"`;
  }
  if (ext === '.ts' || ext === '.tsx') {
    return `${stage} && node -e "const fs=require('fs'); const c=fs.readFileSync(${JSON.stringify(safeName)}, 'utf8'); if(!c.trim()) throw new Error('empty file'); if((c.match(/[{}]/g)||[]).length===1) throw new Error('suspicious unbalanced braces'); console.log('validation_ok: typescript content staged')"`;
  }
  return `${stage} && test -s ${stagedFile} && echo validation_ok: file staged`;
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
        const { filename, fileContent, researchContext, missionId } = await req.json();

        if (!filename || !fileContent) {
          send({ type: 'error', content: 'No filename or file content provided.' });
          controller.close();
          return;
        }

        send({ type: 'status', phase: 'diagnosing', content: `[CODE AGENT] Scanning ${filename} for defects...` });
        const patchPlan = await proposeCodePatch({ filename, fileContent, researchContext });
        const proposedValidationCommand = buildValidationCommand(filename, patchPlan.fixedCode);
        send({ type: 'status', phase: 'patching', content: `[CODE AGENT] Patch proposed: ${patchPlan.patchSummary}` });

        const mission = missionId ? await getMissionById(missionId) : await getActiveMission();
        const action = await createAgentAction({
          missionId: mission?.id || 'm1',
          agentId: 'a3',
          capability: 'workspace_write_file',
          intent: `Analyze and fix ${filename}`,
          inputs: {
            filename,
            content: patchPlan.fixedCode,
            currentContent: fileContent,
            previousContent: fileContent,
            patchSummary: patchPlan.patchSummary,
            diagnosis: patchPlan.diagnosis,
            changed: patchPlan.changed,
            researchContext: researchContext || '',
            validationCommand: proposedValidationCommand,
          },
          riskLevel: 'Medium',
          requiredPermission: 'Edit',
          metadata: { route: '/api/code-agent' },
        });

        const gate = await evaluateAgentAction(action.id);
        if (gate.status === 'pending_approval') {
          send({
            type: 'approval_required',
            phase: 'blocked',
            actionId: action.id,
            approvalId: gate.approvalId,
            content: 'Code Agent fix is blocked until sandbox/code execution approval is approved.',
          });
          controller.close();
          return;
        }

        send({ type: 'status', phase: 'triaging', content: `[CODE AGENT] Running Diagnostics Console analysis on ${filename}...` });

        let diagnosis = patchPlan.diagnosis;
        let fix = patchPlan.patchSummary;
        let fixedCode = patchPlan.fixedCode;
        let testResult = '';
        let passed = false;
        let validationEvidenceIds: string[] = [];
        let patchEvidenceIds: string[] = [];

        send({ type: 'status', phase: 'generating', content: `[CODE AGENT] Running governed runtime loop for ${filename}...` });

        const runtime = await runAgentRuntimeAction({
          actionId: action.id,
          budget: { maxSteps: 5, timeoutMs: 90_000, retryLimit: 1 },
        });
        passed = runtime.status === 'completed' && runtime.evidenceIds.length > 0;
        patchEvidenceIds = runtime.evidenceIds;
        fixedCode = readRuntimeWorkspaceFile(filename) || fixedCode;
        diagnosis = `${diagnosis} ${runtime.finalSummary || (passed ? `Runtime completed ${filename}.` : `Runtime did not complete ${filename}.`)}`.trim();
        fix = passed ? `${fix}. Runtime evidence captured: ${runtime.evidenceIds.join(', ')}` : runtime.failureReason || 'Runtime failed before applying a patch.';
        testResult = passed ? `Runtime completed with ${runtime.evidenceIds.length} evidence link(s).` : runtime.failureReason || 'Runtime failed.';
        let validationApprovalId: string | null | undefined = null;
        let validationActionId: string | null = null;
        let retryPatchActionId: string | null = null;
        let retryValidationActionId: string | null = null;
        let retryAttempt = 0;

        if (passed && patchPlan.changed) {
          const validationCommand = buildValidationCommand(filename, fixedCode);
          const validationAction = await createAgentAction({
            missionId: mission?.id || 'm1',
            agentId: 'a3',
            capability: 'execute_command',
            intent: `Validate Code Agent patch for ${filename}`,
            inputs: {
              filename,
              command: validationCommand,
              validatesActionId: action.id,
            },
            riskLevel: 'High',
            requiredPermission: 'Execute',
            metadata: { route: '/api/code-agent', validatesActionId: action.id, requiresEvidence: true },
          });
          validationActionId = validationAction.id;
          const validationGate = await evaluateAgentAction(validationAction.id);
          if (validationGate.status === 'pending_approval') {
            validationApprovalId = validationGate.approvalId;
            passed = false;
            testResult = `Validation command requires approval before execution. Approval: ${validationApprovalId}`;
            fix = `${fix}. Patch applied; validation is blocked pending command approval.`;
          } else {
            const validationRuntime = await runAgentRuntimeAction({
              actionId: validationAction.id,
              budget: { maxSteps: 3, timeoutMs: 60_000, retryLimit: 1 },
            });
            passed = validationRuntime.status === 'completed' && validationRuntime.evidenceIds.length > 0;
            validationEvidenceIds = validationRuntime.evidenceIds;
            testResult = passed
              ? `Validation completed with ${validationRuntime.evidenceIds.length} evidence link(s).`
              : validationRuntime.failureReason || 'Validation failed.';
          }
        }

        if (!passed && patchPlan.changed && !validationApprovalId && await hasConfiguredModelProvider()) {
          retryAttempt = 1;
          const validationFeedback = testResult || 'Validation failed without a detailed error.';
          send({ type: 'status', phase: 'retrying', content: `[CODE AGENT] Validation failed. Retrying patch with feedback: ${validationFeedback}` });
          const retryPlan = await proposeCodePatch({
            filename,
            fileContent: fixedCode,
            researchContext,
            validationFeedback,
            attempt: 2,
          });

          const retryAction = await createAgentAction({
            missionId: mission?.id || 'm1',
            agentId: 'a3',
            capability: 'workspace_write_file',
            intent: `Retry Code Agent patch for ${filename}`,
            inputs: {
              filename,
              content: retryPlan.fixedCode,
              currentContent: fixedCode,
              previousContent: fixedCode,
              patchSummary: `Retry after validation failure: ${retryPlan.patchSummary}`,
              diagnosis: retryPlan.diagnosis,
              changed: retryPlan.changed,
              researchContext: researchContext || '',
              validationFeedback,
              retryOfActionId: action.id,
              validationCommand: buildValidationCommand(filename, retryPlan.fixedCode),
            },
            riskLevel: 'Medium',
            requiredPermission: 'Edit',
            metadata: { route: '/api/code-agent', retryOfActionId: action.id, retryAttempt },
          });
          retryPatchActionId = retryAction.id;

          const retryGate = await evaluateAgentAction(retryAction.id);
          if (retryGate.status === 'pending_approval') {
            validationApprovalId = retryGate.approvalId;
            testResult = `Retry patch requires approval before execution. Approval: ${validationApprovalId}`;
            fix = `${fix}. Retry patch is blocked pending approval.`;
          } else {
            const retryRuntime = await runAgentRuntimeAction({
              actionId: retryAction.id,
              budget: { maxSteps: 5, timeoutMs: 90_000, retryLimit: 1 },
            });
            if (retryRuntime.status === 'completed' && retryRuntime.evidenceIds.length > 0) {
              patchEvidenceIds = [...patchEvidenceIds, ...retryRuntime.evidenceIds];
              fixedCode = readRuntimeWorkspaceFile(filename) || retryPlan.fixedCode;
              diagnosis = `${diagnosis} Retry diagnosis: ${retryPlan.diagnosis}`.trim();
              fix = `${fix}. Retry patch applied: ${retryPlan.patchSummary}`;

              const retryValidationAction = await createAgentAction({
                missionId: mission?.id || 'm1',
                agentId: 'a3',
                capability: 'execute_command',
                intent: `Validate retry Code Agent patch for ${filename}`,
                inputs: {
                  filename,
                  command: buildValidationCommand(filename, fixedCode),
                  validatesActionId: retryAction.id,
                  retryOfActionId: validationActionId,
                },
                riskLevel: 'High',
                requiredPermission: 'Execute',
                metadata: { route: '/api/code-agent', validatesActionId: retryAction.id, retryOfActionId: validationActionId, retryAttempt, requiresEvidence: true },
              });
              retryValidationActionId = retryValidationAction.id;
              const retryValidationGate = await evaluateAgentAction(retryValidationAction.id);
              if (retryValidationGate.status === 'pending_approval') {
                validationApprovalId = retryValidationGate.approvalId;
                testResult = `Retry validation command requires approval before execution. Approval: ${validationApprovalId}`;
                fix = `${fix}. Retry validation is blocked pending command approval.`;
              } else {
                const retryValidationRuntime = await runAgentRuntimeAction({
                  actionId: retryValidationAction.id,
                  budget: { maxSteps: 3, timeoutMs: 60_000, retryLimit: 1 },
                });
                passed = retryValidationRuntime.status === 'completed' && retryValidationRuntime.evidenceIds.length > 0;
                validationEvidenceIds = [...validationEvidenceIds, ...retryValidationRuntime.evidenceIds];
                testResult = passed
                  ? `Retry validation completed with ${retryValidationRuntime.evidenceIds.length} evidence link(s).`
                  : retryValidationRuntime.failureReason || 'Retry validation failed.';
              }
            } else {
              testResult = retryRuntime.failureReason || 'Retry patch failed before validation.';
              fix = `${fix}. Retry patch failed before validation.`;
            }
          }
        }

        if (mission) {
          const existingArtifact = mission.artifacts?.find((artifact) => artifact.filename === filename);
          if (existingArtifact) {
            await updateArtifact(mission.id, filename, fixedCode);
          } else {
            await addArtifact(mission.id, { filename, type: 'code', content: fixedCode });
          }

          if (passed) {
            await addActivityLog(mission.id, {
              eventType: 'task_complete',
              actor: 'Code Agent',
              actorIcon: 'code',
              summary: `Diagnostics passed for ${filename}`,
              detail: `Fix applied: "${fix}". Test result: ${testResult}`,
            });
            const openFailure = mission.failures?.find((failure) => !failure.resolved && failure.agentName === 'Code Agent');
            if (openFailure) {
              await resolveFailure(mission.id, openFailure.id, `Code Agent resolved: ${fix}`);
            }
          } else {
            await recordFailure(mission.id, {
              agentName: 'Code Agent',
              failureType: 'AssertionError',
              summary: diagnosis,
              attemptNumber: 1,
              taskId: '',
              suprGuidance: fix,
            });
            await addActivityLog(mission.id, {
              eventType: 'escalation',
              actor: 'Code Agent',
              actorIcon: 'code',
              summary: `Diagnostics failed for ${filename}`,
              detail: `Diagnosis: "${diagnosis}". Escalating to Supr for review.`,
            });
          }
        }

        send({
          type: 'result',
          phase: passed ? 'passed' : 'failed',
          actionId: action.id,
          traceId: action.traceId,
          diagnosis,
          fix,
          fixedCode,
          testResult,
          passed,
          changed: patchPlan.changed,
          evidenceIds: patchEvidenceIds,
          validationEvidenceIds,
          validationActionId,
          validationApprovalId,
          retryAttempt,
          retryPatchActionId,
          retryValidationActionId,
        });
      } catch (err: any) {
        console.error('Code Agent API error:', err);
        send({ type: 'error', content: `Code Agent pipeline failed: ${err.message}` });
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
