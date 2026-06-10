import { useState } from 'react';
import {
  connectionTypeLabels,
  deadlineStatusLabels,
  getApplicationStatusLabel,
  isClosedApplicationStatus,
  roleLabels,
} from '../../connectionContent';
import { formatDate, formatDateTime } from '../../utils';

const statusActionLabels = {
  accepted: 'Прийняти в роботу',
  needs_clarification: 'Повернути на доповнення',
  completed: 'Завершити роботу',
};

const statusCommentLabels = {
  needs_clarification: 'Що потрібно уточнити?',
};

function getStatusActionLabel(currentStatus, nextStatus, fallbackLabel) {
  if (isClosedApplicationStatus(currentStatus) && nextStatus === 'accepted') {
    return 'Відновити заяву';
  }

  return statusActionLabels[nextStatus] ?? fallbackLabel;
}

function getStatusConfirmationText(currentStatus, nextStatus) {
  if (isClosedApplicationStatus(currentStatus) && nextStatus === 'accepted') {
    return 'Відновити заяву та дозволити редагування?';
  }

  if (nextStatus === 'completed') {
    return 'Завершити роботу із заявкою? Після завершення редагування буде заблоковано.';
  }

  if (nextStatus === 'needs_clarification') {
    return 'Повернути заявку на доповнення замовнику?';
  }

  if (nextStatus === 'accepted') {
    return 'Прийняти заявку в роботу?';
  }

  return 'Підтвердити зміну статусу заявки?';
}

function formatQuestionnaireValue(questionnaire, key, unitKey = '') {
  const value = String(questionnaire?.[key] ?? '').trim();
  const unit = unitKey ? String(questionnaire?.[unitKey] ?? '').trim() : '';

  return value && unit ? `${value} ${unit}` : value;
}

