import { ipcMain, shell, dialog, IpcMainInvokeEvent, app, screen } from 'electron';
import { chatWithAI, chatWithAIStream } from './ai-service';
import { getReminders, addReminder, removeReminder, toggleReminder, parseNaturalTime } from './reminder-service';
import { execSystemTool, discoverApps, getAppList } from './system-tools';
import Store from 'electron-store';

const store = new Store({ projectName: 'claude-desk-pet' });

export function registerIPCHandlers() {
  ipcMain.handle('ai-chat', async (_, messages: unknown[]) => {
    try {
      return await chatWithAI(messages as Array<{ role: string; content: string }>);
    } catch (err) {
      const e = err as Error;
      return { error: e.message };
    }
  });

  ipcMain.on('ai-chat-stream', async (event: IpcMainInvokeEvent, messages: unknown[]) => {
    try {
      const generator = chatWithAIStream(messages as Array<{ role: string; content: string }>);
      for await (const item of generator) {
        if ('chunk' in item) {
          event.sender.send('ai-stream-data', item.chunk);
        } else if ('done' in item) {
          event.sender.send('ai-stream-done', { action: item.action });
        }
      }
    } catch (err) {
      const e = err as Error;
      event.sender.send('ai-stream-done', { error: e.message });
    }
  });

  ipcMain.handle('get-config', (_, key: string) => {
    return store.get(key);
  });

  ipcMain.handle('set-config', (_, key: string, value: unknown) => {
    store.set(key, value);
    return true;
  });

  ipcMain.handle('get-all-config', () => {
    return store.store;
  });

  ipcMain.handle('reminder-get', () => {
    return getReminders();
  });

  ipcMain.handle('reminder-add', (_, reminder: unknown) => {
    try {
      return addReminder(reminder as { content: string; triggerAt: number | string; repeat?: string });
    } catch (err) {
      const e = err as Error;
      return { error: e.message };
    }
  });

  ipcMain.handle('reminder-remove', (_, id: string) => {
    return removeReminder(id);
  });

  ipcMain.handle('reminder-toggle', (_, id: string) => {
    return toggleReminder(id);
  });

  ipcMain.handle('reminder-parse-time', (_, text: string) => {
    return parseNaturalTime(text);
  });

  ipcMain.handle('system-tool', async (_, command: string, args?: string[]) => {
    try {
      return await execSystemTool(command, args);
    } catch (err) {
      const e = err as Error;
      return { error: e.message };
    }
  });

  ipcMain.handle('system-tool-list-apps', async () => {
    try {
      // 确保缓存已加载
      await discoverApps();
      return { success: true, apps: getAppList() };
    } catch (err) {
      const e = err as Error;
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('open-external', (_, url: string) => {
    shell.openExternal(url);
    return true;
  });

  ipcMain.handle('show-save-dialog', async (_, options) => {
    const result = await dialog.showSaveDialog(options);
    return result;
  });

  ipcMain.handle('quit-app', () => {
    app.quit();
    return true;
  });

  ipcMain.handle('get-screen-size', () => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    return { width, height };
  });
}
