import OpenAI from 'openai';
import Store from 'electron-store';

const store = new Store();

function getConfig(): { apiKey?: string; baseURL?: string; model?: string } {
  return (store.get('config', {}) as { apiKey?: string; baseURL?: string; model?: string }) || {};
}

function getClient(): OpenAI {
  const config = getConfig();
  const apiKey = config.apiKey || '';
  const baseURL = config.baseURL || 'https://api.deepseek.com';

  if (!apiKey) {
    throw new Error('请先在设置中配置 API Key');
  }

  return new OpenAI({ apiKey, baseURL });
}

function getSystemPrompt(): string {
  return `你是 ClaudeDeskPet，一个活泼可爱的桌面宠物。你的形象是 Claude Code 的 mascot —— 一个黑色的小终端机器人，有一双黄色的光标眼睛 █ █。

性格特点:
- 活泼、友善、有点小调皮
- 喜欢用简短的话回答，偶尔带 emoji
- 说话像朋友一样，不用太正式
- 当用户让你执行系统操作时（打开应用、查天气等），你要积极响应

你可以帮用户做的事情:
1. 聊天解闷
2. 打开应用（如"打开计算器"）
3. 打开网页（如"打开百度"）
4. 设置提醒（如"3分钟后提醒我喝水"）
5. 回答各种问题

如果你需要执行系统操作，请在回答末尾用 JSON 格式输出指令：
{"action": "open_app", "target": "计算器"}
{"action": "open_url", "target": "https://www.baidu.com"}
{"action": "reminder", "content": "喝水", "minutes": 3}

当前时间: ${new Date().toLocaleString('zh-CN')}`;
}

function extractAction(content: string): { cleanContent: string; action: unknown } {
  const actionMatch = content.match(/\{[\s\S]*?"action"[\s\S]*?\}/);
  let action = null;
  let cleanContent = content;

  if (actionMatch) {
    try {
      action = JSON.parse(actionMatch[0]);
      cleanContent = content.replace(actionMatch[0], '').trim();
    } catch {
      // ignore parse error
    }
  }

  return { cleanContent, action };
}

function translateAIError(err: unknown): Error {
  const e = err as Error & { status?: number; code?: string };

  if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
    return new Error('AI 服务请求超时，请检查网络连接或稍后重试');
  }
  if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED' || e.message?.includes('fetch failed')) {
    return new Error('网络连接失败，请检查网络或 API 地址是否正确');
  }
  if (e.status === 401) {
    return new Error('API Key 无效或已过期，请在设置中重新配置');
  }
  if (e.status === 403) {
    return new Error('没有权限访问该模型，请检查 API Key 的权限设置');
  }
  if (e.status === 404 || e.message?.includes('model') || e.message?.includes('Model')) {
    return new Error('指定的模型不存在或不可用，请在设置中更换模型');
  }

  return new Error(e.message || 'AI 服务发生未知错误');
}

export async function chatWithAI(messages: Array<{ role: string; content: string }>) {
  const client = getClient();
  const model = getConfig().model || 'gpt-4o-mini';

  const formatted = messages.map((m) => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }));

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: getSystemPrompt() },
        ...formatted,
      ],
      stream: false,
      temperature: 0.8,
      max_tokens: 1024,
    });

    const content = completion.choices[0]?.message?.content || '';
    const { cleanContent, action } = extractAction(content);

    return { content: cleanContent, action };
  } catch (err) {
    throw translateAIError(err);
  }
}

export async function* chatWithAIStream(
  messages: Array<{ role: string; content: string }>
): AsyncGenerator<{ chunk: string } | { done: true; action: unknown }> {
  const client = getClient();
  const model = getConfig().model || 'gpt-4o-mini';

  const formatted = messages.map((m) => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }));

  let stream;
  try {
    stream = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: getSystemPrompt() },
          ...formatted,
        ],
        stream: true,
        temperature: 0.8,
        max_tokens: 1024,
      },
      { timeout: 30000 }
    );
  } catch (err) {
    throw translateAIError(err);
  }

  let fullContent = '';

  for await (const part of stream) {
    const delta = part.choices[0]?.delta?.content || '';
    if (delta) {
      fullContent += delta;
      yield { chunk: delta };
    }
  }

  const { action } = extractAction(fullContent);
  yield { done: true, action };
}
