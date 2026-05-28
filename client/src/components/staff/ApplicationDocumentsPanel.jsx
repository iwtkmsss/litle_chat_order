import { apiUrl } from '../../api';
import { formatDateTime } from '../../utils';

const notificationStatusLabels = {
  prepared: 'Email-лист сформовано',
  skipped: 'Email не вказано',
  sent: 'Надіслано',
  failed: 'Помилка надсилання',
};

export function ApplicationDocumentsPanel({
  generatingDocumentType,
  getGeneratedDocumentOptions,
  isAdmin,
  onGenerateDocument,
  selectedApplication,
}) {
  return (
    <>
      <section className="surface-card manager-card">
        <div className="section-header">
          <div>
            <h2>Документи</h2>
            <p className="muted-copy">Заповнені docx зберігаються на сервері назавжди.</p>
          </div>
          <span className="counter-chip">{selectedApplication.generatedDocuments.length}</span>
        </div>

        <div className="document-actions">
          {getGeneratedDocumentOptions(selectedApplication).map(([type, label]) => (
            <button
              className="secondary-button"
              disabled={Boolean(generatingDocumentType)}
              key={type}
              onClick={() => onGenerateDocument(type)}
              type="button"
            >
              {generatingDocumentType === type ? 'Генерація...' : `Згенерувати ${label}`}
            </button>
          ))}
        </div>

        <div className="email-log">
          {selectedApplication.generatedDocuments.length === 0 ? (
            <p className="muted-copy">Згенерованих документів ще немає.</p>
          ) : selectedApplication.generatedDocuments.map((document) => (
            <article className="email-log-item" key={document.id}>
              <strong>{document.title}</strong>
              <a href={apiUrl(`/api/generated-documents/${document.id}`)}>{document.originalName}</a>
              <small>{formatDateTime(document.createdAt)}</small>
            </article>
          ))}
        </div>
      </section>

      {isAdmin ? (
        <section className="surface-card manager-card">
          <div className="section-header">
            <div>
              <h2>Email-листи</h2>
              <p className="muted-copy">Листи для інформування замовника про стадії виконання етапів.</p>
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
                  <span>
                    {notification.recipientEmail || 'email не вказано'} ·{' '}
                    {notificationStatusLabels[notification.status] ?? notification.status}
                  </span>
                  <small>{formatDateTime(notification.createdAt)}</small>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
