import { useMemo, useState } from 'react';
import {
  DEFAULT_APPLICATION_TYPE_ID,
  createEmptyQuestionnaireValues,
  getApplicationTypeConfig,
  getApplicationTypeOptions,
} from '../config/applicationFormConfig';
import { DynamicApplicationFields } from './forms/DynamicApplicationFields';

const stepTitles = [
  'Дані заявника',
  'Дані об’єкта',
  'Тип приєднання',
  'Опитувальний лист',
  'Додаткові матеріали',
  'Перевірка',
];

export function createPublicApplicationInitialValues(application = null) {
  const questionnaire = application?.appendixData?.questionnaire ?? {};
  const appendix3 = application?.appendixData?.appendix3 ?? {};
  const questionnaireType = questionnaire.type || DEFAULT_APPLICATION_TYPE_ID;

  return {
    fullName: application?.applicantFullName ?? questionnaire.customerName ?? '',
    stationId: application?.stationId ? String(application.stationId) : '',
    phone: application?.phone ?? questionnaire.customerPhone ?? '',
    email: application?.email ?? questionnaire.customerEmail ?? '',
    mailingAddress: appendix3.mailingAddress ?? questionnaire.customerAddress ?? '',
    objectName: appendix3.objectName ?? questionnaire.objectName ?? '',
    objectAddress: application?.objectAddress ?? questionnaire.objectAddress ?? '',
    connectionReason: appendix3.connectionReason ?? '',
    connectionType: application?.connectionType ?? 'standard',
    questionnaireType,
    notes: application?.notes ?? '',
    ...createEmptyQuestionnaireValues(questionnaireType),
    ...questionnaire,
  };
}

function preserveSharedValues(current, nextType) {
  const emptyValues = createEmptyQuestionnaireValues(nextType);
  const sharedKeys = [
    'customerName',
    'customerAddress',
    'customerDistrict',
    'customerEmail',
    'customerPhone',
    'designOrganizationName',
    'designOrganizationAddress',
    'designOrganizationEmail',
    'designOrganizationPhone',
    'objectName',
    'objectAddress',
    'plannedWorks',
    'constructionStartYear',
    'commissioningYear',
    'projectDeveloper',
    'constructionExecutor',
    'thirdPartyConnection',
    'responseMethod',
    'notificationMethod',
    'heatObjectDescription',
    'permittedHeatLoad',
  ];

  return {
    ...current,
    ...emptyValues,
    ...Object.fromEntries(sharedKeys.map((key) => [key, current[key] ?? ''])),
    questionnaireType: nextType,
    type: nextType,
  };
}

