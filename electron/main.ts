import { app, ipcMain, screen } from 'electron';
import { spawn } from 'child_process';
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

// Walk state
let walkTimer: NodeJS.Timeout | null = null;
let walkChatSyncTimer: NodeJS.Timeout | null = null;
let walkDirX = 0;
let walkDirY = 0;
let walkAccumX = 0;
let walkAccumY = 0;
let walkPosX = 0;
let walkPosY = 0;

const modifierKeys = new Set([
  'LEFT CTRL', 'RIGHT CTRL',
  'LEFT ALT', 'RIGHT ALT',
  'LEFT SHIFT', 'RIGHT SHIFT',
  'LEFT META', 'RIGHT META',
  'CAPS LOCK', 'NUM LOCK', 'SCROLL LOCK',
  'PRINT SCREEN', 'ESCAPE',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  // Navigation / media — not typing
  'LEFT', 'RIGHT', 'UP', 'DOWN',
  'PAGE UP', 'PAGE DOWN', 'HOME', 'END',
  'INSERT', 'DELETE', 'TAB',
  'SPACE', 'RETURN', 'ENTER', 'BACKSPACE',
  'MEDIA PLAY PAUSE', 'MEDIA NEXT TRACK', 'MEDIA PREVIOUS TRACK', 'MEDIA STOP',
  'VOLUME UP', 'VOLUME DOWN', 'VOLUME MUTE',
]);

function updateTypingStatus() {
  const isTyping = isChatTyping || isGlobalTyping;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('typing-status', isTyping);
  }
}

function checkFocusIsTextInput(): Promise<boolean> {
  const script = `try { Add-Type -AssemblyName UIAutomationClient | Out-Null; $e = [System.Windows.Automation.AutomationElement]::FocusedElement; if ($e) { $t = $e.Current.ControlType.ProgrammaticName; if ($t -match 'Edit|Document|Text') { Write-Output 'YES' } else { Write-Output 'NO' } } else { Write-Output 'NO' } } catch { Write-Output 'NO' }`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');

  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded]);
    let stdout = '';
    ps.stdout.on('data', (data) => { stdout += data.toString(); });
    ps.stderr.on('data', () => { /* ignore */ });
    ps.on('close', () => {
      resolve(stdout.trim() === 'YES');
    });
    ps.on('error', () => resolve(false));
    setTimeout(() => {
      try { ps.kill(); } catch { /* ignore */ }
      resolve(false);
    }, 1000);
  });
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

    if (isGlobalTyping) {
      // Already typing: just refresh the timer
      if (globalTypingTimer) clearTimeout(globalTypingTimer);
      globalTypingTimer = setTimeout(() => {
        isGlobalTyping = false;
        updateTypingStatus();
      }, 300);
      return;
    }

    // Not typing yet: verify focus is in a text input before entering typing state
    checkFocusIsTextInput().then((isTextInput) => {
      if (isTextInput) {
        isGlobalTyping = true;
        updateTypingStatus();

        if (globalTypingTimer) clearTimeout(globalTypingTimer);
        globalTypingTimer = setTimeout(() => {
          isGlobalTyping = false;
          updateTypingStatus();
        }, 300);
      }
    });
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
  stopWalk();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function syncChatWindow() {
  if (!chatWindow || chatWindow.isDestroyed() || !petWindow || petWindow.isDestroyed()) return;
  if (!chatWindow.isVisible()) return;

  const petBounds = petWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: petBounds.x, y: petBounds.y });
  const { x: wx, y: wy, width: ww, height: wh } = display.workArea;

  const CW = 360;
  const CH = 420;

  let cx = petBounds.x + petBounds.width + 8;
  let cy = petBounds.y;

  if (cx + CW > wx + ww) {
    cx = petBounds.x - CW - 8;
  }
  if (cy + CH > wy + wh) {
    cy = wy + wh - CH - 8;
  }
  if (cy < wy) cy = wy + 8;

  chatWindow.setBounds({
    x: Math.round(cx),
    y: Math.round(cy),
    width: CW,
    height: CH,
  });
}

