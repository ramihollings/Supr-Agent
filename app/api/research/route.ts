import { NextRequest } from 'next/server';
import { addActivityLog, addArtifact, addMemoryItem, getActiveMission, getMissionById } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth';
import { createAgentAction } from '@/lib/runtime/agent-actions';
import { runAgentRuntimeAction } from '@/lib/runtime/agent-runtime-runner';

export const dynamic = 'force-dynamic';

type ResearchSourceEvidence = {
  id: string;
  url: string;
  domain: string;
  title: string;
  snippets: string[];
  confidence: 'low' | 'medium' | 'high';
  retrievedAt: string;
};

function sourceId(url: string) {
  return `source-${Buffer.from(url).toString('base64url').slice(0, 24)}`;
}

async function fetchResearchSource(query: string) {
  try {
    const sourceUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const data = await response.json();
    const snippets: string[] = [];
    if (data.AbstractText) snippets.push(data.AbstractText);
    if (Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 4)) {
        if (topic.Text) snippets.push(topic.Text);
        if (Array.isArray(topic.Topics)) {
          snippets.push(...topic.Topics.map((item: any) => item.Text).filter(Boolean).slice(0, 2));
        }
      }
    }
    if (snippets.length === 0) return null;
    const url = data.AbstractURL || data.Results?.[0]?.FirstURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    return {
      mode: 'Live',
      url,
      domain: new URL(url).hostname.replace(/^www\./, ''),
      snippets: snippets.slice(0, 6),
      confidence: snippets.length >= 3 ? 'high' : snippets.length >= 1 ? 'medium' : 'low',
      retrievedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Research source fetch failed:', error);
    return null;
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
        const { query, missionId } = await req.json();
        if (!query?.trim()) {
          send({ type: 'error', content: 'No query provided.' });
          controller.close();
          return;
        }

        const mission = missionId ? await getMissionById(missionId) : await getActiveMission();
        const action = await createAgentAction({
          missionId: mission?.id || 'm1',
          agentId: 'a2',
          capability: 'web_scrape',
          intent: query,
          inputs: { query },
          riskLevel: 'Low',
          requiredPermission: 'Observe',
          metadata: { route: '/api/research' },
        });

        send({ type: 'status', phase: 'searching', content: `[RESEARCH AGENT] Dispatching research query: "${query}"` });
        await new Promise((resolve) => setTimeout(resolve, 600));
        send({ type: 'status', phase: 'browsing', content: '[RESEARCH AGENT] Web browser engaged. Scanning indexed sources...' });

        let url = '';
        let domain = '';
        let findings: string[] = [];
        let recommendation = '';
        let mode = 'no_source_evidence';
        let completionStatus: 'complete' | 'partial' = 'partial';
        let confidence: 'low' | 'medium' | 'high' = 'low';
        let sources: ResearchSourceEvidence[] = [];

        send({ type: 'status', phase: 'extracting', content: '[RESEARCH AGENT] Running governed source-evidence runtime...' });
        let runtime: Awaited<ReturnType<typeof runAgentRuntimeAction>> | { status: string; evidenceIds: string[]; failureReason?: string };
        try {
          runtime = await runAgentRuntimeAction({
            actionId: action.id,
            budget: { maxSteps: 4, timeoutMs: 60_000 },
          });
        } catch (runtimeError: any) {
          runtime = {
            status: 'pending_approval',
            evidenceIds: [],
            failureReason: runtimeError.message || String(runtimeError),
          };
          send({
            type: 'status',
            phase: 'extracting',
            content: `[RESEARCH AGENT] Governed runtime paused: ${runtime.failureReason}. Continuing with direct source collection.`,
          });
        }
        const liveSource = await fetchResearchSource(query);
        if (liveSource) {
          mode = 'Live';
          completionStatus = 'complete';
          url = liveSource.url;
          domain = liveSource.domain;
          confidence = liveSource.confidence as 'low' | 'medium' | 'high';
          sources = [{
            id: sourceId(liveSource.url),
            url: liveSource.url,
            domain: liveSource.domain,
            title: `${liveSource.domain} source evidence`,
            snippets: liveSource.snippets,
            confidence,
            retrievedAt: liveSource.retrievedAt,
          }];
          findings = liveSource.snippets.slice(0, 5).map((snippet) => `[Live source] ${snippet}`);
          recommendation = `Review ${domain} source signals and convert the strongest finding into a scoped task.`;
        } else {
          url = `no-source://research-agent/${encodeURIComponent(query.toLowerCase().replace(/\s+/g, '-'))}`;
          domain = 'no-source-evidence';
          findings = [];
          recommendation = `No source-backed evidence was found for "${query}". Treat this research run as partial and retry with a narrower query or configured search provider.`;
        }

        if (mission) {
          const filename = `research_${query.toLowerCase().replace(/\W+/g, '_').substring(0, 40)}.md`;
          const mdContent = [
            `# Research Intelligence Brief: ${query}`,
            '',
            '## Source Analysis',
            `- **Target Domain**: ${url}`,
            `- **Mode**: ${mode}`,
            `- **Evidence Status**: ${completionStatus}`,
            `- **Confidence**: ${confidence}`,
            `- **Timestamp**: ${new Date().toLocaleString()}`,
            '- **Agent**: Research Agent (WebBrowser v1.2)',
            '',
            '## Source Manifest',
            ...(
              sources.length > 0
                ? sources.map((source, index) => `${index + 1}. ${source.title} (${source.confidence}) - ${source.url}`)
                : ['- No source evidence captured. This brief is partial and must not be treated as verified.']
            ),
            '',
            '## Extracted Intelligence Signals',
            ...(findings.length > 0 ? findings.map((finding, index) => `${index + 1}. ${finding}`) : ['- No source-backed findings captured.']),
            '',
            '## Supr Recommendation',
            `> ${recommendation}`,
          ].join('\n');

          await addArtifact(mission.id, { filename, type: 'markdown', content: mdContent });

          for (const finding of findings) {
            await addMemoryItem(mission.id, { key: 'research_finding', value: finding, importance: 'High' });
          }
          for (const source of sources) {
            await addMemoryItem(mission.id, { key: 'research_source', value: JSON.stringify(source), importance: source.confidence === 'high' ? 'High' : 'Medium' });
          }

          await addActivityLog(mission.id, {
            eventType: completionStatus === 'complete' ? 'agent_action' : 'escalation',
            actor: 'Research Agent',
            actorIcon: 'travel_explore',
            summary: completionStatus === 'complete' ? `Research brief completed for: "${query}"` : `Research brief partial for: "${query}"`,
            detail: `${mode} research mode. Evidence status: ${completionStatus}. Confidence: ${confidence}. Runtime status: ${runtime.status}. ${findings.length} research signals extracted and persisted to SQLite. Markdown brief saved as ${filename}.`,
          });
        }

        send({
          type: 'result',
          phase: completionStatus === 'complete' ? 'done' : 'partial',
          actionId: action.id,
          traceId: action.traceId,
          findings,
          recommendation,
          url,
          domain,
          mode,
          completionStatus,
          confidence,
          sources,
          runtimeStatus: runtime.status,
          evidenceIds: runtime.evidenceIds,
          filename: mission ? `research_${query.toLowerCase().replace(/\W+/g, '_').substring(0, 40)}.md` : null,
        });
      } catch (err: any) {
        console.error('Research Agent API error:', err);
        send({ type: 'error', content: `Research pipeline failed: ${err.message}` });
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
