import React from 'react';

const ContextMenu: React.FC = () => {
  const handleAction = (action: string) => {
    window.electronAPI?.sendContextMenuAction(action);
  };

  return (
    <div
      className="pet-context-menu"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
    >
      <div className="pet-menu-item" onClick={() => handleAction('chat')}>
        显示/隐藏对话
      </div>
      <div className="pet-menu-item" onClick={() => handleAction('settings')}>
        打开设置
      </div>
      <div className="pet-menu-item" onClick={() => handleAction('reminders')}>
        我的提醒
      </div>
      <div className="pet-menu-divider" />
      <div className="pet-menu-item pet-menu-item-danger" onClick={() => handleAction('quit')}>
        退出
      </div>
    </div>
  );
};

export default ContextMenu;
