import { useEffect } from 'react';
import Pet from './components/Pet';
import ChatBubble from './components/ChatBubble';
import SettingsPanel from './components/SettingsPanel';
import ReminderList from './components/ReminderList';
import ContextMenu from './components/ContextMenu';
import { usePetStore } from './stores/petStore';

function App() {
  const hash = window.location.hash.slice(1).replace(/^\//, '') || 'pet';
  const setSettingsOpen = usePetStore((s) => s.setSettingsOpen);
  const setReminderListOpen = usePetStore((s) => s.setReminderListOpen);
  const loadConfig = usePetStore((s) => s.loadConfig);
  const loadMessages = usePetStore((s) => s.loadMessages);

  useEffect(() => {
    if (hash !== 'chat') return;
    loadConfig();
    loadMessages();
    const unsubSettings = window.electronAPI?.onOpenSettings(() => setSettingsOpen(true));
    const unsubReminders = window.electronAPI?.onOpenReminders(() => setReminderListOpen(true));
    return () => {
      unsubSettings?.();
      unsubReminders?.();
    };
  }, [hash, setSettingsOpen, setReminderListOpen, loadConfig, loadMessages]);

  if (hash === 'chat') {
    return (
      <>
        <ChatBubble />
        <SettingsPanel />
        <ReminderList />
      </>
    );
  }

  if (hash === 'context-menu') {
    return <ContextMenu />;
  }

  return <Pet />;
}

export default App;