export function ApplicationDetail({
  appendix3Fields,
  availableStatusOptions,
  deadlineDataDraft,
  disabledDeadlineData,
  isDeadlineDataLocked = false,
  disabledStatus,
  getQuestionnaireFields,
  getQuestionnaireTypeDetails,
  isAdmin,
  onSaveDeadlineData,
  onSaveStatus,
  selectedApplication,
  setDeadlineDataDraft,
  setStatusDraft,
  statusDraft,
}) {
  const [isFullInfoOpen, setIsFullInfoOpen] = useState(false);
  const commentRequired = statusDraft.status === 'needs_clarification'
    && statusDraft.status !== selectedApplication.status;
  const isStatusCommentMissing = commentRequired && !statusDraft.comment.trim();
  const actionOptions = availableStatusOptions.filter((option) =>
    ['accepted', 'needs_clarification', 'completed'].includes(option.value),
  );
  const canChangeStatus = actionOptions.length > 0;
  const currentStatusLabel = getApplicationStatusLabel(selectedApplication.status, 'manager');

  function selectStatusAction(status) {
    setStatusDraft({ status, comment: '' });

    if (status !== 'needs_clarification' && window.confirm(getStatusConfirmationText(selectedApplication.status, status))) {
      onSaveStatus({ status, comment: '' });
    }
  }

  function confirmStatusAction() {
    if (!window.confirm(getStatusConfirmationText(selectedApplication.status, statusDraft.status))) {
      return;
    }

    onSaveStatus(statusDraft);
  }

  return (
    <section className="surface-card manager-card application-overview-card">
      <div className="application-overview-block application-overview-block--main">
        <div className="section-header">
          <div>
            <span className="section-kicker">Заява {selectedApplication.applicationNumber}</span>
            <h2>{selectedApplication.applicantFullName}</h2>
            <p className="muted-copy">{selectedApplication.objectAddress}</p>
          </div>
          <span className={`application-status-chip application-status-pill--${selectedApplication.status}`}>
            {currentStatusLabel}
          </span>
        </div>

        <div className="detail-meta-grid">
          <span>{selectedApplication.stationName}</span>
          <span>Область: {selectedApplication.objectRegion || 'не вказано'}</span>
          <span>{connectionTypeLabels[selectedApplication.connectionType]}</span>
          <span>Телефон: {selectedApplication.phone}</span>
          <span>Email: {selectedApplication.email || 'не вказано'}</span>
          <span>Дата заяви: {formatDate(selectedApplication.receivedAt)}</span>
          <span>Відповідальний: {selectedApplication.responsibleName || 'не вказано'}</span>
        </div>

        <div className="application-detail-toolbar">
          <button className="secondary-button" onClick={() => setIsFullInfoOpen(true)} type="button">
            Повна інформація по заявці
          </button>
        </div>
      </div>

      <div className="appendix-data-view application-section--actions">
        <h3>Дії із заявкою</h3>
        {!canChangeStatus ? (
          <p className="stage-note">
            {selectedApplication.status === 'completed'
              ? 'Заявку завершено.'
              : selectedApplication.status === 'rejected'
                ? 'Заявку закрито.'
                : 'Немає доступних переходів для поточного статусу.'}
          </p>
        ) : null}
        {isAdmin && ['completed', 'rejected'].includes(selectedApplication.status) && canChangeStatus ? (
          <p className="stage-note">
            Адмінське перевизначення: ці дії доступні тільки адміністратору й будуть записані в журнал.
          </p>
        ) : null}

        {canChangeStatus ? (
          <div className="application-action-grid">
            {actionOptions.map((option) => (
              <button
                className={option.value === 'completed' ? 'danger-button' : 'secondary-button'}
                disabled={disabledStatus}
                key={option.value}
                onClick={() => selectStatusAction(option.value)}
                type="button"
              >
                {getStatusActionLabel(selectedApplication.status, option.value, option.label)}
              </button>
            ))}
          </div>
        ) : null}

        {commentRequired ? (
          <>
            <label className="field-block field-block--wide">
              <span>{statusCommentLabels[statusDraft.status] ?? 'Коментар для замовника'}</span>
              <textarea
                className="field-input field-textarea"
                disabled={disabledStatus}
                onChange={(event) =>
                  setStatusDraft((current) => ({
                    ...current,
                    comment: event.target.value,
                  }))
                }
                required
                rows={3}
                value={statusDraft.comment}
              />
            </label>

            <button
              className="primary-button"
              disabled={disabledStatus || isStatusCommentMissing}
              onClick={confirmStatusAction}
              type="button"
            >
              {disabledStatus
                ? 'Збереження...'
                : getStatusActionLabel(selectedApplication.status, statusDraft.status, 'Підтвердити дію')}
            </button>
          </>
        ) : null}
      </div>

      {isAdmin ? (
        <>
          <DeadlineChecks checks={selectedApplication.deadlineChecks} />
          <DeadlineDataEditor
            deadlineDataDraft={deadlineDataDraft}
            disabled={disabledDeadlineData}
            isLocked={isDeadlineDataLocked}
            onSave={onSaveDeadlineData}
            setDeadlineDataDraft={setDeadlineDataDraft}
          />
        </>
      ) : null}
      {/*
        Тимчасово приховано у кабінеті менеджера. Щоб повернути менеджеру ці блоки,
        прибрати умову isAdmin вище або додати окремий дозвіл для менеджера.
      */}
      <StatusHistory
        stageEntries={selectedApplication.stageHistory ?? []}
        statusEntries={selectedApplication.statusHistory ?? []}
      />

      {isFullInfoOpen ? (
        <ApplicationFullInfoModal
          appendix3Fields={appendix3Fields}
          getQuestionnaireFields={getQuestionnaireFields}
          getQuestionnaireTypeDetails={getQuestionnaireTypeDetails}
          onClose={() => setIsFullInfoOpen(false)}
          selectedApplication={selectedApplication}
        />
      ) : null}
    </section>
  );
}

