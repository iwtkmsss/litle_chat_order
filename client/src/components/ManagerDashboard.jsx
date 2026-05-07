import { useEffect, useEffectEvent, useState } from 'react';
import { api } from '../api';
import {
  applicationStatusLabels,
  connectionTypeLabels,
  stageStatusLabels,
  stageStatusOptions,
} from '../connectionContent';
import { formatDate, formatDateTime } from '../utils';
import { ChatRoom } from './ChatRoom';

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function createEmptyApplicationForm() {
  return {
    applicationNumber: '',
    applicantFullName: '',
    phone: '',
    email: '',
    objectAddress: '',
    connectionType: 'standard',
    status: 'in_progress',
    receivedAt: getToday(),
    responsibleName: '',
    notes: '',
    customerUserId: '',
    appendixData: {
      appendix3: {
        operatorRecipient: '',
        mailingAddress: '',
        operatorName: '',
        objectName: '',
        connectionReason: '',
        representativeName: '',
        representativePhone: '',
        representativeEmail: '',
      },
      questionnaire: {
        type: 'heat_use',
        customerInfo: '',
        designOrganization: '',
        constructionObject: '',
        constructionStartYear: '',
        commissioningYear: '',
        permittedHeatLoad: '',
        heatSupplyContractNumber: '',
        personalAccountNumber: '',
        additionalHeatLoad: '',
        totalHeatLoad: '',
        heatingLoad: '',
        hotWaterMaxLoad: '',
        hotWaterAverageLoad: '',
        ventilationLoad: '',
        technologyLoad: '',
        additionalCapacity: '',
        totalCapacity: '',
        projectDeveloper: '',
        constructionExecutor: '',
        existingHeatSource: '',
        heatObjectDescription: '',
        thirdPartyConnection: '',
        notificationMethod: '',
      },
    },
  };
}

function getStageDraft(stage) {
  return {
    status: stage.status,
    startedAt: stage.startedAt ?? '',
    completedAt: stage.completedAt ?? '',
    publicNote: stage.publicNote ?? '',
    isVisible: stage.isVisible,
  };
}

const appendix3Fields = [
  ['operatorRecipient', 'Керівнику / Оператор'],
  ['mailingAddress', 'Адреса для листування'],
  ['operatorName', 'Найменування Оператора'],
  ['objectName', 'Об’єкт у заяві'],
  ['connectionReason', 'Причина приєднання'],
  ['representativeName', 'Відповідальна особа'],
  ['representativePhone', 'Телефон відповідальної особи'],
  ['representativeEmail', 'Email відповідальної особи'],
];

const questionnaireFields = [
  ['customerInfo', 'Дані замовника'],
  ['designOrganization', 'Проєктна організація'],
  ['constructionObject', 'Об’єкт будівництва / реконструкції'],
  ['constructionStartYear', 'Рік початку будівництва'],
  ['commissioningYear', 'Рік введення в експлуатацію'],
  ['permittedHeatLoad', 'Дозволене теплове навантаження'],
  ['heatSupplyContractNumber', 'Договір теплової енергії №'],
  ['personalAccountNumber', 'Особовий рахунок №'],
  ['additionalHeatLoad', 'Додаткове теплове навантаження'],
  ['totalHeatLoad', 'Загальне теплове навантаження'],
  ['additionalCapacity', 'Додаткова технічна потужність'],
  ['totalCapacity', 'Загальна технічна потужність'],
  ['heatingLoad', 'Опалення'],
  ['hotWaterMaxLoad', 'ГВП максимальне'],
  ['hotWaterAverageLoad', 'ГВП середнє'],
  ['ventilationLoad', 'Вентиляція'],
  ['technologyLoad', 'Технологія'],
  ['projectDeveloper', 'Проєкт МО забезпечує'],
  ['constructionExecutor', 'Виконавець будівельних робіт'],
  ['existingHeatSource', 'Існуюче джерело теплопостачання'],
  ['heatObjectDescription', 'Об’єкт теплофікації'],
  ['thirdPartyConnection', 'Підключення третіх осіб'],
  ['notificationMethod', 'Спосіб повідомлення'],
];

