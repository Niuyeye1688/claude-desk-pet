import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

interface AppEntry {
  name: string;
  target: string;
}

let appCache: AppEntry[] | null = null;
let appCachePromise: Promise<AppEntry[]> | null = null;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.lnk$/i, '')
    .replace(/\.url$/i, '')
    .replace(/[-_\.\s]+/g, '')
    .trim();
}

function fuzzyScore(query: string, target: string): number {
  const q = normalizeName(query);
  const t = normalizeName(target);
  if (t === q) return 1000;
  if (t.includes(q)) return 500 + q.length;
  // 简单 LCS 长度
  let score = 0;
  let ti = 0;
  for (let i = 0; i < q.length; i++) {
    const idx = t.indexOf(q[i], ti);
    if (idx !== -1) {
      score++;
      ti = idx + 1;
    }
  }
  return score;
}

async function scanDirectory(dir: string, results: AppEntry[]): Promise<void> {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await scanDirectory(fullPath, results);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.lnk' || ext === '.url' || ext === '.exe') {
          results.push({ name: entry.name, target: fullPath });
        }
      }
    }
  } catch {
    // 忽略无权限或不存在目录
  }
}

export async function discoverApps(): Promise<AppEntry[]> {
  if (appCache) return appCache;
  if (appCachePromise) return appCachePromise;

  appCachePromise = (async () => {
    const results: AppEntry[] = [];
    const dirs = [
      'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs',
      path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'),
    ];
    for (const dir of dirs) {
      await scanDirectory(dir, results);
    }
    appCache = results;
    return results;
  })();

  return appCachePromise;
}

export function getAppList(): AppEntry[] {
  return appCache || [];
}

