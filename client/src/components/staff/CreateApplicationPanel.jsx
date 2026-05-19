import { DynamicApplicationFields } from '../forms/DynamicApplicationFields';
import {
  getApplicationTypeConfig,
  getApplicationTypeOptions,
} from '../../config/applicationFormConfig';

export function CreateApplicationPanel({
  appendix3Fields,
  applicationForm,
  customerUsers,
  disabled,
  isAdmin,
  onSubmit,
  setApplicationForm,
  stations,
  updateAppendixField,
  users,
}) {
  return (
    <form className="application-form" onSubmit={onSubmit}>
      {isAdmin ? (
        <label className="field-block">
          <span>Станція/компанія</span>
          <select
            className="field-input"
            disabled={disabled}
            onChange={(event) =>
              setApplicationForm((current) => ({
                ...current,
                stationId: event.target.value,
                customerUserId: '',
              }))
            }
            required
            value={applicationForm.stationId}
          >
            <option value="">Оберіть станцію</option>
            {stations.filter((station) => station.isActive).map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="field-block">
        <span>Номер заяви</span>
        <input
          className="field-input"
          disabled={disabled}
          onChange={(event) =>
            setApplicationForm((current) => ({ ...current, applicationNumber: event.target.value }))
          }
          placeholder="Можна залишити порожнім"
          value={applicationForm.applicationNumber}
        />
      </label>

      <label className="field-block">
        <span>Кабінет замовника</span>
        <select
          className="field-input"
          disabled={disabled}
          onChange={(event) => {
            const selectedUser = users.find((chatUser) => chatUser.id === Number(event.target.value));
            setApplicationForm((current) => ({
              ...current,
              customerUserId: event.target.value,
              applicantFullName: current.applicantFullName || selectedUser?.fullName || '',
            }));
          }}
          value={applicationForm.customerUserId}
        >
          <option value="">Без прив’язки до кабінету</option>
          {customerUsers.map((chatUser) => (
            <option key={chatUser.id} value={chatUser.id}>
              {chatUser.fullName}
            </option>
          ))}
        </select>
      </label>

      <label className="field-block">
        <span>Прізвище Ім’я По батькові</span>
        <input
          className="field-input"
          disabled={disabled}
          onChange={(event) =>
            setApplicationForm((current) => ({
              ...current,
              applicantFullName: event.target.value,
              appendixData: {
                ...current.appendixData,
                questionnaire: {
                  ...current.appendixData.questionnaire,
                  customerName: current.appendixData.questionnaire.customerName || event.target.value,
                },
              },
            }))
          }
          required
          value={applicationForm.applicantFullName}
        />
      </label>

      <label className="field-block">
        <span>Номер телефону</span>
        <input
          className="field-input"
          disabled={disabled}
          onChange={(event) =>
            setApplicationForm((current) => ({
              ...current,
              phone: event.target.value,
              appendixData: {
                ...current.appendixData,
                questionnaire: {
                  ...current.appendixData.questionnaire,
                  customerPhone: current.appendixData.questionnaire.customerPhone || event.target.value,
                },
              },
            }))
          }
          required
          value={applicationForm.phone}
        />
      </label>

      <label className="field-block">
        <span>Email для листування</span>
        <input
          className="field-input"
          disabled={disabled}
          onChange={(event) =>
            setApplicationForm((current) => ({
              ...current,
              email: event.target.value,
              appendixData: {
                ...current.appendixData,
                questionnaire: {
                  ...current.appendixData.questionnaire,
                  customerEmail: current.appendixData.questionnaire.customerEmail || event.target.value,
                  notificationMethod: current.appendixData.questionnaire.notificationMethod || event.target.value,
                },
              },
            }))
          }
          type="email"
          value={applicationForm.email}
        />
      </label>

      <label className="field-block field-block--wide">
        <span>Об’єкт або адреса приєднання</span>
        <input
          className="field-input"
          disabled={disabled}
          onChange={(event) =>
            setApplicationForm((current) => ({
              ...current,
              objectAddress: event.target.value,
              appendixData: {
                ...current.appendixData,
                questionnaire: {
                  ...current.appendixData.questionnaire,
                  objectAddress: current.appendixData.questionnaire.objectAddress || event.target.value,
                },
              },
            }))
          }
          required
          value={applicationForm.objectAddress}
        />
      </label>

      <label className="field-block">
        <span>Тип приєднання</span>
        <select
          className="field-input"
          disabled={disabled}
          onChange={(event) =>
            setApplicationForm((current) => ({ ...current, connectionType: event.target.value }))
          }
          value={applicationForm.connectionType}
        >
          <option value="standard">Приєднання до теплових мереж</option>
          <option value="temporary">Тимчасове приєднання</option>
        </select>
      </label>

      <label className="field-block">
        <span>Дата отримання заяви</span>
        <input
          className="field-input"
          disabled={disabled}
          onChange={(event) =>
            setApplicationForm((current) => ({ ...current, receivedAt: event.target.value }))
          }
          required
          type="date"
          value={applicationForm.receivedAt}
        />
      </label>

      <label className="field-block field-block--wide">
        <span>Відповідальний працівник</span>
        <input
          className="field-input"
          disabled={disabled}
          onChange={(event) =>
            setApplicationForm((current) => ({ ...current, responsibleName: event.target.value }))
          }
          value={applicationForm.responsibleName}
        />
      </label>

      <label className="field-block field-block--wide">
        <span>Примітки</span>
        <textarea
          className="field-input field-textarea"
          disabled={disabled}
          onChange={(event) =>
            setApplicationForm((current) => ({ ...current, notes: event.target.value }))
          }
          rows={3}
          value={applicationForm.notes}
        />
      </label>

        <AppendixForm
          appendix3Fields={appendix3Fields}
          applicationForm={applicationForm}
          disabled={disabled}
          updateAppendixField={updateAppendixField}
        />

      <button className="primary-button field-block--wide" disabled={disabled} type="submit">
        {disabled ? 'Додавання...' : 'Додати заяву'}
      </button>
    </form>
  );
}

function AppendixForm({
  appendix3Fields,
  applicationForm,
  disabled,
  updateAppendixField,
}) {
  const questionnaireType = applicationForm.appendixData.questionnaire.type;
  const applicationType = getApplicationTypeConfig(questionnaireType);

  return (
    <>
      <div className="appendix-form-section field-block--wide">
        <div>
          <span className="section-kicker">Додаток 3</span>
          <h3>Заява на приєднання</h3>
        </div>

        {appendix3Fields.map(([key, label]) => (
          <label className="field-block" key={key}>
            <span>{label}</span>
            <input
              className="field-input"
              disabled={disabled}
              onChange={(event) => updateAppendixField('appendix3', key, event.target.value)}
              type={key.toLowerCase().includes('email') ? 'email' : 'text'}
              value={applicationForm.appendixData.appendix3[key]}
            />
          </label>
        ))}
      </div>

      <div className="appendix-form-section field-block--wide">
        <div>
          <span className="section-kicker">{applicationType.appendix}</span>
          <h3>{applicationType.title}</h3>
          <p className="muted-copy">{applicationType.description}</p>
        </div>

        <div className="questionnaire-type-grid field-block--wide">
          {getApplicationTypeOptions().map((typeConfig) => (
            <button
              className={applicationType.id === typeConfig.id ? 'questionnaire-type-card is-active' : 'questionnaire-type-card'}
              disabled={disabled}
              key={typeConfig.id}
              onClick={() => updateAppendixField('questionnaire', 'type', typeConfig.id)}
              type="button"
            >
              <strong>{typeConfig.title}</strong>
              <span>{typeConfig.appendix}</span>
            </button>
          ))}
        </div>
      </div>

      <DynamicApplicationFields
        applicationType={applicationType}
        disabled={disabled}
        onChange={(field, value) => updateAppendixField('questionnaire', field, value)}
        values={applicationForm.appendixData.questionnaire}
      />
    </>
  );
}
