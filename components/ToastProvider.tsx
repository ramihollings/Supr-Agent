"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Toast } from "@/components/Toast";

type ToastTone = "info" | "success" | "error";

interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    setCurrent({ id: Date.now(), message, tone });
  }, []);

  const handleDismiss = useCallback(() => setCurrent(null), []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast
        key={current?.id}
        message={current?.message ?? null}
        tone={current?.tone}
        onDismiss={handleDismiss}
      />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
