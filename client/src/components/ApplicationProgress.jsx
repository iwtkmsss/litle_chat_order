import {
  applicationStatusDescriptions,
  applicationStatusLabels,
  connectionTypeLabels,
  deadlineStatusLabels,
  stageStatusLabels,
} from '../connectionContent';
import { apiUrl } from '../api';
import { formatDate, formatDateTime } from '../utils';

export function ApplicationProgress({ application, compact = false }) {
  if (!application) {
    return null;
  }

  const visibleStatusHistory = application.statusHistory ?? [];
  const latestClarification = visibleStatusHistory.find(
    (entry) => entry.toStatus === 'needs_clarification' && entry.comment,
  );

  return (
    <section className={compact ? 'application-progress application-progress--compact' : 'application-progress'}>
      <div className="application-summary">
        <div>
          <span className="section-kicker">Заява {application.applicationNumber}</span>
          <h2>{application.applicantFullName}</h2>
          <p className="muted-copy">{application.objectAddress}</p>
          <p className="muted-copy">
            {applicationStatusDescriptions[application.status] ?? 'Поточний статус заявки.'}
          </p>
        </div>

        <div className="summary-pill-group">
          <span className="summary-pill">{applicationStatusLabels[application.status] ?? application.status}</span>
          <span className="summary-pill">{connectionTypeLabels[application.connectionType]}</span>
          <span className="summary-pill">
            {application.stageSummary.completed}/{application.stageSummary.total} етапів
          </span>
        </div>
      </div>

      {application.status === 'needs_clarification' && latestClarification ? (
        <p className="stage-note">
          <strong>Потрібно уточнення:</strong>
          <br />
          {latestClarification.comment}
        </p>
      ) : null}

      {visibleStatusHistory.length > 0 && !compact ? (
        <div className="appendix-data-view">
          <h3>Історія статусів</h3>
          <div className="email-log">
            {visibleStatusHistory.map((entry) => (
              <article className="email-log-item" key={entry.id}>
                <strong>
                  {applicationStatusLabels[entry.fromStatus] ?? entry.fromStatus ?? 'Створено'}
                  {' → '}
                  {applicationStatusLabels[entry.toStatus] ?? entry.toStatus}
                </strong>
                {entry.comment ? <span>{entry.comment}</span> : null}
                <small>{formatDateTime(entry.createdAt)}</small>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="stage-timeline">
        {application.stages.map((stage) => (
          <article className={`stage-row stage-row--${stage.status}`} key={stage.id}>
            <div className="stage-marker" />
            <div className="stage-row__body">
              <div className="stage-row__head">
                <h3>{stage.title}</h3>
                <div className="summary-pill-group">
                  {stage.isOptional ? <span className="role-badge">За необхідності</span> : null}
                  <span className="role-badge">{stageStatusLabels[stage.status] ?? stage.status}</span>
                </div>
              </div>

              {!compact ? <p className="muted-copy">{stage.description}</p> : null}

              <div className="stage-meta">
                {stage.expectedAt ? <span>Очікуваний строк: {formatDate(stage.expectedAt)}</span> : null}
                {stage.dueAt ? <span>Граничний строк: {formatDate(stage.dueAt)}</span> : null}
                {stage.startedAt ? <span>Початок: {formatDate(stage.startedAt)}</span> : null}
                {stage.completedAt ? <span>Дата виконання: {formatDate(stage.completedAt)}</span> : null}
                {stage.deadlineStatus ? <span>{deadlineStatusLabels[stage.deadlineStatus] ?? stage.deadlineStatus}</span> : null}
              </div>

              {stage.publicNote ? <p className="stage-note">{stage.publicNote}</p> : null}
            </div>
          </article>
        ))}
      </div>

      {application.generatedDocuments?.length ? (
        <div className="document-grid application-documents">
          {application.generatedDocuments.map((document) => (
            <a className="document-chip" href={apiUrl(`/api/generated-documents/${document.id}`)} key={document.id}>
              <strong>{document.title}</strong>
              <span>{document.originalName}</span>
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}