export function PublicApplicationForm({
  disabled = false,
  initialValues = null,
  onCancel,
  onSubmit,
  stations = [],
  submitLabel = 'Подати заяву',
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState(() => initialValues ?? createPublicApplicationInitialValues());
  const selectedApplicationType = getApplicationTypeConfig(form.questionnaireType);
  const isLastStep = stepIndex === stepTitles.length - 1;
  const progress = useMemo(
    () => Math.round(((stepIndex + 1) / stepTitles.length) * 100),
    [stepIndex],
  );

  function updateField(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'fullName' && !current.customerName ? { customerName: value } : {}),
      ...(key === 'phone' && !current.customerPhone ? { customerPhone: value } : {}),
      ...(key === 'email' && !current.customerEmail ? { customerEmail: value, notificationMethod: value } : {}),
      ...(key === 'mailingAddress' && !current.customerAddress ? { customerAddress: value } : {}),
      ...(key === 'objectName' && !current.objectName ? { objectName: value } : {}),
      ...(key === 'objectAddress' && !current.objectAddress ? { objectAddress: value } : {}),
    }));
  }

  function updateApplicationType(typeId) {
    setForm((current) => preserveSharedValues(current, typeId));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isLastStep) {
      setStepIndex((current) => Math.min(current + 1, stepTitles.length - 1));
      return;
    }

    await onSubmit({
      ...form,
      customerName: form.customerName || form.fullName,
      customerAddress: form.customerAddress || form.mailingAddress,
      customerEmail: form.customerEmail || form.email,
      customerPhone: form.customerPhone || form.phone,
      objectName: form.objectName || form.objectAddress,
      notificationMethod: form.notificationMethod || form.email,
    });
  }

  return (
    <form className="registration-form public-application-form" onSubmit={handleSubmit}>
      <div className="form-progress field-block--wide" aria-label="Прогрес подання заяви">
        <div className="form-progress__meta">
          <strong>{stepTitles[stepIndex]}</strong>
          <span>{stepIndex + 1} з {stepTitles.length}</span>
        </div>
        <div className="form-progress__track">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      {stepIndex === 0 ? (
        <section className="registration-section">
          <h2>Дані заявника</h2>
          <label className="field-block field-block--wide">
            <span>ПІБ / найменування заявника</span>
            <input className="field-input" disabled={disabled} onChange={(event) => updateField('fullName', event.target.value)} required value={form.fullName} />
          </label>
          <label className="field-block">
            <span>Email</span>
            <input className="field-input" disabled={disabled} onChange={(event) => updateField('email', event.target.value)} required type="email" value={form.email} />
          </label>
          <label className="field-block">
            <span>Телефон</span>
            <input className="field-input" disabled={disabled} onChange={(event) => updateField('phone', event.target.value)} required type="tel" value={form.phone} />
          </label>
          <label className="field-block field-block--wide">
            <span>Адреса для листування</span>
            <input className="field-input" disabled={disabled} onChange={(event) => updateField('mailingAddress', event.target.value)} required value={form.mailingAddress} />
          </label>
        </section>
      ) : null}

      {stepIndex === 1 ? (
        <section className="registration-section">
          <h2>Дані об’єкта</h2>
          <label className="field-block field-block--wide">
            <span>Станція/компанія</span>
            <select className="field-input" disabled={disabled} onChange={(event) => updateField('stationId', event.target.value)} required value={form.stationId}>
              <option value="">Оберіть станцію</option>
              {stations.map((station) => (
                <option key={station.id} value={station.id}>{station.name}</option>
              ))}
            </select>
          </label>
          <label className="field-block field-block--wide">
            <span>Назва об’єкта</span>
            <input className="field-input" disabled={disabled} onChange={(event) => updateField('objectName', event.target.value)} required value={form.objectName} />
          </label>
          <label className="field-block field-block--wide">
            <span>Адреса об’єкта</span>
            <input className="field-input" disabled={disabled} onChange={(event) => updateField('objectAddress', event.target.value)} required value={form.objectAddress} />
          </label>
        </section>
      ) : null}

      {stepIndex === 2 ? (
        <section className="registration-section">
          <h2>Тип приєднання</h2>
          <label className="field-block">
            <span>Тип послуги</span>
            <select className="field-input" disabled={disabled} onChange={(event) => updateField('connectionType', event.target.value)} value={form.connectionType}>
              <option value="standard">Приєднання до теплових мереж</option>
              <option value="temporary">Тимчасове приєднання</option>
            </select>
          </label>
          <div className="questionnaire-type-grid field-block--wide">
            {getApplicationTypeOptions().map((typeConfig) => (
              <button
                className={selectedApplicationType.id === typeConfig.id ? 'questionnaire-type-card is-active' : 'questionnaire-type-card'}
                disabled={disabled}
                key={typeConfig.id}
                onClick={() => updateApplicationType(typeConfig.id)}
                type="button"
              >
                <strong>{typeConfig.userLabel}</strong>
                <span>{typeConfig.appendix}. {typeConfig.title}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {stepIndex === 3 ? (
        <section className="registration-section">
          <div className="appendix-form-section field-block--wide">
            <div>
              <span className="section-kicker">{selectedApplicationType.appendix}</span>
              <h3>{selectedApplicationType.title}</h3>
              <p className="muted-copy">
                {selectedApplicationType.description} Якщо ви не знаєте окреме значення, залиште поле порожнім. Оператор уточнить дані під час розгляду заявки.
              </p>
            </div>
          </div>
          <DynamicApplicationFields applicationType={selectedApplicationType} disabled={disabled} onChange={updateField} values={form} />
        </section>
      ) : null}

      {stepIndex === 4 ? (
        <section className="registration-section">
          <h2>Документи / додаткові матеріали</h2>
          <p className="muted-copy field-block--wide">
            Завантаження файлів у публічній формі буде підключено окремо. Якщо оператору знадобляться додаткові матеріали, заяву буде повернуто на доповнення.
          </p>
          <label className="field-block field-block--wide">
            <span>Підстава або причина приєднання</span>
            <textarea className="field-input field-textarea" disabled={disabled} onChange={(event) => updateField('connectionReason', event.target.value)} rows={3} value={form.connectionReason} />
          </label>
          <label className="field-block field-block--wide">
            <span>Примітки</span>
            <textarea className="field-input field-textarea" disabled={disabled} onChange={(event) => updateField('notes', event.target.value)} rows={3} value={form.notes} />
          </label>
        </section>
      ) : null}

      {stepIndex === 5 ? (
        <section className="registration-section">
          <h2>Перевірка</h2>
          <div className="appendix-data-grid field-block--wide">
            <span><strong>Заявник</strong>{form.fullName}</span>
            <span><strong>Email</strong>{form.email}</span>
            <span><strong>Телефон</strong>{form.phone}</span>
            <span><strong>Об’єкт</strong>{form.objectName || form.objectAddress}</span>
            <span><strong>Адреса об’єкта</strong>{form.objectAddress}</span>
            <span><strong>Тип</strong>{selectedApplicationType.appendix}. {selectedApplicationType.title}</span>
          </div>
          <p className="muted-copy field-block--wide">
            Після подання буде створено тимчасовий кабінет заявки. Повноцінний особистий кабінет відкриється після прийняття заявки оператором.
          </p>
        </section>
      ) : null}

      <div className="form-actions field-block--wide">
        {onCancel ? (
          <button className="secondary-button" disabled={disabled} onClick={onCancel} type="button">Скасувати</button>
        ) : null}
        <button className="secondary-button" disabled={disabled || stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(current - 1, 0))} type="button">
          Назад
        </button>
        <button className="primary-button" disabled={disabled} type="submit">
          {isLastStep ? (disabled ? 'Подання...' : submitLabel) : 'Далі'}
        </button>
      </div>
    </form>
  );
}
