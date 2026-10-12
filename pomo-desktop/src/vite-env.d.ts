/// <reference types="vite/client" />

interface Window {
  pomoDesktop?: {
    appName: string;
    notify?: (title: string, body: string) => Promise<boolean>;
    updateTray?: (payload: { mode: string; time: string; status: string }) => Promise<boolean>;
    setCompactMode?: (enabled: boolean) => Promise<boolean>;
    getWindowMode?: () => Promise<{ compact?: boolean }>;
    getStartupSettings?: () => Promise<{ openAtLogin?: boolean }>;
    setStartupSettings?: (enabled: boolean) => Promise<{ openAtLogin?: boolean }>;
    getIdleSeconds?: () => Promise<number>;
    onDeepLink?: (callback: (payload: { token?: string; apiUrl?: string }) => void) => () => void;
    onTrayCommand?: (callback: (command: 'toggle' | 'reset') => void) => () => void;
    onWindowMode?: (callback: (payload: { compact?: boolean }) => void) => () => void;
  };
}
