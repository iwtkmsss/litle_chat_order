import { useEffect, useEffectEvent, useState } from 'react';
import { api } from '../api';
import { ChatRoom } from './ChatRoom';
import { formatDateTime } from '../utils';

function buildAccessMap(chats) {
  return Object.fromEntries(
    chats.map((chat) => [chat.id, [...chat.accessUserIds]]),
  );
}

export function ManagerDashboard({ onLogout }) {
  const [users, setUsers] = useState([]);
  const [chats, setChats] = useState([]);
  const [accessMap, setAccessMap] = useState({});
  const [modalChatId, setModalChatId] = useState(null);
  const [openAccessChatId, setOpenAccessChatId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [panelMessage, setPanelMessage] = useState('');
  const [userForm, setUserForm] = useState({ fullName: '', password: '' });
  const [chatForm, setChatForm] = useState({ title: '', description: '' });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [savingChatId, setSavingChatId] = useState(null);
  const [deletingChatId, setDeletingChatId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);

  const loadDashboard = useEffectEvent(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsLoading(true);
      setError('');
    }

    try {
      const [usersResponse, chatsResponse] = await Promise.all([
        api.listUsers(),
        api.listChats(),
      ]);

      setUsers(usersResponse.users);
      setChats(chatsResponse.chats);
      setAccessMap(buildAccessMap(chatsResponse.chats));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  });

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (modalChatId && !chats.some((chat) => chat.id === modalChatId)) {
      setModalChatId(null);
    }
  }, [chats, modalChatId]);

  useEffect(() => {
    if (openAccessChatId && !chats.some((chat) => chat.id === openAccessChatId)) {
      setOpenAccessChatId(null);
    }
  }, [chats, openAccessChatId]);

  const modalChat = chats.find((chat) => chat.id === modalChatId) ?? null;

  function toggleAccess(chatId, userId) {
    setAccessMap((current) => {
      const selected = current[chatId] ?? [];
      const nextSelected = selected.includes(userId)
        ? selected.filter((id) => id !== userId)
        : [...selected, userId];

      return {
        ...current,
        [chatId]: nextSelected,
      };
    });
  }

  function getAccessSummary(chatId) {
    const selectedIds = accessMap[chatId] ?? [];

    if (selectedIds.length === 0) {
      return 'Немає доступу';
    }

    const names = users
      .filter((chatUser) => selectedIds.includes(chatUser.id))
      .map((chatUser) => chatUser.fullName);

    if (names.length <= 2) {
      return names.join(', ');
    }

    return `${names[0]}, ${names[1]} +${names.length - 2}`;
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    setIsCreatingUser(true);
    setPanelMessage('');

    try {
      await api.createUser(userForm);
      setUserForm({ fullName: '', password: '' });
      setPanelMessage('Створено.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setIsCreatingUser(false);
    }
  }

  async function handleCreateChat(event) {
    event.preventDefault();
    setIsCreatingChat(true);
    setPanelMessage('');

    try {
      const response = await api.createChat(chatForm);
      setChatForm({ title: '', description: '' });
      setPanelMessage('Створено.');
      await loadDashboard({ silent: true });
      setModalChatId(response.chat.id);
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setIsCreatingChat(false);
    }
  }

  async function handleSaveAccess(chatId) {
    setSavingChatId(chatId);
    setPanelMessage('');

    try {
      await api.updateChatAccess(chatId, accessMap[chatId] ?? []);
      setPanelMessage('Оновлено.');
      setOpenAccessChatId(null);
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setSavingChatId(null);
    }
  }

  async function handleDeleteChat(chat) {
    const confirmed = window.confirm(`Видалити чат "${chat.title}"?`);

    if (!confirmed) {
      return;
    }

    setDeletingChatId(chat.id);
    setPanelMessage('');

    try {
      await api.deleteChat(chat.id);
      setPanelMessage('Видалено.');
      setModalChatId((current) => (current === chat.id ? null : current));
      setOpenAccessChatId((current) => (current === chat.id ? null : current));
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setDeletingChatId(null);
    }
  }

  async function handleDeleteUser(chatUser) {
    const confirmed = window.confirm(`Видалити користувача "${chatUser.fullName}"?`);

    if (!confirmed) {
      return;
    }

    setDeletingUserId(chatUser.id);
    setPanelMessage('');

    try {
      await api.deleteUser(chatUser.id);
      setPanelMessage('Видалено.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setDeletingUserId(null);
    }
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <h1>Менеджер</h1>
        </div>

        <div className="header-actions">
          <button className="secondary-button" onClick={() => loadDashboard()} type="button">
            Оновити
          </button>
          <button className="primary-button" onClick={onLogout} type="button">
            Вийти
          </button>
        </div>
      </header>

      {panelMessage ? <p className="manager-message">{panelMessage}</p> : null}
      {error ? <p className="form-error manager-message">{error}</p> : null}

      <section className="manager-top-grid">
        <section className="surface-card manager-card">
          <div className="section-header">
            <h2>Новий користувач</h2>
          </div>

          <form className="stack-form" onSubmit={handleCreateUser}>
            <label className="field-block">
              <span>Ім'я та прізвище</span>
              <input
                className="field-input"
                disabled={isCreatingUser}
                onChange={(event) =>
                  setUserForm((current) => ({ ...current, fullName: event.target.value }))
                }
                required
                value={userForm.fullName}
              />
            </label>

            <label className="field-block">
              <span>Пароль</span>
              <input
                className="field-input"
                disabled={isCreatingUser}
                onChange={(event) =>
                  setUserForm((current) => ({ ...current, password: event.target.value }))
                }
                required
                type="password"
                value={userForm.password}
              />
            </label>

            <button className="primary-button" disabled={isCreatingUser} type="submit">
              {isCreatingUser ? 'Створення...' : 'Створити'}
            </button>
          </form>
        </section>

        <section className="surface-card manager-card">
          <div className="section-header">
            <h2>Новий чат</h2>
          </div>

          <form className="stack-form" onSubmit={handleCreateChat}>
            <label className="field-block">
              <span>Назва</span>
              <input
                className="field-input"
                disabled={isCreatingChat}
                onChange={(event) =>
                  setChatForm((current) => ({ ...current, title: event.target.value }))
                }
                required
                value={chatForm.title}
              />
            </label>

            <label className="field-block">
              <span>Опис</span>
              <textarea
                className="field-input field-textarea"
                disabled={isCreatingChat}
                onChange={(event) =>
                  setChatForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={4}
                value={chatForm.description}
              />
            </label>

            <button className="primary-button" disabled={isCreatingChat} type="submit">
              {isCreatingChat ? 'Створення...' : 'Створити'}
            </button>
          </form>
        </section>
      </section>

      <section className="manager-simple-grid">
        <section className="surface-card manager-card">
          <div className="section-header">
            <h2>Користувачі</h2>
            <span className="counter-chip">{users.length}</span>
          </div>

          {isLoading ? <p className="muted-copy">Завантаження...</p> : null}
          {!isLoading && users.length === 0 ? <p className="muted-copy">Немає користувачів.</p> : null}

          <div className="entity-list">
            {users.map((chatUser) => (
              <article className="entity-row" key={chatUser.id}>
                <div className="entity-main">
                  <strong>{chatUser.fullName}</strong>
                  <small>{formatDateTime(chatUser.createdAt)}</small>
                </div>

                <button
                  className="danger-button"
                  disabled={deletingUserId === chatUser.id}
                  onClick={() => handleDeleteUser(chatUser)}
                  type="button"
                >
                  {deletingUserId === chatUser.id ? 'Видалення...' : 'Видалити'}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="surface-card manager-card">
          <div className="section-header">
            <h2>Чати</h2>
            <span className="counter-chip">{chats.length}</span>
          </div>

          {isLoading ? <p className="muted-copy">Завантаження...</p> : null}
          {!isLoading && chats.length === 0 ? <p className="muted-copy">Немає чатів.</p> : null}

          <div className="chat-admin-list">
            {chats.map((chat) => (
              <article className="chat-admin-card" key={chat.id}>
                <div className="chat-admin-head">
                  <div className="chat-admin-title">
                    <strong>{chat.title}</strong>
                    {chat.description ? <p className="muted-copy">{chat.description}</p> : null}
                  </div>

                  <div className="chat-admin-actions">
                    <button
                      className="secondary-button"
                      onClick={() =>
                        setOpenAccessChatId((current) => (current === chat.id ? null : chat.id))
                      }
                      type="button"
                    >
                      Доступ
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => setModalChatId(chat.id)}
                      type="button"
                    >
                      Чат
                    </button>
                    <button
                      className="danger-button"
                      disabled={deletingChatId === chat.id}
                      onClick={() => handleDeleteChat(chat)}
                      type="button"
                    >
                      {deletingChatId === chat.id ? 'Видалення...' : 'Видалити'}
                    </button>
                  </div>
                </div>

                <div className="chat-admin-meta">
                  <span>{chat.messageCount} повідомлень</span>
                  <span>{formatDateTime(chat.updatedAt)}</span>
                  <span className="access-summary">{getAccessSummary(chat.id)}</span>
                </div>

                {openAccessChatId === chat.id ? (
                  <div className="access-flyout">
                    {users.length === 0 ? (
                      <p className="muted-copy">Немає користувачів.</p>
                    ) : (
                      <div className="access-grid">
                        {users.map((chatUser) => (
                          <label className="access-toggle" key={`${chat.id}-${chatUser.id}`}>
                            <input
                              checked={(accessMap[chat.id] ?? []).includes(chatUser.id)}
                              onChange={() => toggleAccess(chat.id, chatUser.id)}
                              type="checkbox"
                            />
                            <span>{chatUser.fullName}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    <div className="access-flyout-actions">
                      <button
                        className="secondary-button"
                        onClick={() => setOpenAccessChatId(null)}
                        type="button"
                      >
                        Закрити
                      </button>
                      <button
                        className="primary-button"
                        disabled={savingChatId === chat.id}
                        onClick={() => handleSaveAccess(chat.id)}
                        type="button"
                      >
                        {savingChatId === chat.id ? 'Збереження...' : 'Зберегти'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </section>

      {modalChat ? (
        <div className="modal-backdrop" onClick={() => setModalChatId(null)} role="presentation">
          <div className="modal-shell" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-toolbar">
              <button className="secondary-button" onClick={() => setModalChatId(null)} type="button">
                Закрити
              </button>
            </div>

            <ChatRoom
              chat={modalChat}
              emptyTitle="Немає чатів"
              onThreadUpdated={() => loadDashboard({ silent: true })}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
