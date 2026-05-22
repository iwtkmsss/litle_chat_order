import { useEffect, useState } from 'react';
import {
  connectionTypeLabels,
  deadlineStatusLabels,
  getApplicationStatusDescription,
  getApplicationStatusLabel,
  roleLabels,
} from '../../connectionContent';
import { api } from '../../api';
import { formatDate, formatDateTime } from '../../utils';

const statusActionLabels = {
  accepted: 'Прийняти в роботу',
  needs_clarification: 'Повернути на доповнення',
  rejected: 'Відхилити',
  under_review: 'Передати на технічний розгляд',
  technical_conditions_ready: 'Позначити ТУ підготовленими',
  agreement_ready: 'Позначити договір підготовленим',
  completed: 'Завершити заявку',
  submitted: 'Повернути до нової заявки',
};

const statusCommentLabels = {
  needs_clarification: 'Що потрібно уточнити?',
  rejected: 'Причина відхилення або повернення',
};

function getAccessState(application) {
  if (application.customerUserId) {
    return {
      tone: 'success',
      title: 'Особистий кабінет створено.',
      lines: ['Замовник може увійти через email і тимчасовий пароль.'],
    };
  }

  if (application.status === 'needs_clarification') {
    return {
      tone: 'warning',
      title: 'Тимчасовий кабінет активний.',
      lines: [
        'Замовник може відредагувати та повторно надіслати заяву.',
        'Повноцінний особистий кабінет ще не створено.',
      ],
    };
  }

  if (application.status === 'rejected') {
    return {
      tone: 'danger',
      title: 'Заявку відхилено або повернуто.',
      lines: ['Особистий кабінет не створювався.'],
    };
  }

  return {
    tone: 'info',
    title: 'Тимчасовий кабінет активний.',
    lines: [
      'Повноцінний особистий кабінет ще не створено.',
      'Він буде створений після прийняття заявки в роботу.',
    ],
  };
}

function getStatusActionLabel(currentStatus, nextStatus, fallbackLabel) {
  if (currentStatus === 'needs_clarification' && nextStatus === 'accepted') {
    return 'Прийняти повторно в роботу';
  }

  return statusActionLabels[nextStatus] ?? fallbackLabel;
}

export function ApplicationDetail({
  appendix3Fields,
  availableStatusOptions,
  deadlineDataDraft,
  disabledDeadlineData,
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
  const [revealedAccess, setRevealedAccess] = useState(null);
  const [isRevealingAccess, setIsRevealingAccess] = useState(false);
  const [accessError, setAccessError] = useState('');
  const commentRequired = ['needs_clarification', 'rejected'].includes(statusDraft.status)
    && statusDraft.status !== selectedApplication.status;
  const isStatusCommentMissing = commentRequired && !statusDraft.comment.trim();
  const actionOptions = availableStatusOptions.filter(
    (option) => !(selectedApplication.status === 'needs_clarification' && option.value === 'submitted'),
  );
  const canChangeStatus = actionOptions.length > 0;
  const currentStatusLabel = getApplicationStatusLabel(selectedApplication.status, 'manager');
  const currentStatusDescription = getApplicationStatusDescription(selectedApplication.status, 'manager');
  const accessState = getAccessState(selectedApplication);
  const accessNotification = selectedApplication.notifications?.find(
    (notification) => notification.notificationType === 'customer_access_prepared',
  );

  useEffect(() => {
    setRevealedAccess(null);
    setAccessError('');
  }, [selectedApplication.id]);

  async function handleRevealAccess() {
    setIsRevealingAccess(true);
    setAccessError('');

    try {
      const response = await api.revealCustomerAccess(selectedApplication.id);
      setRevealedAccess(response);
    } catch (error) {
      setAccessError(error.message);
    } finally {
      setIsRevealingAccess(false);
    }
  }

  async function handleCopyPassword() {
    if (!revealedAccess?.temporaryPassword) {
      return;
    }

    try {
      await navigator.clipboard.writeText(revealedAccess.temporaryPassword);
      setAccessError('');
    } catch {
      setAccessError('Не вдалося скопіювати пароль. Виділіть його вручну.');
    }
  }

  function selectStatusAction(status) {
    setStatusDraft({ status, comment: '' });

    if (!['needs_clarification', 'rejected'].includes(status)) {
      onSaveStatus({ status, comment: '' });
    }
  }

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
        {selectedApplication.objectRegion ? <span>Область: {selectedApplication.objectRegion}</span> : null}
        <span>{connectionTypeLabels[selectedApplication.connectionType]}</span>
        <span>{currentStatusLabel}</span>
        <span>Телефон: {selectedApplication.phone}</span>
        <span>Email: {selectedApplication.email || 'не вказано'}</span>
        <span>Дата заяви: {formatDate(selectedApplication.receivedAt)}</span>
        <span>Відповідальний: {selectedApplication.responsibleName || 'не вказано'}</span>
      </div>

      <div className="appendix-data-view">
        <h3>Статус заявки</h3>
        <p className="stage-note">
          <strong>{currentStatusLabel}</strong>
          <br />
          {currentStatusDescription}
        </p>
      </div>

      <CustomerAccessBlock
        accessError={accessError}
        accessNotification={accessNotification}
        accessState={accessState}
        application={selectedApplication}
        isRevealingAccess={isRevealingAccess}
        onCopyPassword={handleCopyPassword}
        onHidePassword={() => setRevealedAccess(null)}
        onRevealAccess={handleRevealAccess}
        revealedAccess={revealedAccess}
      />

      <div className="appendix-data-view">
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
                className={option.value === 'rejected' ? 'danger-button' : 'secondary-button'}
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
              className={statusDraft.status === 'rejected' ? 'danger-button' : 'primary-button'}
              disabled={disabledStatus || isStatusCommentMissing}
              onClick={() => onSaveStatus(statusDraft)}
              type="button"
            >
              {disabledStatus
                ? 'Збереження...'
                : getStatusActionLabel(selectedApplication.status, statusDraft.status, 'Підтвердити дію')}
            </button>
          </>
        ) : null}
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

