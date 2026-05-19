import { applicationStatusLabels } from '../../connectionContent';

export function ApplicationRegistry({
  applications,
  deletingApplicationId,
  isAdmin,
  isLoading,
  onDeleteApplication,
  onSelectApplication,
  selectedApplicationId,
}) {
  return (
    <section className="manager-simple-grid manager-simple-grid--single">
      <section className="surface-card manager-card">
        <div className="section-header">
          <div>
            <h2>Заяви</h2>
            <p className="muted-copy">Телефон, ПІБ, номер заяви, станція та поточний прогрес.</p>
          </div>
          <span className="counter-chip">{applications.length}</span>
        </div>

        {isLoading ? <p className="muted-copy">Завантаження...</p> : null}
        {!isLoading && applications.length === 0 ? <p className="muted-copy">Заяв ще немає.</p> : null}

        <div className="application-list">
          {applications.map((application) => (
            <article
              className={application.id === selectedApplicationId ? 'application-card is-active' : 'application-card'}
              key={application.id}
            >
              <button
                className="application-card__main"
                onClick={() => onSelectApplication(application.id)}
                type="button"
              >
                <span className="section-kicker">{application.applicationNumber}</span>
                <strong>{application.applicantFullName}</strong>
                <span>{application.objectAddress}</span>
                <span>{application.stationName}</span>
                <span>
                  {application.stageSummary.completed}/{application.stageSummary.total} етапів ·{' '}
                  {applicationStatusLabels[application.status]}
                </span>
              </button>

              {isAdmin ? (
                <div className="application-card__actions">
                  <button
                    className="danger-button"
                    disabled={deletingApplicationId === application.id}
                    onClick={() => onDeleteApplication(application)}
                    type="button"
                  >
                    {deletingApplicationId === application.id ? 'Видалення...' : 'Видалити'}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