function ApplicationFullInfoModal({
  appendix3Fields,
  getQuestionnaireFields,
  getQuestionnaireTypeDetails,
  onClose,
  selectedApplication,
}) {
  const questionnaireDetails = getQuestionnaireTypeDetails(selectedApplication.appendixData?.questionnaire?.type);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-label="Повна інформація по заявці"
        aria-modal="true"
        className="modal-shell modal-shell--wide surface-card"
        role="dialog"
      >
        <div className="modal-toolbar">
          <div>
            <span className="section-kicker">Заява {selectedApplication.applicationNumber}</span>
            <h2>Повна інформація по заявці</h2>
          </div>
          <button className="secondary-button" onClick={onClose} type="button">
            Закрити
          </button>
        </div>

        <div className="modal-content application-full-info">
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
          </div>

          <div className="appendix-data-view">
            <h3>Дані з опитувального листа</h3>
            <div className="appendix-data-grid">
              <span>
                <strong>Тип</strong>
                {`${questionnaireDetails.appendixLabel} - ${questionnaireDetails.title}`}
              </span>
              {getQuestionnaireFields(selectedApplication.appendixData?.questionnaire?.type)
                .filter(([key]) => selectedApplication.appendixData?.questionnaire?.[key])
                .map(([key, label, unitKey]) => (
                  <span key={key}>
                    <strong>{label}</strong>
                    {formatQuestionnaireValue(selectedApplication.appendixData.questionnaire, key, unitKey)}
                  </span>
                ))}
            </div>

            {selectedApplication.notes ? (
              <p className="stage-note application-full-info__note">
                <strong>Коментар</strong>
                <br />
                {selectedApplication.notes}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusHistory({ stageEntries, statusEntries }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const entries = [
    ...statusEntries.map((entry) => ({ ...entry, historyType: 'application_status' })),
    ...stageEntries.map((entry) => ({ ...entry, historyType: 'stage' })),
  ].sort((left, right) => {
    const byDate = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();

    if (byDate !== 0) {
      return byDate;
    }

    return String(right.id).localeCompare(String(left.id));
  });

  if (!entries.length) {
    return null;
  }

  const visibleEntries = isExpanded ? entries : entries.slice(0, 6);
  const hiddenCount = Math.max(0, entries.length - visibleEntries.length);

  return (
    <div className="appendix-data-view application-section--history">
      <div className="history-section-head">
        <h3>Історія статусів</h3>
        <span className="counter-chip">{entries.length}</span>
      </div>
      <div className="email-log">
        {visibleEntries.map((entry) => (
          <article className="email-log-item" key={entry.id}>
            {entry.historyType === 'stage' ? (
              <>
                <strong>
                  Етап: {entry.stageTitle}
                </strong>
                <span>
                  {entry.fromStatus
                    ? `${stageStatusLabel(entry.fromStatus)} → ${stageStatusLabel(entry.toStatus)}`
                    : entry.summary}
                </span>
                {entry.toStartedAt && entry.fromStartedAt !== entry.toStartedAt ? (
                  <span>Дата початку: {formatDate(entry.toStartedAt)}</span>
                ) : null}
                {entry.toCompletedAt && entry.fromCompletedAt !== entry.toCompletedAt ? (
                  <span>Дата виконання: {formatDate(entry.toCompletedAt)}</span>
                ) : null}
              </>
            ) : (
              <strong>
                {entry.fromStatus ? getApplicationStatusLabel(entry.fromStatus, 'manager') : 'Створено'}
                {' → '}
                {getApplicationStatusLabel(entry.toStatus, 'manager')}
              </strong>
            )}
            {entry.comment ? <span>{entry.comment}</span> : null}
            <small>
              {entry.changedByName || 'Система'} · {roleLabels[entry.changedByRole] ?? entry.changedByRole ?? 'система'} · {formatDateTime(entry.createdAt)}
            </small>
          </article>
        ))}
      </div>
      {entries.length > 6 ? (
        <button className="secondary-button history-toggle-button" onClick={() => setIsExpanded((current) => !current)} type="button">
          {isExpanded ? 'Згорнути історію' : `Показати ще ${hiddenCount}`}
        </button>
      ) : null}
    </div>
  );
}

function stageStatusLabel(status) {
  const labels = {
    not_started: 'Не розпочато',
    in_progress: 'Виконується',
    completed: 'Виконано',
    not_required: 'Не потрібно',
  };

  return labels[status] ?? status;
}

function DeadlineChecks({ checks }) {
  return (
    <div className="appendix-data-view application-section--deadlines">
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

function DeadlineDataEditor({ deadlineDataDraft, disabled, isLocked = false, onSave, setDeadlineDataDraft }) {
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
    <div className="appendix-data-view application-section--control-dates">
      <h3>Контрольні дати</h3>
      <div className="stage-editor__controls deadline-data-controls">
        {fields.map(([key, label]) => (
          <label className="field-block" key={key}>
            <span>{label}</span>
            <input
              className="field-input"
              disabled={disabled || isLocked}
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
      <button className="primary-button" disabled={disabled || isLocked} onClick={onSave} type="button">
        {disabled ? 'Збереження...' : isLocked ? 'Заяву завершено' : 'Зберегти контрольні дати'}
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
