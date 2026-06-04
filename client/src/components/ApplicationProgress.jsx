import {
  connectionTypeLabels,
  deadlineStatusLabels,
  getApplicationStatusDescription,
  getApplicationStatusLabel,
  stageStatusLabels,
} from '../connectionContent';
import { apiUrl } from '../api';
import { formatDate, formatDateTime } from '../utils';

function getStageDates(stage) {
  return [
    ['Очікуваний строк', stage.expectedAt],
    ['Граничний строк', stage.dueAt],
    ['Початок', stage.startedAt],
    ['Дата виконання', stage.completedAt],
  ].filter(([, value]) => value);
}

export function ApplicationProgress({ application, compact = false }) {
  if (!application) {
    return null;
  }

  const stages = application.stages ?? [];
  const visibleStatusHistory = application.statusHistory ?? [];
  const latestClarification = visibleStatusHistory.find(
    (entry) => entry.toStatus === 'needs_clarification' && entry.comment,
  );
  const stageSummary = application.stageSummary ?? {
    completed: stages.filter((stage) => stage.status === 'completed').length,
    total: stages.length,
  };
  const progressPercent = stageSummary.total
    ? Math.round((stageSummary.completed / stageSummary.total) * 100)
    : 0;
  const statusLabel = getApplicationStatusLabel(application.status, 'customer');
  const statusDescription = getApplicationStatusDescription(application.status, 'customer');

  return (
    <section className={compact ? 'application-progress application-progress--compact' : 'application-progress'}>
      <div className="customer-progress-overview">
        <div className="customer-progress-overview__main">
          <span className="section-kicker">Поточний стан</span>
          <h2>{statusLabel}</h2>
          <p className="muted-copy">{statusDescription}</p>
        </div>

        <div className="customer-progress-meter" aria-label={`Виконано ${stageSummary.completed} з ${stageSummary.total} етапів`}>
          <strong>{stageSummary.completed}/{stageSummary.total}</strong>
          <span>етапів виконано</span>
        </div>
      </div>

      <div className="customer-progress-bar" aria-hidden="true">
        <span style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="customer-progress-facts">
        <span>Заява {application.applicationNumber}</span>
        <span>{connectionTypeLabels[application.connectionType] ?? application.connectionType}</span>
        <span>{progressPercent}% прогресу</span>
      </div>

      {application.status === 'needs_clarification' && latestClarification ? (
        <p className="stage-note customer-progress-alert">
          <strong>Потрібно уточнення</strong>
          <br />
          {latestClarification.comment}
        </p>
      ) : null}

      <section className="customer-progress-section customer-progress-section--stages">
        <div className="customer-progress-section__head">
          <div>
            <h3>Етапи виконання</h3>
            {!compact ? (
              <p className="muted-copy">
                Послідовність робіт за заявкою та поточний стан кожного етапу.
              </p>
            ) : null}
          </div>
          <span className="summary-pill">{stageSummary.completed}/{stageSummary.total}</span>
        </div>

        {stages.length ? (
          <div className="stage-timeline customer-stage-timeline">
            {stages.map((stage, index) => {
              const stageDates = getStageDates(stage);

              return (
                <article className={`stage-row customer-stage-row stage-row--${stage.status}`} key={stage.id}>
                  <div className="customer-stage-index">
                    <span>{index + 1}</span>
                  </div>
                  <div className="stage-row__body customer-stage-row__body">
                    <div className="stage-row__head">
                      <div>
                        <h3>{stage.title}</h3>
                        {!compact && stage.description ? <p className="muted-copy">{stage.description}</p> : null}
                      </div>
                      <div className="summary-pill-group">
                        {stage.isOptional ? <span className="role-badge">За необхідності</span> : null}
                        <span className={`role-badge stage-status-badge stage-status-badge--${stage.status}`}>
                          {stageStatusLabels[stage.status] ?? stage.status}
                        </span>
                      </div>
                    </div>

                    {stageDates.length || stage.deadlineStatus ? (
                      <div className="customer-stage-meta">
                        {stageDates.map(([label, value]) => (
                          <span key={label}>
                            <strong>{label}</strong>
                            {formatDate(value)}
                          </span>
                        ))}
                        {stage.deadlineStatus ? (
                          <span>
                            <strong>Строк</strong>
                            {deadlineStatusLabels[stage.deadlineStatus] ?? stage.deadlineStatus}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {stage.publicNote ? <p className="stage-note">{stage.publicNote}</p> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="customer-progress-empty">Етапи ще не додано.</p>
        )}
      </section>

      {application.generatedDocuments?.length ? (
        <section className="customer-progress-section customer-progress-section--documents">
          <div className="customer-progress-section__head">
            <div>
              <h3>Документи</h3>
              <p className="muted-copy">Підготовлені файли за цією заявкою.</p>
            </div>
            <span className="summary-pill">{application.generatedDocuments.length}</span>
          </div>
          <div className="document-grid application-documents customer-progress-documents">
            {application.generatedDocuments.map((document) => (
              <a className="document-chip" href={apiUrl(`/api/generated-documents/${document.id}`)} key={document.id}>
                <strong>{document.title}</strong>
                <span>{document.originalName}</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {visibleStatusHistory.length > 0 && !compact ? (
        <section className="customer-progress-section customer-progress-section--history">
          <div className="customer-progress-section__head">
            <div>
              <h3>Історія оновлень</h3>
              <p className="muted-copy">Останні зміни по заявці з датою та коментарем.</p>
            </div>
            <span className="summary-pill">{visibleStatusHistory.length}</span>
          </div>
          <div className="email-log customer-history-log">
            {visibleStatusHistory.map((entry) => (
              <article className="email-log-item customer-history-item" key={entry.id}>
                <div className="customer-history-item__marker" />
                <div className="customer-history-item__body">
                  <strong>
                    {entry.fromStatus ? getApplicationStatusLabel(entry.fromStatus, 'customer') : 'Створено'}
                    {' -> '}
                    {getApplicationStatusLabel(entry.toStatus, 'customer')}
                  </strong>
                  {entry.comment ? <span>{entry.comment}</span> : null}
                  <small>{formatDateTime(entry.createdAt)}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
