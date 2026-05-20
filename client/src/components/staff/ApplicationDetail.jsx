import {
  applicationStatusDescriptions,
  applicationStatusLabels,
  connectionTypeLabels,
  deadlineStatusLabels,
  roleLabels,
} from '../../connectionContent';
import { formatDate, formatDateTime } from '../../utils';

export function ApplicationDetail({
  appendix3Fields,
  availableStatusOptions,
  deadlineDataDraft,
  disabledDeadlineData,
  disabledStatus,
  getQuestionnaireFields,
  getQuestionnaireTypeDetails,
  onSaveDeadlineData,
  onSaveStatus,
  selectedApplication,
  setDeadlineDataDraft,
  setStatusDraft,
  statusDraft,
}) {
  const needsStatusComment = ['needs_clarification', 'rejected'].includes(statusDraft.status)
    && statusDraft.status !== selectedApplication.status;
  const isStatusCommentMissing = statusDraft.status === 'needs_clarification'
    && statusDraft.status !== selectedApplication.status
    && !statusDraft.comment.trim();
  const canChangeStatus = availableStatusOptions.length > 0;

  return (
    <section className="surface-card manager-card">
      <div className="section-header">
        <div>
          <span className="section-kicker">Заява {selectedApplication.applicationNumber}</span>
          <h2>{selectedApplication.applicantFullName}</h2>
          <p className="muted-copy">{selectedApplication.objectAddress}</p>
        </div>
      </div>

      <div className="detail-meta-grid">
        <span>{selectedApplication.stationName}</span>
        <span>{connectionTypeLabels[selectedApplication.connectionType]}</span>
        <span>{applicationStatusLabels[selectedApplication.status]}</span>
        <span>Телефон: {selectedApplication.phone}</span>
        <span>Email: {selectedApplication.email || 'не вказано'}</span>
        <span>Дата заяви: {formatDate(selectedApplication.receivedAt)}</span>
        <span>Відповідальний: {selectedApplication.responsibleName || 'не вказано'}</span>
      </div>

      <div className="appendix-data-view">
        <h3>Статус заявки</h3>
        {!selectedApplication.customerUserId ? (
          <p className="stage-note">
            Це pending-заява без створеного кабінету замовника. Після переходу в статус
            “Прийнято в обробку” система створить або прив’яже кабінет замовника та підготує
            email-повідомлення з доступом.
          </p>
        ) : null}
        <p className="stage-note">
          <strong>{applicationStatusLabels[selectedApplication.status] ?? selectedApplication.status}</strong>
          <br />
          {applicationStatusDescriptions[selectedApplication.status] ?? 'Поточний статус заявки.'}
        </p>

        <div className="stage-editor__controls">
          <label className="field-block">
            <span>Наступний статус</span>
            <select
              className="field-input"
              disabled={disabledStatus || !canChangeStatus}
              onChange={(event) =>
                setStatusDraft((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
              value={statusDraft.status}
            >
              <option value={selectedApplication.status}>
                {canChangeStatus ? 'Оберіть наступний статус' : 'Немає доступних переходів'}
              </option>
              {availableStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {needsStatusComment ? (
            <label className="field-block field-block--wide">
              <span>{statusDraft.status === 'needs_clarification' ? 'Що потрібно уточнити?' : 'Причина рішення'}</span>
              <textarea
                className="field-input field-textarea"
                disabled={disabledStatus}
                onChange={(event) =>
                  setStatusDraft((current) => ({
                    ...current,
                    comment: event.target.value,
                  }))
                }
                required={statusDraft.status === 'needs_clarification'}
                rows={3}
                value={statusDraft.comment}
              />
            </label>
          ) : null}
        </div>

        <button
          className="primary-button"
          disabled={disabledStatus || !canChangeStatus || statusDraft.status === selectedApplication.status || isStatusCommentMissing}
          onClick={onSaveStatus}
          type="button"
        >
          {disabledStatus ? 'Збереження...' : 'Оновити статус'}
        </button>
      </div>

      {selectedApplication.notes ? <p className="stage-note">{selectedApplication.notes}</p> : null}

      <DeadlineChecks checks={selectedApplication.deadlineChecks} />
      <StatusHistory entries={selectedApplication.statusHistory ?? []} />
      <DeadlineDataEditor
        deadlineDataDraft={deadlineDataDraft}
        disabled={disabledDeadlineData}
        onSave={onSaveDeadlineData}
        setDeadlineDataDraft={setDeadlineDataDraft}
      />

      <div className="appendix-data-view">
        <h3>Дані з Додатка 3</h3>
        <div className="appendix-data-grid">
          {appendix3Fields
            .filter(([key]) => selectedApplication.appendixData?.appendix3?.[key])
            .map(([key, label]) => (
              <span key={key}>
                <strong>{label}</strong>
                {selectedApplication.appendixData.appendix3[key]}
              </span>
            ))}
        </div>

        <h3>Дані з опитувального листа</h3>
        <div className="appendix-data-grid">
          <span>
            <strong>Тип</strong>
            {`${getQuestionnaireTypeDetails(selectedApplication.appendixData?.questionnaire?.type).appendixLabel} - ${getQuestionnaireTypeDetails(selectedApplication.appendixData?.questionnaire?.type).title}`}
          </span>
          {getQuestionnaireFields(selectedApplication.appendixData?.questionnaire?.type)
            .filter(([key]) => selectedApplication.appendixData?.questionnaire?.[key])
            .map(([key, label]) => (
              <span key={key}>
                <strong>{label}</strong>
                {selectedApplication.appendixData.questionnaire[key]}
              </span>
            ))}
        </div>
      </div>
    </section>
  );
}

function StatusHistory({ entries }) {
  if (!entries.length) {
    return null;
  }

  return (
    <div className="appendix-data-view">
      <h3>Історія статусів</h3>
      <div className="email-log">
        {entries.map((entry) => (
          <article className="email-log-item" key={entry.id}>
            <strong>
              {applicationStatusLabels[entry.fromStatus] ?? entry.fromStatus ?? 'Створено'}
              {' → '}
              {applicationStatusLabels[entry.toStatus] ?? entry.toStatus}
            </strong>
            {entry.comment ? <span>{entry.comment}</span> : null}
            <small>
              {entry.changedByName || 'Система'} · {roleLabels[entry.changedByRole] ?? entry.changedByRole ?? 'система'} · {formatDateTime(entry.createdAt)}
            </small>
          </article>
        ))}
      </div>
    </div>
  );
}

function DeadlineChecks({ checks }) {
  return (
    <div className="appendix-data-view">
      <h3>Контроль строків</h3>
      <div className="appendix-data-grid">
        {checks.map((check) => (
          <span key={check.key}>
            <strong>{check.label}</strong>
            {check.dueAt ? `До ${formatDate(check.dueAt)}` : 'Строк не задано'}
            <StatusPill status={check.status} />
          </span>
        ))}
      </div>
    </div>
  );
}

function DeadlineDataEditor({ deadlineDataDraft, disabled, onSave, setDeadlineDataDraft }) {
  const fields = [
    ['invoiceIssuedAt', 'Дата отримання/видачі рахунку'],
    ['paymentDueAt', 'Граничний строк оплати'],
    ['paymentCompletedAt', 'Дата оплати'],
    ['contractSentAt', 'Дата отримання примірників договору'],
    ['signedContractDueAt', 'Граничний строк повернення договору'],
    ['signedContractReceivedAt', 'Дата повернення підписаного договору'],
    ['temporaryResponseDueAt', 'Строк первинного інформування для тимчасового приєднання'],
    ['temporaryResponseCompletedAt', 'Дата первинного інформування'],
  ];

  return (
    <div className="appendix-data-view">
      <h3>Контрольні дати</h3>
      <div className="stage-editor__controls">
        {fields.map(([key, label]) => (
          <label className="field-block" key={key}>
            <span>{label}</span>
            <input
              className="field-input"
              disabled={disabled}
              onChange={(event) =>
                setDeadlineDataDraft((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
              type="date"
              value={deadlineDataDraft[key] ?? ''}
            />
          </label>
        ))}
      </div>
      <button className="primary-button" disabled={disabled} onClick={onSave} type="button">
        {disabled ? 'Збереження...' : 'Зберегти контрольні дати'}
      </button>
    </div>
  );
}

function StatusPill({ status }) {
  return (
    <span className={`summary-pill deadline-pill deadline-pill--${status}`}>
      {deadlineStatusLabels[status] ?? status}
    </span>
  );
}
