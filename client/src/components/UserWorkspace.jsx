import { useEffect, useEffectEvent, useState } from 'react';
import { api } from '../api';
import { ChatRoom } from './ChatRoom';

export function UserWorkspace({ user, onLogout }) {
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadChats = useEffectEvent(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsLoading(true);
      setError('');
    }

    try {
      const response = await api.listChats();
      setChats(response.chats);
      setSelectedChatId((current) => {
        if (response.chats.some((chat) => chat.id === current)) {
          return current;
        }

        return response.chats[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  });

  useEffect(() => {
    loadChats();

    const timer = window.setInterval(() => {
      loadChats({ silent: true });
    }, 15000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const selectedChat = chats.find((chat) => chat.id === selectedChatId) ?? null;

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <h1>Чати</h1>
        </div>

        <div className="header-actions">
          <button className="secondary-button" onClick={() => loadChats()} type="button">
            Оновити
          </button>
          <button className="primary-button" onClick={onLogout} type="button">
            Вийти
          </button>
        </div>
      </header>

      <section className="surface-card tabs-card">
        <div className="tab-strip">
          {chats.map((chat) => (
            <button
              className={chat.id === selectedChatId ? 'tab-button is-active' : 'tab-button'}
              key={chat.id}
              onClick={() => setSelectedChatId(chat.id)}
              type="button"
            >
              <strong>{chat.title}</strong>
              <span>{chat.messageCount} повідомлень</span>
            </button>
          ))}
        </div>

        {isLoading ? <p className="muted-copy">Завантаження...</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {!isLoading && !error && chats.length === 0 ? (
          <p className="muted-copy">Немає чатів.</p>
        ) : null}
      </section>

      <ChatRoom
        chat={selectedChat}
        emptyTitle="Немає чатів"
        onThreadUpdated={() => loadChats({ silent: true })}
      />
    </main>
  );
}
