import { useEffect, useEffectEvent, useState } from 'react';
import { api } from '../api';
import { applicationStatusLabels } from '../connectionContent';
import { ApplicationProgress } from './ApplicationProgress';
import { ChatRoom } from './ChatRoom';

export function UserWorkspace({ user, onLogout }) {
  const [applications, setApplications] = useState([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

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

  useEffect(() => {
    loadApplications();

    const timer = window.setInterval(() => {
      loadApplications({ silent: true });
    }, 15000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const selectedApplication =
    applications.find((application) => application.id === selectedApplicationId) ?? null;

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <span className="section-kicker">Особистий кабінет замовника</span>
          <h1>Мої заяви</h1>
          <p className="muted-copy">{user.fullName}</p>
        </div>

        <div className="header-actions">
          <button className="secondary-button" onClick={() => loadApplications()} type="button">
            Оновити
          </button>
          <button className="primary-button" onClick={onLogout} type="button">
            Вийти
          </button>
        </div>
      </header>

      <section className="surface-card tabs-card">
        <div className="tab-strip">
          {applications.map((application) => (
            <button
              className={application.id === selectedApplicationId ? 'tab-button is-active' : 'tab-button'}
              key={application.id}
              onClick={() => setSelectedApplicationId(application.id)}
              type="button"
            >
              <strong>{application.applicationNumber}</strong>
              <span>{applicationStatusLabels[application.status]}</span>
            </button>
          ))}
        </div>

        {isLoading ? <p className="muted-copy">Завантаження...</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {!isLoading && !error && applications.length === 0 ? (
          <p className="muted-copy">У вашому кабінеті ще немає заяв на приєднання.</p>
        ) : null}
      </section>

      {selectedApplication ? (
        <>
          <section className="surface-card manager-card">
            <ApplicationProgress application={selectedApplication} />
          </section>

          <ChatRoom
            chat={selectedApplication.chat}
            emptyTitle="Немає заяви"
            onThreadUpdated={() => loadApplications({ silent: true })}
          />
        </>
      ) : (
        <section className="surface-card thread-empty">
          <h2>Немає заяв</h2>
        </section>
      )}
    </main>
  );
}
