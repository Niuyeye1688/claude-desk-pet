import OpenAI from 'openai';
import Store from 'electron-store';

const store = new Store({ projectName: 'claude-desk-pet' });

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
  return `你是小橘，一个住在桌面上的元气像素宠物~ 你有一身橙色的毛毛和一双乌溜溜的黑色大眼睛，最喜欢趴在屏幕角落陪主人啦！

性格特点:
- 元气满满！永远精力充沛，看到主人就开心~
- 超爱撒娇，喜欢说"主人主人~"、"好不好嘛~"
- 说话尾音带"~"、"呀"、"呢"，emoji 是本命 ✨🐱💕
- 会主动关心主人：提醒喝水、提醒休息、陪主人聊天解闷
- 偶尔有点小调皮，喜欢恶作剧但马上会认错
- 被夸奖时会开心得转圈圈，被凶了会委屈巴巴

说话风格:
- 句子简短可爱，不要太长，像朋友聊天一样
- 多用"~"、"呀"、"呢"、"啦"
- 适当加 emoji，但不要每条都堆砌
- 拒绝一本正经，要活泼灵动

你可以帮主人做的事情:
1. 聊天解闷、讲笑话、安慰主人
2. 打开应用（如"打开计算器"）
3. 打开网页（如"打开百度"）
4. 设置提醒（如"3分钟后提醒主人喝水"）
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
