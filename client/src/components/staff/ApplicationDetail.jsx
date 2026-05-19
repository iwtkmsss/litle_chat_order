import {
  applicationStatusLabels,
  connectionTypeLabels,
  deadlineStatusLabels,
} from '../../connectionContent';
import { formatDate } from '../../utils';

export function ApplicationDetail({
  appendix3Fields,
  deadlineDataDraft,
  disabledDeadlineData,
  getQuestionnaireFields,
  getQuestionnaireTypeDetails,
  onSaveDeadlineData,
  selectedApplication,
  setDeadlineDataDraft,
}) {
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

      {selectedApplication.notes ? <p className="stage-note">{selectedApplication.notes}</p> : null}

      <DeadlineChecks checks={selectedApplication.deadlineChecks} />
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
