import { create } from 'zustand';
import type { PetState, PetPosition, ChatMessage, AppConfig, Reminder } from '../types';

interface PetStore {
  state: PetState;
  position: PetPosition;
  messages: ChatMessage[];
  isChatOpen: boolean;
  isSettingsOpen: boolean;
  isReminderListOpen: boolean;
  reminders: Reminder[];
  config: AppConfig;
  setState: (state: PetState) => void;
  setPosition: (pos: PetPosition) => void;
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  setChatOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setReminderListOpen: (open: boolean) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setReminders: (reminders: Reminder[]) => void;
  loadReminders: () => Promise<void>;
  updateConfig: (cfg: Partial<AppConfig>) => void;
  loadConfig: () => Promise<void>;
  loadMessages: () => Promise<void>;
}

export const usePetStore = create<PetStore>((set, get) => ({
  state: 'idle',
  position: { x: 0, y: 0 },
  messages: [],
  isChatOpen: false,
  isSettingsOpen: false,
  isReminderListOpen: false,
  reminders: [],
  config: {
    apiKey: '',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    petSize: 120,
    activityLevel: 'normal',
    autoStart: false,
    userProfile: '',
  },

  setState: (state) => set({ state }),
  setPosition: (position) => set({ position }),
  addMessage: (msg) => {
    const next = [...get().messages, msg];
    set({ messages: next });
    window.electronAPI?.invoke('set-config', 'messages', next);
  },
  clearMessages: () => {
    set({ messages: [] });
    window.electronAPI?.invoke('set-config', 'messages', []);
  },
  setMessages: (messages) => {
    set({ messages });
    window.electronAPI?.invoke('set-config', 'messages', messages);
  },
  setChatOpen: (isChatOpen) => set({ isChatOpen }),
  setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  setReminderListOpen: (isReminderListOpen) => set({ isReminderListOpen }),
  setReminders: (reminders) => set({ reminders }),

  loadReminders: async () => {
    try {
      const list = (await window.electronAPI?.invoke('reminder-get')) as Reminder[] | undefined;
      if (list) set({ reminders: list });
    } catch {
      // ignore
    }
  },

  updateConfig: (cfg) => {
    const newConfig = { ...get().config, ...cfg };
    set({ config: newConfig });
    window.electronAPI?.invoke('set-config', 'config', newConfig);
  },

  loadConfig: async () => {
    try {
      const saved = (await window.electronAPI?.invoke('get-config', 'config')) as AppConfig | undefined;
      if (saved) {
        set({ config: { ...get().config, ...saved } });
      }
    } catch {
      // ignore
    }
  },

  loadMessages: async () => {
    try {
      const saved = (await window.electronAPI?.invoke('get-config', 'messages')) as ChatMessage[] | undefined;
      if (saved && Array.isArray(saved)) {
        set({ messages: saved });
      }
    } catch {
      // ignore
    }
  },
}));
