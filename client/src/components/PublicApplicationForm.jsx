import { useMemo, useState } from 'react';
import {
  CONNECTION_REASON_OPTIONS,
  DEFAULT_APPLICATION_TYPE_ID,
  createEmptyQuestionnaireValues,
  getConnectionReasonLabel,
  getApplicationTypeConfig,
  getApplicationTypeOptions,
  getUnitFieldName,
} from '../config/applicationFormConfig';
import { UKRAINE_REGIONS } from '../config/ukraineRegions';
import {
  formatUkrainianPhone,
  normalizeUkrainianPhone,
  UKRAINIAN_PHONE_PREFIX,
  validateUkrainianPhone,
} from '../utils';
import { DynamicApplicationFields } from './forms/DynamicApplicationFields';
import { ToastMessage } from './ToastMessage';

const stepTitles = [
  'Дані заявника',
  'Дані об’єкта для підключення',
  'Тип приєднання',
  'Опитувальний лист',
  'Додаткові матеріали',
  'Перевірка',
];

const hiddenQuestionnaireFields = [
  'customerName',
  'customerAddress',
  'customerDistrict',
  'customerEmail',
  'customerPhone',
  'objectName',
  'objectAddress',
  'plannedWorks',
  'constructionStartYear',
  'commissioningYear',
];

const RESPONSE_METHOD_EMAIL = 'Електронною поштою';
const RESPONSE_METHOD_POST = 'Поштою';
const RESPONSE_METHOD_IN_PERSON = 'За місцем подання заяви';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneFieldNames = new Set(['phone', 'customerPhone', 'designOrganizationPhone', 'representativePhone']);

export function createPublicApplicationInitialValues(application = null) {
  const questionnaire = application?.appendixData?.questionnaire ?? {};
  const appendix3 = application?.appendixData?.appendix3 ?? {};
  const questionnaireType = questionnaire.type || DEFAULT_APPLICATION_TYPE_ID;

  return {
    fullName: application?.applicantFullName ?? questionnaire.customerName ?? '',
    objectRegion: application?.objectRegion ?? questionnaire.objectRegion ?? '',
    phone: application?.phone ?? questionnaire.customerPhone ?? '',
    email: application?.email ?? questionnaire.customerEmail ?? '',
    mailingAddress: appendix3.mailingAddress ?? questionnaire.customerAddress ?? '',
    customerDistrict: questionnaire.customerDistrict ?? '',
    objectName: appendix3.objectName ?? questionnaire.objectName ?? '',
    objectAddress: application?.objectAddress ?? questionnaire.objectAddress ?? '',
    plannedWorks: questionnaire.plannedWorks ?? '',
    constructionStartYear: questionnaire.constructionStartYear ?? '',
    commissioningYear: questionnaire.commissioningYear ?? '',
    connectionReason: appendix3.connectionReason ?? '',
    connectionType: application?.connectionType ?? 'standard',
    questionnaireType,
    notes: application?.notes ?? '',
    ...createEmptyQuestionnaireValues(questionnaireType),
    ...questionnaire,
  };
}

function normalizeInitialValues(values) {
  return {
    ...values,
    phone: formatUkrainianPhone(values.phone),
    customerPhone: formatUkrainianPhone(values.customerPhone || values.phone),
    designOrganizationPhone: formatUkrainianPhone(values.designOrganizationPhone),
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
    'permittedHeatLoadUnit',
  ];

  return {
    ...current,
    ...emptyValues,
    ...Object.fromEntries(sharedKeys.map((key) => [key, current[key] ?? ''])),
    questionnaireType: nextType,
    type: nextType,
  };
}

function isBlank(value) {
  return String(value ?? '').trim() === '';
}

function isValidYear(value) {
  if (isBlank(value)) {
    return true;
  }

  const year = String(value).trim();
  const numericYear = Number(year);

  return /^\d{4}$/.test(year) && numericYear >= 1900 && numericYear <= 2100;
}

