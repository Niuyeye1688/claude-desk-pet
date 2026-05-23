import { Tray, Menu, BrowserWindow, nativeImage, app } from 'electron';
import path from 'path';
import fs from 'fs';

let tray: Tray | null = null;

function createFallbackIcon(): nativeImage.NativeImage {
  // Create a simple 16x16 yellow square as fallback
  const size = { width: 16, height: 16 };
  const image = nativeImage.createEmpty();
  // Electron doesn't support drawing on nativeImage easily,
  // so we create a 1x1 transparent image and let OS use default
  const buffer = Buffer.alloc(16 * 16 * 4, 0);
  for (let i = 0; i < 16 * 16; i++) {
    buffer[i * 4] = 212;     // R
    buffer[i * 4 + 1] = 160; // G
    buffer[i * 4 + 2] = 23;  // B
    buffer[i * 4 + 3] = 255; // A
  }
  return nativeImage.createFromBuffer(buffer, size);
}

export function createTray(petWindow: BrowserWindow, chatWindow: BrowserWindow): Tray {
  const iconPath = path.join(__dirname, '../assets/icons/tray.png');
  let icon: nativeImage.NativeImage;

  try {
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        icon = createFallbackIcon();
      }
    } else {
      console.warn('Tray icon not found at:', iconPath);
      icon = createFallbackIcon();
    }
  } catch (err) {
    console.error('Failed to load tray icon:', err);
    icon = createFallbackIcon();
  }

  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('ClaudeDeskPet');

  const updateMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: petWindow.isVisible() ? '隐藏宠物' : '显示宠物',
        click: () => {
          if (petWindow.isVisible()) {
            petWindow.hide();
            chatWindow.hide();
          } else {
            petWindow.show();
          }
        },
      },
      {
        label: '打开对话',
        click: () => {
          petWindow.show();
          chatWindow.show();
          chatWindow.focus();
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.quit();
        },
      },
    ]);
    tray!.setContextMenu(contextMenu);
  };

  updateMenu();

  tray.on('click', () => {
    if (petWindow.isVisible()) {
      petWindow.hide();
      chatWindow.hide();
    } else {
      petWindow.show();
    }
    updateMenu();
  });

  petWindow.on('show', updateMenu);
  petWindow.on('hide', updateMenu);

  return tray;
}
