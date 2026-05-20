import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import {
  applicationStatusDescriptions,
  applicationStatusLabels,
  connectionTypeLabels,
} from '../connectionContent';
import { getApplicationTypeConfig } from '../config/applicationFormConfig';
import { formatDate } from '../utils';
import { ApplicationProgress } from './ApplicationProgress';
import { ChatRoom } from './ChatRoom';
import { CustomerApplicationForm } from './CustomerApplicationForm';

function getObjectName(application) {
  return application.appendixData?.questionnaire?.objectName
    || application.appendixData?.appendix3?.objectName
    || application.objectAddress;
}

function getApplicationTypeLabel(application) {
  return getApplicationTypeConfig(application.appendixData?.questionnaire?.type).title;
}

function getLatestClarification(application) {
  return application.statusHistory?.find(
    (entry) => entry.toStatus === 'needs_clarification' && entry.comment,
  );
}

export function UserWorkspace({ user, onLogout }) {
  const [applications, setApplications] = useState([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const [stations, setStations] = useState([]);
  const [isApplicationFormOpen, setIsApplicationFormOpen] = useState(false);
  const [isCreatingApplication, setIsCreatingApplication] = useState(false);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const chatSectionRef = useRef(null);

  const loadApplications = useEffectEvent(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsLoading(true);
      setError('');
    }

    try {
      const response = await api.listApplications();
      setApplications(response.applications);
      setSelectedApplicationId((current) => {
        if (response.applications.some((application) => application.id === current)) {
          return current;
        }

        return response.applications[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  });

  const loadStations = useEffectEvent(async () => {
    try {
      const response = await api.listPublicStations();
      setStations(response.stations);
    } catch (loadError) {
      setFormError(loadError.message);
    }
  });

  useEffect(() => {
    loadApplications();
    loadStations();

    const timer = window.setInterval(() => {
      loadApplications({ silent: true });
    }, 15000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const selectedApplication =
    applications.find((application) => application.id === selectedApplicationId) ?? null;
  const latestClarification = selectedApplication ? getLatestClarification(selectedApplication) : null;
  const hasGeneratedDocuments = Boolean(selectedApplication?.generatedDocuments?.length);
  const sortedApplications = useMemo(
    () =>
      [...applications].sort((left, right) =>
        new Date(right.receivedAt || right.createdAt).getTime()
        - new Date(left.receivedAt || left.createdAt).getTime(),
      ),
    [applications],
  );

  function openApplicationForm() {
    setFormError('');
    setFormMessage('');
    setIsApplicationFormOpen(true);
  }

  function scrollToChat() {
    chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleCreateApplication(input) {
    setIsCreatingApplication(true);
    setFormError('');
    setFormMessage('');

    try {
      const response = await api.createCustomerApplication(input);
      setApplications((current) => [
        response.application,
        ...current.filter((application) => application.id !== response.application.id),
      ]);
      setSelectedApplicationId(response.application.id);
      setIsApplicationFormOpen(false);
      setFormMessage('Заяву подано. Вона очікує первинної перевірки.');
      await loadApplications({ silent: true });
    } catch (submitError) {
      setFormError(submitError.message);
    } finally {
      setIsCreatingApplication(false);
    }
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <span className="section-kicker">Особистий кабінет замовника</span>
          <h1>Мої заяви</h1>
          <p className="muted-copy">{user.fullName}</p>
        </div>

        <div className="header-actions">
          <button className="primary-button" onClick={openApplicationForm} type="button">
            Подати нову заявку
          </button>
          <button className="secondary-button" onClick={() => loadApplications()} type="button">
            Оновити
          </button>
          <button className="primary-button" onClick={onLogout} type="button">
            Вийти
          </button>
        </div>
      </header>

      {formMessage ? <p className="surface-card success-message">{formMessage}</p> : null}

      {isApplicationFormOpen ? (
        <section className="surface-card manager-card">
          <div className="section-header">
            <div>
              <span className="section-kicker">Нова заява</span>
              <h2>Подати заяву на приєднання</h2>
              <p className="muted-copy">
                Заява буде створена у вашому поточному кабінеті без повторної реєстрації.
              </p>
            </div>
          </div>

          <CustomerApplicationForm
            disabled={isCreatingApplication}
            onCancel={() => setIsApplicationFormOpen(false)}
            onSubmit={handleCreateApplication}
            stations={stations}
            user={user}
          />
          {formError ? <p className="form-error">{formError}</p> : null}
        </section>
      ) : null}

      <section className="surface-card tabs-card">
        <div className="section-header">
          <div>
            <h2>Ваші заявки</h2>
            <p className="muted-copy">Статус, етапи, строки та листування за кожною заявкою.</p>
          </div>
          <span className="counter-chip">{applications.length}</span>
        </div>

        <div className="tab-strip">
          {sortedApplications.map((application) => {
            const isActive = application.id === selectedApplicationId;
            const statusLabel = applicationStatusLabels[application.status] ?? application.status;
            const statusDescription = applicationStatusDescriptions[application.status] ?? 'Поточний статус заявки.';
            const typeLabel = getApplicationTypeLabel(application);

            return (
            <button
              className={isActive ? 'tab-button customer-application-tab is-active' : 'tab-button customer-application-tab'}
              key={application.id}
              onClick={() => setSelectedApplicationId(application.id)}
              type="button"
            >
              <div className="application-card__topline">
                <strong>{application.applicationNumber}</strong>
                <span className={`summary-pill application-status-pill application-status-pill--${application.status}`}>
                  {statusLabel}
                </span>
                {application.status === 'needs_clarification' ? (
                  <span className="summary-pill deadline-pill deadline-pill--due_soon">Потребує уточнення</span>
                ) : null}
                {application.status === 'completed' ? (
                  <span className="summary-pill deadline-pill deadline-pill--done">Завершено</span>
                ) : null}
                {application.status === 'rejected' ? (
                  <span className="summary-pill deadline-pill deadline-pill--overdue">Відмовлено / повернуто</span>
                ) : null}
              </div>
              <span>{getObjectName(application)}</span>
              <span>{statusDescription}</span>
              <span>
                Подано: {formatDate(application.receivedAt || application.createdAt)}
                {' · '}
                {typeLabel}
              </span>
              {application.stationName ? <span>Станція: {application.stationName}</span> : null}
            </button>
            );
          })}
        </div>

        {isLoading ? <p className="muted-copy">Завантажуємо ваші заявки...</p> : null}
        {error ? <p className="form-error">Не вдалося завантажити заявки. Спробуйте оновити сторінку.</p> : null}
        {!isLoading && !error && applications.length === 0 ? (
          <div className="thread-placeholder">
            <h3>У вас ще немає заявок</h3>
            <button className="primary-button" onClick={openApplicationForm} type="button">
              Подати першу заявку
            </button>
          </div>
        ) : null}
      </section>

      {selectedApplication ? (
        <>
          <section className="surface-card manager-card">
            <div className="section-header">
              <div>
                <span className="section-kicker">Заява {selectedApplication.applicationNumber}</span>
                <h2>{getObjectName(selectedApplication)}</h2>
                <p className="muted-copy">
                  {connectionTypeLabels[selectedApplication.connectionType]} · {getApplicationTypeLabel(selectedApplication)}
                </p>
              </div>
              <span className="counter-chip">
                {applicationStatusLabels[selectedApplication.status] ?? selectedApplication.status}
              </span>
            </div>

            <div className="detail-meta-grid">
              <span>Дата подання: {formatDate(selectedApplication.receivedAt)}</span>
              <span>Станція: {selectedApplication.stationName}</span>
              <span>Адреса об’єкта: {selectedApplication.objectAddress}</span>
              <span>{applicationStatusDescriptions[selectedApplication.status] ?? 'Поточний статус заявки.'}</span>
            </div>
          </section>

          {selectedApplication.status === 'needs_clarification' ? (
            <section className="surface-card clarification-card">
              <div>
                <span className="section-kicker">Потрібна дія замовника</span>
                <h2>Потрібно уточнення</h2>
                <p>
                  {latestClarification?.comment
                    || 'Менеджер очікує уточнення даних або додаткову інформацію за заявкою.'}
                </p>
              </div>
              <div className="header-actions">
                <button className="primary-button" onClick={scrollToChat} type="button">
                  Відповісти в чаті
                </button>
                <button className="secondary-button" onClick={scrollToChat} type="button">
                  Додати файл
                </button>
              </div>
            </section>
          ) : null}

          <section className="surface-card manager-card">
            <ApplicationProgress application={selectedApplication} />
          </section>

          {!hasGeneratedDocuments ? (
            <section className="surface-card manager-card">
              <h2>Документи</h2>
              <p className="muted-copy">Документи з’являться після підготовки оператором.</p>
            </section>
          ) : null}

          <div ref={chatSectionRef}>
            <ChatRoom
              chat={selectedApplication.chat}
              emptyTitle="Немає заяви"
              onThreadUpdated={() => loadApplications({ silent: true })}
            />
          </div>
        </>
      ) : (
        <section className="surface-card thread-empty">
          <h2>Немає заяв</h2>
          <button className="primary-button" onClick={openApplicationForm} type="button">
            Подати першу заявку
          </button>
        </section>
      )}
    </main>
  );
}
