"use client";

import { useEffect, useState } from "react";
import { fetchSettingsAction } from "@/app/actions";

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
    // Intentionally mount-only for now; the snapshot is a "what's the
    // current state" read, not a live feed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...snapshot, refresh };
}
