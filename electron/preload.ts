import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  petMove: (pos: { x: number; y: number }) => void;
  toggleChat: (show: boolean) => void;
  onChatMessage: (callback: (message: string) => void) => void;
  sendChatMessage: (message: string) => void;
  onPetNotify: (callback: (type: string, data?: unknown) => void) => void;
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  send: (channel: string, ...args: unknown[]) => void;
  onOpenSettings: (callback: () => void) => (() => void);
  onOpenReminders: (callback: () => void) => (() => void);
  sendAIStream: (messages: Array<{ role: string; content: string }>) => void;
  onAIStreamData: (callback: (chunk: string) => void) => void;
  onAIStreamDone: (callback: (data: { action?: unknown; error?: string }) => void) => void;
  offAIStreamData: () => void;
  offAIStreamDone: () => void;
  showContextMenu: () => void;
  sendContextMenuAction: (action: string) => void;
  onMouseAngle: (callback: (angle: number) => void) => (() => void);
}

const api: ElectronAPI = {
  petMove: (pos) => ipcRenderer.send('pet-move', pos),
  toggleChat: (show) => ipcRenderer.send('toggle-chat', show),
  onChatMessage: (callback) => {
    ipcRenderer.on('chat-message', (_, message) => callback(message));
  },
  sendChatMessage: (message) => ipcRenderer.send('chat-message', message),
  onPetNotify: (callback) => {
    ipcRenderer.on('pet-notify', (_, type, data) => callback(type, data));
  },
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  onOpenSettings: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('open-settings', handler);
    return () => ipcRenderer.removeListener('open-settings', handler);
  },
  onOpenReminders: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('open-reminders', handler);
    return () => ipcRenderer.removeListener('open-reminders', handler);
  },

  // AI Stream
  sendAIStream: (messages) => ipcRenderer.send('ai-chat-stream', messages),
  onAIStreamData: (callback) => {
    ipcRenderer.on('ai-stream-data', (_, chunk) => callback(chunk));
  },
  onAIStreamDone: (callback) => {
    ipcRenderer.on('ai-stream-done', (_, data) => callback(data));
  },
  offAIStreamData: () => {
    ipcRenderer.removeAllListeners('ai-stream-data');
  },
  offAIStreamDone: () => {
    ipcRenderer.removeAllListeners('ai-stream-done');
  },
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  sendContextMenuAction: (action) => ipcRenderer.send('context-menu-action', action),
  onMouseAngle: (callback) => {
    const handler = (_: unknown, angle: number) => callback(angle);
    ipcRenderer.on('mouse-angle', handler);
    return () => ipcRenderer.removeListener('mouse-angle', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type { ElectronAPI };
