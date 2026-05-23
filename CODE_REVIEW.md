# 项目代码审查报告 — `claude-desk-pet`

## 一、项目概况

Electron + React + Vite + Tailwind 桌面宠物应用，支持 AI 对话（OpenAI/兼容 API）、系统工具调用、提醒管理。整体架构清晰，前后端分离得当。以下是发现的问题。

---

## 二、致命 Bug（必定导致功能异常）

### 1. 配置存储键不匹配，AI 功能完全无法使用

| 文件 | 写操作 | 读操作 |
|---|---|---|
| `src/stores/petStore.ts:64` | `store.set('config', { apiKey, baseURL, ... })` | — |
| `electron/ai-service.ts:32-33` | — | `store.get('apiKey', '')` / `store.get('baseURL', ...)` |

- **Settings 面板**保存为 `store.set('config', {...整个对象...})`
- **AI 服务**读取 `store.get('apiKey')` — 这是一个**不同的键**，永远返回空字符串

**结果：用户配置 API Key 后 AI 对话永远报 `"请先在设置中配置 API Key"`。**

**修复方向：** `ai-service.ts` 应改为 `store.get('config', {})` 后取 `config.apiKey`，或 Settings 保存时拆分为独立键。

---

## 三、安全隐患

### 2. XSS — ChatBubble `dangerouslySetInnerHTML` 链接注入

`src/components/ChatBubble.tsx:37` 的 markdown 解析使用 `dangerouslySetInnerHTML`，其中链接规则：
```ts
html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" ...>$1</a>');
```
如果 AI 返回 `[click](javascript:alert(1))`，会渲染为可点击的 `javascript:` 链接。应限制 `href` 仅允许 `http://` / `https://` / `mailto:` 等安全协议。

### 3. API Key 明文存储

`electron-store` 支持 `encryptionKey` 选项，但项目未启用。API Key 以明文 JSON 存储在本地文件系统，建议加密。

### 4. 无 CSP 头

`index.html` 未设置 `Content-Security-Policy`，Electron 应用中应设置 CSP 限制脚本来源。

---

## 四、严重设计问题

### 5. `electron-store` 重复实例化

三个文件各自 `new Store()`：
- `electron/ai-service.ts:4`
- `electron/ipc-handlers.ts:6`
- `electron/reminder-service.ts:36`

虽然底层读写同一文件，但不应依赖隐式行为。建议抽取单例模块统一导出。

### 6. 配置未在启动时加载

`usePetStore` 中定义了 `loadConfig()` 方法但**没有任何组件在挂载时调用它**，导致首次打开时 Settings 面板无法回填已保存的值。

### 7. 拖拽坐标计算错误

`src/components/Pet.tsx:63`:
```ts
const newX = e.screenX - dragStartMouse.current.clientX;
```
`screenX` 是屏幕绝对坐标，`clientX` 是窗口内相对坐标，两者混用会导致拖拽时宠物位置异常跳动。应统一使用一种坐标体系。

---

## 五、中等优先级问题

### 8. `require('electron')` 与 ESM import 混用

`electron/main.ts:33` 使用 `require('electron')` 动态 require，但文件顶部已 ES import `screen`。应统一为 import。

### 9. Chat 窗口尺寸检查冗余

`main.ts` 中的 `ensureChatSize()` 函数（第54-58行）和 `pet-move` handler 内的尺寸检查（第44-48行）做完全相同的事，且配合 `window-manager.ts` 内部的 resize 拦截形成三层重复保障。

### 10. `usePetBehavior` 不响应配置变更

`src/hooks/usePetBehavior.ts:65-70` 的 `useEffect` 依赖数组为 `[]`，意味着 `config.activityLevel` 变更后活动间隔不会更新，需重启应用才生效。

### 11. 流式对话无取消机制

`electron/ipc-handlers.ts:18` 中 `ai-chat-stream` handler 一旦启动流就无法中断。如果用户关闭聊天窗口，流仍会继续消耗 token。建议增加 abort signal 传递。

### 12. 缺少全局错误处理

主进程无 `process.on('uncaughtException')` / `process.on('unhandledRejection')`；渲染进程无 React ErrorBoundary。未处理的异常会导致静默崩溃。

### 13. `system-tools.ts` 中 `spawn` 未检查启动失败

多处 `spawn('cmd', ['/c', 'start', '', ...], { detached: true })` 使用 `try/catch`，但 `spawn` 只有进程启动失败才抛异常，命令执行失败（如 start 找不到目标）不会触发 catch。

---

## 六、轻微/风格问题

| # | 位置 | 问题 |
|---|------|------|
| 14 | `index.html:5` | 引用不存在的 `/vite.svg` favicon |
| 15 | 全局 | 窗口尺寸、颜色、间隔等魔数散落各处，缺少常量文件 |
| 16 | `src/stores/petStore.ts:64` | `updateConfig` 调用 `invoke` 但不等待结果，使用 `void` 忽略 |
| 17 | `electron/preload.ts:53-56` | `offAIStreamData`/`offAIStreamDone` 使用 `removeAllListeners` 而非精确移除，可能与多实例场景冲突 |
| 18 | `electron/system-tools.ts` | `set_volume` 的 PowerShell CoreAudio P/Invoke 脚本直接用字符串拼接 `volume` 变量，虽是 number 但不够健壮 |
| 19 | `electron/window-manager.ts:103-107` | `createChatWindow` 的生产模式下未 catch 加载错误（与 `createPetWindow` 不一致） |
| 20 | 项目根 | 缺少 `.gitignore`，且 `tsconfig.node.tsbuildinfo` 这类构建产物被追踪 |

---

## 七、总结

| 等级 | 数量 | 关键项 |
|------|------|--------|
| **致命** | 1 | 配置存储键不匹配，AI 功能无法使用 |
| **高风险** | 3 | XSS、API Key 明文、无 CSP |
| **中风险** | 6 | electron-store 多例、配置未加载、拖拽坐标错误等 |
| **低风险** | 10 | 魔数、favicon、缺少 gitignore 等 |

**建议优先修复 #1（配置存储匹配）和 #2（XSS），这两个问题直接导致功能不可用或安全风险。**
