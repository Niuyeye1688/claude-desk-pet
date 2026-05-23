import Store from 'electron-store';
import { BrowserWindow } from 'electron';
import * as chrono from 'chrono-node';

interface Reminder {
  id: string;
  content: string;
  triggerAt: number;
  repeat: 'once' | 'daily' | 'weekly';
  enabled: boolean;
}

const store = new Store<{ reminders: Reminder[] }>({ defaults: { reminders: [] } });
let checkInterval: ReturnType<typeof setInterval> | null = null;
let petWindowRef: BrowserWindow | null = null;

export function getReminders(): Reminder[] {
  return store.get('reminders', []);
}

export function parseNaturalTime(text: string): number | null {
  if (!text || typeof text !== 'string') return null;

  // 先尝试用 chrono-node 解析
  const results = chrono.parse(text, new Date(), { forwardDate: true });
  if (results && results.length > 0) {
    const date = results[0].start.date();
    if (date && !isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  // 兜底：尝试直接解析 ISO / 常见格式
  const direct = new Date(text);
  if (!isNaN(direct.getTime())) {
    return direct.getTime();
  }

  return null;
}

export function addReminder(data: { content: string; triggerAt: number | string; repeat?: string }): Reminder {
  const reminders = getReminders();

  let triggerAtNum: number;
  if (typeof data.triggerAt === 'string') {
    const parsed = parseNaturalTime(data.triggerAt);
    if (parsed === null) {
      throw new Error(`无法解析时间: ${data.triggerAt}`);
    }
    triggerAtNum = parsed;
  } else if (typeof data.triggerAt === 'number' && data.triggerAt === 0) {
    const parsed = parseNaturalTime(data.content);
    if (parsed === null) {
      throw new Error(`无法从内容中解析时间: ${data.content}`);
    }
    triggerAtNum = parsed;
  } else {
    triggerAtNum = Number(data.triggerAt);
  }

  const reminder: Reminder = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    content: data.content,
    triggerAt: triggerAtNum,
    repeat: (data.repeat as Reminder['repeat']) || 'once',
    enabled: true,
  };
  store.set('reminders', [...reminders, reminder]);
  return reminder;
}

export function removeReminder(id: string): boolean {
  const reminders = getReminders().filter((r) => r.id !== id);
  store.set('reminders', reminders);
  return true;
}

export function toggleReminder(id: string): boolean {
  const reminders = getReminders().map((r) =>
    r.id === id ? { ...r, enabled: !r.enabled } : r
  );
  store.set('reminders', reminders);
  return true;
}

export function startReminderCheck(petWindow: BrowserWindow) {
  petWindowRef = petWindow;
  if (checkInterval) clearInterval(checkInterval);

  checkInterval = setInterval(() => {
    const now = Date.now();
    const reminders = getReminders();

    for (const reminder of reminders) {
      if (!reminder.enabled) continue;
      if (reminder.triggerAt <= now) {
        // Trigger reminder
        if (petWindowRef && !petWindowRef.isDestroyed()) {
          petWindowRef.webContents.send('pet-notify', 'reminder', {
            content: reminder.content,
          });
        }

        if (reminder.repeat === 'once') {
          removeReminder(reminder.id);
        } else if (reminder.repeat === 'daily') {
          const next = new Date(reminder.triggerAt);
          next.setDate(next.getDate() + 1);
          const remindersList = getReminders().map((r) =>
            r.id === reminder.id ? { ...r, triggerAt: next.getTime() } : r
          );
          store.set('reminders', remindersList);
        } else if (reminder.repeat === 'weekly') {
          const next = new Date(reminder.triggerAt);
          next.setDate(next.getDate() + 7);
          const remindersList = getReminders().map((r) =>
            r.id === reminder.id ? { ...r, triggerAt: next.getTime() } : r
          );
          store.set('reminders', remindersList);
        }
      }
    }
  }, 5000);
}