async function resolveShortcut(lnkPath: string): Promise<string> {
  try {
    // 用 PowerShell 读取快捷方式目标
    const ps = `
      $shell = New-Object -ComObject WScript.Shell;
      $shortcut = $shell.CreateShortcut('${lnkPath.replace(/'/g, "''")}');
      Write-Output $shortcut.TargetPath;
    `;
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\"')}"`, { timeout: 10000 });
    const target = stdout.trim();
    return target || lnkPath;
  } catch {
    return lnkPath;
  }
}

async function findAppByName(appName: string): Promise<string | null> {
  const apps = await discoverApps();
  let best: { entry: AppEntry; score: number } | null = null;

  for (const entry of apps) {
    const score = fuzzyScore(appName, entry.name);
    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score };
    }
  }

  if (!best) return null;

  const ext = path.extname(best.entry.target).toLowerCase();
  if (ext === '.lnk') {
    const resolved = await resolveShortcut(best.entry.target);
    return resolved || best.entry.target;
  }
  return best.entry.target;
}

export async function execSystemTool(command: string, args?: string[]): Promise<ToolResult> {
  switch (command) {
    case 'open_app': {
      const appName = args?.[0] || '';
      if (!appName) {
        return { success: false, error: '未指定应用名称' };
      }

      // 先查硬编码映射
      const appMap: Record<string, string> = {
        '计算器': 'calc',
        '记事本': 'notepad',
        '画图': 'mspaint',
        '资源管理器': 'explorer',
        '任务管理器': 'taskmgr',
        '命令提示符': 'cmd',
        'powershell': 'powershell',
        '设置': 'ms-settings:',
        '控制面板': 'control',
      };
      const hardcoded = appMap[appName];
      if (hardcoded) {
        try {
          spawn('cmd', ['/c', 'start', '', hardcoded], { detached: true, shell: false });
          return { success: true, output: `已打开 ${appName}` };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      // 自动发现
      const discovered = await findAppByName(appName);
      if (discovered) {
        try {
          spawn('cmd', ['/c', 'start', '', `"${discovered}"`], { detached: true, shell: false });
          return { success: true, output: `已打开 ${appName}` };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }

      // 兜底：直接尝试
      try {
        spawn('cmd', ['/c', 'start', '', appName], { detached: true, shell: false });
        return { success: true, output: `已尝试打开 ${appName}` };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'open_url': {
      const url = args?.[0] || '';
      const { shell } = await import('electron');
      await shell.openExternal(url);
      return { success: true, output: `已打开 ${url}` };
    }

    case 'lock_screen': {
      try {
        await execAsync('rundll32.exe user32.dll,LockWorkStation');
        return { success: true, output: '已锁定屏幕' };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'empty_recycle_bin': {
      try {
        await execAsync('powershell -Command "Clear-RecycleBin -Confirm:$false"');
        return { success: true, output: '已清空回收站' };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'shutdown': {
      try {
        await execAsync('shutdown /s /t 60');
        return { success: true, output: '60秒后关机' };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'restart': {
      try {
        await execAsync('shutdown /r /t 60');
        return { success: true, output: '60秒后重启' };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'screenshot': {
      try {
        spawn('snippingtool');
        return { success: true, output: '已打开截图工具' };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'mute': {
      try {
        await execAsync('powershell -Command "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]173)"');
        return { success: true, output: '已静音' };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'unmute': {
      try {
        await execAsync('powershell -Command "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]173)"');
        return { success: true, output: '已切换静音状态' };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'set_volume': {
      const vol = args?.[0] || '50';
      const volume = parseInt(vol, 10);
      if (isNaN(volume) || volume < 0 || volume > 100) {
        return { success: false, error: '音量值应为 0-100 的整数' };
      }
      try {
        // 使用 nircmd 如果存在，否则用 powershell
        const ps = `
          Add-Type -TypeDefinition @'
          using System; using System.Runtime.InteropServices;
          public class VolumeControl {
            [DllImport("user32.dll")] public static extern IntPtr SendMessageW(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);
            [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
          }
'@;
          [math]::Round(${volume} / 100 * 65535) | Set-Variable -Name volScalar;
          # 通过 coreaudio 设置音量更可靠，但这里用简单方式：nircmd 优先
        `;
        // 尝试 nircmd
        try {
          await execAsync(`nircmd.exe setsysvolume ${Math.round(volume / 100 * 65535)}`);
          return { success: true, output: `音量已设置为 ${volume}%` };
        } catch {
          // fallback: 使用 PowerShell + CoreAudio
          const psScript = `
            Add-Type -TypeDefinition @'
            using System; using System.Runtime.InteropServices;
            [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
            interface IAudioEndpointVolume {
              int f1(); int f2(); int f3();
              int SetMasterVolumeLevelScalar(float fLevel, IntPtr pguidEventContext);
              int GetMasterVolumeLevelScalar(out float fLevel);
            }
            [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
            interface IMMDevice {
              int Activate(ref Guid iid, uint clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
            }
            [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
            interface IMMDeviceEnumerator {
              int f1(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
            }
            [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
            public class Volume {
              public static void Set(int percent) {
                var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
                IMMDevice dev;
                enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                Guid IID_IAudioEndpointVolume = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
                object o;
                dev.Activate(ref IID_IAudioEndpointVolume, 0, IntPtr.Zero, out o);
                var vol = (IAudioEndpointVolume)o;
                vol.SetMasterVolumeLevelScalar(percent / 100f, IntPtr.Zero);
              }
            }
'@;
            [Volume]::Set(${volume});
          `;
          await execAsync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\"')}"`, { timeout: 15000 });
          return { success: true, output: `音量已设置为 ${volume}%` };
        }
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'empty_clipboard': {
      try {
        await execAsync('powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::Clear()"');
        return { success: true, output: '剪贴板已清空' };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'list_apps': {
      try {
        const apps = await discoverApps();
        const list = apps.map((a) => `${a.name} -> ${a.target}`).join('\\n');
        return { success: true, output: `发现 ${apps.length} 个应用\\n${list}` };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    }

    default:
      return { success: false, error: `未知命令: ${command}` };
  }
}
