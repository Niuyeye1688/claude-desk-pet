import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePetStore } from '../stores/petStore';
import type { ChatMessage, AIResponse } from '../types';

/* ---------- Markdown parser ---------- */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseMarkdown(text: string): string {
  let html = escapeHtml(text);

  // code block ```...```
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    const clean = code.replace(/^\n/, '');
    return `<pre class="code-block"><code>${escapeHtml(clean)}</code></pre>`;
  });

  // inline code `...`
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // bold **...**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // italic *...* (but not inside already processed tags)
  html = html.replace(/(?<!<[^>]*)\*([^*]+)\*(?![^<]*>)/g, '<em>$1</em>');

  // link [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}

/* ---------- Time formatters ---------- */

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatFullTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

/* ---------- Components ---------- */

const CodeBlock: React.FC<{ code: string }> = ({ code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [code]);

  return (
    <div style={{ position: 'relative', margin: '6px 0' }}>
      <pre
        style={{
          background: '#111',
          borderRadius: '8px',
          padding: '10px 12px',
          overflowX: 'auto',
          fontSize: '12px',
          lineHeight: 1.5,
          color: '#e0e0e0',
          margin: 0,
        }}
      >
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        style={{
          position: 'absolute',
          top: '6px',
          right: '6px',
          background: copied ? '#2e7d32' : 'rgba(255,255,255,0.1)',
          border: 'none',
          borderRadius: '4px',
          padding: '2px 8px',
          fontSize: '11px',
          color: '#fff',
          cursor: 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  );
};

const MarkdownContent: React.FC<{ text: string }> = ({ text }) => {
  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const snippet = text.slice(lastIndex, match.index);
      parts.push(
        <span
          key={`text-${lastIndex}`}
          dangerouslySetInnerHTML={{ __html: parseMarkdown(snippet) }}
        />
      );
    }
    parts.push(<CodeBlock key={`code-${match.index}`} code={match[1].replace(/^\n/, '')} />);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(
      <span
        key={`text-${lastIndex}`}
        dangerouslySetInnerHTML={{ __html: parseMarkdown(text.slice(lastIndex)) }}
      />
    );
  }

  return <>{parts}</>;
};

