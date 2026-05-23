import { app, ipcMain, screen } from 'electron';
import { GlobalKeyboardListener } from 'node-global-key-listener';
import { createPetWindow, createChatWindow, createContextMenuWindow } from './window-manager';
import { createTray } from './tray-manager';
import { registerIPCHandlers } from './ipc-handlers';
import { startReminderCheck } from './reminder-service';

let petWindow: Electron.BrowserWindow | null = null;
let chatWindow: Electron.BrowserWindow | null = null;
let menuWindow: Electron.BrowserWindow | null = null;
let mouseInterval: NodeJS.Timeout | null = null;

// Typing state tracking
let isChatTyping = false;
let isGlobalTyping = false;
let globalTypingTimer: NodeJS.Timeout | null = null;
let gkl: GlobalKeyboardListener | null = null;

const modifierKeys = new Set([
  'LEFT CTRL', 'RIGHT CTRL',
  'LEFT ALT', 'RIGHT ALT',
  'LEFT SHIFT', 'RIGHT SHIFT',
  'LEFT META', 'RIGHT META',
  'CAPS LOCK', 'NUM LOCK', 'SCROLL LOCK',
  'PRINT SCREEN', 'ESCAPE',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

function updateTypingStatus() {
  const isTyping = isChatTyping || isGlobalTyping;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('typing-status', isTyping);
  }
}

app.whenReady().then(() => {
  petWindow = createPetWindow();
  chatWindow = createChatWindow(petWindow);
  menuWindow = createContextMenuWindow();
  createTray(petWindow, chatWindow);
  registerIPCHandlers();
  startReminderCheck(petWindow);

  // Send mouse angle to pet window for eye-tracking
  mouseInterval = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const mouse = screen.getCursorScreenPoint();
    const bounds = petWindow.getBounds();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const angle = Math.atan2(mouse.y - cy, mouse.x - cx) * (180 / Math.PI);
    petWindow.webContents.send('mouse-angle', angle);
  }, 100);

  // Global keyboard listener for typing detection
  gkl = new GlobalKeyboardListener();
  gkl.addListener((e) => {
    const name = e.name?.toUpperCase() ?? '';
    // Ignore mouse clicks, empty names, and modifier-only keys
    if (e.state !== 'DOWN' || !name || name.startsWith('MOUSE') || modifierKeys.has(name)) {
      return;
    }
    isGlobalTyping = true;
    updateTypingStatus();

    if (globalTypingTimer) clearTimeout(globalTypingTimer);
    globalTypingTimer = setTimeout(() => {
      isGlobalTyping = false;
      updateTypingStatus();
    }, 300);
  });

  // 菜单窗口失焦自动隐藏
  menuWindow.on('blur', () => {
    menuWindow?.hide();
  });

  app.on('activate', () => {
    if (petWindow === null || petWindow.isDestroyed()) {
      petWindow = createPetWindow();
    }
    petWindow.show();
  });
});

app.on('before-quit', () => {
  if (mouseInterval) {
    clearInterval(mouseInterval);
    mouseInterval = null;
  }
  if (globalTypingTimer) {
    clearTimeout(globalTypingTimer);
    globalTypingTimer = null;
  }
  if (gkl) {
    gkl.kill();
    gkl = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('pet-move', (_, pos: { x: number; y: number }) => {
  if (petWindow) {
    petWindow.setBounds({
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      width: 160,
      height: 160,
    });
  }
  if (chatWindow && petWindow) {
    const petBounds = petWindow.getBounds();
    const display = screen.getDisplayNearestPoint({ x: pos.x, y: pos.y });
    const { width: sw, height: sh } = display.workAreaSize;

    const CW = 360;
    const CH = 420;

    let cx = petBounds.x + petBounds.width + 8;
    let cy = petBounds.y;

    if (cx + CW > sw) {
      cx = petBounds.x - CW - 8;
    }
    if (cy + CH > sh) {
      cy = sh - CH - 8;
    }
    if (cy < 0) cy = 8;

    chatWindow.setBounds({
      x: Math.round(cx),
      y: Math.round(cy),
      width: 360,
      height: 420,
    });
  }
});

function ensureChatSize() {
  if (!chatWindow) return;
  const b = chatWindow.getBounds();
  if (b.width !== 360 || b.height !== 420) {
    console.log('[Main] Resetting chat bounds from', b.width, b.height);
    chatWindow.setBounds({ x: b.x, y: b.y, width: 360, height: 420 });
  }
}

ipcMain.on('toggle-chat', (_, show: boolean) => {
  if (chatWindow) {
    ensureChatSize();
    if (show) {
      chatWindow.show();
      chatWindow.focus();
    } else {
      chatWindow.hide();
    }
  }
});

ipcMain.on('open-settings-panel', () => {
  if (chatWindow) {
    ensureChatSize();
    chatWindow.show();
    chatWindow.focus();
    chatWindow.webContents.send('open-settings');
  }
});

ipcMain.on('open-reminders-panel', () => {
  if (chatWindow) {
    ensureChatSize();
    chatWindow.show();
    chatWindow.focus();
    chatWindow.webContents.send('open-reminders');
  }
});

// Typing status from chat window (focus/blur) → merged with global keyboard
ipcMain.on('typing-status', (_, isTyping: boolean) => {
  isChatTyping = isTyping;
  updateTypingStatus();
});

// Context menu window handling
ipcMain.on('show-context-menu', () => {
  if (!menuWindow || !petWindow) return;

  const petBounds = petWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: petBounds.x, y: petBounds.y });
  const { width: sw, height: sh } = display.workAreaSize;

  const MW = 140;
  const MH = 156;

  // 默认显示在宠物右下角外侧
  let mx = petBounds.x + petBounds.width + 4;
  let my = petBounds.y + petBounds.height - MH + 20;

  // 边界检查：右侧超出则放左侧
  if (mx + MW > sw) {
    mx = petBounds.x - MW - 4;
  }
  // 底部超出则上移
  if (my + MH > sh) {
    my = sh - MH - 4;
  }
  if (my < 0) my = 4;

  menuWindow.setBounds({ x: Math.round(mx), y: Math.round(my), width: MW, height: MH });
  menuWindow.show();
  menuWindow.focus();
});

ipcMain.on('context-menu-action', (_, action: string) => {
  menuWindow?.hide();

  switch (action) {
    case 'chat': {
      if (chatWindow) {
        ensureChatSize();
        if (chatWindow.isVisible()) {
          chatWindow.hide();
        } else {
          chatWindow.show();
          chatWindow.focus();
        }
      }
      break;
    }
    case 'settings': {
      if (chatWindow) {
        ensureChatSize();
        chatWindow.show();
        chatWindow.focus();
        chatWindow.webContents.send('open-settings');
      }
      break;
    }
    case 'reminders': {
      if (chatWindow) {
        ensureChatSize();
        chatWindow.show();
        chatWindow.focus();
        chatWindow.webContents.send('open-reminders');
      }
      break;
    }
    case 'quit':
      app.quit();
      break;
  }
});

export { petWindow, chatWindow, menuWindow };
