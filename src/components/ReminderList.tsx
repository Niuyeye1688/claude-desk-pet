import React, { useState, useEffect } from 'react';
import { usePetStore } from '../stores/petStore';
import type { Reminder } from '../types';

function formatReminderTime(ts: number): string {
  const now = new Date();
  const target = new Date(ts);
  const isToday =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    target.getFullYear() === tomorrow.getFullYear() &&
    target.getMonth() === tomorrow.getMonth() &&
    target.getDate() === tomorrow.getDate();

  const timeStr = `${String(target.getHours()).padStart(2, '0')}:${String(target.getMinutes()).padStart(2, '0')}`;

  if (isToday) return `今天 ${timeStr}`;
  if (isTomorrow) return `明天 ${timeStr}`;
  return `${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')} ${timeStr}`;
}

const ReminderList: React.FC = () => {
  const { isReminderListOpen, setReminderListOpen, reminders, setReminders, loadReminders } = usePetStore();
  const [showAdd, setShowAdd] = useState(false);
  const [content, setContent] = useState('');
  const [triggerAt, setTriggerAt] = useState('');
  const [repeat, setRepeat] = useState<'once' | 'daily' | 'weekly'>('once');

  useEffect(() => {
    if (isReminderListOpen) {
      loadReminders();
    }
  }, [isReminderListOpen, loadReminders]);

  const handleAdd = async () => {
    if (!content.trim() || !triggerAt) return;
    const ts = new Date(triggerAt).getTime();
    if (isNaN(ts)) return;

    await window.electronAPI?.invoke('reminder-add', {
      content: content.trim(),
      triggerAt: ts,
      repeat,
    });

    // Refresh list
    const list = (await window.electronAPI?.invoke('reminder-get')) as Reminder[] | undefined;
    if (list) setReminders(list);

    setContent('');
    setTriggerAt('');
    setRepeat('once');
    setShowAdd(false);
  };

  const handleToggle = async (id: string) => {
    await window.electronAPI?.invoke('reminder-toggle', id);
    const list = (await window.electronAPI?.invoke('reminder-get')) as Reminder[] | undefined;
    if (list) setReminders(list);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这条提醒吗？')) return;
    await window.electronAPI?.invoke('reminder-remove', id);
    const list = (await window.electronAPI?.invoke('reminder-get')) as Reminder[] | undefined;
    if (list) setReminders(list);
  };

  const repeatLabel: Record<string, string> = {
    once: '一次',
    daily: '每天',
    weekly: '每周',
  };

  if (!isReminderListOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setReminderListOpen(false);
      }}
    >
      <div
        style={{
          width: '100%',
          maxHeight: '100vh',
          overflowY: 'auto',
          background: '#1a1a1a',
          borderRadius: '16px',
          border: '1px solid rgba(212, 160, 23, 0.3)',
          color: '#e0e0e0',
          fontSize: '14px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(212, 160, 23, 0.2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '16px', color: '#d4a017' }}>我的提醒</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setShowAdd((v) => !v)}
              style={{
                background: 'rgba(212, 160, 23, 0.15)',
                border: '1px solid rgba(212, 160, 23, 0.3)',
                color: '#d4a017',
                borderRadius: '6px',
                padding: '4px 12px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              {showAdd ? '取消' : '新建提醒'}
            </button>
            <button
              onClick={() => setReminderListOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#999',
                cursor: 'pointer',
                fontSize: '18px',
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Add Form */}
        {showAdd && (
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid rgba(212, 160, 23, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              background: 'rgba(212, 160, 23, 0.04)',
            }}
          >
            <div>
              <label style={{ fontSize: '12px', color: '#999', display: 'block', marginBottom: '4px' }}>
                提醒内容
              </label>
              <input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="例如：喝水、开会..."
                style={{
                  width: '100%',
                  background: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  color: '#e0e0e0',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', color: '#999', display: 'block', marginBottom: '4px' }}>
                  触发时间
                </label>
                <input
                  type="datetime-local"
                  value={triggerAt}
                  onChange={(e) => setTriggerAt(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#2a2a2a',
                    border: '1px solid #444',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    color: '#e0e0e0',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>
              <div style={{ width: '100px' }}>
                <label style={{ fontSize: '12px', color: '#999', display: 'block', marginBottom: '4px' }}>
                  重复
                </label>
                <select
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value as 'once' | 'daily' | 'weekly')}
                  style={{
                    width: '100%',
                    background: '#2a2a2a',
                    border: '1px solid #444',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    color: '#e0e0e0',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                >
                  <option value="once">一次</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                </select>
              </div>
            </div>
            <button
              onClick={handleAdd}
              disabled={!content.trim() || !triggerAt}
              style={{
                alignSelf: 'flex-end',
                background: '#d4a017',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 16px',
                color: '#1a1a1a',
                fontWeight: 600,
                cursor: !content.trim() || !triggerAt ? 'not-allowed' : 'pointer',
                opacity: !content.trim() || !triggerAt ? 0.6 : 1,
                fontSize: '13px',
              }}
            >
              确认
            </button>
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {reminders.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                color: '#666',
                padding: '32px 20px',
                fontSize: '13px',
              }}
            >
              还没有提醒，点击上方按钮添加
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {reminders.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: '10px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(r.id)}
                    style={{
                      width: '36px',
                      height: '20px',
                      borderRadius: '10px',
                      border: 'none',
                      background: r.enabled ? '#d4a017' : '#444',
                      cursor: 'pointer',
                      position: 'relative',
                      padding: 0,
                      flexShrink: 0,
                      transition: 'background 0.2s',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: '2px',
                        left: r.enabled ? '18px' : '2px',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s',
                        display: 'block',
                      }}
                    />
                  </button>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '14px',
                        color: r.enabled ? '#e0e0e0' : '#777',
                        textDecoration: r.enabled ? 'none' : 'line-through',
                        wordBreak: 'break-word',
                        lineHeight: 1.4,
                      }}
                    >
                      {r.content}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                      {formatReminderTime(r.triggerAt)} · {repeatLabel[r.repeat]}
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(r.id)}
                    title="删除"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#888',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '4px',
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ef5350')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReminderList;