function CustomerAccessBlock({
  accessError,
  accessNotification,
  accessState,
  application,
  isRevealingAccess,
  onCopyPassword,
  onHidePassword,
  onRevealAccess,
  revealedAccess,
}) {
  return (
    <div className={`appendix-data-view customer-access-card customer-access-card--${accessState.tone}`}>
      <h3>Доступ замовника</h3>
      <p className="stage-note">
        <strong>{accessState.title}</strong>
        <br />
        {accessState.lines.join(' ')}
      </p>

      <div className="appendix-data-grid">
        <span>
          <strong>Email / логін</strong>
          {application.email || application.customerUserName || 'не вказано'}
        </span>
        <span>
          <strong>Стан доступу</strong>
          {application.customerUserId ? 'Кабінет створено' : 'Тільки тимчасовий кабінет'}
        </span>
        {accessNotification ? (
          <span>
            <strong>Email-повідомлення</strong>
            {accessNotification.status === 'prepared' ? 'Підготовлено' : 'Не підготовлено'}
          </span>
        ) : null}
      </div>

      {application.customerUserId ? (
        <div className="customer-access-card__actions">
          {!revealedAccess ? (
            <button
              className="secondary-button"
              disabled={isRevealingAccess}
              onClick={onRevealAccess}
              type="button"
            >
              {isRevealingAccess ? 'Завантаження...' : 'Показати тимчасовий пароль'}
            </button>
          ) : (
            <div className="customer-access-secret">
              <div className="appendix-data-grid">
                <span>
                  <strong>Логін</strong>
                  {revealedAccess.login}
                </span>
                <span>
                  <strong>Тимчасовий пароль</strong>
                  <code>{revealedAccess.temporaryPassword}</code>
                </span>
              </div>
              <p className="stage-note">
                Це тимчасовий пароль для першого входу замовника. Не передавайте його стороннім особам.
                Після підключення реальної email-відправки доступ буде передаватися автоматично.
              </p>
              <div className="header-actions">
                <button className="secondary-button" onClick={onCopyPassword} type="button">
                  Скопіювати пароль
                </button>
                <button className="secondary-button" onClick={onHidePassword} type="button">
                  Сховати пароль
                </button>
              </div>
            </div>
          )}
          {accessError ? <p className="form-error">{accessError}</p> : null}
          {!accessError && !accessNotification ? (
            <p className="stage-note">
              Тимчасовий пароль недоступний. Потрібно сформувати новий доступ окремою дією.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
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
              {entry.fromStatus ? getApplicationStatusLabel(entry.fromStatus, 'manager') : 'Створено'}
              {' → '}
              {getApplicationStatusLabel(entry.toStatus, 'manager')}
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