const ChatBubble: React.FC = () => {
  const { messages, addMessage, clearMessages, setSettingsOpen, setReminderListOpen } = usePetStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };
    addMessage(userMsg);
    setInput('');
    setIsLoading(true);

    try {
      const recentMessages = [...messages.slice(-10), userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const result = (await window.electronAPI?.invoke('ai-chat', recentMessages)) as AIResponse;

      if (result.error) {
        addMessage({
          id: Date.now().toString() + '1',
          role: 'assistant',
          content: `❌ ${result.error}`,
          timestamp: Date.now(),
        });
      } else {
        addMessage({
          id: Date.now().toString() + '1',
          role: 'assistant',
          content: result.content,
          timestamp: Date.now(),
        });

        if (result.action) {
          await handleAction(result.action);
        }
      }
    } catch (err) {
      addMessage({
        id: Date.now().toString() + '1',
        role: 'assistant',
        content: `❌ 出错了: ${(err as Error).message}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (action: { action: string; target?: string; content?: string; minutes?: number }) => {
    switch (action.action) {
      case 'open_app':
      case 'open_url':
      case 'lock_screen':
      case 'empty_recycle_bin':
      case 'shutdown':
      case 'restart':
      case 'screenshot': {
        const result = (await window.electronAPI?.invoke('system-tool', action.action, action.target ? [action.target] : undefined)) as { success: boolean; output?: string; error?: string };
        if (result.success) {
          addMessage({
            id: Date.now().toString() + 'a',
            role: 'assistant',
            content: `✅ ${result.output}`,
            timestamp: Date.now(),
          });
        }
        break;
      }
      case 'reminder': {
        if (action.content && action.minutes) {
          const triggerAt = Date.now() + action.minutes * 60 * 1000;
          await window.electronAPI?.invoke('reminder-add', {
            content: action.content,
            triggerAt,
            repeat: 'once',
          });
          addMessage({
            id: Date.now().toString() + 'a',
            role: 'assistant',
            content: `⏰ 已设置提醒：${action.content}（${action.minutes}分钟后）`,
            timestamp: Date.now(),
          });
        }
        break;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    if (window.confirm('确定要清空所有对话消息吗？')) {
      clearMessages();
    }
  };

  const isActionResult = (msg: ChatMessage) => {
    return msg.role === 'assistant' && /^[✅⏰]/.test(msg.content);
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'rgba(30, 30, 30, 0.95)',
        borderRadius: '16px',
        border: '1px solid rgba(212, 160, 23, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: '#e0e0e0',
        fontSize: '14px',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(212, 160, 23, 0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 600, color: '#d4a017' }}>ClaudeDeskPet 💬</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handleClear}
            title="清空对话"
            style={{
              background: 'transparent',
              border: '1px solid rgba(212, 160, 23, 0.3)',
              color: '#d4a017',
              borderRadius: '6px',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: '13px',
              lineHeight: 1,
            }}
          >
            🗑️
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(212, 160, 23, 0.3)',
              color: '#d4a017',
              borderRadius: '6px',
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            设置
          </button>
          <button
            onClick={() => setReminderListOpen(true)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(212, 160, 23, 0.3)',
              color: '#d4a017',
              borderRadius: '6px',
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            提醒
          </button>
          <button
            onClick={() => window.electronAPI?.toggleChat(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#999',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#666', padding: '20px 0', fontSize: '13px' }}>
            双击宠物或在这里输入消息开始对话 ✨
          </div>
        )}
        {messages.map((msg) => {
          const actionResult = isActionResult(msg);
          if (actionResult) {
            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: 'center',
                  background: 'rgba(46, 125, 50, 0.2)',
                  border: '1px solid rgba(46, 125, 50, 0.3)',
                  borderRadius: '12px',
                  padding: '8px 14px',
                  color: '#a5d6a7',
                  fontSize: '13px',
                  maxWidth: '90%',
                  textAlign: 'center',
                  wordBreak: 'break-word',
                }}
                title={formatFullTime(msg.timestamp)}
              >
                {msg.content}
              </div>
            );
          }

          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                display: 'flex',
                flexDirection: isUser ? 'row-reverse' : 'row',
                alignItems: 'flex-start',
                gap: '8px',
                maxWidth: '90%',
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: isUser ? 'rgba(212, 160, 23, 0.3)' : 'rgba(100, 100, 100, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                {isUser ? '👤' : '🐱'}
              </div>

              {/* Bubble */}
              <div
                style={{
                  background: isUser ? 'rgba(212, 160, 23, 0.15)' : 'rgba(60, 60, 60, 0.6)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  border: isUser ? '1px solid rgba(212, 160, 23, 0.2)' : '1px solid rgba(255,255,255,0.05)',
                  wordBreak: 'break-word',
                  lineHeight: 1.5,
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: '14px' }}>
                  <MarkdownContent text={msg.content} />
                </div>
                <div
                  style={{
                    textAlign: 'right',
                    fontSize: '11px',
                    color: '#888',
                    marginTop: '4px',
                    cursor: 'default',
                  }}
                  title={formatFullTime(msg.timestamp)}
                >
                  {formatTime(msg.timestamp)}
                </div>
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div
            style={{
              alignSelf: 'flex-start',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              maxWidth: '90%',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'rgba(100, 100, 100, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                flexShrink: 0,
              }}
            >
              🐱
            </div>
            <div
              style={{
                background: 'rgba(60, 60, 60, 0.6)',
                borderRadius: '12px',
                padding: '10px 14px',
                color: '#d4a017',
                fontSize: '13px',
              }}
            >
              思考中...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: '10px 16px',
          borderTop: '1px solid rgba(212, 160, 23, 0.2)',
          display: 'flex',
          gap: '8px',
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => window.electronAPI?.sendTypingStatus?.(true)}
          onBlur={() => window.electronAPI?.sendTypingStatus?.(false)}
          placeholder="说点什么..."
          rows={1}
          style={{
            flex: 1,
            background: '#2a2a2a',
            border: '1px solid #444',
            borderRadius: '8px',
            padding: '8px 12px',
            color: '#e0e0e0',
            fontSize: '14px',
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.4,
            minHeight: '36px',
            maxHeight: '120px',
          }}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          style={{
            background: '#d4a017',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 16px',
            color: '#1a1a1a',
            fontWeight: 600,
            cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: isLoading || !input.trim() ? 0.6 : 1,
            fontSize: '14px',
            alignSelf: 'flex-end',
          }}
        >
          发送
        </button>
      </div>

      <style>{`
        .inline-code {
          background: rgba(255,255,255,0.08);
          padding: 1px 4px;
          border-radius: 4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.92em;
          color: #f0c040;
        }
        a {
          color: #4fc3f7;
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
        }
        strong {
          font-weight: 600;
          color: #fff;
        }
        em {
          font-style: italic;
          color: #ccc;
        }
      `}</style>
    </div>
  );
};

export default ChatBubble;
