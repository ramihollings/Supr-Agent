"use client";

import { TopNav } from "@/components/TopNav";
import {
  createAgentBlueprintAction,
  createAgentGroupAction,
  fetchSupervisorConsoleAction,
  fetchProductionHealthAction,
  promoteLearnedSkillDraftAction,
  rejectLearnedSkillDraftAction,
  requestLearnedSkillReviewAction,
  upsertMemorySectionAction,
} from "@/app/actions";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

function SupervisorConsoleContent() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("id") || undefined;
  const [data, setData] = useState<any>({
    mission: null,
    agents: [],
    groups: [],
    blueprints: [],
    memorySections: [],
    metrics: [],
    guidelinePacks: [],
    learnedSkillDrafts: [],
    runtimeDecisions: { replanDecisions: [], providerRouteDecisions: [], outboundMessages: [], executionSettings: {} },
  });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [blueprintPrompt, setBlueprintPrompt] = useState("Build a code-focused agent that can implement and verify UI/backend integration safely.");
  const [groupName, setGroupName] = useState("Supervisor Delivery Cell");
  const [sharedContext, setSharedContext] = useState("Coordinate implementation, approval gates, evidence, and review handoffs for this project.");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [memoryDraft, setMemoryDraft] = useState({
    title: "Supervisor Operating Note",
    content: "Explain governance decisions visibly and keep task completion evidence-backed.",
    injectionStatus: "active" as "active" | "inactive",
  });

  const activeAgents = useMemo(() => data.agents.filter((agent: any) => agent.isActive), [data.agents]);
  const supervisor = activeAgents.find((agent: any) => agent.name?.toLowerCase() === "supr") || activeAgents[0];
  const runtimeDecisions = data.runtimeDecisions || { replanDecisions: [], providerRouteDecisions: [], outboundMessages: [], executionSettings: {} };
  const productionHealth = runtimeDecisions.productionHealth;

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const next = await fetchSupervisorConsoleAction(projectId);
    setData(next);
    setSelectedMembers((next.agents || []).filter((agent: any) => agent.isActive && agent.name !== "Supr").slice(0, 3).map((agent: any) => agent.id));
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleBlueprint = async () => {
    if (!blueprintPrompt.trim()) return;
    const res = await createAgentBlueprintAction(blueprintPrompt, projectId);
    showToast(res.success ? "Agent blueprint created" : res.error || "Blueprint failed");
    if (res.success) await load();
  };

  const handleGroup = async () => {
    if (!projectId) {
      showToast("Open a project to create an agent group");
      return;
    }
    if (!supervisor) {
      showToast("No active supervisor agent found");
      return;
    }
    const res = await createAgentGroupAction({
      projectId,
      name: groupName,
      supervisorAgentId: supervisor.id,
      memberAgentIds: selectedMembers,
      sharedContext,
    });
    showToast(res.success ? "Agent group created" : res.error || "Group creation failed");
    if (res.success) await load();
  };

  const handleMemory = async () => {
    const res = await upsertMemorySectionAction({
      projectId,
      ...memoryDraft,
    });
    showToast(res.success ? "Memory section saved" : res.error || "Memory save failed");
    if (res.success) await load();
  };

  const handleRequestSkillReview = async (draftId: string) => {
    const res = await requestLearnedSkillReviewAction(draftId);
    showToast(res.success ? "Skill review requested" : res.error || "Review request failed");
    if (res.success) await load();
  };

  const handlePromoteSkill = async (draftId: string) => {
    const res = await promoteLearnedSkillDraftAction(draftId);
    showToast(res.success ? "Learned skill promoted" : res.error || "Promotion failed");
    if (res.success) await load();
  };

  const handleRejectSkill = async (draftId: string) => {
    const res = await rejectLearnedSkillDraftAction(draftId);
    showToast(res.success ? "Learned skill rejected" : res.error || "Reject failed");
    if (res.success) await load();
  };

  const handleModelProbe = async () => {
    showToast("Running live model probe");
    const health = await fetchProductionHealthAction({ probeModel: true });
    setData((prev: any) => ({
      ...prev,
      runtimeDecisions: {
        ...(prev.runtimeDecisions || {}),
        productionHealth: health,
      },
    }));
    showToast(health.status === "fail" ? "Production probe failed" : "Production probe complete");
  };

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden relative">
      <TopNav title="Supervisor Console" />

      {toast && (
        <div className="fixed bottom-8 right-8 bg-surface-container-high border-4 border-primary p-4 z-50 neo-shadow font-headline font-bold uppercase text-sm">
          {toast}
        </div>
      )}

      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        <header className="border-b-4 border-primary pb-6 mb-6">
          <h1 className="font-headline text-4xl md:text-5xl font-black uppercase tracking-tighter text-primary">Supervisor Console</h1>
          <p className="font-body text-sm font-bold mt-2 text-on-surface-variant max-w-3xl border-l-4 border-secondary pl-3">
            One place for governing-agent structure: team groups, agent blueprints, editable memory, privacy metrics, and review guidelines.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] uppercase text-primary">
            <span className="neo-border-sm bg-background px-2 py-1">{data.mission ? data.mission.name : "No active project selected"}</span>
            <span className="neo-border-sm bg-background px-2 py-1">{activeAgents.length} active agents</span>
            <span className="neo-border-sm bg-background px-2 py-1">{data.guidelinePacks.length} guideline packs</span>
          </div>
        </header>

        {loading ? (
          <p className="font-headline font-bold uppercase text-primary animate-pulse">Loading supervisor state...</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <section className="xl:col-span-3 neo-border bg-background">
              <div className="bg-surface-variant border-b-4 border-primary p-4">
                <h2 className="font-headline font-black uppercase text-xl text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined">account_tree</span>
                  Runtime Decisions
                </h2>
              </div>
              <div className="p-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
                <article className="bg-surface-container border-2 border-primary p-3">
                  <h3 className="font-headline font-black uppercase text-primary text-sm">Sandbox Choice</h3>
                  <dl className="mt-2 space-y-1 font-mono text-[10px]">
                    <div className="flex justify-between gap-3"><dt>Mode</dt><dd>{runtimeDecisions.executionSettings.runtime_mode || "real"}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Docker</dt><dd>{runtimeDecisions.executionSettings.docker_available === "true" ? "available" : "not enabled"}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Remote</dt><dd>{runtimeDecisions.executionSettings.remote_execution_enabled === "true" ? "enabled" : "disabled"}</dd></div>
                  </dl>
                </article>

                <article className="bg-surface-container border-2 border-primary p-3">
                  <h3 className="font-headline font-black uppercase text-primary text-sm">Provider Routing</h3>
                  <div className="mt-2 space-y-2 max-h-36 overflow-y-auto custom-scrollbar">
                    {runtimeDecisions.providerRouteDecisions.length === 0 ? (
                      <p className="font-body text-[11px] text-on-surface-variant">No provider route decisions recorded.</p>
                    ) : runtimeDecisions.providerRouteDecisions.map((decision: any) => (
                      <div key={decision.id} className="font-mono text-[10px] border-b border-outline-variant pb-2">
                        {decision.agentRole}: {decision.provider}{decision.model ? ` / ${decision.model}` : ""}
                        {decision.fallbackProvider ? ` -> ${decision.fallbackProvider}` : ""}
                        {decision.failureReason ? <p className="text-error mt-1">{decision.failureReason}</p> : null}
                      </div>
                    ))}
                  </div>
                </article>

                <article className="bg-surface-container border-2 border-primary p-3">
                  <h3 className="font-headline font-black uppercase text-primary text-sm">Replans</h3>
                  <div className="mt-2 space-y-2 max-h-36 overflow-y-auto custom-scrollbar">
                    {runtimeDecisions.replanDecisions.length === 0 ? (
                      <p className="font-body text-[11px] text-on-surface-variant">No replans recorded.</p>
                    ) : runtimeDecisions.replanDecisions.map((decision: any) => (
                      <div key={decision.id} className="font-mono text-[10px] border-b border-outline-variant pb-2">
                        {decision.trigger} / {decision.plannerSource}
                        <p className="text-on-surface-variant mt-1">
                          +{decision.insertedActionIds.length} inserted / -{decision.removedActionIds.length} removed
                        </p>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="bg-surface-container border-2 border-primary p-3">
                  <h3 className="font-headline font-black uppercase text-primary text-sm">Outbound Messages</h3>
                  <div className="mt-2 space-y-2 max-h-36 overflow-y-auto custom-scrollbar">
                    {runtimeDecisions.outboundMessages.length === 0 ? (
                      <p className="font-body text-[11px] text-on-surface-variant">No outbound notifications recorded.</p>
                    ) : runtimeDecisions.outboundMessages.map((message: any) => (
                      <div key={message.id} className="font-mono text-[10px] border-b border-outline-variant pb-2">
                        {message.source} / {message.reason} / {message.status}
                        {message.error ? <p className="text-error mt-1">{message.error}</p> : null}
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </section>

            <section className="xl:col-span-3 neo-border bg-background">
              <div className="bg-surface-variant border-b-4 border-primary p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <h2 className="font-headline font-black uppercase text-xl text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined">health_and_safety</span>
                  Production Health
                </h2>
                <button
                  onClick={handleModelProbe}
                  className="neo-border-sm bg-primary text-on-primary px-3 py-2 font-headline font-black uppercase text-xs hover:bg-tertiary hover:text-on-tertiary transition-colors"
                >
                  Probe Live Model
                </button>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <article className="bg-surface-container border-2 border-primary p-3">
                  <h3 className="font-headline font-black uppercase text-primary text-sm">Status</h3>
                  <p className={`mt-2 font-headline font-black uppercase text-2xl ${
                    productionHealth?.status === "fail" ? "text-error" : productionHealth?.status === "warn" ? "text-secondary" : "text-tertiary"
                  }`}>
                    {productionHealth?.status || "unknown"}
                  </p>
                  <p className="font-mono text-[9px] uppercase text-on-surface-variant mt-1">{productionHealth?.generatedAt || "not checked"}</p>
                </article>
                <article className="bg-surface-container border-2 border-primary p-3">
                  <h3 className="font-headline font-black uppercase text-primary text-sm">LLM</h3>
                  <dl className="mt-2 space-y-1 font-mono text-[10px]">
                    <div className="flex justify-between gap-3"><dt>Provider</dt><dd>{productionHealth?.llm?.activeProvider?.name || "missing"}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Model</dt><dd>{productionHealth?.llm?.activeProvider?.model || productionHealth?.llm?.minimaxModel || "unknown"}</dd></div>
                    <div className="flex justify-between gap-3"><dt>MiniMax</dt><dd>{productionHealth?.llm?.minimaxConfigured ? "configured" : "missing"}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Probe</dt><dd>{productionHealth?.llm?.modelProbe ? (productionHealth.llm.modelProbe.ok ? "pass" : "fail") : "not run"}</dd></div>
                  </dl>
                </article>
                <article className="bg-surface-container border-2 border-primary p-3">
                  <h3 className="font-headline font-black uppercase text-primary text-sm">Auth</h3>
                  <dl className="mt-2 space-y-1 font-mono text-[10px]">
                    <div className="flex justify-between gap-3"><dt>Secured</dt><dd>{productionHealth?.auth?.secured ? "yes" : "no"}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Password</dt><dd>{productionHealth?.auth?.passwordLooksDefault ? "default risk" : "set"}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Session</dt><dd>{productionHealth?.auth?.sessionSecretSource || "unknown"}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Cookies</dt><dd>{productionHealth?.auth?.secureCookiePolicy || "unknown"}</dd></div>
                  </dl>
                </article>
                <article className="bg-surface-container border-2 border-primary p-3">
                  <h3 className="font-headline font-black uppercase text-primary text-sm">Channels</h3>
                  <div className="mt-2 space-y-1 font-mono text-[10px]">
                    {(productionHealth?.channels || []).map((channel: any) => (
                      <div key={channel.id} className="flex justify-between gap-3">
                        <span>{channel.id}</span>
                        <span>{channel.status}</span>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="md:col-span-2 bg-surface-container border-2 border-primary p-3">
                  <h3 className="font-headline font-black uppercase text-primary text-sm">Warnings</h3>
                  <div className="mt-2 space-y-1 font-body text-[11px] text-on-surface-variant max-h-32 overflow-y-auto custom-scrollbar">
                    {(productionHealth?.warnings || []).length === 0 ? <p>No warnings.</p> : productionHealth.warnings.map((item: string, index: number) => <p key={index}>{item}</p>)}
                  </div>
                </article>
                <article className="md:col-span-2 bg-surface-container border-2 border-primary p-3">
                  <h3 className="font-headline font-black uppercase text-primary text-sm">Failures</h3>
                  <div className="mt-2 space-y-1 font-body text-[11px] text-on-surface-variant max-h-32 overflow-y-auto custom-scrollbar">
                    {(productionHealth?.failures || []).length === 0 ? <p>No failures.</p> : productionHealth.failures.map((item: string, index: number) => <p key={index} className="text-error">{item}</p>)}
                  </div>
                </article>
              </div>
            </section>

            <section className="xl:col-span-2 neo-border bg-background">
              <div className="bg-primary text-on-primary border-b-4 border-primary p-4">
                <h2 className="font-headline font-black uppercase text-xl flex items-center gap-2">
                  <span className="material-symbols-outlined">groups</span>
                  Agent Groups
                </h2>
              </div>
              <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <input
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    className="w-full bg-surface-container neo-border p-2 font-headline font-bold uppercase text-sm"
                  />
                  <textarea
                    value={sharedContext}
                    onChange={(event) => setSharedContext(event.target.value)}
                    className="w-full h-24 bg-surface-container neo-border p-2 font-body text-xs"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activeAgents.map((agent: any) => (
                      <label key={agent.id} className="flex items-center gap-2 bg-surface-container border-2 border-primary p-2 text-xs font-bold uppercase">
                        <input
                          type="checkbox"
                          checked={selectedMembers.includes(agent.id)}
                          disabled={agent.id === supervisor?.id}
                          onChange={(event) => {
                            setSelectedMembers((prev) => event.target.checked ? [...prev, agent.id] : prev.filter((id) => id !== agent.id));
                          }}
                        />
                        {agent.name}
                      </label>
                    ))}
                  </div>
                  <button onClick={handleGroup} className="bg-primary text-on-primary neo-border px-4 py-2 font-headline font-bold uppercase text-xs">
                    Create Group
                  </button>
                </div>

                <div className="space-y-3">
                  {data.groups.length === 0 ? (
                    <div className="border-4 border-dashed border-outline-variant p-6 text-center font-body text-xs text-on-surface-variant">
                      No agent groups yet for this project.
                    </div>
                  ) : data.groups.map((group: any) => (
                    <article key={group.id} className="bg-surface-container neo-border p-3">
                      <h3 className="font-headline font-black uppercase text-primary">{group.name}</h3>
                      <p className="font-mono text-[10px] text-on-surface-variant mt-1">Lead: {group.supervisorAgentId} | Members: {group.members.length}</p>
                      <p className="font-body text-xs mt-2">{group.sharedContext}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="neo-border bg-background">
              <div className="bg-secondary text-on-error border-b-4 border-primary p-4">
                <h2 className="font-headline font-black uppercase text-xl flex items-center gap-2">
                  <span className="material-symbols-outlined">architecture</span>
                  Agent Builder
                </h2>
              </div>
              <div className="p-4 space-y-3">
                <textarea
                  value={blueprintPrompt}
                  onChange={(event) => setBlueprintPrompt(event.target.value)}
                  className="w-full h-28 bg-surface-container neo-border p-2 font-body text-xs"
                />
                <button onClick={handleBlueprint} className="bg-primary text-on-primary neo-border px-4 py-2 font-headline font-bold uppercase text-xs">
                  Generate Blueprint
                </button>
                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                  {data.blueprints.map((blueprint: any) => (
                    <article key={blueprint.id} className="bg-surface-container border-2 border-primary p-3">
                      <h3 className="font-headline font-black uppercase text-primary text-sm">{blueprint.role}</h3>
                      <p className="font-body text-[11px] mt-1">{blueprint.rationale}</p>
                      <p className="font-mono text-[10px] mt-2">Tier: {blueprint.permissionTier} | Provider: {blueprint.provider}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="xl:col-span-2 neo-border bg-background">
              <div className="bg-primary text-on-primary border-b-4 border-primary p-4">
                <h2 className="font-headline font-black uppercase text-xl flex items-center gap-2">
                  <span className="material-symbols-outlined">school</span>
                  Learned Skill Drafts
                </h2>
              </div>
              <div className="p-4 space-y-3 max-h-[32rem] overflow-y-auto custom-scrollbar">
                {data.learnedSkillDrafts.length === 0 ? (
                  <div className="border-4 border-dashed border-outline-variant p-6 text-center font-body text-xs text-on-surface-variant">
                    No SIAL drafts yet. Complex completed runs with three or more tool calls will appear here for review.
                  </div>
                ) : data.learnedSkillDrafts.map((draft: any) => (
                  <article key={draft.id} className="bg-surface-container neo-border p-3">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <h3 className="font-headline font-black uppercase text-primary">{draft.proposedName}</h3>
                        <p className="font-mono text-[10px] text-on-surface-variant mt-1">
                          {draft.status} | run {draft.agentRunId} | evidence {draft.evidenceIds?.length || 0}
                        </p>
                        {draft.approvalId && (
                          <p className="font-mono text-[10px] text-on-surface-variant mt-1">Approval: {draft.approvalId}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleRequestSkillReview(draft.id)} className="bg-secondary text-on-error neo-border px-3 py-2 font-headline font-bold uppercase text-[10px]">
                          Review
                        </button>
                        <button onClick={() => handlePromoteSkill(draft.id)} className="bg-primary text-on-primary neo-border px-3 py-2 font-headline font-bold uppercase text-[10px]">
                          Promote
                        </button>
                        <button onClick={() => handleRejectSkill(draft.id)} className="bg-error text-on-error neo-border px-3 py-2 font-headline font-bold uppercase text-[10px]">
                          Reject
                        </button>
                      </div>
                    </div>
                    <pre className="mt-3 bg-background border-2 border-primary p-3 font-mono text-[10px] whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {draft.markdown}
                    </pre>
                  </article>
                ))}
              </div>
            </section>

            <section className="neo-border bg-background">
              <div className="bg-tertiary text-on-tertiary border-b-4 border-primary p-4">
                <h2 className="font-headline font-black uppercase text-xl flex items-center gap-2">
                  <span className="material-symbols-outlined">memory</span>
                  White-Box Memory
                </h2>
              </div>
              <div className="p-4 space-y-3">
                <input
                  value={memoryDraft.title}
                  onChange={(event) => setMemoryDraft((prev) => ({ ...prev, title: event.target.value }))}
                  className="w-full bg-surface-container neo-border p-2 font-headline font-bold uppercase text-sm"
                />
                <textarea
                  value={memoryDraft.content}
                  onChange={(event) => setMemoryDraft((prev) => ({ ...prev, content: event.target.value }))}
                  className="w-full h-24 bg-surface-container neo-border p-2 font-body text-xs"
                />
                <label className="flex items-center gap-2 font-headline font-bold uppercase text-xs">
                  <input
                    type="checkbox"
                    checked={memoryDraft.injectionStatus === "active"}
                    onChange={(event) => setMemoryDraft((prev) => ({ ...prev, injectionStatus: event.target.checked ? "active" : "inactive" }))}
                  />
                  Inject into supervisor context
                </label>
                <button onClick={handleMemory} className="bg-primary text-on-primary neo-border px-4 py-2 font-headline font-bold uppercase text-xs">
                  Save Memory
                </button>
                <div className="space-y-2">
                  {data.memorySections.slice(0, 4).map((section: any) => (
                    <article key={section.id} className="bg-surface-container border-2 border-primary p-3">
                      <h3 className="font-headline font-black uppercase text-primary text-sm">{section.title}</h3>
                      <p className="font-mono text-[10px]">{section.provenance} | {section.injectionStatus} | edited: {String(section.userEdited)}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="neo-border bg-background">
              <div className="bg-primary-container border-b-4 border-primary p-4">
                <h2 className="font-headline font-black uppercase text-xl text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined">monitoring</span>
                  Privacy Metrics
                </h2>
              </div>
              <div className="p-4 space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                {data.metrics.length === 0 ? (
                  <p className="font-body text-xs text-on-surface-variant">No operational metrics recorded yet.</p>
                ) : data.metrics.map((metric: any) => (
                  <div key={metric.id} className="bg-surface-container border-2 border-primary p-2 font-mono text-[10px]">
                    {metric.eventType} / {metric.outcome || "recorded"} / {metric.agentId || "system"}
                  </div>
                ))}
              </div>
            </section>

            <section className="xl:col-span-1 neo-border bg-background">
              <div className="bg-surface-variant border-b-4 border-primary p-4">
                <h2 className="font-headline font-black uppercase text-xl text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined">rule</span>
                  Guideline Packs
                </h2>
              </div>
              <div className="p-4 space-y-3">
                {data.guidelinePacks.map((pack: any) => (
                  <article key={pack.id} className="bg-surface-container border-2 border-primary p-3">
                    <h3 className="font-headline font-black uppercase text-primary text-sm">{pack.name}</h3>
                    <p className="font-mono text-[10px] mb-2">{pack.language || "any"} / {pack.framework || "any"} / {pack.context || "any"}</p>
                    <ul className="font-body text-[11px] list-disc pl-4 space-y-1">
                      {pack.rules.slice(0, 3).map((rule: string) => <li key={rule}>{rule}</li>)}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default function SupervisorConsolePage() {
  return (
    <Suspense fallback={<div className="flex-1 md:ml-64 min-h-screen bg-surface-container p-10 font-headline font-bold uppercase text-primary">Loading Supervisor Console...</div>}>
      <SupervisorConsoleContent />
    </Suspense>
  );
}
