import {
  applicationStatusLabels,
  connectionTypeLabels,
  deadlineStatusLabels,
  stageStatusLabels,
} from '../connectionContent';
import { apiUrl } from '../api';
import { formatDate } from '../utils';

export function ApplicationProgress({ application, compact = false }) {
  if (!application) {
    return null;
  }

  return (
    <section className={compact ? 'application-progress application-progress--compact' : 'application-progress'}>
      <div className="application-summary">
        <div>
          <span className="section-kicker">Заява {application.applicationNumber}</span>
          <h2>{application.applicantFullName}</h2>
          <p className="muted-copy">{application.objectAddress}</p>
        </div>

        <div className="summary-pill-group">
          <span className="summary-pill">{applicationStatusLabels[application.status] ?? application.status}</span>
          <span className="summary-pill">{connectionTypeLabels[application.connectionType]}</span>
          <span className="summary-pill">
            {application.stageSummary.completed}/{application.stageSummary.total} етапів
          </span>
        </div>
      </div>

      <div className="stage-timeline">
        {application.stages.map((stage) => (
          <article className={`stage-row stage-row--${stage.status}`} key={stage.id}>
            <div className="stage-marker" />
            <div className="stage-row__body">
              <div className="stage-row__head">
                <h3>{stage.title}</h3>
                <span className="role-badge">{stageStatusLabels[stage.status] ?? stage.status}</span>
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
