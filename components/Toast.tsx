"use client";

import { useEffect } from "react";

type ToastTone = "info" | "success" | "error";

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
  tone?: ToastTone;
}

const toneClass: Record<ToastTone, string> = {
  info: "bg-surface-container-high text-on-surface",
  success: "bg-tertiary-container text-on-tertiary-container",
  error: "bg-error-container text-on-error-container",
};

export function Toast({ message, onDismiss, durationMs = 2600, tone = "info" }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(id);
  }, [message, durationMs, onDismiss]);

  if (!message) {
    return <div role="status" aria-live="polite" className="sr-only" />;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[90vw]"
    >
      <div
        className={`px-4 py-2 rounded-lg shadow-lg text-sm font-body font-medium ${toneClass[tone]}`}
      >
        {message}
      </div>
    </div>
  );
}
