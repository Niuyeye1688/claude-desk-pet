import { app, ipcMain, screen, BrowserWindow } from 'electron';
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

// Follow state (move toward mouse after hover)
let followTimer: NodeJS.Timeout | null = null;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let mouseStillSince = 0;
const MOUSE_STILL_THRESHOLD = 10000;
const MOUSE_STILL_RADIUS = 10;
const FOLLOW_ARRIVAL_RADIUS = 20;

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
  if (isTyping && followTimer) stopFollow();
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

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (petWindow) {
      if (petWindow.isMinimized()) petWindow.restore();
      petWindow.show();
      petWindow.focus();
    }
  });

  app.whenReady().then(() => {
  // Defensive: avoid duplicate pet window when Electron restarts in dev mode
  const existingPet = BrowserWindow.getAllWindows().find((w) => {
    const b = w.getBounds();
    return b.width === 160 && b.height === 160;
  });
  petWindow = existingPet || createPetWindow();
  chatWindow = createChatWindow(petWindow);
  menuWindow = createContextMenuWindow();
  createTray(petWindow, chatWindow);
  registerIPCHandlers();
  startReminderCheck(petWindow);

  // Send mouse angle to pet window for eye-tracking + mouse still detection
  mouseInterval = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const mouse = screen.getCursorScreenPoint();
    const bounds = petWindow.getBounds();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const angle = Math.atan2(mouse.y - cy, mouse.x - cx) * (180 / Math.PI);
    petWindow.webContents.send('mouse-angle', angle);

    // Mouse still detection for follow
    if (mouseStillSince === 0) {
      lastMouseX = mouse.x;
      lastMouseY = mouse.y;
      mouseStillSince = Date.now();
      return;
    }
    const dist = Math.hypot(mouse.x - lastMouseX, mouse.y - lastMouseY);
    if (dist >= MOUSE_STILL_RADIUS) {
      lastMouseX = mouse.x;
      lastMouseY = mouse.y;
      mouseStillSince = Date.now();
    } else if (Date.now() - mouseStillSince >= MOUSE_STILL_THRESHOLD) {
      if (tryStartFollow()) {
        mouseStillSince = 0;
      } else {
        mouseStillSince = Date.now(); // retry after another threshold
      }
    }
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
    const existingPet = BrowserWindow.getAllWindows().find((w) => {
      const b = w.getBounds();
      return b.width === 160 && b.height === 160;
    });
    if (existingPet) {
      petWindow = existingPet;
      petWindow.show();
    } else {
      petWindow = createPetWindow();
    }
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

function syncChatWindow(force = false) {
  if (!chatWindow || chatWindow.isDestroyed() || !petWindow || petWindow.isDestroyed()) return;
  if (!force && !chatWindow.isVisible()) return;

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

function canStartFollow(): boolean {
  if (!petWindow || petWindow.isDestroyed()) return false;
  if (walkTimer !== null) return false;
  if (followTimer !== null) return false;
  if (isChatTyping || isGlobalTyping) return false;
  if (chatWindow?.isVisible()) return false;
  if (menuWindow?.isVisible()) return false;
  if (isDragging) return false;

  const mouse = screen.getCursorScreenPoint();
  const bounds = petWindow.getBounds();
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const dist = Math.hypot(mouse.x - cx, mouse.y - cy);
  if (dist < FOLLOW_ARRIVAL_RADIUS) return false;

  return true;
}

function tryStartFollow(): boolean {
  if (!canStartFollow()) return false;
  startFollow();
  return true;
}

function stopFollow() {
  if (followTimer) {
    clearTimeout(followTimer);
    followTimer = null;
  }
  if (walkChatSyncTimer) {
    clearInterval(walkChatSyncTimer);
    walkChatSyncTimer = null;
  }
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('follow-done');
  }
}

function startFollow() {
  if (followTimer) return;
  if (!petWindow || petWindow.isDestroyed()) return;

  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('follow-start');
  }

  const b = petWindow.getBounds();
  walkPosX = b.x;
  walkPosY = b.y;

  const STEP = 1;
  const INTERVAL = 33;

  const tick = () => {
    if (!petWindow || petWindow.isDestroyed()) {
      stopFollow();
      return;
    }

    if (isChatTyping || isGlobalTyping) { stopFollow(); return; }
    if (chatWindow?.isVisible()) { stopFollow(); return; }
    if (menuWindow?.isVisible()) { stopFollow(); return; }
    if (isDragging) { stopFollow(); return; }

    const mouse = screen.getCursorScreenPoint();
    const bounds = petWindow.getBounds();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;

    const dx = mouse.x - cx;
    const dy = mouse.y - cy;
    const dist = Math.hypot(dx, dy);

    if (dist < FOLLOW_ARRIVAL_RADIUS) {
      stopFollow();
      return;
    }

    const dirX = dx / dist;
    const dirY = dy / dist;

    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
    const { x: wx, y: wy, width: ww, height: wh } = display.workArea;

    let newX = bounds.x + dirX * STEP;
    let newY = bounds.y + dirY * STEP;

    const maxX = wx + ww - 160;
    const maxY = wy + wh - 160;

    if (newX < wx) newX = wx;
    if (newX > maxX) newX = maxX;
    if (newY < wy) newY = wy;
    if (newY > maxY) newY = maxY;

    petWindow.setBounds({ x: Math.round(newX), y: Math.round(newY), width: 160, height: 160 });
    walkPosX = newX;
    walkPosY = newY;

    followTimer = setTimeout(tick, INTERVAL);
  };

  followTimer = setTimeout(tick, INTERVAL);

  walkChatSyncTimer = setInterval(() => {
    syncChatWindow();
  }, 100);
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
  if (followTimer) stopFollow();
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
  if (followTimer) stopFollow();
  syncChatWindow();
});

ipcMain.on('drag-start', () => {
  isDragging = true;
  if (followTimer) stopFollow();
});

ipcMain.on('drag-end', () => {
  isDragging = false;
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

function notifyPetPanelState(isOpen: boolean) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send(isOpen ? 'panel-open' : 'panel-close');
  }
}

ipcMain.on('toggle-chat', (_, show: boolean) => {
  if (chatWindow) {
    ensureChatSize();
    if (show) {
      syncChatWindow(true);
      chatWindow.show();
      chatWindow.focus();
      notifyPetPanelState(true);
    } else {
      chatWindow.hide();
      notifyPetPanelState(false);
    }
  }
});

ipcMain.on('open-settings-panel', () => {
  if (chatWindow) {
    ensureChatSize();
    syncChatWindow(true);
    chatWindow.show();
    chatWindow.focus();
    chatWindow.webContents.send('open-settings');
    notifyPetPanelState(true);
  }
});

ipcMain.on('open-reminders-panel', () => {
  if (chatWindow) {
    ensureChatSize();
    chatWindow.show();
    chatWindow.focus();
    chatWindow.webContents.send('open-reminders');
    notifyPetPanelState(true);
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
          notifyPetPanelState(false);
        } else {
          chatWindow.show();
          chatWindow.focus();
          notifyPetPanelState(true);
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
        notifyPetPanelState(true);
      }
      break;
    }
    case 'reminders': {
      if (chatWindow) {
        ensureChatSize();
        chatWindow.show();
        chatWindow.focus();
        chatWindow.webContents.send('open-reminders');
        notifyPetPanelState(true);
      }
      break;
    }
    case 'quit':
      app.quit();
      break;
  }
});

}

export { petWindow, chatWindow, menuWindow };
