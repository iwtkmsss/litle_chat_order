import { useState } from 'react';
import { api, apiUrl } from '../../api';
import { formatDateTime } from '../../utils';

const notificationStatusLabels = {
  prepared: 'Email-лист сформовано',
  skipped: 'Email не вказано',
  sent: 'Надіслано',
};

function getNotificationStatusLabel(notification) {
  if (notification.sendError) {
    return 'Помилка надсилання';
  }

  return notificationStatusLabels[notification.status] ?? notification.status;
}

function getNotificationStatusTone(notification) {
  if (notification.sendError) {
    return 'error';
  }

  if (notification.status === 'sent') {
    return 'success';
  }

  if (notification.status === 'skipped') {
    return 'muted';
  }

  return 'pending';
}

export function ApplicationDocumentsPanel({
  deletingDocumentId,
  generatingDocumentType,
  getGeneratedDocumentOptions,
  isAdmin,
  isLocked = false,
  onGenerateDocument,
  onDeleteGeneratedDocument,
  onEmailSent,
  selectedApplication,
}) {
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailDraft, setEmailDraft] = useState({ templateId: '', subject: '', body: '' });
  const [isConfirmingEmail, setIsConfirmingEmail] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailModalError, setEmailModalError] = useState('');

  async function openEmailModal() {
    setIsEmailModalOpen(true);
    setIsConfirmingEmail(false);
    setEmailModalError('');
    setIsLoadingTemplates(true);

    try {
      const response = await api.listApplicationEmailTemplates(selectedApplication.id);
      const templates = response.templates ?? [];
      setEmailTemplates(templates);
      setEmailRecipient(response.recipientEmail ?? '');

      if (templates[0]) {
        setEmailDraft({
          templateId: templates[0].id,
          subject: templates[0].subject,
          body: templates[0].body,
        });
      }
    } catch (error) {
      setEmailModalError(error.message);
    } finally {
      setIsLoadingTemplates(false);
    }
  }

  function selectEmailTemplate(templateId) {
    const template = emailTemplates.find((item) => item.id === templateId);

    if (!template) {
      return;
    }

    setEmailDraft({
      templateId: template.id,
      subject: template.subject,
      body: template.body,
    });
    setIsConfirmingEmail(false);
    setEmailModalError('');
  }

  async function confirmSendEmail() {
    setIsSendingEmail(true);
    setEmailModalError('');

    try {
      await api.sendApplicationEmail(selectedApplication.id, emailDraft);
      setIsEmailModalOpen(false);
      await onEmailSent?.();
    } catch (error) {
      setEmailModalError(error.message);
    } finally {
      setIsSendingEmail(false);
    }
  }

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
              disabled={isLocked || Boolean(generatingDocumentType)}
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
            <article className="email-log-item document-log-item" key={document.id}>
              <div>
                <strong>{document.title}</strong>
                <a href={apiUrl(`/api/generated-documents/${document.id}`)}>{document.originalName}</a>
                <small>{formatDateTime(document.createdAt)}</small>
              </div>
              <button
                aria-label="Прибрати документ"
                className="icon-danger-button"
                disabled={isLocked || deletingDocumentId === document.id}
                onClick={() => onDeleteGeneratedDocument(document)}
                title="Прибрати документ"
                type="button"
              >
                ×
              </button>
            </article>
          ))}
        </div>
      </section>

      {isAdmin ? (
        <section className="surface-card manager-card email-status-panel">
          <div className="section-header">
            <div>
              <h2>Email-листи</h2>
              <p className="muted-copy">Листи для інформування замовника про стадії виконання етапів.</p>
            </div>
            <div className="email-panel-actions">
              <span className="counter-chip">{selectedApplication.notifications.length}</span>
              <button
                className="secondary-button"
                onClick={openEmailModal}
                type="button"
              >
                Надіслати лист
              </button>
            </div>
          </div>

          {selectedApplication.notifications.length === 0 ? (
            <p className="muted-copy">Листів ще немає.</p>
          ) : (
            <div className="email-log">
              {selectedApplication.notifications.slice(0, 5).map((notification) => (
                <article className="email-log-item email-log-item--status" key={notification.id}>
                  <div className="email-log-item__main">
                    <strong>{notification.subject}</strong>
                    <span>{notification.recipientEmail || 'email не вказано'}</span>
                    <small>{formatDateTime(notification.createdAt)}</small>
                    {notification.sendError ? (
                      <p className="email-send-error">{notification.sendError}</p>
                    ) : null}
                  </div>
                  <div className="email-log-item__status">
                    <span className={`email-status-pill email-status-pill--${getNotificationStatusTone(notification)}`}>
                      {getNotificationStatusLabel(notification)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
          {isEmailModalOpen ? (
            <div className="modal-backdrop" role="presentation">
              <section
                aria-label="Відправка email-листа за шаблоном"
                aria-modal="true"
                className="email-template-modal surface-card"
                role="dialog"
              >
                <div className="modal-toolbar">
                  <div>
                    <h2>Надіслати лист</h2>
                    <p className="muted-copy">Оберіть шаблон, відредагуйте лист і підтвердьте відправку.</p>
                  </div>
                  <button className="secondary-button" onClick={() => setIsEmailModalOpen(false)} type="button">
                    Закрити
                  </button>
                </div>

                {emailModalError ? <p className="form-error">{emailModalError}</p> : null}

                {isLoadingTemplates ? (
                  <p className="muted-copy">Завантаження шаблонів...</p>
                ) : !isConfirmingEmail ? (
                  <div className="email-template-editor">
                    <label className="field-block">
                      <span>Одержувач</span>
                      <input className="field-input" disabled value={emailRecipient || 'email не вказано'} />
                    </label>
                    <label className="field-block">
                      <span>Шаблон</span>
                      <select
                        className="field-input"
                        onChange={(event) => selectEmailTemplate(event.target.value)}
                        value={emailDraft.templateId}
                      >
                        {emailTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-block">
                      <span>Тема</span>
                      <input
                        className="field-input"
                        onChange={(event) =>
                          setEmailDraft((current) => ({ ...current, subject: event.target.value }))
                        }
                        value={emailDraft.subject}
                      />
                    </label>
                    <label className="field-block">
                      <span>Текст листа</span>
                      <textarea
                        className="field-input field-textarea"
                        onChange={(event) =>
                          setEmailDraft((current) => ({ ...current, body: event.target.value }))
                        }
                        rows={12}
                        value={emailDraft.body}
                      />
                    </label>
                    <div className="form-actions">
                      <button className="secondary-button" onClick={() => setIsEmailModalOpen(false)} type="button">
                        Відмінити
                      </button>
                      <button
                        className="primary-button"
                        disabled={!emailRecipient || !emailDraft.subject.trim() || !emailDraft.body.trim()}
                        onClick={() => setIsConfirmingEmail(true)}
                        type="button"
                      >
                        Переглянути перед відправкою
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="email-confirmation">
                    <p className="stage-note">
                      Перевірте лист перед відправкою. Після підтвердження буде створено новий email-запис і виконано SMTP-відправку.
                    </p>
                    <div className="email-preview-box">
                      <strong>Кому</strong>
                      <span>{emailRecipient}</span>
                      <strong>Тема</strong>
                      <span>{emailDraft.subject}</span>
                      <strong>Текст</strong>
                      <pre>{emailDraft.body}</pre>
                    </div>
                    <div className="form-actions">
                      <button className="secondary-button" disabled={isSendingEmail} onClick={() => setIsConfirmingEmail(false)} type="button">
                        Назад до редагування
                      </button>
                      <button className="secondary-button" disabled={isSendingEmail} onClick={() => setIsEmailModalOpen(false)} type="button">
                        Відмінити
                      </button>
                      <button className="primary-button" disabled={isSendingEmail} onClick={confirmSendEmail} type="button">
                        {isSendingEmail ? 'Відправка...' : 'Підтвердити і відправити'}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
