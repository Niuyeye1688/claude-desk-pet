import React, { useState, useEffect, useRef } from 'react';
import { usePetStore } from '../stores/petStore';
import type { AppConfig } from '../types';

const PRESET_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'];
const LOCAL_MODELS = ['qwen3:8b', 'qwen3-8b-small', 'qwen3-vl:4b'];

const LOCAL_BASE_URL = 'http://localhost:11434/v1';
const REMOTE_BASE_URL = 'https://api.deepseek.com';

const SettingsPanel: React.FC = () => {
  const { isSettingsOpen, setSettingsOpen, config, updateConfig } = usePetStore();
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [showKey, setShowKey] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSettingsOpen) {
      setLocalConfig(config);
    }
  }, [isSettingsOpen, config]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setShowModels(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleChange = (key: keyof AppConfig, value: unknown) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    updateConfig(localConfig);
    setSettingsOpen(false);
  };

  const isLocalMode = localConfig.baseURL === LOCAL_BASE_URL;

  const handleSwitchMode = (local: boolean) => {
    if (local) {
      setLocalConfig((prev) => ({
        ...prev,
        baseURL: LOCAL_BASE_URL,
        model: LOCAL_MODELS.includes(prev.model) ? prev.model : 'qwen3-8b-small',
        apiKey: '',
      }));
    } else {
      setLocalConfig((prev) => ({
        ...prev,
        baseURL: REMOTE_BASE_URL,
        model: PRESET_MODELS.includes(prev.model) ? prev.model : 'deepseek-v4-flash',
      }));
    }
  };

  const handleClearAllData = () => {
    if (window.confirm('确定要清空所有数据吗？此操作不可恢复！')) {
      updateConfig({
        apiKey: '',
        baseURL: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        petSize: 120,
        activityLevel: 'normal',
        autoStart: false,
        userProfile: '',
      });
      setLocalConfig({
        apiKey: '',
        baseURL: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        petSize: 120,
        activityLevel: 'normal',
        autoStart: false,
        userProfile: '',
      });
    }
  };

  if (!isSettingsOpen) return null;

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
        if (e.target === e.currentTarget) handleSave();
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
          <span style={{ fontWeight: 600, fontSize: '16px', color: '#d4a017' }}>设置</span>
          <button
            onClick={handleSave}
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

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* AI Config */}
          <div>
            <div
              style={{
                fontSize: '12px',
                color: '#d4a017',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                marginBottom: '10px',
                fontWeight: 600,
              }}
            >
              AI 配置
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {([
                  { key: 'remote', label: '在线 API' },
                  { key: 'local', label: '本地 Ollama' },
                ] as const).map((mode) => {
                  const active = (mode.key === 'local') === isLocalMode;
                  return (
                    <button
                      key={mode.key}
                      onClick={() => handleSwitchMode(mode.key === 'local')}
                      style={{
                        flex: 1,
                        padding: '6px 0',
                        borderRadius: '6px',
                        border: active ? '1px solid #d4a017' : '1px solid #444',
                        background: active ? 'rgba(212, 160, 23, 0.15)' : '#2a2a2a',
                        color: active ? '#d4a017' : '#999',
                        cursor: 'pointer',
                        fontSize: '13px',
                        transition: 'all 0.15s',
                      }}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#999', display: 'block', marginBottom: '4px' }}>
                  API Base URL
                </label>
                <input
                  value={localConfig.baseURL}
                  onChange={(e) => handleChange('baseURL', e.target.value)}
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

              {!isLocalMode && (
                <div>
                  <label style={{ fontSize: '12px', color: '#999', display: 'block', marginBottom: '4px' }}>
                    API Key
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={localConfig.apiKey}
                      onChange={(e) => handleChange('apiKey', e.target.value)}
                      placeholder="sk-..."
                      style={{
                        flex: 1,
                        background: '#2a2a2a',
                        border: '1px solid #444',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        color: '#e0e0e0',
                        fontSize: '13px',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => setShowKey((v) => !v)}
                      style={{
                        background: '#2a2a2a',
                        border: '1px solid #444',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        color: '#d4a017',
                        cursor: 'pointer',
                        fontSize: '12px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {showKey ? '隐藏' : '显示'}
                    </button>
                  </div>
                </div>
              )}

              <div ref={modelRef} style={{ position: 'relative' }}>
                <label style={{ fontSize: '12px', color: '#999', display: 'block', marginBottom: '4px' }}>
                  模型
                </label>
                <input
                  value={localConfig.model}
                  onChange={(e) => handleChange('model', e.target.value)}
                  onFocus={() => setShowModels(true)}
                  placeholder="gpt-4o-mini / deepseek-chat"
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
                {showModels && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      background: '#252525',
                      border: '1px solid #444',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      zIndex: 10,
                    }}
                  >
                    {(isLocalMode ? LOCAL_MODELS : PRESET_MODELS).map((m) => (
                      <div
                        key={m}
                        onClick={() => {
                          handleChange('model', m);
                          setShowModels(false);
                        }}
                        style={{
                          padding: '8px 10px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: localConfig.model === m ? '#d4a017' : '#e0e0e0',
                          background: localConfig.model === m ? 'rgba(212,160,23,0.1)' : undefined,
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = 'rgba(212,160,23,0.08)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background =
                            localConfig.model === m ? 'rgba(212,160,23,0.1)' : 'transparent')
                        }
                      >
                        {m}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Pet Config */}
          <div>
            <div
              style={{
                fontSize: '12px',
                color: '#d4a017',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                marginBottom: '10px',
                fontWeight: 600,
              }}
            >
              宠物配置
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', color: '#999' }}>尺寸</label>
                  <span style={{ fontSize: '12px', color: '#d4a017' }}>{localConfig.petSize}px</span>
                </div>
                <input
                  type="range"
                  min={80}
                  max={160}
                  value={localConfig.petSize}
                  onChange={(e) => handleChange('petSize', Number(e.target.value))}
                  style={{
                    width: '100%',
                    accentColor: '#d4a017',
                    cursor: 'pointer',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#999', display: 'block', marginBottom: '6px' }}>
                  活动频率
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['quiet', 'normal', 'active'] as const).map((level) => {
                    const labels: Record<string, string> = { quiet: '安静', normal: '正常', active: '活泼' };
                    const active = localConfig.activityLevel === level;
                    return (
                      <button
                        key={level}
                        onClick={() => handleChange('activityLevel', level)}
                        style={{
                          flex: 1,
                          padding: '6px 0',
                          borderRadius: '6px',
                          border: active ? '1px solid #d4a017' : '1px solid #444',
                          background: active ? 'rgba(212, 160, 23, 0.15)' : '#2a2a2a',
                          color: active ? '#d4a017' : '#999',
                          cursor: 'pointer',
                          fontSize: '13px',
                          transition: 'all 0.15s',
                        }}
                      >
                        {labels[level]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: '13px', color: '#e0e0e0' }}>开机自启</label>
                <button
                  onClick={() => handleChange('autoStart', !localConfig.autoStart)}
                  style={{
                    width: '40px',
                    height: '22px',
                    borderRadius: '11px',
                    border: 'none',
                    background: localConfig.autoStart ? '#d4a017' : '#444',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.2s',
                    padding: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: localConfig.autoStart ? '20px' : '2px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.2s',
                      display: 'block',
                    }}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Data */}
          <div>
            <div
              style={{
                fontSize: '12px',
                color: '#d4a017',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                marginBottom: '10px',
                fontWeight: 600,
              }}
            >
              数据
            </div>
            <button
              onClick={handleClearAllData}
              style={{
                width: '100%',
                padding: '8px 0',
                background: 'rgba(211, 47, 47, 0.1)',
                border: '1px solid rgba(211, 47, 47, 0.3)',
                borderRadius: '6px',
                color: '#ef5350',
                cursor: 'pointer',
                fontSize: '13px',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(211, 47, 47, 0.2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(211, 47, 47, 0.1)')}
            >
              清空所有数据
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(212, 160, 23, 0.2)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={handleSave}
            style={{
              background: '#d4a017',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 20px',
              color: '#1a1a1a',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
