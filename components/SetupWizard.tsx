'use client';

import { useState, useEffect } from 'react';
import { updateSettingAction, fetchSettingsAction } from '@/app/actions';
import { 
  X, 
  Rocket, 
  Key, 
  Settings, 
  HelpCircle, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft,
  Sparkles,
  Link2,
  FileCode2,
  Activity,
  Layers,
  Users2
} from 'lucide-react';

interface SetupWizardProps {
  onClose: () => void;
}

export function SetupWizard({ onClose }: SetupWizardProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Credentials and configuration form states
  const [geminiKey, setGeminiKey] = useState('');
  const [operatingMode, setOperatingMode] = useState('guided');
  const [githubPat, setGithubPat] = useState('');
  const [slackWebhook, setSlackWebhook] = useState('');
  const [gmailPassword, setGmailPassword] = useState('');

  // Load existing settings if available
  useEffect(() => {
    async function loadExistingSettings() {
      try {
        const settings = await fetchSettingsAction();
        if (settings.global_gemini_key) setGeminiKey(settings.global_gemini_key);
        if (settings.operating_mode) setOperatingMode(settings.operating_mode);
        if (settings.integrations_github) setGithubPat(settings.integrations_github);
        if (settings.integrations_slack) setSlackWebhook(settings.integrations_slack);
        if (settings.integrations_gmail) setGmailPassword(settings.integrations_gmail);
      } catch (err) {
        console.error('Failed to pre-load setup settings:', err);
      }
    }
    loadExistingSettings();
  }, []);

  const handleFinish = async () => {
    setIsSubmitting(true);
    setError('');
    
    // Simple validation: Gemini Key is highly recommended
    if (!geminiKey.trim()) {
      setError('A Gemini API key is highly recommended to run models and orchestrate agent tasks.');
      setStep(2); // Jump back to step 2
      setIsSubmitting(false);
      return;
    }

    try {
      // Save all settings to the SQLite database
      await Promise.all([
        updateSettingAction('global_gemini_key', geminiKey),
        updateSettingAction('operating_mode', operatingMode),
        updateSettingAction('integrations_github', githubPat),
        updateSettingAction('integrations_slack', slackWebhook),
        updateSettingAction('integrations_gmail', gmailPassword),
        updateSettingAction('has_completed_wizard', 'true') // Set flag to completed
      ]);

      // Success, close the modal
      onClose();
    } catch (err: any) {
      setError(`Failed to save setup configuration: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  return (
    <div className="fixed inset-0 bg-primary/30 backdrop-blur-sm z-[100] flex items-center justify-center p-4 selection:bg-primary-container selection:text-on-primary-container">
      <div className="bg-background neo-border neo-shadow-lg w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <header className="p-6 border-b-4 border-primary flex justify-between items-center bg-primary text-on-primary">
          <div className="flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-secondary animate-pulse" />
            <h2 className="font-headline text-2xl font-black uppercase tracking-tight">Supr Setup Wizard</h2>
          </div>
          <button onClick={onClose} className="hover:rotate-90 transition-transform cursor-pointer p-1">
            <X className="w-6 h-6" />
          </button>
        </header>

        {/* Steps Indicator */}
        <div className="flex border-b-4 border-primary bg-surface-container overflow-x-auto">
          {[
            { n: 1, label: 'Welcome', icon: Rocket },
            { n: 2, label: 'LLM Key', icon: Key },
            { n: 3, label: 'Integrations', icon: Link2 },
            { n: 4, label: 'Features Tour', icon: HelpCircle },
            { n: 5, label: 'Complete', icon: CheckCircle2 }
          ].map((s) => (
            <button 
              type="button"
              key={s.n}
              onClick={() => {
                if (s.n < step || (geminiKey.trim() || s.n === 1)) {
                  setStep(s.n);
                }
              }}
              className={`flex-1 flex items-center justify-center py-3 px-2 gap-2 border-r-2 border-primary last:border-r-0 transition-colors cursor-pointer text-left focus:outline-none ${
                step === s.n ? 'bg-primary-container text-on-primary-container font-bold' : 'text-on-surface-variant/50 hover:bg-surface-container-high'
              }`}
            >
              <s.icon className="w-4 h-4 shrink-0" />
              <span className="font-headline text-[10px] uppercase hidden md:inline">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Wizard Form Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-6">
          {error && (
            <div className="bg-error-container border-2 border-error p-3 text-xs font-body font-bold text-error uppercase flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">warning</span>
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="text-center space-y-3">
                <div className="w-20 h-20 bg-primary-container text-primary rounded-full mx-auto flex items-center justify-center neo-border">
                  <Rocket className="w-10 h-10" />
                </div>
                <h3 className="font-headline text-3xl font-black uppercase tracking-tighter text-primary">Welcome to Supr.</h3>
                <p className="font-body text-base text-on-surface-variant max-w-md mx-auto font-bold border-l-4 border-tertiary pl-3 text-left">
                  Configure your workspace, set up your keys, and explore how Supr coordinates your autonomous agent workforce.
                </p>
              </div>

              <div className="bg-surface-container p-5 neo-border space-y-3">
                <h4 className="font-headline font-bold text-xs uppercase text-primary border-b border-primary pb-1">Operational Protocol</h4>
                <p className="font-body text-xs text-on-surface-variant leading-relaxed">
                  Unlike terminal-only scripts, Supr sits as a centralized orchestration layer that tracks, guides, and audits both <strong>Permanent</strong> and <strong>Temporary</strong> agents as they execute complex roadmaps.
                </p>
                <p className="font-body text-xs text-on-surface-variant leading-relaxed">
                  Let's configure your models first to get the system online!
                </p>
              </div>
            </div>
          )}

          {/* Step 2: LLM Configuration */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="space-y-2">
                <label className="font-headline font-bold uppercase text-sm tracking-widest text-primary flex items-center gap-1.5">
                  <Key className="w-4 h-4" /> Google Gemini API Key
                </label>
                <p className="font-body text-[11px] text-on-surface-variant">Required for model chat, code generation, and central agent orchestration.</p>
                <input 
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="Enter your AIzaSy... API Key"
                  className="w-full bg-background neo-border p-4 font-mono text-sm focus:outline-none focus:border-tertiary"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="font-headline font-bold uppercase text-sm tracking-widest text-primary flex items-center gap-1.5">
                  <Settings className="w-4 h-4" /> Default Operating Autonomy
                </label>
                <p className="font-body text-[11px] text-on-surface-variant">Configure how much clearance the agents hold before requesting permissions.</p>
                <select
                  value={operatingMode}
                  onChange={(e) => setOperatingMode(e.target.value)}
                  className="w-full bg-surface neo-border p-4 font-headline text-sm uppercase font-bold focus:outline-none focus:border-tertiary"
                >
                  <option value="guided">Guided (Requires User Confirmation)</option>
                  <option value="supervisor">Supervisor (Escalates Exceptions)</option>
                  <option value="autonomous">Autonomous (Fully Independent)</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 3: Integrations (Optional) */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="bg-surface-container p-4 border-2 border-primary border-dashed text-xs text-on-surface-variant">
                <strong>Live Integrations:</strong> Supr runs live by default with the configured LLM. Optional channels left blank stay unavailable or approval-gated without blocking core agent work.
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="font-headline font-bold uppercase text-xs text-primary">GitHub Personal Access Token (PAT)</label>
                  <input 
                    type="password"
                    value={githubPat}
                    onChange={(e) => setGithubPat(e.target.value)}
                    placeholder="ghp_..."
                    className="w-full bg-background neo-border p-3 font-mono text-xs focus:outline-none focus:border-tertiary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-headline font-bold uppercase text-xs text-primary">Slack Webhook URL</label>
                  <input 
                    type="text"
                    value={slackWebhook}
                    onChange={(e) => setSlackWebhook(e.target.value)}
                    placeholder="https://hooks.slack.com/services/..."
                    className="w-full bg-background neo-border p-3 font-mono text-xs focus:outline-none focus:border-tertiary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-headline font-bold uppercase text-xs text-primary">Gmail App Password</label>
                  <input 
                    type="password"
                    value={gmailPassword}
                    onChange={(e) => setGmailPassword(e.target.value)}
                    placeholder="abcd efgh ijkl mnop"
                    className="w-full bg-background neo-border p-3 font-mono text-xs focus:outline-none focus:border-tertiary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Features Tour */}
          {step === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h4 className="font-headline font-black uppercase text-center text-primary text-lg">Explore Core Workspaces</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border-2 border-primary p-4 bg-background flex gap-3 shadow-[2px_2px_0px_0px_var(--color-primary)]">
                  <Rocket className="w-8 h-8 text-secondary shrink-0" />
                  <div>
                    <h5 className="font-headline font-bold uppercase text-xs">Dashboard</h5>
                    <p className="font-body text-[10px] text-on-surface-variant mt-1">Rollup summary of active projects, checklist tasks, and delivery readiness scores.</p>
                  </div>
                </div>

                <div className="border-2 border-primary p-4 bg-background flex gap-3 shadow-[2px_2px_0px_0px_var(--color-primary)]">
                  <FileCode2 className="w-8 h-8 text-primary shrink-0" />
                  <div>
                    <h5 className="font-headline font-bold uppercase text-xs">Supr-Chat & Sandbox</h5>
                    <p className="font-body text-[10px] text-on-surface-variant mt-1">Chat directly with the supervisor, upload files, and edit/run code live inside sandboxes.</p>
                  </div>
                </div>

                <div className="border-2 border-primary p-4 bg-background flex gap-3 shadow-[2px_2px_0px_0px_var(--color-primary)]">
                  <Activity className="w-8 h-8 text-tertiary shrink-0" />
                  <div>
                    <h5 className="font-headline font-bold uppercase text-xs">Observance Hub</h5>
                    <p className="font-body text-[10px] text-on-surface-variant mt-1">Audit log traces of agent delegations, handoffs, reviews, and security gate approvals.</p>
                  </div>
                </div>

                <div className="border-2 border-primary p-4 bg-background flex gap-3 shadow-[2px_2px_0px_0px_var(--color-primary)]">
                  <Users2 className="w-8 h-8 text-secondary shrink-0" />
                  <div>
                    <h5 className="font-headline font-bold uppercase text-xs">Roster (Task Force)</h5>
                    <p className="font-body text-[10px] text-on-surface-variant mt-1">Register permanent or temporary agents, adjust permission hierarchies, and assign jobs.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Complete */}
          {step === 5 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300 text-center">
              <div className="w-24 h-24 bg-tertiary-container text-tertiary rounded-full mx-auto flex items-center justify-center neo-border">
                <CheckCircle2 className="w-12 h-12" />
              </div>
              
              <div className="space-y-2">
                <h3 className="font-headline text-3xl font-black uppercase tracking-tighter text-primary">System Initialized</h3>
                <p className="font-body text-sm text-on-surface-variant max-w-sm mx-auto font-bold">
                  All systems configured. Your secure supervisor session is ready to authorize.
                </p>
              </div>

              <div className="bg-surface-container p-5 neo-border text-left">
                <h4 className="font-headline font-bold uppercase text-xs mb-3 border-b border-primary pb-1">Session Configuration</h4>
                <ul className="space-y-1.5 font-mono text-[10px] text-on-surface-variant">
                  <li className="flex justify-between"><span>Core LLM:</span> <span className="font-bold">{geminiKey ? 'Gemini 2.0 (Configured)' : 'Missing (Required)'}</span></li>
                  <li className="flex justify-between"><span>Autonomy Mode:</span> <span className="font-bold uppercase">{operatingMode}</span></li>
                  <li className="flex justify-between"><span>GitHub PAT:</span> <span className="font-bold uppercase">{githubPat ? 'Active' : 'Unavailable'}</span></li>
                  <li className="flex justify-between"><span>Slack Webhook:</span> <span className="font-bold uppercase">{slackWebhook ? 'Active' : 'Unavailable'}</span></li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="p-6 border-t-4 border-primary flex justify-between bg-surface bg-surface-container-high">
          {step > 1 ? (
            <button 
              type="button"
              onClick={prevStep}
              className="flex items-center gap-2 font-headline font-bold uppercase hover:text-tertiary transition-colors cursor-pointer text-xs focus:outline-none"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : <div />}

          {step < 5 ? (
            <button 
              type="button"
              onClick={nextStep}
              disabled={step === 2 && !geminiKey.trim()}
              className="bg-primary text-on-primary neo-border px-6 py-2.5 font-headline font-bold uppercase hover:bg-tertiary hover:text-on-tertiary transition-colors neo-shadow disabled:opacity-50 flex items-center gap-2 cursor-pointer text-xs focus:outline-none"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button 
              type="button"
              onClick={handleFinish}
              disabled={isSubmitting}
              className="bg-tertiary text-on-tertiary neo-border px-8 py-3 font-headline font-black uppercase hover:bg-primary hover:text-on-primary transition-all neo-shadow active:translate-x-1 active:translate-y-1 disabled:opacity-50 flex items-center gap-2 cursor-pointer text-xs focus:outline-none"
            >
              {isSubmitting ? 'Saving settings...' : 'Launch Workspace'}
              <Rocket className="w-4 h-4 shrink-0" />
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
