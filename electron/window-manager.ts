import { BrowserWindow, screen } from 'electron';
import path from 'path';

export function createPetWindow(): BrowserWindow {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: 160,
    height: 160,
    x: Math.max(20, sw - 180),
    y: Math.max(20, sh - 200),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setResizable(false);
  win.setMinimumSize(160, 160);
  win.setMaximumSize(160, 160);
  win.setIgnoreMouseEvents(false);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.on('will-resize', (e) => {
    e.preventDefault();
  });

  // Debug logging
  win.webContents.on('did-fail-load', (_, code, desc) => {
    console.error('Pet window failed to load:', code, desc);
  });
  win.webContents.on('console-message', (_, level, message) => {
    console.log(`[Pet ${level}]`, message);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/pet`);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'pet' }).catch((err) => {
      console.error('Failed to load pet window:', err);
    });
  }

  return win;
}

export function createChatWindow(petWindow: BrowserWindow): BrowserWindow {
  const win = new BrowserWindow({
    width: 360,
    height: 420,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setResizable(false);
  win.setMinimumSize(360, 420);
  win.setMaximumSize(360, 420);

  win.on('will-resize', (e) => {
    e.preventDefault();
  });

  const petBounds = petWindow.getBounds();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  let cx = petBounds.x - 368;
  let cy = petBounds.y;
  if (cx < 0) cx = petBounds.x + petBounds.width + 8;
  if (cy + 420 > sh) cy = sh - 428;
  if (cy < 0) cy = 8;
  win.setBounds({ x: cx, y: cy, width: 360, height: 420 });

  win.webContents.on('did-fail-load', (_, code, desc) => {
    console.error('Chat window failed to load:', code, desc);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/chat`);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'chat' }).catch((err) => {
      console.error('Failed to load chat window:', err);
    });
  }

  return win;
}

export function createContextMenuWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 140,
    height: 156,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setResizable(false);
  win.setMinimumSize(140, 160);
  win.setMaximumSize(140, 160);
  win.on('will-resize', (e) => e.preventDefault());
  win.setIgnoreMouseEvents(false);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.webContents.on('did-fail-load', (_, code, desc) => {
    console.error('Context menu window failed to load:', code, desc);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/context-menu`);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'context-menu' }).catch((err) => {
      console.error('Failed to load context menu window:', err);
    });
  }

  return win;
}
