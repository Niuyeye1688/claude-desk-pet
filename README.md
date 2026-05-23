# ClaudeDeskPet

一个可爱的 Electron 桌面宠物应用，支持 AI 聊天、提醒、眼球追踪等功能。

## 功能

- 桌面宠物：漂浮在所有窗口之上，可拖拽移动
- AI 聊天：通过 DeepSeek API 进行对话，支持流式输出
- 眼球追踪：宠物瞳孔跟随鼠标移动
- 自动行为：idle/walk 状态自动切换
- 提醒系统：支持自然语言设置提醒（如"3分钟后提醒我喝水"）
- 右键菜单：快速操作

## 技术栈

- Electron 42
- Vite 8
- React 19
- TypeScript
- Tailwind CSS v4
- Zustand

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build:win    # 构建 Windows 安装包
npm run build        # 通用构建
```

## 许可证

[MIT](LICENSE)
