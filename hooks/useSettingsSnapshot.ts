"use client";

import { useEffect, useState } from "react";
import { fetchSettingsAction } from "@/app/actions";

/**
 * Client-side sentinel write that other tabs (and the chat) listen
 * for via the 'storage' event. Settings-saving code can call this
 * after a successful write to make the change visible in the chat
 * without a full page reload.
 *
 * Falls back to a no-op in non-browser contexts (SSR).
 */
export function notifySettingsChanged(): void {
  if (typeof window === "undefined") return;
  try {
    // Writing the same value back fires a 'storage' event in OTHER
    // tabs but not this one. The chat's useSettingsSnapshot listens
    // and re-fetches.
    window.localStorage.setItem("supr:settings-updated", String(Date.now()));
  } catch {
    // localStorage may be unavailable (private mode, quota). Fall
    // back to a custom event the same tab can listen to.
    window.dispatchEvent(new CustomEvent("supr:settings-updated"));
  }
}

export interface SettingsSnapshot {
  activeModel: string;
  activeModelName: string;
  autonomyMode: string;
  sandboxAllowKeys: boolean;
  liveProviderModels: Record<string, { label: string; value: string }[]>;
  loaded: boolean;
}

const DEFAULT_SNAPSHOT: SettingsSnapshot = {
  activeModel: "gemini",
  activeModelName: "",
  autonomyMode: "guided",
  sandboxAllowKeys: false,
  liveProviderModels: {},
  loaded: false,
};

/**
 * Read the slice of settings the chat page cares about.
 *
 * The chat page previously duplicated state for the active LLM
 * provider, the autonomy mode, the live model catalog, and the
 * sandbox-allow-keys flag. It also re-ran its own version of
 * `fetchSettingsAction()` on mount, so a model change in Settings
 * required a page refresh to take effect.
 *
 * This hook is the shared source of truth. Both the chat and the
 * settings page (and any other consumer) can read the same snapshot,
 * refreshed on mount and on demand. A future iteration can wire it to
 * a TanStack Query cache so writes from one page propagate live to
 * the other; for now the snapshot is load-once.
 */
export function useSettingsSnapshot(): SettingsSnapshot & { refresh: () => void } {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot>(DEFAULT_SNAPSHOT);

  const refresh = () => {
    fetchSettingsAction()
      .then((s) => {
        setSnapshot({
          activeModel: s.llm_provider_supr || "gemini",
          activeModelName: s.llm_model_supr || "",
          autonomyMode: s.operating_mode || "guided",
          sandboxAllowKeys: s.sandbox_allow_api_keys === "true",
          liveProviderModels: typeof s.live_provider_models === "object" && s.live_provider_models
            ? s.live_provider_models
            : {},
          loaded: true,
        });
      })
      .catch(() => {
        setSnapshot((prev) => ({ ...prev, loaded: true }));
      });
  };

  useEffect(() => {
    refresh();
    // Re-fetch when the user comes back to this tab. Settings changes
    // made in the Settings page only persist in the DB; the chat has
    // no live channel to hear about them. Re-reading on focus is the
    // simplest "good enough" cross-tab propagation: changes made in
    // another tab show up when the user comes back to this one.
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);

    // Also re-fetch on the legacy 'storage' event, which is emitted
    // by other tabs (not this one) when they write to localStorage.
    // The Settings page can broadcast a sentinel write after a save
    // to make the change visible immediately in the chat.
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'supr:settings-updated') refresh();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return { ...snapshot, refresh };
}
