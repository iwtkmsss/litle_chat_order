import { useState } from 'react';
import {
  DEFAULT_APPLICATION_TYPE_ID,
  createEmptyQuestionnaireValues,
  getApplicationTypeConfig,
  getApplicationTypeOptions,
} from '../config/applicationFormConfig';
import { DynamicApplicationFields } from './forms/DynamicApplicationFields';

function createInitialForm(user) {
  return {
    stationId: user.stationId ? String(user.stationId) : '',
    phone: '',
    email: '',
    mailingAddress: '',
    connectionReason: '',
    connectionType: 'standard',
    questionnaireType: DEFAULT_APPLICATION_TYPE_ID,
    notes: '',
    ...createEmptyQuestionnaireValues(DEFAULT_APPLICATION_TYPE_ID),
    customerName: user.fullName ?? '',
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

export function CustomerApplicationForm({
  disabled,
  onCancel,
  onSubmit,
  stations,
  user,
}) {
  const [form, setForm] = useState(() => createInitialForm(user));
  const selectedApplicationType = getApplicationTypeConfig(form.questionnaireType);

  function updateField(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'phone' && !current.customerPhone ? { customerPhone: value } : {}),
      ...(key === 'email' && !current.customerEmail ? { customerEmail: value, notificationMethod: value } : {}),
      ...(key === 'mailingAddress' && !current.customerAddress ? { customerAddress: value } : {}),
    }));
  }

  function updateApplicationType(typeId) {
    setForm((current) => preserveSharedValues(current, typeId));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await onSubmit({
      ...form,
      customerName: form.customerName || user.fullName,
      customerAddress: form.customerAddress || form.mailingAddress,
      customerEmail: form.customerEmail || form.email,
      customerPhone: form.customerPhone || form.phone,
      notificationMethod: form.notificationMethod || form.email,
    });
  }

  return (
    <form className="registration-form customer-application-form" onSubmit={handleSubmit}>
      <section className="registration-section">
        <h2>Нова заява</h2>

        <label className="field-block field-block--wide">
          <span>Станція/компанія</span>
          <select
            className="field-input"
            disabled={disabled}
            onChange={(event) => updateField('stationId', event.target.value)}
            required
            value={form.stationId}
          >
            <option value="">Оберіть станцію</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field-block">
          <span>Телефон</span>
          <input
            className="field-input"
            disabled={disabled}
            onChange={(event) => updateField('phone', event.target.value)}
            required
            type="tel"
            value={form.phone}
          />
        </label>

        <label className="field-block">
          <span>Email для листування</span>
          <input
            className="field-input"
            disabled={disabled}
            onChange={(event) => updateField('email', event.target.value)}
            required
            type="email"
            value={form.email}
          />
        </label>

        <label className="field-block field-block--wide">
          <span>Адреса для листування</span>
          <input
            className="field-input"
            disabled={disabled}
            onChange={(event) => updateField('mailingAddress', event.target.value)}
            required
            value={form.mailingAddress}
          />
        </label>

        <label className="field-block">
          <span>Тип приєднання</span>
          <select
            className="field-input"
            disabled={disabled}
            onChange={(event) => updateField('connectionType', event.target.value)}
            value={form.connectionType}
          >
            <option value="standard">Приєднання до теплових мереж</option>
            <option value="temporary">Тимчасове приєднання</option>
          </select>
        </label>

        <label className="field-block field-block--wide">
          <span>Підстава або причина приєднання</span>
          <textarea
            className="field-input field-textarea"
            disabled={disabled}
            onChange={(event) => updateField('connectionReason', event.target.value)}
            rows={3}
            value={form.connectionReason}
          />
        </label>
      </section>

      <section className="registration-section">
        <div className="appendix-form-section field-block--wide">
          <div>
            <span className="section-kicker">Опитувальний лист</span>
            <h3>{selectedApplicationType.appendix}. {selectedApplicationType.title}</h3>
            <p className="muted-copy">{selectedApplicationType.description}</p>
          </div>

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
        </div>

        <DynamicApplicationFields
          applicationType={selectedApplicationType}
          disabled={disabled}
          onChange={updateField}
          values={form}
        />

        <label className="field-block field-block--wide">
          <span>Примітки</span>
          <textarea
            className="field-input field-textarea"
            disabled={disabled}
            onChange={(event) => updateField('notes', event.target.value)}
            rows={3}
            value={form.notes}
          />
        </label>
      </section>

      <div className="form-actions field-block--wide">
        <button className="secondary-button" disabled={disabled} onClick={onCancel} type="button">
          Скасувати
        </button>
        <button className="primary-button" disabled={disabled} type="submit">
          {disabled ? 'Подання...' : 'Подати заяву'}
        </button>
      </div>
    </form>
  );
}
