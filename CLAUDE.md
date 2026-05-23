# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClaudeDeskPet is an Electron desktop pet application. The pet floats on top of all windows and can be dragged around. It features AI chat (via DeepSeek API), reminders, eye-tracking (pupils follow the mouse), and auto-behavior (idle/walk states).

**Tech stack:** Electron 42 + Vite 8 + React 19 + TypeScript + Tailwind CSS v4 + Zustand.

## Build Commands

```bash
npm run dev              # Start Vite dev server + Electron
npm run build:win        # Build Windows installer (tsc + vite build + electron-builder --win)
npm run build            # Generic build (tsc + vite build + electron-builder)
```

The installer output is `release/ClaudeDeskPet Setup 1.0.9.exe`. There is no test suite or linter configured.

## Architecture

### Multi-Window Setup

The app uses **three BrowserWindows** managed in `electron/main.ts` and `electron/window-manager.ts`:

1. **Pet window** (`160×160`, frameless, transparent, alwaysOnTop, skipTaskbar) — renders the pet sprite. URL hash `#/pet`.
2. **Chat window** (`360×420`, same frameless style, initially hidden) — chat UI, settings, reminders. URL hash `#/chat`.
3. **Context menu window** (`140×156`, hidden) — right-click menu for the pet. URL hash `#/context-menu`.

All windows load the same `dist/index.html` and use `window.location.hash` to decide which UI to render (`src/App.tsx`).

### IPC Flow

`electron/preload.ts` exposes `window.electronAPI` (contextBridge). Main-side handlers live in `electron/ipc-handlers.ts`. Channels include:

- `pet-move` — renderer sends new window position, main updates pet + chat bounds
- `toggle-chat`, `show-context-menu`, `context-menu-action` — window visibility / menu actions
- `mouse-angle` — main → renderer every 100ms with mouse angle for eye tracking
- `ai-chat`, `ai-chat-stream` / `ai-stream-data`, `ai-stream-done` — AI chat (non-streaming and streaming)
- `reminder-*` — CRUD for reminders
- `system-tool`, `system-tool-list-apps` — OS integration
- `get-config`, `set-config` — persisted config via `electron-store`

### Pet Behavior & Eye Tracking

**Behavior:** `src/hooks/usePetBehavior.ts` runs a random timer that switches between `idle` and `walk` states. Paused while dragging. States: `'idle' | 'walk' | 'sleep' | 'happy' | 'click' | 'type'`.

**Eye tracking:** `electron/main.ts` polls `screen.getCursorScreenPoint()` every 100ms and sends the angle to the pet window. `src/components/PetSprite.tsx` computes pupil offsets mathematically and positions two absolute `div` pupils over transparent eye holes in `pet.png`. The pupils are children of the animated `.pet-body` container so they move with CSS transforms (breathing, walking, etc.).

**Important math:** The pet image is `150×96` but rendered inside a square container using `object-fit: contain`. Pupil positions must account for the vertical offset caused by the image's aspect ratio (`imgTopOffset`).

**Current pet.png:** User-customized pixel-art character (150×96). The eyes are two `6×11` black rectangles centered at `(52.5, 34)` and `(94.5, 34)` in the original image. The eye regions are transparent; pupils overlay them.

### AI Service

`electron/ai-service.ts` uses the `openai` SDK but points to DeepSeek by default (`baseURL: 'https://api.deepseek.com'`). Only two models are supported: `deepseek-v4-flash` and `deepseek-v4-pro` (configured in `SettingsPanel.tsx` and `petStore.ts`).

The AI has a system prompt that defines a "cute desktop pet" persona. It can output JSON actions at the end of responses (`open_app`, `open_url`, `reminder`), which are extracted via regex in `extractAction()`.

### State Management

`src/stores/petStore.ts` uses Zustand. Config (API key, model, pet size, activity level) is persisted through `electron-store` via IPC (`get-config` / `set-config`).

### Reminders

`electron/reminder-service.ts` uses `chrono-node` to parse natural language times (e.g., "3分钟后提醒我喝水"). Reminders are stored in `electron-store` and checked every 5 seconds.

## Key Files

| File | Purpose |
|------|---------|
| `electron/main.ts` | Main process entry. Creates windows, starts mouse angle polling, handles window positioning. |
| `electron/preload.ts` | Preload script exposing `window.electronAPI`. |
| `electron/window-manager.ts` | Factory functions for the three BrowserWindows. |
| `electron/ipc-handlers.ts` | Registers all `ipcMain.handle/on` handlers. |
| `electron/ai-service.ts` | AI chat (streaming and non-streaming) with DeepSeek/OpenAI-compatible APIs. |
| `electron/reminder-service.ts` | Reminder polling, chrono-node parsing. |
| `src/components/PetSprite.tsx` | Renders the pet image + pupils + particles + sleep Zzz. Contains eye-tracking math. |
| `src/components/Pet.tsx` | Drag logic, double-click to open chat, context menu trigger. |
| `src/hooks/usePetBehavior.ts` | Random state machine for idle/walk behavior. |
| `src/stores/petStore.ts` | Zustand store for global state + config persistence. |
| `src/index.css` | Tailwind import + pet animation keyframes (breathe, walk, happy, sleep, etc.). |
| `public/pet.png` | Pet sprite image (also copied to `assets/pet.png` for the build). |
| `assets/icons/claude-extracted.ico` | App icon (extracted from Claude Setup.exe). |
| `assets/icons/tray.png` | Tray icon. |

## Important Decisions / Constraints

- **Windows only** — `electron-builder.json5` targets NSIS x64.
- **No tests or linting** — the project has no test framework or linter configured.
- **Pet window size is fixed** at 160×160 in the main process (`setBounds` in `pet-move` handler and window creation), but `PetSprite` accepts a `size` prop (default 120) that controls the rendered sprite inside the window.
- **Mouse angle interval** runs every 100ms. On app quit, the interval is cleared in `app.on('before-quit')` and the callback guards against `isDestroyed()`.
- **`electron-builder` icon requirement** — Windows app icon must be ≥256×256.
- **Image processing history** — The `pet.png` has been processed multiple times (flood-fill background removal + eye-region transparency). If replacing the sprite, re-run the Python flood-fill + eye masking logic on the new image.
