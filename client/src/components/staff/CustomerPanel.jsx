import { useState } from 'react';
import { roleLabels } from '../../connectionContent';
import { formatDateTime } from '../../utils';

export function CustomerPanel({
  deletingUserId,
  isAdmin,
  onDeleteUser,
  onSaveUser,
  savingUserId,
  setUserDrafts,
  stations = [],
  userDrafts = {},
  users,
}) {
  const [visiblePasswordUserIds, setVisiblePasswordUserIds] = useState(() => new Set());

  function togglePasswordVisibility(userId) {
    setVisiblePasswordUserIds((current) => {
      const next = new Set(current);

      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }

      return next;
    });
  }

  return (
    <section className="manager-simple-grid manager-simple-grid--single">
      <section className="surface-card manager-card">
        <div className="section-header">
          <div>
            <h2>{isAdmin ? 'Користувачі' : 'Кабінети замовників'}</h2>
            <p className="muted-copy">Ролі, станції та доступ до особистого кабінету.</p>
          </div>
          <span className="counter-chip">{users.length}</span>
        </div>

        <div className="entity-list">
          {users.map((chatUser) => {
            const draft = userDrafts[chatUser.id] ?? {
              fullName: chatUser.fullName ?? '',
              login: chatUser.login ?? '',
              password: '',
              role: chatUser.role ?? 'customer',
              stationId: String(chatUser.stationId ?? ''),
            };
            const isPasswordVisible = visiblePasswordUserIds.has(chatUser.id);

            return (
              <article className={isAdmin ? 'entity-row entity-row--editable' : 'entity-row'} key={chatUser.id}>
                <div className="entity-main">
                  <strong>{chatUser.fullName}</strong>
                  <small>
                    {roleLabels[chatUser.role] ?? chatUser.role}
                    {chatUser.stationName ? ` · ${chatUser.stationName}` : ''}
                    {' · '}
                    {formatDateTime(chatUser.createdAt)}
                  </small>
                </div>

                {isAdmin ? (
                  <div className="user-edit-grid">
                    <label className="field-block">
                      <span>ПІБ</span>
                      <input
                        className="field-input"
                        onChange={(event) =>
                          setUserDrafts((current) => ({
                            ...current,
                            [chatUser.id]: { ...draft, fullName: event.target.value },
                          }))
                        }
                        value={draft.fullName}
                      />
                    </label>
                    <label className="field-block">
                      <span>Логін / email</span>
                      <input
                        className="field-input"
                        onChange={(event) =>
                          setUserDrafts((current) => ({
                            ...current,
                            [chatUser.id]: { ...draft, login: event.target.value },
                          }))
                        }
                        type="email"
                        value={draft.login}
                      />
                    </label>
                    <label className="field-block">
                      <span>Роль</span>
                      <select
                        className="field-input"
                        onChange={(event) =>
                          setUserDrafts((current) => ({
                            ...current,
                            [chatUser.id]: { ...draft, role: event.target.value },
                          }))
                        }
                        value={draft.role}
                      >
                        <option value="manager">Менеджер</option>
                        <option value="customer">Замовник</option>
                      </select>
                    </label>
                    <label className="field-block">
                      <span>Станція/компанія</span>
                      <select
                        className="field-input"
                        onChange={(event) =>
                          setUserDrafts((current) => ({
                            ...current,
                            [chatUser.id]: { ...draft, stationId: event.target.value },
                          }))
                        }
                        value={draft.stationId}
                      >
                        <option value="">Оберіть станцію</option>
                        {stations.filter((station) => station.isActive).map((station) => (
                          <option key={station.id} value={station.id}>
                            {station.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-block">
                      <span>Новий пароль</span>
                      <span className="password-input-wrap">
                        <input
                          className="field-input"
                          onChange={(event) =>
                            setUserDrafts((current) => ({
                              ...current,
                              [chatUser.id]: { ...draft, password: event.target.value },
                            }))
                          }
                          placeholder="Не змінювати"
                          type={isPasswordVisible ? 'text' : 'password'}
                          value={draft.password}
                        />
                        <button
                          aria-label={isPasswordVisible ? 'Сховати пароль' : 'Показати пароль'}
                          className="password-eye-button"
                          onClick={() => togglePasswordVisibility(chatUser.id)}
                          title={isPasswordVisible ? 'Сховати пароль' : 'Показати пароль'}
                          type="button"
                        >
                          {isPasswordVisible ? '◉' : '◎'}
                        </button>
                      </span>
                    </label>
                    <div className="user-edit-actions">
                      <button
                        className="primary-button"
                        disabled={savingUserId === chatUser.id}
                        onClick={() => onSaveUser(chatUser)}
                        type="button"
                      >
                        {savingUserId === chatUser.id ? 'Збереження...' : 'Зберегти'}
                      </button>
                      <button
                        className="danger-button"
                        disabled={deletingUserId === chatUser.id}
                        onClick={() => onDeleteUser(chatUser)}
                        type="button"
                      >
                        {deletingUserId === chatUser.id ? 'Видалення...' : 'Видалити'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}

export function UserCreateForm({ disabled, isAdmin, onSubmit, setUserForm, stations, userForm }) {
  return (
    <form className="stack-form" onSubmit={onSubmit}>
      {isAdmin ? (
        <>
          <label className="field-block">
            <span>Роль</span>
            <select
              className="field-input"
              disabled={disabled}
              onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}
              value={userForm.role}
            >
              <option value="manager">Менеджер</option>
              <option value="customer">Замовник</option>
            </select>
          </label>

          <label className="field-block">
            <span>Станція/компанія</span>
            <select
              className="field-input"
              disabled={disabled}
              onChange={(event) => setUserForm((current) => ({ ...current, stationId: event.target.value }))}
              required
              value={userForm.stationId}
            >
              <option value="">Оберіть станцію</option>
              {stations.filter((station) => station.isActive).map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      <label className="field-block">
        <span>Прізвище Ім’я По батькові</span>
        <input
          className="field-input"
          disabled={disabled}
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
          disabled={disabled}
          onChange={(event) =>
            setUserForm((current) => ({ ...current, password: event.target.value }))
          }
          required
          type="password"
          value={userForm.password}
        />
      </label>

      <button className="primary-button" disabled={disabled} type="submit">
        {disabled ? 'Створення...' : 'Створити користувача'}
      </button>
    </form>
  );
}
