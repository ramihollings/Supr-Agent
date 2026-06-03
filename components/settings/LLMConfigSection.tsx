"use client";

import type { Ref } from "react";

export interface LlmRoleConfig {
  /** Provider id (e.g. 'gemini', 'openai', 'anthropic', 'openai_compat'). */
  provider: string;
  key: string;
  model: string;
  /** Only relevant when provider === 'openai_compat'. */
  url: string;
}

export interface LlmConfigSectionProps {
  ref: Ref<HTMLDivElement>;
  // Global key state.
  globalMinimaxKey: string;
  globalGeminiKey: string;
  globalOpenaiKey: string;
  globalAnthropicKey: string;
  globalXaiKey: string;
  globalOpenrouterKey: string;
  globalGroqKey: string;
  globalMistralKey: string;
  globalDeepseekKey: string;
  // Backup provider.
  globalBackupKey: string;
  globalBackupUrl: string;
  globalBackupModel: string;
  globalBackupName: string;
  // Per-role overrides.
  supr: LlmRoleConfig;
  code: LlmRoleConfig;
  research: LlmRoleConfig;
  sub: LlmRoleConfig;
  // Setters (the page owns the state).
  onChangeGlobalKey: (key: string, value: string) => void;
  onChangeBackupField: (field: "name" | "model" | "url" | "key", value: string) => void;
  onChangeRoleField: (role: "supr" | "code" | "research" | "sub", field: keyof LlmRoleConfig, value: string) => void;
  // Helpers.
  providerOptions: { value: string; label: string }[];
  modelOptionsForProvider: (provider: string) => { label: string; value: string }[];
  onSelectRoleProvider: (provider: string, role: "supr" | "code" | "research" | "sub") => void;
  // Save handlers.
  onUpdateSetting: (key: string, value: string, toastMsg?: string) => void | Promise<void>;
  onSaveGlobalKey: (key: string, value: string, label: string) => void;
  onSaveBackupConfig: () => void;
  onSaveRoleOverride: (role: "supr" | "code" | "research" | "sub") => void;
  // Constants.
  defaultMinimaxModel: string;
}

const ROLE_META: Record<
  LlmConfigSectionProps["supr"] extends LlmRoleConfig ? "supr" | "code" | "research" | "sub" : never,
  { title: string; icon: string; settingPrefix: string }
> = {
  supr: { title: "Lead Orchestrator (Supr)", icon: "psychology", settingPrefix: "supr" },
  code: { title: "Coding Agent", icon: "code", settingPrefix: "code" },
  research: { title: "Research Agent", icon: "travel_explore", settingPrefix: "research" },
  sub: { title: "Sub-Agents (General)", icon: "group", settingPrefix: "sub" },
};

export function LLMConfigSection(props: LlmConfigSectionProps) {
  return (
    <div ref={props.ref} className="flex flex-col gap-6">
      <div className="border-b-4 border-primary pb-4 mb-4">
        <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">LLM Configuration</h2>
        <p className="font-body text-on-surface-variant mt-2">Manage API keys, endpoints, and models for Supr and sub-agents on the fly.</p>
      </div>

      {/* 1. Global API Keys & Defaults */}
      <GlobalProvidersCard {...props} />

      {/* 2. Custom Role Overrides */}
      <RoleOverridesCard {...props} />
    </div>
  );
}