function getConnectionTypeLabel(value) {
  return value === 'temporary' ? 'Тимчасове приєднання' : 'Приєднання до теплових мереж';
}

function getDefaultNotificationContact(form, responseMethod = form.responseMethod) {
  if (responseMethod === RESPONSE_METHOD_EMAIL) {
    return form.email;
  }

  if (responseMethod === RESPONSE_METHOD_POST) {
    return form.mailingAddress;
  }

  if (responseMethod === RESPONSE_METHOD_IN_PERSON) {
    return '';
  }

  return form.notificationMethod || form.email;
}

function normalizeOptionalPhone(value) {
  return isBlank(value) ? '' : normalizeUkrainianPhone(value);
}

function getVisibleQuestionnaireFields(applicationType) {
  const hiddenFieldSet = new Set(hiddenQuestionnaireFields);

  return applicationType.groups
    .flatMap((group) => group.fields)
    .filter((field) => !hiddenFieldSet.has(field.name));
}

function normalizeUnitFields(values, applicationType) {
  const nextValues = { ...values };

  applicationType.groups
    .flatMap((group) => group.fields)
    .filter((field) => field.unitOptions)
    .forEach((field) => {
      const unitFieldName = getUnitFieldName(field);

      if (isBlank(nextValues[field.name])) {
        nextValues[unitFieldName] = '';
      }
    });

  return nextValues;
}

function FieldError({ id, message }) {
  if (!message) {
    return null;
  }

  return (
    <small className="form-error field-error" id={id}>
      {message}
    </small>
  );
}

