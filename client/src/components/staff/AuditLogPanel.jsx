import { roleLabels } from '../../connectionContent';
import { formatDateTime } from '../../utils';

export function AuditLogPanel({ active, auditEntries }) {
  return (
    <section className="surface-card manager-card application-detail-grid__wide" hidden={!active}>
      <div className="section-header">
        <div>
          <span className="section-kicker">Адмін</span>
          <h2>Журнал дій</h2>
        </div>
        <span className="counter-chip">{auditEntries.length}</span>
      </div>
      <div className="email-log">
        {auditEntries.map((entry) => (
          <article className="email-log-item" key={entry.id}>
            <strong>{entry.summary}</strong>
            <span>
              {entry.actorName} · {roleLabels[entry.actorRole] ?? entry.actorRole}
              {entry.stationName ? ` · ${entry.stationName}` : ''}
            </span>
            <small>{formatDateTime(entry.createdAt)}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