export function ManagerDashboard({ onLogout }) {
  const [users, setUsers] = useState([]);
  const [applications, setApplications] = useState([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const [stageDrafts, setStageDrafts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [panelMessage, setPanelMessage] = useState('');
  const [userForm, setUserForm] = useState({ fullName: '', password: '' });
  const [applicationForm, setApplicationForm] = useState(createEmptyApplicationForm);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isCreatingApplication, setIsCreatingApplication] = useState(false);
  const [savingStageId, setSavingStageId] = useState(null);
  const [deletingApplicationId, setDeletingApplicationId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);

  const loadDashboard = useEffectEvent(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsLoading(true);
      setError('');
    }

    try {
      const [usersResponse, applicationsResponse] = await Promise.all([
        api.listUsers(),
        api.listApplications(),
      ]);

      setUsers(usersResponse.users);
      setApplications(applicationsResponse.applications);
      setSelectedApplicationId((current) => {
        if (applicationsResponse.applications.some((application) => application.id === current)) {
          return current;
        }

        return applicationsResponse.applications[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  });

  useEffect(() => {
    loadDashboard();
  }, []);

  const selectedApplication =
    applications.find((application) => application.id === selectedApplicationId) ?? null;

  useEffect(() => {
    if (!selectedApplication) {
      setStageDrafts({});
      return;
    }

    setStageDrafts(
      Object.fromEntries(
        selectedApplication.stages.map((stage) => [stage.id, getStageDraft(stage)]),
      ),
    );
  }, [selectedApplication?.id, selectedApplication?.updatedAt]);

  async function handleCreateUser(event) {
    event.preventDefault();
    setIsCreatingUser(true);
    setPanelMessage('');

    try {
      await api.createUser(userForm);
      setUserForm({ fullName: '', password: '' });
      setPanelMessage('Кабінет замовника створено.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setIsCreatingUser(false);
    }
  }

  async function handleDeleteUser(chatUser) {
    const confirmed = window.confirm(`Видалити кабінет замовника "${chatUser.fullName}"?`);

    if (!confirmed) {
      return;
    }

    setDeletingUserId(chatUser.id);
    setPanelMessage('');

    try {
      await api.deleteUser(chatUser.id);
      setPanelMessage('Кабінет замовника видалено.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setDeletingUserId(null);
    }
  }

  async function handleCreateApplication(event) {
    event.preventDefault();
    setIsCreatingApplication(true);
    setPanelMessage('');

    try {
      const response = await api.createApplication({
        ...applicationForm,
        customerUserId: applicationForm.customerUserId || null,
      });
      setApplicationForm(createEmptyApplicationForm());
      setPanelMessage('Заяву додано до реєстру.');
      await loadDashboard({ silent: true });
      setSelectedApplicationId(response.application.id);
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setIsCreatingApplication(false);
    }
  }

  async function handleDeleteApplication(application) {
    const confirmed = window.confirm(`Видалити заяву "${application.applicationNumber}"?`);

    if (!confirmed) {
      return;
    }

    setDeletingApplicationId(application.id);
    setPanelMessage('');

    try {
      await api.deleteApplication(application.id);
      setPanelMessage('Заяву видалено.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setDeletingApplicationId(null);
    }
  }

  async function handleSaveStage(stage) {
    if (!selectedApplication) {
      return;
    }

    setSavingStageId(stage.id);
    setPanelMessage('');

    try {
      const response = await api.updateApplicationStage(
        selectedApplication.id,
        stage.id,
        stageDrafts[stage.id],
      );

      setApplications((current) =>
        current.map((application) =>
          application.id === response.application.id ? response.application : application,
        ),
      );
      setPanelMessage('Етап оновлено. Email-лист підготовлено, якщо вказано дату виконання.');
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setSavingStageId(null);
    }
  }

  function updateStageDraft(stageId, patch) {
    setStageDrafts((current) => ({
      ...current,
      [stageId]: {
        ...current[stageId],
        ...patch,
      },
    }));
  }

  function updateAppendixField(section, field, value) {
    setApplicationForm((current) => ({
      ...current,
      appendixData: {
        ...current.appendixData,
        [section]: {
          ...current.appendixData[section],
          [field]: value,
        },
      },
    }));
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <span className="section-kicker">Виробничо-технічний відділ</span>
          <h1>Реєстр заявників</h1>
          <p className="muted-copy">
            Приєднання до теплових мереж, етапи виконання, документи та листування.
          </p>
        </div>

        <div className="header-actions">
          <button className="secondary-button" onClick={() => loadDashboard()} type="button">
            Оновити
          </button>
          <button className="primary-button" onClick={onLogout} type="button">
            Вийти
          </button>
        </div>
      </header>

      {panelMessage ? <p className="manager-message">{panelMessage}</p> : null}
      {error ? <p className="form-error manager-message">{error}</p> : null}

      <section className="manager-top-grid">
        <section className="surface-card manager-card">
          <div className="section-header">
            <div>
              <span className="section-kicker">Особистий кабінет</span>
              <h2>Новий замовник</h2>
            </div>
          </div>

          <form className="stack-form" onSubmit={handleCreateUser}>
            <label className="field-block">
              <span>Прізвище Ім’я По батькові</span>
              <input
                className="field-input"
                disabled={isCreatingUser}
                onChange={(event) =>
                  setUserForm((current) => ({ ...current, fullName: event.target.value }))
                }
                required
                value={userForm.fullName}
              />
            </label>

            <label className="field-block">
              <span>Пароль</span>
              <input
                className="field-input"
                disabled={isCreatingUser}
                onChange={(event) =>
                  setUserForm((current) => ({ ...current, password: event.target.value }))
                }
                required
                type="password"
                value={userForm.password}
              />
            </label>

            <button className="primary-button" disabled={isCreatingUser} type="submit">
              {isCreatingUser ? 'Створення...' : 'Створити кабінет'}
            </button>
          </form>
        </section>

        <section className="surface-card manager-card">
          <div className="section-header">
            <div>
              <span className="section-kicker">Реєстр</span>
              <h2>Нова заява на приєднання</h2>
            </div>
          </div>

          <form className="application-form" onSubmit={handleCreateApplication}>
            <label className="field-block">
              <span>Номер заяви</span>
              <input
                className="field-input"
                disabled={isCreatingApplication}
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
                disabled={isCreatingApplication}
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
                {users.map((chatUser) => (
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
                disabled={isCreatingApplication}
                onChange={(event) =>
                  setApplicationForm((current) => ({ ...current, applicantFullName: event.target.value }))
                }
                required
                value={applicationForm.applicantFullName}
              />
            </label>

            <label className="field-block">
              <span>Номер телефону</span>
              <input
                className="field-input"
                disabled={isCreatingApplication}
                onChange={(event) =>
                  setApplicationForm((current) => ({ ...current, phone: event.target.value }))
                }
                required
                value={applicationForm.phone}
              />
            </label>

            <label className="field-block">
              <span>Email для поштових листів</span>
              <input
                className="field-input"
                disabled={isCreatingApplication}
                onChange={(event) =>
                  setApplicationForm((current) => ({ ...current, email: event.target.value }))
                }
                type="email"
                value={applicationForm.email}
              />
            </label>

            <label className="field-block field-block--wide">
              <span>Об’єкт або адреса приєднання</span>
              <input
                className="field-input"
                disabled={isCreatingApplication}
                onChange={(event) =>
                  setApplicationForm((current) => ({ ...current, objectAddress: event.target.value }))
                }
                required
                value={applicationForm.objectAddress}
              />
            </label>

            <label className="field-block">
              <span>Тип приєднання</span>
              <select
                className="field-input"
                disabled={isCreatingApplication}
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
                disabled={isCreatingApplication}
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
                disabled={isCreatingApplication}
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
                disabled={isCreatingApplication}
                onChange={(event) =>
                  setApplicationForm((current) => ({ ...current, notes: event.target.value }))
                }
                rows={3}
                value={applicationForm.notes}
              />
            </label>

            <div className="appendix-form-section field-block--wide">
              <div>
                <span className="section-kicker">Додаток 3</span>
                <h3>Заява на приєднання</h3>
              </div>

              <label className="field-block">
                <span>Керівнику / найменування Оператора</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('appendix3', 'operatorRecipient', event.target.value)}
                  value={applicationForm.appendixData.appendix3.operatorRecipient}
                />
              </label>

              <label className="field-block">
                <span>Адреса для листування</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('appendix3', 'mailingAddress', event.target.value)}
                  value={applicationForm.appendixData.appendix3.mailingAddress}
                />
              </label>

              <label className="field-block">
                <span>Найменування Оператора в заяві</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('appendix3', 'operatorName', event.target.value)}
                  value={applicationForm.appendixData.appendix3.operatorName}
                />
              </label>

              <label className="field-block">
                <span>Найменування та адреса об’єкта</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('appendix3', 'objectName', event.target.value)}
                  value={applicationForm.appendixData.appendix3.objectName}
                />
              </label>

              <label className="field-block field-block--wide">
                <span>Причина приєднання</span>
                <select
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('appendix3', 'connectionReason', event.target.value)}
                  value={applicationForm.appendixData.appendix3.connectionReason}
                >
                  <option value="">Не вказано</option>
                  <option value="Об’єкт не був підключений до теплових мереж Оператора">
                    Об’єкт не був підключений до теплових мереж Оператора
                  </option>
                  <option value="Збільшення теплового навантаження або теплової потужності об’єкта">
                    Збільшення теплового навантаження або теплової потужності об’єкта
                  </option>
                  <option value="Зміна вимог до надійності транспортування та якості теплової енергії">
                    Зміна вимог до надійності транспортування та якості теплової енергії
                  </option>
                  <option value="Зміна вимог нормативно-правових актів">
                    Зміна вимог нормативно-правових актів
                  </option>
                </select>
              </label>

              <label className="field-block">
                <span>Відповідальна особа замовника</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('appendix3', 'representativeName', event.target.value)}
                  value={applicationForm.appendixData.appendix3.representativeName}
                />
              </label>

              <label className="field-block">
                <span>Телефон відповідальної особи</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('appendix3', 'representativePhone', event.target.value)}
                  value={applicationForm.appendixData.appendix3.representativePhone}
                />
              </label>

              <label className="field-block">
                <span>Email відповідальної особи</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('appendix3', 'representativeEmail', event.target.value)}
                  type="email"
                  value={applicationForm.appendixData.appendix3.representativeEmail}
                />
              </label>
            </div>

            <div className="appendix-form-section field-block--wide">
              <div>
                <span className="section-kicker">Додаток 4 / Додаток 5</span>
                <h3>Опитувальний лист</h3>
              </div>

              <label className="field-block">
                <span>Тип опитувального листа</span>
                <select
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'type', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.type}
                >
                  <option value="heat_use">Додаток 4 - тепловикористальні установки</option>
                  <option value="generation">Додаток 5 - теплогенеруючі/когенераційні установки</option>
                </select>
              </label>

              <label className="field-block">
                <span>Дані замовника</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'customerInfo', event.target.value)}
                  placeholder="Найменування, адреса, адмінрайон, email, телефон"
                  value={applicationForm.appendixData.questionnaire.customerInfo}
                />
              </label>

              <label className="field-block">
                <span>Проєктна організація</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'designOrganization', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.designOrganization}
                />
              </label>

              <label className="field-block">
                <span>Планується будівництво / реконструкція об’єкта</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'constructionObject', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.constructionObject}
                />
              </label>

              <label className="field-block">
                <span>Рік початку будівництва</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'constructionStartYear', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.constructionStartYear}
                />
              </label>

              <label className="field-block">
                <span>Рік введення в експлуатацію</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'commissioningYear', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.commissioningYear}
                />
              </label>

              <label className="field-block">
                <span>Дозволене теплове навантаження</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'permittedHeatLoad', event.target.value)}
                  placeholder="Гкал/год або МВт"
                  value={applicationForm.appendixData.questionnaire.permittedHeatLoad}
                />
              </label>

              <label className="field-block">
                <span>Договір користування / постачання теплової енергії №</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'heatSupplyContractNumber', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.heatSupplyContractNumber}
                />
              </label>

              <label className="field-block">
                <span>Особовий рахунок №</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'personalAccountNumber', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.personalAccountNumber}
                />
              </label>

              <label className="field-block">
                <span>Додаткове теплове навантаження</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'additionalHeatLoad', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.additionalHeatLoad}
                />
              </label>

              <label className="field-block">
                <span>Загальне теплове навантаження</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'totalHeatLoad', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.totalHeatLoad}
                />
              </label>

              <label className="field-block">
                <span>Додаткова технічна потужність у точці приєднання</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'additionalCapacity', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.additionalCapacity}
                />
              </label>

              <label className="field-block">
                <span>Загальна технічна потужність у точці приєднання</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'totalCapacity', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.totalCapacity}
                />
              </label>

              <label className="field-block">
                <span>Опалення</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'heatingLoad', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.heatingLoad}
                />
              </label>

              <label className="field-block">
                <span>Гаряче водопостачання максимальне</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'hotWaterMaxLoad', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.hotWaterMaxLoad}
                />
              </label>

              <label className="field-block">
                <span>Гаряче водопостачання середнє</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'hotWaterAverageLoad', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.hotWaterAverageLoad}
                />
              </label>

              <label className="field-block">
                <span>Вентиляція</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'ventilationLoad', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.ventilationLoad}
                />
              </label>

              <label className="field-block">
                <span>Технологія</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'technologyLoad', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.technologyLoad}
                />
              </label>

              <label className="field-block">
                <span>Розробку проєкту мереж Оператора забезпечує</span>
                <select
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'projectDeveloper', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.projectDeveloper}
                >
                  <option value="">Не вказано</option>
                  <option value="Оператор">Оператор</option>
                  <option value="Замовник">Замовник</option>
                </select>
              </label>

              <label className="field-block">
                <span>Виконавець будівельних робіт</span>
                <select
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'constructionExecutor', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.constructionExecutor}
                >
                  <option value="">Не вказано</option>
                  <option value="Оператор">Оператор</option>
                  <option value="Інший суб’єкт господарювання">Інший суб’єкт господарювання</option>
                </select>
              </label>

              <label className="field-block field-block--wide">
                <span>Стислі дані про існуюче джерело теплопостачання</span>
                <textarea
                  className="field-input field-textarea"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'existingHeatSource', event.target.value)}
                  rows={3}
                  value={applicationForm.appendixData.questionnaire.existingHeatSource}
                />
              </label>

              <label className="field-block field-block--wide">
                <span>Стислі дані про об’єкт теплофікації</span>
                <textarea
                  className="field-input field-textarea"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'heatObjectDescription', event.target.value)}
                  rows={3}
                  value={applicationForm.appendixData.questionnaire.heatObjectDescription}
                />
              </label>

              <label className="field-block">
                <span>Підключення третіх осіб</span>
                <select
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'thirdPartyConnection', event.target.value)}
                  value={applicationForm.appendixData.questionnaire.thirdPartyConnection}
                >
                  <option value="">Не вказано</option>
                  <option value="так">так</option>
                  <option value="ні">ні</option>
                </select>
              </label>

              <label className="field-block">
                <span>Повідомлення надати</span>
                <input
                  className="field-input"
                  disabled={isCreatingApplication}
                  onChange={(event) => updateAppendixField('questionnaire', 'notificationMethod', event.target.value)}
                  placeholder="За місцем подання, email або пошта"
                  value={applicationForm.appendixData.questionnaire.notificationMethod}
                />
              </label>
            </div>

            <button className="primary-button field-block--wide" disabled={isCreatingApplication} type="submit">
              {isCreatingApplication ? 'Додавання...' : 'Додати заяву'}
            </button>
          </form>
        </section>
      </section>

      <section className="manager-simple-grid">
        <section className="surface-card manager-card">
          <div className="section-header">
            <div>
              <h2>Заяви</h2>
              <p className="muted-copy">Телефон, ПІБ, номер заяви та поточний прогрес.</p>
            </div>
            <span className="counter-chip">{applications.length}</span>
          </div>

          {isLoading ? <p className="muted-copy">Завантаження...</p> : null}
          {!isLoading && applications.length === 0 ? <p className="muted-copy">Заяв ще немає.</p> : null}

          <div className="application-list">
            {applications.map((application) => (
              <article
                className={
                  application.id === selectedApplicationId
                    ? 'application-card is-active'
                    : 'application-card'
                }
                key={application.id}
              >
                <button
                  className="application-card__main"
                  onClick={() => setSelectedApplicationId(application.id)}
                  type="button"
                >
                  <span className="section-kicker">{application.applicationNumber}</span>
                  <strong>{application.applicantFullName}</strong>
                  <span>{application.objectAddress}</span>
                  <span>
                    {application.stageSummary.completed}/{application.stageSummary.total} етапів ·{' '}
                    {applicationStatusLabels[application.status]}
                  </span>
                </button>

                <div className="application-card__actions">
                  <button
                    className="danger-button"
                    disabled={deletingApplicationId === application.id}
                    onClick={() => handleDeleteApplication(application)}
                    type="button"
                  >
                    {deletingApplicationId === application.id ? 'Видалення...' : 'Видалити'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="surface-card manager-card">
          <div className="section-header">
            <div>
              <h2>Кабінети замовників</h2>
              <p className="muted-copy">Доступ до особистого кабінету та чату по заяві.</p>
            </div>
            <span className="counter-chip">{users.length}</span>
          </div>

          <div className="entity-list">
            {users.map((chatUser) => (
              <article className="entity-row" key={chatUser.id}>
                <div className="entity-main">
                  <strong>{chatUser.fullName}</strong>
                  <small>{formatDateTime(chatUser.createdAt)}</small>
                </div>

                <button
                  className="danger-button"
                  disabled={deletingUserId === chatUser.id}
                  onClick={() => handleDeleteUser(chatUser)}
                  type="button"
                >
                  {deletingUserId === chatUser.id ? 'Видалення...' : 'Видалити'}
                </button>
              </article>
            ))}
          </div>
        </section>
      </section>

      {selectedApplication ? (
        <section className="application-detail-grid">
          <section className="surface-card manager-card">
            <div className="section-header">
              <div>
                <span className="section-kicker">Заява {selectedApplication.applicationNumber}</span>
                <h2>{selectedApplication.applicantFullName}</h2>
                <p className="muted-copy">{selectedApplication.objectAddress}</p>
              </div>
            </div>

            <div className="detail-meta-grid">
              <span>{connectionTypeLabels[selectedApplication.connectionType]}</span>
              <span>{applicationStatusLabels[selectedApplication.status]}</span>
              <span>Телефон: {selectedApplication.phone}</span>
              <span>Email: {selectedApplication.email || 'не вказано'}</span>
              <span>Дата заяви: {formatDate(selectedApplication.receivedAt)}</span>
              <span>Відповідальний: {selectedApplication.responsibleName || 'не вказано'}</span>
            </div>

            {selectedApplication.notes ? <p className="stage-note">{selectedApplication.notes}</p> : null}

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
                  {selectedApplication.appendixData?.questionnaire?.type === 'generation'
                    ? 'Додаток 5 - теплогенеруючі/когенераційні установки'
                    : 'Додаток 4 - тепловикористальні установки'}
                </span>
                {questionnaireFields
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

          <section className="surface-card manager-card">
            <div className="section-header">
              <div>
                <h2>Поштові листи</h2>
                <p className="muted-copy">Заглушка майбутньої email-інтеграції.</p>
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
                    <span>{notification.recipientEmail || 'email не вказано'} · {notification.status}</span>
                    <small>{formatDateTime(notification.createdAt)}</small>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="surface-card manager-card application-detail-grid__wide">
            <div className="section-header">
              <div>
                <h2>Етапи виконання приєднання</h2>
                <p className="muted-copy">
                  Замовник бачить видимі етапи після натискання кнопки «Отримати інформацію».
                </p>
              </div>
            </div>

            <div className="stage-editor-list">
              {selectedApplication.stages.map((stage) => {
                const draft = stageDrafts[stage.id] ?? getStageDraft(stage);

                return (
                  <article className="stage-editor" key={stage.id}>
                    <div className="stage-editor__title">
                      <span className="counter-chip">{stage.sortOrder}</span>
                      <div>
                        <h3>{stage.title}</h3>
                        <p className="muted-copy">{stage.description}</p>
                      </div>
                    </div>

                    <div className="stage-editor__controls">
                      <label className="field-block">
                        <span>Стадія виконання</span>
                        <select
                          className="field-input"
                          onChange={(event) => updateStageDraft(stage.id, { status: event.target.value })}
                          value={draft.status}
                        >
                          {stageStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field-block">
                        <span>Дата початку</span>
                        <input
                          className="field-input"
                          onChange={(event) => updateStageDraft(stage.id, { startedAt: event.target.value })}
                          type="date"
                          value={draft.startedAt}
                        />
                      </label>

                      <label className="field-block">
                        <span>Виконано, дата виконання</span>
                        <input
                          className="field-input"
                          onChange={(event) => updateStageDraft(stage.id, { completedAt: event.target.value })}
                          type="date"
                          value={draft.completedAt}
                        />
                      </label>
                    </div>

                    <label className="field-block">
                      <span>Коментар для замовника</span>
                      <textarea
                        className="field-input field-textarea"
                        onChange={(event) => updateStageDraft(stage.id, { publicNote: event.target.value })}
                        rows={3}
                        value={draft.publicNote}
                      />
                    </label>

                    <div className="stage-editor__footer">
                      <label className="access-toggle">
                        <input
                          checked={draft.isVisible}
                          onChange={(event) => updateStageDraft(stage.id, { isVisible: event.target.checked })}
                          type="checkbox"
                        />
                        <span>Показувати замовнику</span>
                      </label>

                      <span className="muted-copy">{stageStatusLabels[stage.status]}</span>

                      <button
                        className="primary-button"
                        disabled={savingStageId === stage.id}
                        onClick={() => handleSaveStage(stage)}
                        type="button"
                      >
                        {savingStageId === stage.id ? 'Збереження...' : 'Зберегти етап'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="application-detail-grid__wide">
            <ChatRoom
              chat={selectedApplication.chat}
              emptyTitle="Немає заяви"
              onThreadUpdated={() => loadDashboard({ silent: true })}
            />
          </section>
        </section>
      ) : null}
    </main>
  );
}