export function PublicApplicationForm({
  disabled = false,
  initialValues = null,
  onCancel,
  onSubmit,
  submitLabel = 'Подати заяву',
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState(() => normalizeInitialValues(initialValues ?? createPublicApplicationInitialValues()));
  const [toast, setToast] = useState(null);
  const selectedApplicationType = getApplicationTypeConfig(form.questionnaireType);
  const isLastStep = stepIndex === stepTitles.length - 1;
  const progress = useMemo(
    () => Math.round(((stepIndex + 1) / stepTitles.length) * 100),
    [stepIndex],
  );
  const reviewItems = useMemo(() => ([
    ['ПІБ / найменування заявника', form.fullName],
    ['Email', form.email],
    ['Телефон', form.phone],
    ['Поштова адреса для листування', form.mailingAddress],
    ['Область об’єкта', form.objectRegion],
    ['Назва об’єкта', form.objectName || form.objectAddress],
    ['Адреса об’єкта', form.objectAddress],
    ['Тип приєднання', getConnectionTypeLabel(form.connectionType)],
    ['Тип установки', `${selectedApplicationType.appendix}. ${selectedApplicationType.title}`],
    ['Спосіб отримання відповіді', form.responseMethod],
    ['Контакт для відповіді', form.notificationMethod],
    ['Причина приєднання', getConnectionReasonLabel(form.connectionReason)],
    ['Додаткова інформація для оператора', form.notes],
  ].filter(([, value]) => !isBlank(value))), [form, selectedApplicationType]);

  function clearFieldError(key) {
    setFieldErrors((current) => {
      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function updateField(key, value) {
    const nextValue = phoneFieldNames.has(key) ? formatUkrainianPhone(value) : value;
    clearFieldError(key);
    if (['email', 'mailingAddress', 'responseMethod'].includes(key)) {
      clearFieldError('notificationMethod');
    }

    setForm((current) => {
      const shouldMirrorNotification = !current.notificationMethod || current.notificationMethod === current.email || current.notificationMethod === current.mailingAddress;
      const nextState = {
        ...current,
        [key]: nextValue,
        ...(key === 'fullName' ? { customerName: nextValue } : {}),
        ...(key === 'phone' ? { customerPhone: nextValue } : {}),
        ...(key === 'email'
          ? {
            customerEmail: nextValue,
            ...(shouldMirrorNotification && current.responseMethod !== RESPONSE_METHOD_POST ? { notificationMethod: nextValue } : {}),
          }
          : {}),
        ...(key === 'mailingAddress'
          ? {
            customerAddress: nextValue,
            ...(shouldMirrorNotification && current.responseMethod === RESPONSE_METHOD_POST ? { notificationMethod: nextValue } : {}),
          }
          : {}),
        ...(key === 'objectName' ? { objectName: nextValue } : {}),
        ...(key === 'objectAddress' ? { objectAddress: nextValue } : {}),
      };

      if (key === 'responseMethod') {
        nextState.notificationMethod = getDefaultNotificationContact(nextState, nextValue);
      }

      return nextState;
    });
  }

  function updateApplicationType(typeId) {
    setForm((current) => normalizeInitialValues(preserveSharedValues(current, typeId)));
    setFieldErrors({});
  }

  function showToast(message, tone = 'error') {
    setToast({
      id: Date.now(),
      message,
      tone,
    });
  }

  function handlePrimaryPhoneFocus() {
    if (isBlank(form.phone)) {
      updateField('phone', UKRAINIAN_PHONE_PREFIX);
    }
  }

  function validateEmailField(errors, key, value, { required = false } = {}) {
    if (required && isBlank(value)) {
      errors[key] = 'Заповніть це поле.';
      return;
    }

    if (!isBlank(value) && !emailPattern.test(String(value).trim())) {
      errors[key] = 'Введіть коректну email-адресу.';
    }
  }

  function validatePhoneField(errors, key, value, { required = false } = {}) {
    if (required && isBlank(value)) {
      errors[key] = 'Заповніть це поле.';
      return;
    }

    if (!isBlank(value) && !validateUkrainianPhone(value)) {
      errors[key] = 'Введіть номер телефону у форматі +380 XX XXX XX XX.';
    }
  }

  function validateRequiredField(errors, key, value, message = 'Заповніть це поле.') {
    if (isBlank(value)) {
      errors[key] = message;
    }
  }

  function validateYearField(errors, key, value) {
    if (!isValidYear(value)) {
      errors[key] = 'Введіть рік у форматі YYYY.';
    }
  }

  function validateQuestionnaireFields(errors) {
    const visibleFields = getVisibleQuestionnaireFields(selectedApplicationType);

    visibleFields.forEach((field) => {
      if (field.required) {
        validateRequiredField(
          errors,
          field.name,
          form[field.name],
          field.name === 'responseMethod' ? 'Оберіть спосіб отримання відповіді.' : 'Заповніть це поле.',
        );
      }

      if (field.type === 'email') {
        validateEmailField(errors, field.name, form[field.name]);
      }

      if (field.type === 'tel') {
        validatePhoneField(errors, field.name, form[field.name]);
      }

      if (field.unitOptions) {
        const unitFieldName = getUnitFieldName(field);

        if (!isBlank(form[field.name]) && isBlank(form[unitFieldName])) {
          errors[unitFieldName] = 'Оберіть одиницю виміру.';
        }
      }
    });

    validateRequiredField(errors, 'responseMethod', form.responseMethod, 'Оберіть спосіб отримання відповіді.');

    if (form.responseMethod === RESPONSE_METHOD_EMAIL) {
      validateEmailField(errors, 'notificationMethod', form.notificationMethod || form.email, { required: true });
    }

    if (form.responseMethod === RESPONSE_METHOD_POST) {
      validateRequiredField(errors, 'notificationMethod', form.notificationMethod || form.mailingAddress, 'Вкажіть поштову адресу для відповіді.');
    }
  }

  function validateCurrentStep() {
    const errors = {};

    if (stepIndex === 0) {
      validateRequiredField(errors, 'fullName', form.fullName);
      validateEmailField(errors, 'email', form.email, { required: true });
      validatePhoneField(errors, 'phone', form.phone, { required: true });
      validateRequiredField(errors, 'mailingAddress', form.mailingAddress);
    }

    if (stepIndex === 1) {
      validateRequiredField(errors, 'objectRegion', form.objectRegion, 'Оберіть область, у якій розташований об’єкт підключення.');
      validateRequiredField(errors, 'objectName', form.objectName);
      validateRequiredField(errors, 'objectAddress', form.objectAddress);
      validateYearField(errors, 'constructionStartYear', form.constructionStartYear);
      validateYearField(errors, 'commissioningYear', form.commissioningYear);
    }

    if (stepIndex === 3) {
      validateQuestionnaireFields(errors);
    }

    if (stepIndex === 4) {
      validateRequiredField(errors, 'connectionReason', form.connectionReason, 'Оберіть причину приєднання.');
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      showToast('Перевірте поля форми та виправте помилки.');
      return false;
    }

    return true;
  }

  function createSubmissionPayload() {
    const normalizedPhone = normalizeUkrainianPhone(form.phone);
    const notificationMethod = form.notificationMethod || getDefaultNotificationContact(form);

    return normalizeUnitFields({
      ...form,
      phone: normalizedPhone,
      customerName: form.fullName,
      customerAddress: form.mailingAddress,
      customerDistrict: form.customerDistrict,
      customerEmail: form.email,
      customerPhone: normalizedPhone,
      designOrganizationPhone: normalizeOptionalPhone(form.designOrganizationPhone),
      objectName: form.objectName || form.objectAddress,
      objectAddress: form.objectAddress,
      objectRegion: form.objectRegion,
      plannedWorks: form.plannedWorks,
      constructionStartYear: form.constructionStartYear,
      commissioningYear: form.commissioningYear,
      notificationMethod,
    }, selectedApplicationType);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!validateCurrentStep()) {
      return;
    }

    if (!isLastStep) {
      setStepIndex((current) => Math.min(current + 1, stepTitles.length - 1));
      return;
    }

    await onSubmit(createSubmissionPayload());
  }

  return (
    <form className="registration-form public-application-form" noValidate onSubmit={handleSubmit}>
      <ToastMessage
        key={toast?.id}
        message={toast?.message}
        onClose={() => setToast(null)}
        tone={toast?.tone}
      />
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
            <span>ПІБ / найменування заявника <small className="field-unit">обов’язково</small></span>
            <input
              aria-describedby={fieldErrors.fullName ? 'fullName-error' : undefined}
              aria-invalid={Boolean(fieldErrors.fullName)}
              className="field-input"
              disabled={disabled}
              onChange={(event) => updateField('fullName', event.target.value)}
              placeholder="Наприклад: Іваненко Іван Іванович"
              required
              value={form.fullName}
            />
            <FieldError id="fullName-error" message={fieldErrors.fullName} />
          </label>
          <label className="field-block">
            <span>Email <small className="field-unit">обов’язково</small></span>
            <input
              aria-describedby={['email-help', fieldErrors.email ? 'email-error' : ''].filter(Boolean).join(' ')}
              aria-invalid={Boolean(fieldErrors.email)}
              className="field-input"
              disabled={disabled}
              onChange={(event) => updateField('email', event.target.value)}
              placeholder="name@example.com"
              required
              type="email"
              value={form.email}
            />
            <small className="field-help" id="email-help">
              На цю адресу буде прив’язана заявка та майбутній доступ до особистого кабінету.
            </small>
            <FieldError id="email-error" message={fieldErrors.email} />
          </label>
          <label className="field-block">
            <span>Номер телефону <small className="field-unit">обов’язково</small></span>
            <input
              aria-describedby={['phone-help', fieldErrors.phone ? 'phone-error' : ''].filter(Boolean).join(' ')}
              aria-invalid={Boolean(fieldErrors.phone)}
              className="field-input"
              disabled={disabled}
              inputMode="tel"
              onChange={(event) => updateField('phone', event.target.value)}
              onFocus={handlePrimaryPhoneFocus}
              placeholder="+380 67 123 45 67"
              required
              type="tel"
              value={form.phone}
            />
            <small className="field-help" id="phone-help">
              Введіть номер телефону у форматі +380 XX XXX XX XX.
            </small>
            <FieldError id="phone-error" message={fieldErrors.phone} />
          </label>
          <label className="field-block field-block--wide">
            <span>Поштова адреса для листування <small className="field-unit">обов’язково</small></span>
            <input
              aria-describedby={['mailingAddress-help', fieldErrors.mailingAddress ? 'mailingAddress-error' : ''].filter(Boolean).join(' ')}
              aria-invalid={Boolean(fieldErrors.mailingAddress)}
              className="field-input"
              disabled={disabled}
              onChange={(event) => updateField('mailingAddress', event.target.value)}
              placeholder="м. Київ, вул. Хрещатик, 1, кв. 12"
              required
              value={form.mailingAddress}
            />
            <small className="field-help" id="mailingAddress-help">
              Вкажіть фізичну адресу для офіційного листування. Це не email.
            </small>
            <FieldError id="mailingAddress-error" message={fieldErrors.mailingAddress} />
          </label>
        </section>
      ) : null}

      {stepIndex === 1 ? (
        <section className="registration-section">
          <h2>Дані об’єкта для підключення</h2>
          <p className="muted-copy field-block--wide">
            Вкажіть інформацію про об’єкт, який планується підключити до теплових мереж.
          </p>
          <label className="field-block field-block--wide">
            <span>Область, де розташований об’єкт підключення <small className="field-unit">обов’язково</small></span>
            <select
              aria-describedby={['objectRegion-help', fieldErrors.objectRegion ? 'objectRegion-error' : ''].filter(Boolean).join(' ')}
              aria-invalid={Boolean(fieldErrors.objectRegion)}
              className="field-input"
              disabled={disabled}
              onChange={(event) => updateField('objectRegion', event.target.value)}
              required
              value={form.objectRegion}
            >
              <option value="">Оберіть область</option>
              {UKRAINE_REGIONS.map((region) => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
            <small className="field-help" id="objectRegion-help">
              Оберіть область, у якій розташований об’єкт підключення. За областю система визначить відповідального менеджера.
            </small>
            <FieldError id="objectRegion-error" message={fieldErrors.objectRegion} />
          </label>
          <label className="field-block field-block--wide">
            <span>Назва об’єкта для підключення <small className="field-unit">обов’язково</small></span>
            <input
              aria-describedby={['objectName-help', fieldErrors.objectName ? 'objectName-error' : ''].filter(Boolean).join(' ')}
              aria-invalid={Boolean(fieldErrors.objectName)}
              className="field-input"
              disabled={disabled}
              onChange={(event) => updateField('objectName', event.target.value)}
              placeholder="Житловий будинок, офісна будівля, виробниче приміщення"
              required
              value={form.objectName}
            />
            <small className="field-help" id="objectName-help">
              Вкажіть назву або короткий опис об’єкта, який планується підключити.
            </small>
            <FieldError id="objectName-error" message={fieldErrors.objectName} />
          </label>
          <label className="field-block field-block--wide">
            <span>Адреса об’єкта для підключення <small className="field-unit">обов’язково</small></span>
            <input
              aria-describedby={['objectAddress-help', fieldErrors.objectAddress ? 'objectAddress-error' : ''].filter(Boolean).join(' ')}
              aria-invalid={Boolean(fieldErrors.objectAddress)}
              className="field-input"
              disabled={disabled}
              onChange={(event) => updateField('objectAddress', event.target.value)}
              placeholder="м. Київ, вул. Енергетична, 10"
              required
              value={form.objectAddress}
            />
            <small className="field-help" id="objectAddress-help">
              Вкажіть адресу об’єкта, який планується підключити до теплових мереж.
            </small>
            <FieldError id="objectAddress-error" message={fieldErrors.objectAddress} />
          </label>
          <label className="field-block">
            <span>Будівництво або реконструкція <small className="field-unit">якщо відомо</small></span>
            <select className="field-input" disabled={disabled} onChange={(event) => updateField('plannedWorks', event.target.value)} value={form.plannedWorks}>
              <option value="">Не вказано</option>
              <option value="Будівництво">Будівництво</option>
              <option value="Реконструкція">Реконструкція</option>
              <option value="Будівництво та реконструкція">Будівництво та реконструкція</option>
            </select>
          </label>
          <label className="field-block">
            <span>Рік початку робіт <small className="field-unit">якщо відомо</small></span>
            <input
              aria-describedby={['constructionStartYear-help', fieldErrors.constructionStartYear ? 'constructionStartYear-error' : ''].filter(Boolean).join(' ')}
              aria-invalid={Boolean(fieldErrors.constructionStartYear)}
              className="field-input"
              disabled={disabled}
              max="2100"
              min="1900"
              onChange={(event) => updateField('constructionStartYear', event.target.value)}
              placeholder="2026"
              type="number"
              value={form.constructionStartYear}
            />
            <small className="field-help" id="constructionStartYear-help">
              Якщо точний рік невідомий, залиште поле порожнім.
            </small>
            <FieldError id="constructionStartYear-error" message={fieldErrors.constructionStartYear} />
          </label>
          <label className="field-block">
            <span>Рік введення в експлуатацію <small className="field-unit">якщо відомо</small></span>
            <input
              aria-describedby={['commissioningYear-help', fieldErrors.commissioningYear ? 'commissioningYear-error' : ''].filter(Boolean).join(' ')}
              aria-invalid={Boolean(fieldErrors.commissioningYear)}
              className="field-input"
              disabled={disabled}
              max="2100"
              min="1900"
              onChange={(event) => updateField('commissioningYear', event.target.value)}
              placeholder="2026"
              type="number"
              value={form.commissioningYear}
            />
            <small className="field-help" id="commissioningYear-help">
              Якщо точний рік невідомий, залиште поле порожнім.
            </small>
            <FieldError id="commissioningYear-error" message={fieldErrors.commissioningYear} />
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
          <DynamicApplicationFields
            applicationType={selectedApplicationType}
            disabled={disabled}
            errors={fieldErrors}
            hiddenFields={hiddenQuestionnaireFields}
            onChange={updateField}
            requiredFields={['responseMethod']}
            values={form}
          />
        </section>
      ) : null}

      {stepIndex === 4 ? (
        <section className="registration-section">
          <h2>Документи / додаткові матеріали</h2>
          <p className="muted-copy field-block--wide">
            Завантаження файлів у публічній формі буде підключено окремо. Якщо оператору знадобляться додаткові матеріали, заяву буде повернуто на доповнення.
          </p>
          <label className="field-block field-block--wide">
            <span>Причина приєднання <small className="field-unit">обов’язково</small></span>
            <select
              aria-describedby={fieldErrors.connectionReason ? 'connectionReason-error' : undefined}
              aria-invalid={Boolean(fieldErrors.connectionReason)}
              className="field-input"
              disabled={disabled}
              onChange={(event) => updateField('connectionReason', event.target.value)}
              required
              value={form.connectionReason}
            >
              <option disabled hidden value="">Оберіть причину</option>
              {CONNECTION_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError id="connectionReason-error" message={fieldErrors.connectionReason} />
          </label>
          <label className="field-block field-block--wide">
            <span>Додаткова інформація для оператора <small className="field-unit">необов’язково</small></span>
            <textarea
              className="field-input field-textarea"
              disabled={disabled}
              onChange={(event) => updateField('notes', event.target.value)}
              placeholder="Напишіть інформацію, яку вважаєте важливою для розгляду заяви"
              rows={3}
              value={form.notes}
            />
          </label>
        </section>
      ) : null}
  
      {stepIndex === 5 ? (
        <section className="registration-section">
          <h2>Перевірка</h2>
          <div className="appendix-data-grid field-block--wide">
            {reviewItems.map(([label, value]) => (
              <span key={label}><strong>{label}</strong>{value}</span>
            ))}
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