function stopWalk() {
  if (walkTimer) {
    clearTimeout(walkTimer);
    walkTimer = null;
  }
  if (walkChatSyncTimer) {
    clearInterval(walkChatSyncTimer);
    walkChatSyncTimer = null;
  }
}

function startWalk() {
  if (walkTimer) return;
  if (!petWindow || petWindow.isDestroyed()) return;

  let dx = (Math.random() - 0.5) * 2;
  let dy = (Math.random() - 0.5) * 2;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  walkDirX = dx / len;
  walkDirY = dy / len;
  walkAccumX = 0;
  walkAccumY = 0;

  const b = petWindow.getBounds();
  walkPosX = b.x;
  walkPosY = b.y;

  const STEP = 1;
  const INTERVAL = 33;

  const tick = () => {
    if (!petWindow || petWindow.isDestroyed()) {
      stopWalk();
      return;
    }

    const display = screen.getDisplayNearestPoint({ x: walkPosX, y: walkPosY });
    const { x: wx, y: wy, width: ww, height: wh } = display.workArea;

    walkAccumX += walkDirX * STEP;
    walkAccumY += walkDirY * STEP;

    const dx = Math.round(walkAccumX);
    const dy = Math.round(walkAccumY);
    walkAccumX -= dx;
    walkAccumY -= dy;

    walkPosX += dx;
    walkPosY += dy;

    const maxX = wx + ww - 160;
    const maxY = wy + wh - 160;

    if (walkPosX < wx) { walkPosX = wx; walkDirX = Math.abs(walkDirX); walkAccumX = 0; }
    if (walkPosX > maxX) { walkPosX = maxX; walkDirX = -Math.abs(walkDirX); walkAccumX = 0; }
    if (walkPosY < wy) { walkPosY = wy; walkDirY = Math.abs(walkDirY); walkAccumY = 0; }
    if (walkPosY > maxY) { walkPosY = maxY; walkDirY = -Math.abs(walkDirY); walkAccumY = 0; }

    if (Math.random() < 0.02) {
      let ndx = (Math.random() - 0.5) * 2;
      let ndy = (Math.random() - 0.5) * 2;
      const nl = Math.sqrt(ndx * ndx + ndy * ndy) || 1;
      walkDirX = ndx / nl;
      walkDirY = ndy / nl;
    }

    petWindow.setBounds({ x: Math.round(walkPosX), y: Math.round(walkPosY), width: 160, height: 160 });
    walkTimer = setTimeout(tick, INTERVAL);
  };

  walkTimer = setTimeout(tick, INTERVAL);

  // Sync chat window at lower frequency (10 fps) to avoid DWM stutter
  walkChatSyncTimer = setInterval(() => {
    syncChatWindow();
  }, 100);
}

ipcMain.on('pet-move', (_, pos: { x: number; y: number }) => {
  if (petWindow) {
    petWindow.setBounds({
      x: Math.round(pos.x),
      y: Math.round(pos.y),
      width: 160,
      height: 160,
    });
    walkPosX = pos.x;
    walkPosY = pos.y;
  }
  syncChatWindow();
});

ipcMain.on('start-walk', () => startWalk());
ipcMain.on('stop-walk', () => stopWalk());

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
  const { x: wx, y: wy, width: ww, height: wh } = display.workArea;

  const MW = 140;
  const MH = 156;

  // 默认显示在宠物右下角外侧
  let mx = petBounds.x + petBounds.width + 4;
  let my = petBounds.y + petBounds.height - MH + 20;

  // 边界检查：右侧超出则放左侧
  if (mx + MW > wx + ww) {
    mx = petBounds.x - MW - 4;
  }
  // 底部超出则上移
  if (my + MH > wy + wh) {
    my = wy + wh - MH - 4;
  }
  if (my < wy) my = wy + 4;

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
