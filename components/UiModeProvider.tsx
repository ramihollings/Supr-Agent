'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type UiMode = 'mobile' | 'pro' | 'dev';

interface UiModeContextType {
  mode: UiMode;
  setMode: (mode: UiMode) => void;
}

const UiModeContext = createContext<UiModeContextType | undefined>(undefined);

export function UiModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<UiMode>('pro'); // Default to pro to avoid layout shift before hydration if possible

  useEffect(() => {
    try {
      const stored = localStorage.getItem('supr_ui_mode') as UiMode;
      if (stored && ['mobile', 'pro', 'dev'].includes(stored)) {
        setModeState(stored);
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  }, []);

  const setMode = (newMode: UiMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem('supr_ui_mode', newMode);
    } catch (e) {
      // Ignore localStorage errors
    }
  };

  return (
    <UiModeContext.Provider value={{ mode, setMode }}>
      {children}
    </UiModeContext.Provider>
  );
}

export function useUiMode() {
  const context = useContext(UiModeContext);
  if (context === undefined) {
    throw new Error('useUiMode must be used within a UiModeProvider');
  }
  return context;
}
