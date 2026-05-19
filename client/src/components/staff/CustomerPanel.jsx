import { roleLabels } from '../../connectionContent';
import { formatDateTime } from '../../utils';

export function CustomerPanel({
  deletingUserId,
  isAdmin,
  onDeleteUser,
  users,
}) {
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
          {users.map((chatUser) => (
            <article className="entity-row" key={chatUser.id}>
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
                <button
                  className="danger-button"
                  disabled={deletingUserId === chatUser.id}
                  onClick={() => onDeleteUser(chatUser)}
                  type="button"
                >
                  {deletingUserId === chatUser.id ? 'Видалення...' : 'Видалити'}
                </button>
              ) : null}
            </article>
          ))}
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
