"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchProductionHealthAction,
  fetchSettingsAction,
  probeDockerAvailabilityAction,
  updateSettingAction,
} from "@/app/actions";
import { DEFAULT_MINIMAX_MODEL } from "@/lib/providers/catalog";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, KeyRound, Rocket, ShieldCheck, X } from "lucide-react";

interface SetupWizardProps {
  onClose: () => void;
  required?: boolean;
}

type HealthSnapshot = Awaited<ReturnType<typeof fetchProductionHealthAction>>;

export function SetupWizard({ onClose, required = false }: SetupWizardProps) {
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isProbing, setIsProbing] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [minimaxKey, setMinimaxKey] = useState("");
  const [operatingMode, setOperatingMode] = useState("Supervisor");
  const [remoteExecutionEnabled, setRemoteExecutionEnabled] = useState(false);
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [dockerAvailable, setDockerAvailable] = useState(false);
  const [dockerDetail, setDockerDetail] = useState("");
  const [health, setHealth] = useState<HealthSnapshot | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true, required ? undefined : onClose);

  useEffect(() => {
    async function load() {
      try {
        const [settings, bootstrapHealth] = await Promise.all([
          fetchSettingsAction(),
          fetchProductionHealthAction(),
        ]);
        if (settings.global_minimax_key) setMinimaxKey(settings.global_minimax_key);
        if (settings.operating_mode) setOperatingMode(settings.operating_mode);
        setRemoteExecutionEnabled(settings.remote_execution_enabled === "true");
        setSlackEnabled(settings.channels_slack === "true");
        setDiscordEnabled(settings.channels_discord === "true");
        setTelegramEnabled(settings.channels_telegram === "true");
        setDockerAvailable(settings.docker_available === "true");
        setDockerDetail(settings.docker_last_probe || "");
        setHealth(bootstrapHealth);
      } catch (loadError: any) {
        setError(loadError?.message || String(loadError));
      } finally {
        setLoaded(true);
      }
    }
    void load();
  }, []);

  const requiredChecks = [
    { label: "Master access key", ok: (health as any)?.auth?.secured === true },
    { label: "MiniMax API key", ok: minimaxKey.trim().length > 0 || (health as any)?.llm?.minimaxConfigured === true },
    { label: "Live runtime mode", ok: (health as any)?.runtime?.mode === "real" },
  ];

  const canAdvance = () => {
    if (step === 2) return minimaxKey.trim().length > 0;
    if (step === 4) return (health as any)?.llm?.modelProbe?.ok === true;
    return true;
  };

  const handleSaveConfiguration = async () => {
    setIsSaving(true);
    setError("");
    try {
      const updates = await Promise.all([
        updateSettingAction("global_minimax_key", minimaxKey),
        updateSettingAction("operating_mode", operatingMode),
        updateSettingAction("llm_provider_supr", "minimax"),
        updateSettingAction("llm_model_supr", DEFAULT_MINIMAX_MODEL),
        updateSettingAction("runtime_mode", "real"),
        updateSettingAction("remote_execution_enabled", remoteExecutionEnabled ? "true" : "false"),
        updateSettingAction("channels_slack", slackEnabled ? "true" : "false"),
        updateSettingAction("channels_discord", discordEnabled ? "true" : "false"),
        updateSettingAction("channels_telegram", telegramEnabled ? "true" : "false"),
      ]);
      const failed = updates.find((result) => !result?.success && !result?.unchanged);
      if (failed) {
        throw new Error(failed.error || "Failed to save bootstrap settings.");
      }
      const docker = await probeDockerAvailabilityAction();
      await updateSettingAction("docker_available", docker.available ? "true" : "false");
      await updateSettingAction("docker_last_probe", docker.detail || "");
      setDockerAvailable(docker.available);
      setDockerDetail(docker.detail || "");
      setStep(4);
    } catch (saveError: any) {
      setError(saveError?.message || String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleProbe = async () => {
    setIsProbing(true);
    setError("");
    try {
      const snapshot = await fetchProductionHealthAction({ probeModel: true });
      setHealth(snapshot);
      if (snapshot.status === "fail") {
        setError(snapshot.failures?.[0] || "Production probe failed.");
      }
    } catch (probeError: any) {
      setError(probeError?.message || String(probeError));
    } finally {
      setIsProbing(false);
    }
  };

  const handleFinish = async () => {
    setIsSaving(true);
    setError("");
    try {
      if ((health as any)?.llm?.modelProbe?.ok !== true) {
        throw new Error("Run the live MiniMax probe before launching Supr.");
      }
      const result = await updateSettingAction("has_completed_wizard", "true");
      if (!result.success) {
        throw new Error(result.error || "Unable to mark bootstrap as complete.");
      }
      onClose();
    } catch (finishError: any) {
      setError(finishError?.message || String(finishError));
    } finally {
      setIsSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="fixed inset-0 z-[100] bg-primary/20 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-background neo-border neo-shadow-lg p-8 text-center">
          <p className="font-headline font-bold uppercase text-primary animate-pulse">Loading production bootstrap...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-primary/20 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-wizard-title"
        className="w-full max-w-3xl max-h-[92vh] overflow-hidden bg-background neo-border neo-shadow-lg flex flex-col"
      >
        <header className="bg-primary text-on-primary border-b-4 border-primary p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Rocket className="w-7 h-7 text-secondary" aria-hidden="true" />
            <div>
              <h2 id="setup-wizard-title" className="font-headline text-2xl font-black uppercase tracking-tight">Supr Bootstrap</h2>
              <p className="font-body text-xs font-bold uppercase tracking-wider">Live runtime setup for first boot</p>
            </div>
          </div>
          {!required ? (
            <button onClick={onClose} aria-label="Close setup wizard" className="p-1 hover:rotate-90 transition-transform">
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          ) : null}
        </header>

        <div className="grid grid-cols-4 border-b-4 border-primary bg-surface-container">
          {["Welcome", "Provider", "Runtime", "Health"].map((label, index) => {
            const current = index + 1;
            return (
              <div
                key={label}
                className={`px-3 py-3 text-center font-headline text-[11px] font-black uppercase border-r-2 border-primary last:border-r-0 ${
                  step === current ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant"
                }`}
              >
                {label}
              </div>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {error ? (
            <div className="bg-error-container border-2 border-error p-3 text-error text-xs font-bold uppercase flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <div className="w-20 h-20 rounded-full mx-auto bg-primary-container text-primary flex items-center justify-center neo-border">
                  <ShieldCheck className="w-10 h-10" />
                </div>
                <h3 className="font-headline text-3xl font-black uppercase tracking-tighter text-primary">Welcome to Supr</h3>
                <p className="font-body text-sm font-bold text-on-surface-variant max-w-2xl mx-auto">
                  Supr is a workspace for orchestrating AI agents on real work — projects, code, research, and approvals — with a single supervisor keeping everything accountable.
                </p>
              </div>

              <div className="bg-surface-container neo-border p-5 space-y-3">
                <h4 className="font-headline font-black uppercase text-sm text-primary">What you'll do next</h4>
                <ol className="space-y-2 font-body text-sm text-on-surface">
                  <li className="flex gap-3">
                    <span className="font-headline font-black text-primary">1.</span>
                    <span><strong>Add an AI provider key</strong> so Supr can talk to a model. We use MiniMax by default; Gemini and others work too.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="font-headline font-black text-primary">2.</span>
                    <span><strong>Pick a runtime policy</strong> — how much autonomy agents get before they check in with you.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="font-headline font-black text-primary">3.</span>
                    <span><strong>Run a live health probe</strong> to confirm everything is wired up before you hand off real work.</span>
                  </li>
                </ol>
              </div>

              <div className="bg-surface-container neo-border p-5 space-y-2">
                <h4 className="font-headline font-black uppercase text-sm text-primary">Before you start</h4>
                <p className="font-body text-xs text-on-surface-variant">
                  The required checks below confirm the pieces Supr actually needs. If something is missing, the next step will help you set it up.
                </p>
                <div className="space-y-2 mt-3">
                  {requiredChecks.map((check) => (
                    <div key={check.label} className="flex items-center justify-between gap-3 bg-background border-2 border-primary p-3">
                      <span className="font-body text-sm font-bold">{check.label}</span>
                      <span className={`font-headline text-xs font-black uppercase ${check.ok ? "text-tertiary" : "text-error"}`}>
                        {check.ok ? "ready" : "needs action"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <div>
                <h3 className="font-headline font-black uppercase text-lg text-primary">Add an AI provider key</h3>
                <p className="font-body text-sm text-on-surface-variant mt-1">
                  Supr uses a single provider key to run the supervisor, sub-agents, and chat. MiniMax is the default, but you can switch providers later in Settings.
                </p>
              </div>
              <div>
                <label htmlFor="provider-key" className="font-headline font-black uppercase text-sm text-primary flex items-center gap-2">
                  <KeyRound className="w-4 h-4" />
                  MiniMax API Key
                </label>
                <p className="font-body text-xs text-on-surface-variant mt-1">
                  Required to run Supr. Your key stays in your local database and is never sent anywhere else. The default production model is <code className="font-mono text-xs">{DEFAULT_MINIMAX_MODEL}</code>.
                </p>
              </div>
              <input
                id="provider-key"
                type="password"
                value={minimaxKey}
                onChange={(event) => setMinimaxKey(event.target.value)}
                placeholder="Paste your key here"
                className="w-full bg-background neo-border p-4 font-mono text-sm focus:outline-none focus:border-tertiary"
              />
              <div className="bg-surface-container neo-border p-4">
                <div className="flex items-center justify-between gap-3 font-mono text-xs">
                  <span>Default provider</span>
                  <span className="font-bold">MiniMax</span>
                </div>
                <div className="flex items-center justify-between gap-3 font-mono text-xs mt-2">
                  <span>Default model</span>
                  <span className="font-bold">{DEFAULT_MINIMAX_MODEL}</span>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <div>
                <h3 className="font-headline font-black uppercase text-lg text-primary">Pick how much autonomy Supr has</h3>
                <p className="font-body text-sm text-on-surface-variant mt-1">
                  You can change this anytime in Settings. Channels (Slack, Discord, Telegram) stay off until you turn them on.
                </p>
              </div>

              <fieldset className="space-y-2">
                <legend className="font-headline font-black uppercase text-xs text-primary">Operating mode</legend>
                <div className="space-y-2">
                  {[
                    { value: 'Supervisor', title: 'Recommended · Supervisor', desc: 'Supr works on its own for routine tasks, but checks in on anything risky.' },
                    { value: 'guided', title: 'Guided', desc: 'Supr proposes every step and waits for your approval.' },
                    { value: 'autonomous', title: 'Autonomous', desc: 'Supr handles most work end-to-end with minimal check-ins.' },
                  ].map((option) => (
                    <label key={option.value} className={`flex items-start gap-3 bg-surface-container neo-border p-4 cursor-pointer ${operatingMode === option.value ? 'border-tertiary' : ''}`}>
                      <input
                        type="radio"
                        name="operating-mode"
                        value={option.value}
                        checked={operatingMode === option.value}
                        onChange={() => setOperatingMode(option.value)}
                        className="mt-1 accent-primary"
                      />
                      <div>
                        <p className="font-headline font-black uppercase text-xs text-primary">{option.title}</p>
                        <p className="font-body text-xs text-on-surface-variant mt-1">{option.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="flex items-center justify-between gap-4 bg-surface-container neo-border p-4">
                <div>
                  <p className="font-headline font-black uppercase text-xs text-primary">Remote execution</p>
                  <p className="font-body text-[11px] text-on-surface-variant">Leave this off unless you have a remote runner configured in Settings.</p>
                </div>
                <input
                  type="checkbox"
                  checked={remoteExecutionEnabled}
                  onChange={(event) => setRemoteExecutionEnabled(event.target.checked)}
                  className="w-5 h-5 accent-primary"
                />
              </label>

              <div>
                <p className="font-headline font-black uppercase text-xs text-primary mb-2">Channels (optional)</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { label: "Slack", checked: slackEnabled, setter: setSlackEnabled },
                    { label: "Discord", checked: discordEnabled, setter: setDiscordEnabled },
                    { label: "Telegram", checked: telegramEnabled, setter: setTelegramEnabled },
                  ].map((channel) => (
                    <label key={channel.label} className="bg-surface-container neo-border p-4 flex items-center justify-between gap-3">
                      <span className="font-headline font-black uppercase text-xs text-primary">{channel.label}</span>
                      <input
                        type="checkbox"
                        checked={channel.checked}
                        onChange={(event) => channel.setter(event.target.checked)}
                        className="w-5 h-5 accent-primary"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-background border-2 border-primary p-4">
                <p className="font-mono text-xs">Docker probe: {dockerAvailable ? "available" : "not available yet"}</p>
                <p className="font-body text-[11px] text-on-surface-variant mt-1">{dockerDetail || "The wizard will probe Docker when you save this step."}</p>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-headline font-black uppercase text-lg text-primary">Production health</h3>
                  <p className="font-body text-xs text-on-surface-variant mt-1">
                    Run a real MiniMax probe before launch. Warnings are allowed for local/VPS shakeout; failures should stop the handoff.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleProbe}
                  disabled={isProbing}
                  className="bg-primary text-on-primary neo-border px-4 py-2 font-headline font-black uppercase text-xs hover:bg-tertiary hover:text-on-tertiary disabled:opacity-50"
                >
                  {isProbing ? "Probing..." : "Run Live Probe"}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-surface-container neo-border p-4">
                  <p className="font-headline font-black uppercase text-xs text-primary">Status</p>
                  <p className={`mt-2 font-headline font-black uppercase text-2xl ${
                    health?.status === "fail" ? "text-error" : health?.status === "warn" ? "text-secondary" : "text-tertiary"
                  }`}>
                    {health?.status || "unknown"}
                  </p>
                  <p className="font-mono text-[10px] uppercase text-on-surface-variant mt-1">{health?.generatedAt || "not checked"}</p>
                </div>
                <div className="bg-surface-container neo-border p-4">
                  <p className="font-headline font-black uppercase text-xs text-primary">Model probe</p>
                  <p className="mt-2 font-mono text-xs">
                    {(health as any)?.llm?.modelProbe?.ok
                      ? `${(health as any).llm.modelProbe.provider} / ${(health as any).llm.modelProbe.model} / ${(health as any).llm.modelProbe.latencyMs}ms`
                      : "Not run yet"}
                  </p>
                </div>
              </div>

              <div className="bg-surface-container neo-border p-4">
                <p className="font-headline font-black uppercase text-xs text-primary">Warnings</p>
                <div className="mt-2 space-y-1 font-body text-[11px] text-on-surface-variant">
                  {(health?.warnings || []).length === 0 ? <p>No warnings.</p> : health?.warnings?.map((warning: string, index: number) => <p key={index}>{warning}</p>)}
                </div>
              </div>

              <div className="bg-surface-container neo-border p-4">
                <p className="font-headline font-black uppercase text-xs text-primary">Failures</p>
                <div className="mt-2 space-y-1 font-body text-[11px]">
                  {(health?.failures || []).length === 0 ? <p className="text-tertiary">No failures.</p> : health?.failures?.map((failure: string, index: number) => <p key={index} className="text-error">{failure}</p>)}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="border-t-4 border-primary bg-surface-container p-5 flex items-center justify-between gap-3">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((current) => current - 1)}
                className="flex items-center gap-2 font-headline font-bold uppercase text-xs hover:text-tertiary"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            {step === 3 ? (
              <button
                type="button"
                onClick={handleSaveConfiguration}
                disabled={isSaving || !minimaxKey.trim()}
                className="bg-primary text-on-primary neo-border px-5 py-3 font-headline font-black uppercase text-xs hover:bg-tertiary hover:text-on-tertiary disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Runtime"}
              </button>
            ) : null}

            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((current) => current + 1)}
                disabled={!canAdvance() || isSaving}
                className="bg-primary text-on-primary neo-border px-5 py-3 font-headline font-black uppercase text-xs hover:bg-tertiary hover:text-on-tertiary disabled:opacity-50 flex items-center gap-2"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={isSaving || (health as any)?.llm?.modelProbe?.ok !== true}
                className="bg-tertiary text-on-tertiary neo-border px-6 py-3 font-headline font-black uppercase text-xs hover:bg-primary hover:text-on-primary disabled:opacity-50 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isSaving ? "Finishing..." : "Launch Supr"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
