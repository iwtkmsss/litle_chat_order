import { useEffect, useEffectEvent, useState } from 'react';
import { api } from '../api';
import {
  applicationStatusLabels,
  connectionTypeLabels,
  stageStatusLabels,
  stageStatusOptions,
} from '../connectionContent';
import { formatDate, formatDateTime } from '../utils';
import { ChatRoom } from './ChatRoom';

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function createEmptyApplicationForm() {
  return {
    applicationNumber: '',
    applicantFullName: '',
    phone: '',
    email: '',
    objectAddress: '',
    connectionType: 'standard',
    status: 'in_progress',
    receivedAt: getToday(),
    responsibleName: '',
    notes: '',
    customerUserId: '',
  };
}

function getStageDraft(stage) {
  return {
    status: stage.status,
    startedAt: stage.startedAt ?? '',
    completedAt: stage.completedAt ?? '',
    publicNote: stage.publicNote ?? '',
    isVisible: stage.isVisible,
  };
}

export function ManagerDashboard({ onLogout }) {
  const [users, setUsers] = useState([]);
  const [applications, setApplications] = useState([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const [stageDrafts, setStageDrafts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [panelMessage, setPanelMessage] = useState('');
  const [userForm, setUserForm] = useState({ fullName: '', password: '' });
  const [applicationForm, setApplicationForm] = useState(createEmptyApplicationForm);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isCreatingApplication, setIsCreatingApplication] = useState(false);
  const [savingStageId, setSavingStageId] = useState(null);
  const [deletingApplicationId, setDeletingApplicationId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);

  const loadDashboard = useEffectEvent(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsLoading(true);
      setError('');
    }

    try {
      const [usersResponse, applicationsResponse] = await Promise.all([
        api.listUsers(),
        api.listApplications(),
      ]);

      setUsers(usersResponse.users);
      setApplications(applicationsResponse.applications);
      setSelectedApplicationId((current) => {
        if (applicationsResponse.applications.some((application) => application.id === current)) {
          return current;
        }

        return applicationsResponse.applications[0]?.id ?? null;
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
    loadDashboard();
  }, []);

  const selectedApplication =
    applications.find((application) => application.id === selectedApplicationId) ?? null;

  useEffect(() => {
    if (!selectedApplication) {
      setStageDrafts({});
      return;
    }

    setStageDrafts(
      Object.fromEntries(
        selectedApplication.stages.map((stage) => [stage.id, getStageDraft(stage)]),
      ),
    );
  }, [selectedApplication?.id, selectedApplication?.updatedAt]);

  async function handleCreateUser(event) {
    event.preventDefault();
    setIsCreatingUser(true);
    setPanelMessage('');

    try {
      await api.createUser(userForm);
      setUserForm({ fullName: '', password: '' });
      setPanelMessage('Кабінет замовника створено.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setIsCreatingUser(false);
    }
  }

  async function handleDeleteUser(chatUser) {
    const confirmed = window.confirm(`Видалити кабінет замовника "${chatUser.fullName}"?`);

    if (!confirmed) {
      return;
    }

    setDeletingUserId(chatUser.id);
    setPanelMessage('');

    try {
      await api.deleteUser(chatUser.id);
      setPanelMessage('Кабінет замовника видалено.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setDeletingUserId(null);
    }
  }

  async function handleCreateApplication(event) {
    event.preventDefault();
    setIsCreatingApplication(true);
    setPanelMessage('');

    try {
      const response = await api.createApplication({
        ...applicationForm,
        customerUserId: applicationForm.customerUserId || null,
      });
      setApplicationForm(createEmptyApplicationForm());
      setPanelMessage('Заяву додано до реєстру.');
      await loadDashboard({ silent: true });
      setSelectedApplicationId(response.application.id);
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setIsCreatingApplication(false);
    }
  }

  async function handleDeleteApplication(application) {
    const confirmed = window.confirm(`Видалити заяву "${application.applicationNumber}"?`);

    if (!confirmed) {
      return;
    }

    setDeletingApplicationId(application.id);
    setPanelMessage('');

    try {
      await api.deleteApplication(application.id);
      setPanelMessage('Заяву видалено.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setDeletingApplicationId(null);
    }
  }

  async function handleSaveStage(stage) {
    if (!selectedApplication) {
      return;
    }

    setSavingStageId(stage.id);
    setPanelMessage('');

    try {
      const response = await api.updateApplicationStage(
        selectedApplication.id,
        stage.id,
        stageDrafts[stage.id],
      );

      setApplications((current) =>
        current.map((application) =>
          application.id === response.application.id ? response.application : application,
        ),
      );
      setPanelMessage('Етап оновлено. Email-лист підготовлено, якщо вказано дату виконання.');
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setSavingStageId(null);
    }
  }

  function updateStageDraft(stageId, patch) {
    setStageDrafts((current) => ({
      ...current,
      [stageId]: {
        ...current[stageId],
        ...patch,
      },
    }));
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <span className="section-kicker">Виробничо-технічний відділ</span>
          <h1>Реєстр заявників</h1>
          <p className="muted-copy">
            Приєднання до теплових мереж, етапи виконання, документи та листування.
          </p>
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
            <div>
              <span className="section-kicker">Особистий кабінет</span>
              <h2>Новий замовник</h2>
            </div>
          </div>

          <form className="stack-form" onSubmit={handleCreateUser}>
            <label className="field-block">
              <span>Прізвище Ім’я По батькові</span>
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
              {isCreatingUser ? 'Створення...' : 'Створити кабінет'}
            </button>
          </form>
        </section>

        <section className="surface-card manager-card">
          <div className="section-header">
            <div>
              <span className="section-kicker">Реєстр</span>
              <h2>Нова заява на приєднання</h2>
            </div>
          </div>

          <form className="application-form" onSubmit={handleCreateApplication}>
            <label className="field-block">
              <span>Номер заяви</span>
              <input
                className="field-input"
                disabled={isCreatingApplication}
                onChange={(event) =>
                  setApplicationForm((current) => ({ ...current, applicationNumber: event.target.value }))
                }
                placeholder="Можна залишити порожнім"
                value={applicationForm.applicationNumber}
              />
            </label>

            <label className="field-block">
              <span>Кабінет замовника</span>
              <select
                className="field-input"
                disabled={isCreatingApplication}
                onChange={(event) => {
                  const selectedUser = users.find((chatUser) => chatUser.id === Number(event.target.value));
                  setApplicationForm((current) => ({
                    ...current,
                    customerUserId: event.target.value,
                    applicantFullName: current.applicantFullName || selectedUser?.fullName || '',
                  }));
                }}
                value={applicationForm.customerUserId}
              >
                <option value="">Без прив’язки до кабінету</option>
                {users.map((chatUser) => (
                  <option key={chatUser.id} value={chatUser.id}>
                    {chatUser.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-block">
              <span>Прізвище Ім’я По батькові</span>
              <input
                className="field-input"
                disabled={isCreatingApplication}
                onChange={(event) =>
                  setApplicationForm((current) => ({ ...current, applicantFullName: event.target.value }))
                }
                required
                value={applicationForm.applicantFullName}
              />
            </label>

            <label className="field-block">
              <span>Номер телефону</span>
              <input
                className="field-input"
                disabled={isCreatingApplication}
                onChange={(event) =>
                  setApplicationForm((current) => ({ ...current, phone: event.target.value }))
                }
                required
                value={applicationForm.phone}
              />
            </label>

            <label className="field-block">
              <span>Email для поштових листів</span>
              <input
                className="field-input"
                disabled={isCreatingApplication}
                onChange={(event) =>
                  setApplicationForm((current) => ({ ...current, email: event.target.value }))
                }
                type="email"
                value={applicationForm.email}
              />
            </label>

            <label className="field-block field-block--wide">
              <span>Об’єкт або адреса приєднання</span>
              <input
                className="field-input"
                disabled={isCreatingApplication}
                onChange={(event) =>
                  setApplicationForm((current) => ({ ...current, objectAddress: event.target.value }))
                }
                required
                value={applicationForm.objectAddress}
              />
            </label>

            <label className="field-block">
              <span>Тип приєднання</span>
              <select
                className="field-input"
                disabled={isCreatingApplication}
                onChange={(event) =>
                  setApplicationForm((current) => ({ ...current, connectionType: event.target.value }))
                }
                value={applicationForm.connectionType}
              >
                <option value="standard">Приєднання до теплових мереж</option>
                <option value="temporary">Тимчасове приєднання</option>
              </select>
            </label>

            <label className="field-block">
              <span>Дата отримання заяви</span>
              <input
                className="field-input"
                disabled={isCreatingApplication}
                onChange={(event) =>
                  setApplicationForm((current) => ({ ...current, receivedAt: event.target.value }))
                }
                required
                type="date"
                value={applicationForm.receivedAt}
              />
            </label>

            <label className="field-block field-block--wide">
              <span>Відповідальний працівник</span>
              <input
                className="field-input"
                disabled={isCreatingApplication}
                onChange={(event) =>
                  setApplicationForm((current) => ({ ...current, responsibleName: event.target.value }))
                }
                value={applicationForm.responsibleName}
              />
            </label>

            <label className="field-block field-block--wide">
              <span>Примітки</span>
              <textarea
                className="field-input field-textarea"
                disabled={isCreatingApplication}
                onChange={(event) =>
                  setApplicationForm((current) => ({ ...current, notes: event.target.value }))
                }
                rows={3}
                value={applicationForm.notes}
              />
            </label>

            <button className="primary-button field-block--wide" disabled={isCreatingApplication} type="submit">
              {isCreatingApplication ? 'Додавання...' : 'Додати заяву'}
            </button>
          </form>
        </section>
      </section>

      <section className="manager-simple-grid">
        <section className="surface-card manager-card">
          <div className="section-header">
            <div>
              <h2>Заяви</h2>
              <p className="muted-copy">Телефон, ПІБ, номер заяви та поточний прогрес.</p>
            </div>
            <span className="counter-chip">{applications.length}</span>
          </div>

          {isLoading ? <p className="muted-copy">Завантаження...</p> : null}
          {!isLoading && applications.length === 0 ? <p className="muted-copy">Заяв ще немає.</p> : null}

          <div className="application-list">
            {applications.map((application) => (
              <article
                className={
                  application.id === selectedApplicationId
                    ? 'application-card is-active'
                    : 'application-card'
                }
                key={application.id}
              >
                <button
                  className="application-card__main"
                  onClick={() => setSelectedApplicationId(application.id)}
                  type="button"
                >
                  <span className="section-kicker">{application.applicationNumber}</span>
                  <strong>{application.applicantFullName}</strong>
                  <span>{application.objectAddress}</span>
                  <span>
                    {application.stageSummary.completed}/{application.stageSummary.total} етапів ·{' '}
                    {applicationStatusLabels[application.status]}
                  </span>
                </button>

                <div className="application-card__actions">
                  <button
                    className="danger-button"
                    disabled={deletingApplicationId === application.id}
                    onClick={() => handleDeleteApplication(application)}
                    type="button"
                  >
                    {deletingApplicationId === application.id ? 'Видалення...' : 'Видалити'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="surface-card manager-card">
          <div className="section-header">
            <div>
              <h2>Кабінети замовників</h2>
              <p className="muted-copy">Доступ до особистого кабінету та чату по заяві.</p>
            </div>
            <span className="counter-chip">{users.length}</span>
          </div>

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
      </section>

      {selectedApplication ? (
        <section className="application-detail-grid">
          <section className="surface-card manager-card">
            <div className="section-header">
              <div>
                <span className="section-kicker">Заява {selectedApplication.applicationNumber}</span>
                <h2>{selectedApplication.applicantFullName}</h2>
                <p className="muted-copy">{selectedApplication.objectAddress}</p>
              </div>
            </div>

            <div className="detail-meta-grid">
              <span>{connectionTypeLabels[selectedApplication.connectionType]}</span>
              <span>{applicationStatusLabels[selectedApplication.status]}</span>
              <span>Телефон: {selectedApplication.phone}</span>
              <span>Email: {selectedApplication.email || 'не вказано'}</span>
              <span>Дата заяви: {formatDate(selectedApplication.receivedAt)}</span>
              <span>Відповідальний: {selectedApplication.responsibleName || 'не вказано'}</span>
            </div>

            {selectedApplication.notes ? <p className="stage-note">{selectedApplication.notes}</p> : null}
          </section>

          <section className="surface-card manager-card">
            <div className="section-header">
              <div>
                <h2>Поштові листи</h2>
                <p className="muted-copy">Заглушка майбутньої email-інтеграції.</p>
              </div>
              <span className="counter-chip">{selectedApplication.notifications.length}</span>
            </div>

            {selectedApplication.notifications.length === 0 ? (
              <p className="muted-copy">Листів ще немає.</p>
            ) : (
              <div className="email-log">
                {selectedApplication.notifications.slice(0, 5).map((notification) => (
                  <article className="email-log-item" key={notification.id}>
                    <strong>{notification.subject}</strong>
                    <span>{notification.recipientEmail || 'email не вказано'} · {notification.status}</span>
                    <small>{formatDateTime(notification.createdAt)}</small>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="surface-card manager-card application-detail-grid__wide">
            <div className="section-header">
              <div>
                <h2>Етапи виконання приєднання</h2>
                <p className="muted-copy">
                  Замовник бачить видимі етапи після натискання кнопки «Отримати інформацію».
                </p>
              </div>
            </div>

            <div className="stage-editor-list">
              {selectedApplication.stages.map((stage) => {
                const draft = stageDrafts[stage.id] ?? getStageDraft(stage);

                return (
                  <article className="stage-editor" key={stage.id}>
                    <div className="stage-editor__title">
                      <span className="counter-chip">{stage.sortOrder}</span>
                      <div>
                        <h3>{stage.title}</h3>
                        <p className="muted-copy">{stage.description}</p>
                      </div>
                    </div>

                    <div className="stage-editor__controls">
                      <label className="field-block">
                        <span>Стадія виконання</span>
                        <select
                          className="field-input"
                          onChange={(event) => updateStageDraft(stage.id, { status: event.target.value })}
                          value={draft.status}
                        >
                          {stageStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field-block">
                        <span>Дата початку</span>
                        <input
                          className="field-input"
                          onChange={(event) => updateStageDraft(stage.id, { startedAt: event.target.value })}
                          type="date"
                          value={draft.startedAt}
                        />
                      </label>

                      <label className="field-block">
                        <span>Виконано, дата виконання</span>
                        <input
                          className="field-input"
                          onChange={(event) => updateStageDraft(stage.id, { completedAt: event.target.value })}
                          type="date"
                          value={draft.completedAt}
                        />
                      </label>
                    </div>

                    <label className="field-block">
                      <span>Коментар для замовника</span>
                      <textarea
                        className="field-input field-textarea"
                        onChange={(event) => updateStageDraft(stage.id, { publicNote: event.target.value })}
                        rows={3}
                        value={draft.publicNote}
                      />
                    </label>

                    <div className="stage-editor__footer">
                      <label className="access-toggle">
                        <input
                          checked={draft.isVisible}
                          onChange={(event) => updateStageDraft(stage.id, { isVisible: event.target.checked })}
                          type="checkbox"
                        />
                        <span>Показувати замовнику</span>
                      </label>

                      <span className="muted-copy">{stageStatusLabels[stage.status]}</span>

                      <button
                        className="primary-button"
                        disabled={savingStageId === stage.id}
                        onClick={() => handleSaveStage(stage)}
                        type="button"
                      >
                        {savingStageId === stage.id ? 'Збереження...' : 'Зберегти етап'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="application-detail-grid__wide">
            <ChatRoom
              chat={selectedApplication.chat}
              emptyTitle="Немає заяви"
              onThreadUpdated={() => loadDashboard({ silent: true })}
            />
          </section>
        </section>
      ) : null}
    </main>
  );
}
