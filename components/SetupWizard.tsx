"use client";

import { useEffect, useState } from "react";
import {
  fetchProductionHealthAction,
  fetchSettingsAction,
  probeDockerAvailabilityAction,
  updateSettingAction,
} from "@/app/actions";
import { DEFAULT_MINIMAX_MODEL } from "@/lib/providers/catalog";
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
    { label: "Master access key", ok: health?.auth?.secured === true },
    { label: "MiniMax API key", ok: minimaxKey.trim().length > 0 || health?.llm?.minimaxConfigured === true },
    { label: "Live runtime mode", ok: health?.runtime?.mode === "real" },
  ];

  const canAdvance = () => {
    if (step === 2) return minimaxKey.trim().length > 0;
    if (step === 4) return health?.llm?.modelProbe?.ok === true;
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
      if (health?.llm?.modelProbe?.ok !== true) {
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
      <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden bg-background neo-border neo-shadow-lg flex flex-col">
        <header className="bg-primary text-on-primary border-b-4 border-primary p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Rocket className="w-7 h-7 text-secondary" />
            <div>
              <h2 className="font-headline text-2xl font-black uppercase tracking-tight">Supr Bootstrap</h2>
              <p className="font-body text-xs font-bold uppercase tracking-wider">Live runtime setup for first boot</p>
            </div>
          </div>
          {!required ? (
            <button onClick={onClose} className="p-1 hover:rotate-90 transition-transform">
              <X className="w-5 h-5" />
            </button>
          ) : null}
        </header>

        <div className="grid grid-cols-4 border-b-4 border-primary bg-surface-container">
          {["Readiness", "MiniMax", "Runtime", "Health"].map((label, index) => {
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
                <h3 className="font-headline text-3xl font-black uppercase tracking-tighter text-primary">Supr is live by default.</h3>
                <p className="font-body text-sm font-bold text-on-surface-variant max-w-2xl mx-auto">
                  This bootstrap checks the pieces that actually matter for production-style testing: master access, MiniMax, runtime policy, and a real health probe.
                </p>
              </div>

              <div className="bg-surface-container neo-border p-5 space-y-3">
                <h4 className="font-headline font-black uppercase text-sm text-primary">Required checks</h4>
                <div className="space-y-2">
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

              <div className="bg-surface-container neo-border p-5 space-y-2">
                <h4 className="font-headline font-black uppercase text-sm text-primary">Deploy note</h4>
                <p className="font-body text-xs text-on-surface-variant">
                  For VPS testing, set `AUTH_SECRET` in the environment before public exposure. Until then, session signing falls back to the current secure login secret and the health check will warn if it looks too default.
                </p>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <div>
                <label className="font-headline font-black uppercase text-sm text-primary flex items-center gap-2">
                  <KeyRound className="w-4 h-4" />
                  MiniMax API Key
                </label>
                <p className="font-body text-xs text-on-surface-variant mt-1">
                  Required for the live Supr runtime. The default production model stays on `{DEFAULT_MINIMAX_MODEL}`.
                </p>
              </div>
              <input
                type="password"
                value={minimaxKey}
                onChange={(event) => setMinimaxKey(event.target.value)}
                placeholder="Enter your MiniMax key"
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
                <h3 className="font-headline font-black uppercase text-lg text-primary">Runtime policy</h3>
                <p className="font-body text-xs text-on-surface-variant mt-1">
                  Optional channels can stay disconnected. This step stores the live runtime defaults and lets us probe Docker availability before you deploy to the VPS.
                </p>
              </div>

              <div className="space-y-2">
                <label className="font-headline font-black uppercase text-xs text-primary">Operating mode</label>
                <select
                  value={operatingMode}
                  onChange={(event) => setOperatingMode(event.target.value)}
                  className="w-full bg-surface neo-border p-4 font-headline text-sm uppercase font-bold focus:outline-none"
                >
                  <option value="Supervisor">Supervisor</option>
                  <option value="guided">Guided</option>
                  <option value="autonomous">Autonomous</option>
                </select>
              </div>

              <label className="flex items-center justify-between gap-4 bg-surface-container neo-border p-4">
                <div>
                  <p className="font-headline font-black uppercase text-xs text-primary">Remote execution</p>
                  <p className="font-body text-[11px] text-on-surface-variant">Leave this off for local or early VPS validation unless you already have a remote runner.</p>
                </div>
                <input
                  type="checkbox"
                  checked={remoteExecutionEnabled}
                  onChange={(event) => setRemoteExecutionEnabled(event.target.checked)}
                  className="w-5 h-5 accent-primary"
                />
              </label>

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
                    {health?.llm?.modelProbe?.ok
                      ? `${health.llm.modelProbe.provider} / ${health.llm.modelProbe.model} / ${health.llm.modelProbe.latencyMs}ms`
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
                disabled={isSaving || health?.llm?.modelProbe?.ok !== true}
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