function GlobalProvidersCard(props: LlmConfigSectionProps) {
  const providerKeyControls = [
    { label: 'OpenAI API Key', key: 'global_openai_key', value: props.globalOpenaiKey, onChange: props.onChangeGlobalKey, placeholder: 'sk-...' },
    { label: 'Anthropic API Key', key: 'global_anthropic_key', value: props.globalAnthropicKey, onChange: props.onChangeGlobalKey, placeholder: 'sk-ant-...' },
    { label: 'xAI API Key', key: 'global_xai_key', value: props.globalXaiKey, onChange: props.onChangeGlobalKey, placeholder: 'xai-...' },
    { label: 'OpenRouter API Key', key: 'global_openrouter_key', value: props.globalOpenrouterKey, onChange: props.onChangeGlobalKey, placeholder: 'sk-or-...' },
    { label: 'Groq API Key', key: 'global_groq_key', value: props.globalGroqKey, onChange: props.onChangeGlobalKey, placeholder: 'gsk_...' },
    { label: 'Mistral API Key', key: 'global_mistral_key', value: props.globalMistralKey, onChange: props.onChangeGlobalKey, placeholder: '...' },
    { label: 'DeepSeek API Key', key: 'global_deepseek_key', value: props.globalDeepseekKey, onChange: props.onChangeGlobalKey, placeholder: 'sk-...' },
  ];

  return (
    <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-6 bg-primary text-on-primary text-[8px] font-black uppercase flex items-center justify-center rotate-45 translate-x-8 translate-y-3 pointer-events-none select-none tracking-widest shadow-sm">
        Global Keys
      </div>
      <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2 border-b-2 border-primary pb-2 mb-2">
        <span className="material-symbols-outlined text-primary">key</span> Global Providers &amp; Fallbacks
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block font-headline font-bold uppercase text-primary mb-1 text-xs">MiniMax API Key</label>
          <div className="flex gap-2">
            <input
              type="password" aria-label="MiniMax API Key"
              value={props.globalMinimaxKey}
              onChange={(e) => props.onChangeGlobalKey('global_minimax_key', e.target.value)}
              className="flex-1 bg-background neo-border p-2 font-mono text-xs focus:outline-none focus:border-tertiary"
              placeholder="sk-..."
            />
            <button
              onClick={() => props.onSaveGlobalKey('global_minimax_key', props.globalMinimaxKey, 'Global MiniMax key saved ✓')}
              className="bg-primary text-on-primary font-bold uppercase text-xs px-3 neo-border hover:bg-tertiary transition-colors"
            >Save</button>
          </div>
          <span className="text-[9px] text-on-surface-variant block mt-1">Primary LLM if set. Default model: {props.defaultMinimaxModel}. API: https://api.minimax.io/v1</span>
        </div>

        <div>
          <label className="block font-headline font-bold uppercase text-primary mb-1 text-xs">Gemini API Key</label>
          <div className="flex gap-2">
            <input
              type="password" aria-label="Gemini API Key"
              value={props.globalGeminiKey}
              onChange={(e) => props.onChangeGlobalKey('global_gemini_key', e.target.value)}
              className="flex-1 bg-background neo-border p-2 font-mono text-xs focus:outline-none focus:border-tertiary"
              placeholder="AIzaSy..."
            />
            <button
              onClick={() => props.onSaveGlobalKey('global_gemini_key', props.globalGeminiKey, 'Global Gemini key saved ✓')}
              className="bg-primary text-on-primary font-bold uppercase text-xs px-3 neo-border hover:bg-tertiary transition-colors"
            >Save</button>
          </div>
          <span className="text-[9px] text-on-surface-variant block mt-1">Secondary primary LLM. Used if MiniMax key is missing.</span>
        </div>

        {providerKeyControls.map((control) => (
          <div key={control.key}>
            <label className="block font-headline font-bold uppercase text-primary mb-1 text-xs">{control.label}</label>
            <div className="flex gap-2">
              <input
                type="password" aria-label={control.label}
                value={control.value}
                onChange={(e) => control.onChange(control.key, e.target.value)}
                className="flex-1 bg-background neo-border p-2 font-mono text-xs focus:outline-none focus:border-tertiary"
                placeholder={control.placeholder}
              />
              <button
                onClick={() => props.onSaveGlobalKey(control.key, control.value, `${control.label} saved`)}
                className="bg-primary text-on-primary font-bold uppercase text-xs px-3 neo-border hover:bg-tertiary transition-colors"
              >Save</button>
            </div>
          </div>
        ))}
      </div>

      <div className="w-full h-0.5 bg-outline-variant my-2"></div>

      <h4 className="font-headline font-bold text-xs uppercase text-primary tracking-wide">Backup Provider Config (OpenAI-Compatible)</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">Backup Name</label>
          <input
            type="text"
            value={props.globalBackupName}
            onChange={(e) => props.onChangeBackupField('name', e.target.value)}
            className="w-full bg-background neo-border p-2 text-xs focus:outline-none focus:border-tertiary font-bold"
            placeholder="e.g. OpenAI, Groq, Together"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">Backup Model Name</label>
          <input
            type="text"
            value={props.globalBackupModel}
            onChange={(e) => props.onChangeBackupField('model', e.target.value)}
            className="w-full bg-background neo-border p-2 text-xs focus:outline-none focus:border-tertiary font-mono"
            placeholder="gpt-4o-mini, llama-3.3-70b-versatile"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">Backup API Base URL</label>
          <input
            type="text"
            value={props.globalBackupUrl}
            onChange={(e) => props.onChangeBackupField('url', e.target.value)}
            className="w-full bg-background neo-border p-2 text-xs focus:outline-none focus:border-tertiary font-mono"
            placeholder="https://api.openai.com/v1"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">Backup API Key</label>
          <div className="flex gap-2">
            <input
              type="password" aria-label="Backup API Key"
              value={props.globalBackupKey}
              onChange={(e) => props.onChangeBackupField('key', e.target.value)}
              className="flex-1 bg-background neo-border p-2 text-xs focus:outline-none focus:border-tertiary font-mono"
              placeholder="sk-..."
            />
            <button
              onClick={props.onSaveBackupConfig}
              className="bg-primary text-on-primary font-bold uppercase text-xs px-6 neo-border hover:bg-tertiary transition-colors"
            >Save Backup Config</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleOverridesCard(props: LlmConfigSectionProps) {
  return (
    <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-6">
      <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2 border-b-2 border-primary pb-2">
        <span className="material-symbols-outlined text-primary">diversity_3</span> Agent Customization Override
      </h3>

      <p className="font-body text-xs text-on-surface-variant leading-relaxed">
        By default, all agents inherit the global priority flow (MiniMax → Gemini → Backup).
        Override specific agents below to run them on separate providers or custom models on the fly!
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(["supr", "code", "research", "sub"] as const).map((role) => {
          const meta = ROLE_META[role];
          const config = props[role];
          const modelOptions = props.modelOptionsForProvider(config.provider);
          return (
            <div key={role} className="neo-border bg-background p-4 flex flex-col gap-3 relative">
              <div className="flex justify-between items-center border-b border-primary pb-2">
                <span className="font-headline font-bold text-xs uppercase text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">{meta.icon}</span> {meta.title}
                </span>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-primary-container border border-primary">Active</span>
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase text-on-surface-variant mb-1">Select Provider</label>
                <select
                  value={config.provider}
                  onChange={(e) => props.onSelectRoleProvider(e.target.value, role)}
                  className="w-full bg-surface neo-border p-1.5 text-xs font-bold"
                >
                  {props.providerOptions.map((provider) => (
                    <option key={provider.value} value={provider.value}>{provider.label}</option>
                  ))}
                </select>
              </div>
              {config.provider !== 'default' && (
                <div className="space-y-2 animate-fadeIn text-[10px]">
                  <input
                    type="password" aria-label={`${meta.title} API key`}
                    value={config.key}
                    onChange={(e) => props.onChangeRoleField(role, 'key', e.target.value)}
                    placeholder="Custom API Key (leave blank to inherit global)"
                    className="w-full bg-surface neo-border p-1 text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) => props.onChangeRoleField(role, 'model', e.target.value)}
                    list={modelOptions.length ? `${role}-model-options` : undefined}
                    placeholder={config.provider === 'openai_compat' ? 'Custom Model Name Override' : 'Select or enter model'}
                    className="w-full bg-surface neo-border p-1 text-xs"
                  />
                  {modelOptions.length > 0 && (
                    <datalist id={`${role}-model-options`}>
                      {modelOptions.map((model) => (
                        <option key={model.value} value={model.value}>{model.label}</option>
                      ))}
                    </datalist>
                  )}
                  {config.provider === 'openai_compat' && (
                    <input
                      type="text"
                      value={config.url}
                      onChange={(e) => props.onChangeRoleField(role, 'url', e.target.value)}
                      placeholder="Custom Endpoint URL Override"
                      className="w-full bg-surface neo-border p-1 text-xs font-mono"
                    />
                  )}
                </div>
              )}
              <button
                onClick={() => props.onSaveRoleOverride(role)}
                className="mt-auto bg-primary text-on-primary font-bold uppercase text-[10px] py-1.5 neo-border hover:bg-tertiary"
              >Apply Override</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
