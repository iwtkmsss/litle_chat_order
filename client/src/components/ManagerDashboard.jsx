import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { api, apiUrl } from '../api';
import {
  applicationStatusLabels,
  connectionTypeLabels,
  deadlineStatusLabels,
  durationUnitLabels,
  roleLabels,
  stageStatusLabels,
  stageStatusOptions,
} from '../connectionContent';
import { formatDate, formatDateTime } from '../utils';
import { ChatRoom } from './ChatRoom';

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function createEmptyStationForm() {
  return {
    name: '',
    edrpou: '',
    address: '',
    phone: '',
    email: '',
    directorName: '',
    notes: '',
    isActive: true,
  };
}

function createEmptyApplicationForm(user) {
  return {
    stationId: user.role === 'manager' ? String(user.stationId ?? '') : '',
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
    expectedAt: stage.expectedAt ?? '',
    dueAt: stage.dueAt ?? '',
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
  ['heatSupplyContractNumber', 'Договір / рахунок №'],
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

const generatedDocumentOptions = [
  ['appendix3', 'Додаток 3'],
  ['appendix4', 'Додаток 4'],
  ['appendix5', 'Додаток 5'],
  ['appendix1', 'Додаток 1'],
  ['appendix2', 'Додаток 2'],
];

function normalizeStationDraft(station) {
  return {
    name: station.name ?? '',
    edrpou: station.edrpou ?? '',
    address: station.address ?? '',
    phone: station.phone ?? '',
    email: station.email ?? '',
    directorName: station.directorName ?? '',
    notes: station.notes ?? '',
    isActive: station.isActive,
  };
}

function StatusPill({ status }) {
  return (
    <span className={`summary-pill deadline-pill deadline-pill--${status}`}>
      {deadlineStatusLabels[status] ?? status}
    </span>
  );
}

export function ManagerDashboard({ user, onLogout }) {
  const isAdmin = user.role === 'admin';
  const [users, setUsers] = useState([]);
  const [applications, setApplications] = useState([]);
  const [stations, setStations] = useState([]);
  const [settings, setSettings] = useState([]);
  const [deadlineRules, setDeadlineRules] = useState([]);
  const [stageTemplates, setStageTemplates] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const [stageDrafts, setStageDrafts] = useState({});
  const [stationDrafts, setStationDrafts] = useState({});
  const [settingDrafts, setSettingDrafts] = useState({});
  const [deadlineDrafts, setDeadlineDrafts] = useState({});
  const [stageTemplateDrafts, setStageTemplateDrafts] = useState({});
  const [deadlineDataDraft, setDeadlineDataDraft] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [panelMessage, setPanelMessage] = useState('');
  const [stationForm, setStationForm] = useState(createEmptyStationForm);
  const [userForm, setUserForm] = useState({
    fullName: '',
    password: '',
    role: isAdmin ? 'manager' : 'customer',
    stationId: isAdmin ? '' : String(user.stationId ?? ''),
  });
  const [applicationForm, setApplicationForm] = useState(() => createEmptyApplicationForm(user));
  const [isCreatingStation, setIsCreatingStation] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isCreatingApplication, setIsCreatingApplication] = useState(false);
  const [savingStageId, setSavingStageId] = useState(null);
  const [savingStationId, setSavingStationId] = useState(null);
  const [savingSettingKey, setSavingSettingKey] = useState('');
  const [savingDeadlineKey, setSavingDeadlineKey] = useState('');
  const [savingDeadlineData, setSavingDeadlineData] = useState(false);
  const [savingStageTemplateId, setSavingStageTemplateId] = useState(null);
  const [deletingApplicationId, setDeletingApplicationId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [generatingDocumentType, setGeneratingDocumentType] = useState('');
  const [activeDashboardPage, setActiveDashboardPage] = useState('registry');
  const [activeModal, setActiveModal] = useState(null);

  const loadDashboard = useEffectEvent(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsLoading(true);
      setError('');
    }

    try {
      const baseRequests = [
        api.listUsers(),
        api.listApplications(),
        api.listStations(),
      ];
      const [
        usersResponse,
        applicationsResponse,
        stationsResponse,
        settingsResponse,
        deadlineResponse,
        templatesResponse,
        auditResponse,
      ] = await Promise.all([
        ...baseRequests,
        ...(isAdmin
          ? [
            api.listSettings(),
            api.listDeadlineRules(),
            api.listStageTemplates(),
            api.listAuditLog(100),
          ]
          : [Promise.resolve({ settings: [] }), Promise.resolve({ rules: [] }), Promise.resolve({ templates: [] }), Promise.resolve({ entries: [] })]),
      ]);

      setUsers(usersResponse.users);
      setApplications(applicationsResponse.applications);
      setStations(stationsResponse.stations);
      setSettings(settingsResponse.settings);
      setDeadlineRules(deadlineResponse.rules);
      setStageTemplates(templatesResponse.templates);
      setAuditEntries(auditResponse.entries);
      setStationDrafts(Object.fromEntries(stationsResponse.stations.map((station) => [station.id, normalizeStationDraft(station)])));
      setSettingDrafts(Object.fromEntries(settingsResponse.settings.map((setting) => [setting.key, setting.value])));
      setDeadlineDrafts(Object.fromEntries(deadlineResponse.rules.map((rule) => [rule.key, { ...rule }])));
      setStageTemplateDrafts(Object.fromEntries(templatesResponse.templates.map((template) => [template.id, { ...template }])));
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

  const selectedApplicationStationId = applicationForm.stationId
    ? Number(applicationForm.stationId)
    : user.stationId;

  const customerUsers = useMemo(
    () =>
      users.filter((item) =>
        item.role === 'customer'
        && (!selectedApplicationStationId || item.stationId === selectedApplicationStationId),
      ),
    [users, selectedApplicationStationId],
  );

  useEffect(() => {
    if (!selectedApplication) {
      setStageDrafts({});
      setDeadlineDataDraft({});
      return;
    }

    setStageDrafts(
      Object.fromEntries(
        selectedApplication.stages.map((stage) => [stage.id, getStageDraft(stage)]),
      ),
    );
    setDeadlineDataDraft(selectedApplication.deadlineData ?? {});
  }, [selectedApplication?.id, selectedApplication?.updatedAt]);

  async function handleCreateStation(event) {
    event.preventDefault();
    setIsCreatingStation(true);
    setPanelMessage('');

    try {
      await api.createStation(stationForm);
      setStationForm(createEmptyStationForm());
      setPanelMessage('Станцію/компанію створено.');
      setActiveModal(null);
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setIsCreatingStation(false);
    }
  }

  async function handleSaveStation(stationId) {
    setSavingStationId(stationId);
    setPanelMessage('');

    try {
      await api.updateStation(stationId, stationDrafts[stationId]);
      setPanelMessage('Станцію/компанію оновлено.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setSavingStationId(null);
    }
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    setIsCreatingUser(true);
    setPanelMessage('');

    try {
      await api.createUser(userForm);
      setUserForm({
        fullName: '',
        password: '',
        role: isAdmin ? 'manager' : 'customer',
        stationId: isAdmin ? '' : String(user.stationId ?? ''),
      });
      setPanelMessage(userForm.role === 'manager' ? 'Менеджера створено.' : 'Кабінет замовника створено.');
      setActiveModal(null);
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setIsCreatingUser(false);
    }
  }

  async function handleDeleteUser(chatUser) {
    const confirmed = window.confirm(`Видалити користувача "${chatUser.fullName}"?`);

    if (!confirmed) {
      return;
    }

    setDeletingUserId(chatUser.id);
    setPanelMessage('');

    try {
      await api.deleteUser(chatUser.id);
      setPanelMessage('Користувача видалено.');
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
      setApplicationForm(createEmptyApplicationForm(user));
      setPanelMessage('Заяву додано до реєстру.');
      setActiveModal(null);
      setActiveDashboardPage('registry');
      await loadDashboard({ silent: true });
      setSelectedApplicationId(response.application.id);
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setIsCreatingApplication(false);
    }
  }

  async function handleDeleteApplication(application) {
    const confirmed = window.confirm(`Видалити заяву "${application.applicationNumber}"? Згенеровані документи залишаться на сервері.`);

    if (!confirmed) {
      return;
    }

    setDeletingApplicationId(application.id);
    setPanelMessage('');

    try {
      await api.deleteApplication(application.id);
      setPanelMessage('Заяву видалено. Згенеровані документи не видалялися.');
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
      setPanelMessage('Етап оновлено. Email-заглушку підготовлено, якщо етап виконано.');
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setSavingStageId(null);
    }
  }

  async function handleSaveDeadlineData() {
    if (!selectedApplication) {
      return;
    }

    setSavingDeadlineData(true);
    setPanelMessage('');

    try {
      const response = await api.updateApplication(selectedApplication.id, {
        stationId: selectedApplication.stationId,
        applicationNumber: selectedApplication.applicationNumber,
        applicantFullName: selectedApplication.applicantFullName,
        phone: selectedApplication.phone,
        email: selectedApplication.email ?? '',
        objectAddress: selectedApplication.objectAddress,
        connectionType: selectedApplication.connectionType,
        status: selectedApplication.status,
        receivedAt: selectedApplication.receivedAt,
        responsibleName: selectedApplication.responsibleName ?? '',
        notes: selectedApplication.notes ?? '',
        appendixData: selectedApplication.appendixData ?? {},
        deadlineData: deadlineDataDraft,
        customerUserId: selectedApplication.customerUserId ?? null,
      });

      setApplications((current) =>
        current.map((application) =>
          application.id === response.application.id ? response.application : application,
        ),
      );
      setPanelMessage('Контрольні дати оновлено.');
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setSavingDeadlineData(false);
    }
  }

  async function handleGenerateDocument(documentType) {
    if (!selectedApplication) {
      return;
    }

    setGeneratingDocumentType(documentType);
    setPanelMessage('');

    try {
      await api.generateApplicationDocument(selectedApplication.id, documentType);
      setPanelMessage('Документ згенеровано та збережено на сервері.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setGeneratingDocumentType('');
    }
  }

  async function handleSaveSetting(key) {
    setSavingSettingKey(key);
    setPanelMessage('');

    try {
      await api.updateSetting(key, { value: settingDrafts[key] });
      setPanelMessage('Сталий параметр оновлено.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setSavingSettingKey('');
    }
  }

  async function handleSaveDeadlineRule(key) {
    setSavingDeadlineKey(key);
    setPanelMessage('');

    try {
      await api.updateDeadlineRule(key, deadlineDrafts[key]);
      setPanelMessage('Правило строку оновлено.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setSavingDeadlineKey('');
    }
  }

  async function handleSaveStageTemplate(templateId) {
    setSavingStageTemplateId(templateId);
    setPanelMessage('');

    try {
      await api.updateStageTemplate(templateId, stageTemplateDrafts[templateId]);
      setPanelMessage('Шаблон етапу оновлено.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setSavingStageTemplateId(null);
    }
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

  function updateStageDraft(stageId, patch) {
    setStageDrafts((current) => ({
      ...current,
      [stageId]: {
        ...current[stageId],
        ...patch,
      },
    }));
  }

  const dashboardPages = [
    { id: 'registry', label: 'Заяви' },
    { id: 'people', label: isAdmin ? 'Користувачі' : 'Замовники' },
    ...(isAdmin ? [{ id: 'settings', label: 'Налаштування' }] : []),
  ];

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <span className="section-kicker">{isAdmin ? 'Адмін-панель' : user.stationName || 'Менеджер станції'}</span>
          <h1>{isAdmin ? 'Адміністрування сервісу' : 'Реєстр заявників'}</h1>
          <p className="muted-copy">
            Приєднання до теплових мереж, станції/компанії, етапи, документи, строки та журнал дій.
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

      <nav className="dashboard-tabs" aria-label="Навігація кабінету">
        {dashboardPages.map((page) => (
          <button
            className={activeDashboardPage === page.id ? 'dashboard-tab is-active' : 'dashboard-tab'}
            key={page.id}
            onClick={() => setActiveDashboardPage(page.id)}
            type="button"
          >
            {page.label}
          </button>
        ))}
      </nav>

      <section className="dashboard-actions surface-card">
        <div>
          <span className="section-kicker">Швидкі дії</span>
          <p className="muted-copy">Заявки, кабінети та довідники.</p>
        </div>
        <div className="dashboard-actions__buttons">
          <button className="primary-button" onClick={() => setActiveModal('application')} type="button">
            Нова заява
          </button>
          <button className="secondary-button" onClick={() => setActiveModal('user')} type="button">
            {isAdmin ? 'Новий користувач' : 'Новий замовник'}
          </button>
          {isAdmin ? (
            <button className="secondary-button" onClick={() => setActiveModal('station')} type="button">
              Нова станція/компанія
            </button>
          ) : null}
        </div>
      </section>

      {!isAdmin ? (
        <section className="surface-card manager-card manager-context-card">
          <div>
            <span className="section-kicker">Станція/компанія менеджера</span>
            <h2>{user.stationName || 'Не прив’язано'}</h2>
          </div>
          <p className="muted-copy">
            Нові замовники та заявки автоматично належать до цієї станції/компанії.
          </p>
        </section>
      ) : null}

      {activeModal === 'station' && isAdmin ? (
        <DashboardModal title="Нова станція/компанія" onClose={() => setActiveModal(null)}>
          <form className="application-form" onSubmit={handleCreateStation}>
            <label className="field-block">
              <span>Назва</span>
              <input
                className="field-input"
                disabled={isCreatingStation}
                onChange={(event) => setStationForm((current) => ({ ...current, name: event.target.value }))}
                required
                value={stationForm.name}
              />
            </label>

            <label className="field-block">
              <span>ЄДРПОУ</span>
              <input
                className="field-input"
                disabled={isCreatingStation}
                onChange={(event) => setStationForm((current) => ({ ...current, edrpou: event.target.value }))}
                value={stationForm.edrpou}
              />
            </label>

            <label className="field-block field-block--wide">
              <span>Адреса</span>
              <input
                className="field-input"
                disabled={isCreatingStation}
                onChange={(event) => setStationForm((current) => ({ ...current, address: event.target.value }))}
                value={stationForm.address}
              />
            </label>

            <label className="field-block">
              <span>Телефон</span>
              <input
                className="field-input"
                disabled={isCreatingStation}
                onChange={(event) => setStationForm((current) => ({ ...current, phone: event.target.value }))}
                value={stationForm.phone}
              />
            </label>

            <label className="field-block">
              <span>Email</span>
              <input
                className="field-input"
                disabled={isCreatingStation}
                onChange={(event) => setStationForm((current) => ({ ...current, email: event.target.value }))}
                type="email"
                value={stationForm.email}
              />
            </label>

            <label className="field-block">
              <span>ПІБ керівника</span>
              <input
                className="field-input"
                disabled={isCreatingStation}
                onChange={(event) => setStationForm((current) => ({ ...current, directorName: event.target.value }))}
                value={stationForm.directorName}
              />
            </label>

            <label className="access-toggle">
              <input
                checked={stationForm.isActive}
                disabled={isCreatingStation}
                onChange={(event) => setStationForm((current) => ({ ...current, isActive: event.target.checked }))}
                type="checkbox"
              />
              <span>Активна</span>
            </label>

            <label className="field-block field-block--wide">
              <span>Примітки</span>
              <textarea
                className="field-input field-textarea"
                disabled={isCreatingStation}
                onChange={(event) => setStationForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
                value={stationForm.notes}
              />
            </label>

            <button className="primary-button field-block--wide" disabled={isCreatingStation} type="submit">
              {isCreatingStation ? 'Створення...' : 'Створити станцію'}
            </button>
          </form>
        </DashboardModal>
      ) : null}

      {activeModal === 'user' ? (
        <DashboardModal title={isAdmin ? 'Новий менеджер або замовник' : 'Новий замовник'} onClose={() => setActiveModal(null)}>
          <UserCreateForm
            disabled={isCreatingUser}
            isAdmin={isAdmin}
            onSubmit={handleCreateUser}
            setUserForm={setUserForm}
            stations={stations}
            userForm={userForm}
          />
        </DashboardModal>
      ) : null}

      {activeDashboardPage === 'settings' && isAdmin ? (
        <AdminConfiguration
          auditEntries={auditEntries}
          deadlineDrafts={deadlineDrafts}
          deadlineRules={deadlineRules}
          handleSaveDeadlineRule={handleSaveDeadlineRule}
          handleSaveSetting={handleSaveSetting}
          handleSaveStageTemplate={handleSaveStageTemplate}
          handleSaveStation={handleSaveStation}
          savingDeadlineKey={savingDeadlineKey}
          savingSettingKey={savingSettingKey}
          savingStageTemplateId={savingStageTemplateId}
          savingStationId={savingStationId}
          setDeadlineDrafts={setDeadlineDrafts}
          setSettingDrafts={setSettingDrafts}
          setStageTemplateDrafts={setStageTemplateDrafts}
          setStationDrafts={setStationDrafts}
          settingDrafts={settingDrafts}
          settings={settings}
          stageTemplateDrafts={stageTemplateDrafts}
          stageTemplates={stageTemplates}
          stationDrafts={stationDrafts}
          stations={stations}
        />
      ) : null}

      {activeModal === 'application' ? (
        <DashboardModal title="Нова заява на приєднання" isWide onClose={() => setActiveModal(null)}>
        <form className="application-form" onSubmit={handleCreateApplication}>
          {isAdmin ? (
            <label className="field-block">
              <span>Станція/компанія</span>
              <select
                className="field-input"
                disabled={isCreatingApplication}
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
            <span>Email для майбутніх поштових листів</span>
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

          <AppendixForm
            applicationForm={applicationForm}
            disabled={isCreatingApplication}
            updateAppendixField={updateAppendixField}
          />

          <button className="primary-button field-block--wide" disabled={isCreatingApplication} type="submit">
            {isCreatingApplication ? 'Додавання...' : 'Додати заяву'}
          </button>
        </form>
        </DashboardModal>
      ) : null}

      {activeDashboardPage === 'registry' ? (
      <section className="manager-simple-grid manager-simple-grid--single">
        <section className="surface-card manager-card">
          <div className="section-header">
            <div>
              <h2>Заяви</h2>
              <p className="muted-copy">Телефон, ПІБ, номер заяви, станція та поточний прогрес.</p>
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
                  <span>{application.stationName}</span>
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
      </section>
      ) : null}

      {activeDashboardPage === 'people' ? (
      <section className="manager-simple-grid manager-simple-grid--single">
        <section className="surface-card manager-card">
          <div className="section-header">
            <div>
              <h2>{isAdmin ? 'Користувачі' : 'Кабінети замовників'}</h2>
              <p className="muted-copy">Ролі, станції та доступ до особистого кабінету.</p>
            </div>
            <span className="counter-chip">{users.length}</span>
          </div>

          <div className="entity-list">
            {users.map((chatUser) => (
              <article className="entity-row" key={chatUser.id}>
                <div className="entity-main">
                  <strong>{chatUser.fullName}</strong>
                  <small>
                    {roleLabels[chatUser.role] ?? chatUser.role}
                    {chatUser.stationName ? ` · ${chatUser.stationName}` : ''}
                    {' · '}
                    {formatDateTime(chatUser.createdAt)}
                  </small>
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
      ) : null}

      {activeDashboardPage === 'registry' && selectedApplication ? (
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
              disabled={savingDeadlineData}
              onSave={handleSaveDeadlineData}
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
                <h2>Документи</h2>
                <p className="muted-copy">Заповнені docx зберігаються на сервері назавжди.</p>
              </div>
              <span className="counter-chip">{selectedApplication.generatedDocuments.length}</span>
            </div>

            <div className="document-actions">
              {generatedDocumentOptions.map(([type, label]) => (
                <button
                  className="secondary-button"
                  disabled={Boolean(generatingDocumentType)}
                  key={type}
                  onClick={() => handleGenerateDocument(type)}
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
                <article className="email-log-item" key={document.id}>
                  <strong>{document.title}</strong>
                  <a href={apiUrl(`/api/generated-documents/${document.id}`)}>{document.originalName}</a>
                  <small>{formatDateTime(document.createdAt)}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="surface-card manager-card">
            <div className="section-header">
              <div>
                <h2>Поштові листи</h2>
                <p className="muted-copy">Заглушка під майбутній поштовий клієнт. SMS не використовується.</p>
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
                  Очікуваний і граничний строки показуються замовнику відповідно до пункту 1.14 Порядку.
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
                      <StatusPill status={stage.deadlineStatus} />
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
                        <span>Очікуваний строк</span>
                        <input
                          className="field-input"
                          onChange={(event) => updateStageDraft(stage.id, { expectedAt: event.target.value })}
                          type="date"
                          value={draft.expectedAt}
                        />
                      </label>

                      <label className="field-block">
                        <span>Граничний строк</span>
                        <input
                          className="field-input"
                          onChange={(event) => updateStageDraft(stage.id, { dueAt: event.target.value })}
                          type="date"
                          value={draft.dueAt}
                        />
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

function DashboardModal({ children, isWide = false, onClose, title }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className={isWide ? 'modal-shell modal-shell--wide surface-card' : 'modal-shell surface-card'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-toolbar">
          <h2>{title}</h2>
          <button className="secondary-button" onClick={onClose} type="button">
            Закрити
          </button>
        </div>
        <div className="modal-content">{children}</div>
      </section>
    </div>
  );
}

function UserCreateForm({ disabled, isAdmin, onSubmit, setUserForm, stations, userForm }) {
  return (
    <form className="stack-form" onSubmit={onSubmit}>
      {isAdmin ? (
        <>
          <label className="field-block">
            <span>Роль</span>
            <select
              className="field-input"
              disabled={disabled}
              onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}
              value={userForm.role}
            >
              <option value="manager">Менеджер</option>
              <option value="customer">Замовник</option>
            </select>
          </label>

          <label className="field-block">
            <span>Станція/компанія</span>
            <select
              className="field-input"
              disabled={disabled}
              onChange={(event) => setUserForm((current) => ({ ...current, stationId: event.target.value }))}
              required
              value={userForm.stationId}
            >
              <option value="">Оберіть станцію</option>
              {stations.filter((station) => station.isActive).map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      <label className="field-block">
        <span>Прізвище Ім’я По батькові</span>
        <input
          className="field-input"
          disabled={disabled}
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
          disabled={disabled}
          onChange={(event) =>
            setUserForm((current) => ({ ...current, password: event.target.value }))
          }
          required
          type="password"
          value={userForm.password}
        />
      </label>

      <button className="primary-button" disabled={disabled} type="submit">
        {disabled ? 'Створення...' : 'Створити користувача'}
      </button>
    </form>
  );
}

function AppendixForm({ applicationForm, disabled, updateAppendixField }) {
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
          <span className="section-kicker">Додаток 4 або 5</span>
          <h3>Опитувальний лист</h3>
        </div>

        <label className="field-block">
          <span>Тип опитувального листа</span>
          <select
            className="field-input"
            disabled={disabled}
            onChange={(event) => updateAppendixField('questionnaire', 'type', event.target.value)}
            value={applicationForm.appendixData.questionnaire.type}
          >
            <option value="heat_use">Додаток 4 - тепловикористальні установки</option>
            <option value="generation">Додаток 5 - теплогенеруючі/когенераційні установки</option>
          </select>
        </label>

        {questionnaireFields.map(([key, label]) => {
          const longField = ['customerInfo', 'designOrganization', 'constructionObject', 'existingHeatSource', 'heatObjectDescription', 'notificationMethod'].includes(key);

          if (longField) {
            return (
              <label className="field-block field-block--wide" key={key}>
                <span>{label}</span>
                <textarea
                  className="field-input field-textarea"
                  disabled={disabled}
                  onChange={(event) => updateAppendixField('questionnaire', key, event.target.value)}
                  rows={3}
                  value={applicationForm.appendixData.questionnaire[key]}
                />
              </label>
            );
          }

          return (
            <label className="field-block" key={key}>
              <span>{label}</span>
              <input
                className="field-input"
                disabled={disabled}
                onChange={(event) => updateAppendixField('questionnaire', key, event.target.value)}
                value={applicationForm.appendixData.questionnaire[key]}
              />
            </label>
          );
        })}
      </div>
    </>
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

function AdminConfiguration({
  auditEntries,
  deadlineDrafts,
  deadlineRules,
  handleSaveDeadlineRule,
  handleSaveSetting,
  handleSaveStageTemplate,
  handleSaveStation,
  savingDeadlineKey,
  savingSettingKey,
  savingStageTemplateId,
  savingStationId,
  setDeadlineDrafts,
  setSettingDrafts,
  setStageTemplateDrafts,
  setStationDrafts,
  settingDrafts,
  settings,
  stageTemplateDrafts,
  stageTemplates,
  stationDrafts,
  stations,
}) {
  const [activeConfigSection, setActiveConfigSection] = useState('stations');
  const configSections = [
    ['stations', 'Станції'],
    ['deadlines', 'Строки'],
    ['stages', 'Етапи'],
    ['settings', 'Сталі дані'],
    ['audit', 'Журнал дій'],
  ];

  return (
    <section className="admin-config-layout">
      <nav className="dashboard-subtabs" aria-label="Розділи налаштувань">
        {configSections.map(([id, label]) => (
          <button
            className={activeConfigSection === id ? 'dashboard-subtab is-active' : 'dashboard-subtab'}
            key={id}
            onClick={() => setActiveConfigSection(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="surface-card manager-card application-detail-grid__wide" hidden={activeConfigSection !== 'stations'}>
        <div className="section-header">
          <div>
            <span className="section-kicker">Адмін</span>
            <h2>Станції/компанії</h2>
          </div>
          <span className="counter-chip">{stations.length}</span>
        </div>

        <div className="admin-edit-list">
          {stations.map((station) => {
            const draft = stationDrafts[station.id] ?? normalizeStationDraft(station);

            return (
              <article className="stage-editor" key={station.id}>
                <div className="stage-editor__controls">
                  {['name', 'edrpou', 'address', 'phone', 'email', 'directorName'].map((field) => (
                    <label className="field-block" key={field}>
                      <span>
                        {{
                          name: 'Назва',
                          edrpou: 'ЄДРПОУ',
                          address: 'Адреса',
                          phone: 'Телефон',
                          email: 'Email',
                          directorName: 'ПІБ керівника',
                        }[field]}
                      </span>
                      <input
                        className="field-input"
                        onChange={(event) =>
                          setStationDrafts((current) => ({
                            ...current,
                            [station.id]: { ...draft, [field]: event.target.value },
                          }))
                        }
                        type={field === 'email' ? 'email' : 'text'}
                        value={draft[field]}
                      />
                    </label>
                  ))}
                </div>

                <label className="field-block">
                  <span>Примітки</span>
                  <textarea
                    className="field-input field-textarea"
                    onChange={(event) =>
                      setStationDrafts((current) => ({
                        ...current,
                        [station.id]: { ...draft, notes: event.target.value },
                      }))
                    }
                    rows={2}
                    value={draft.notes}
                  />
                </label>

                <div className="stage-editor__footer">
                  <label className="access-toggle">
                    <input
                      checked={draft.isActive}
                      onChange={(event) =>
                        setStationDrafts((current) => ({
                          ...current,
                          [station.id]: { ...draft, isActive: event.target.checked },
                        }))
                      }
                      type="checkbox"
                    />
                    <span>Активна</span>
                  </label>
                  <button
                    className="primary-button"
                    disabled={savingStationId === station.id}
                    onClick={() => handleSaveStation(station.id)}
                    type="button"
                  >
                    {savingStationId === station.id ? 'Збереження...' : 'Зберегти'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="surface-card manager-card application-detail-grid__wide" hidden={activeConfigSection !== 'deadlines'}>
        <div className="section-header">
          <div>
            <span className="section-kicker">Адмін</span>
            <h2>Правила строків</h2>
          </div>
        </div>

        <div className="stage-editor-list">
          {deadlineRules.map((rule) => {
            const draft = deadlineDrafts[rule.key] ?? rule;

            return (
              <article className="stage-editor" key={rule.key}>
                <div>
                  <h3>{rule.label}</h3>
                  <p className="muted-copy">{rule.description}</p>
                </div>
                <div className="stage-editor__controls">
                  <label className="field-block">
                    <span>Кількість</span>
                    <input
                      className="field-input"
                      min="0"
                      onChange={(event) =>
                        setDeadlineDrafts((current) => ({
                          ...current,
                          [rule.key]: { ...draft, amount: event.target.value },
                        }))
                      }
                      type="number"
                      value={draft.amount}
                    />
                  </label>
                  <label className="field-block">
                    <span>Одиниця</span>
                    <select
                      className="field-input"
                      onChange={(event) =>
                        setDeadlineDrafts((current) => ({
                          ...current,
                          [rule.key]: { ...draft, unit: event.target.value },
                        }))
                      }
                      value={draft.unit}
                    >
                      {Object.entries(durationUnitLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-block">
                    <span>Попереджати за днів</span>
                    <input
                      className="field-input"
                      min="0"
                      onChange={(event) =>
                        setDeadlineDrafts((current) => ({
                          ...current,
                          [rule.key]: { ...draft, warningDays: event.target.value },
                        }))
                      }
                      type="number"
                      value={draft.warningDays}
                    />
                  </label>
                </div>
                <div className="stage-editor__footer">
                  <label className="access-toggle">
                    <input
                      checked={draft.isActive}
                      onChange={(event) =>
                        setDeadlineDrafts((current) => ({
                          ...current,
                          [rule.key]: { ...draft, isActive: event.target.checked },
                        }))
                      }
                      type="checkbox"
                    />
                    <span>Активне правило</span>
                  </label>
                  <button
                    className="primary-button"
                    disabled={savingDeadlineKey === rule.key}
                    onClick={() => handleSaveDeadlineRule(rule.key)}
                    type="button"
                  >
                    {savingDeadlineKey === rule.key ? 'Збереження...' : 'Зберегти правило'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="surface-card manager-card application-detail-grid__wide" hidden={activeConfigSection !== 'stages'}>
        <div className="section-header">
          <div>
            <span className="section-kicker">Адмін</span>
            <h2>Шаблони етапів</h2>
          </div>
        </div>

        <div className="stage-editor-list">
          {stageTemplates.map((template) => {
            const draft = stageTemplateDrafts[template.id] ?? template;

            return (
              <article className="stage-editor" key={template.id}>
                <label className="field-block">
                  <span>Назва етапу</span>
                  <textarea
                    className="field-input"
                    onChange={(event) =>
                      setStageTemplateDrafts((current) => ({
                        ...current,
                        [template.id]: { ...draft, title: event.target.value },
                      }))
                    }
                    rows={2}
                    value={draft.title}
                  />
                </label>
                <label className="field-block">
                  <span>Опис</span>
                  <textarea
                    className="field-input field-textarea"
                    onChange={(event) =>
                      setStageTemplateDrafts((current) => ({
                        ...current,
                        [template.id]: { ...draft, description: event.target.value },
                      }))
                    }
                    rows={2}
                    value={draft.description}
                  />
                </label>
                <div className="stage-editor__controls">
                  <label className="field-block">
                    <span>Порядок</span>
                    <input
                      className="field-input"
                      min="1"
                      onChange={(event) =>
                        setStageTemplateDrafts((current) => ({
                          ...current,
                          [template.id]: { ...draft, sortOrder: event.target.value },
                        }))
                      }
                      type="number"
                      value={draft.sortOrder}
                    />
                  </label>
                  <label className="field-block">
                    <span>Типовий очікуваний строк</span>
                    <input
                      className="field-input"
                      min="0"
                      onChange={(event) =>
                        setStageTemplateDrafts((current) => ({
                          ...current,
                          [template.id]: { ...draft, defaultExpectedDays: event.target.value },
                        }))
                      }
                      type="number"
                      value={draft.defaultExpectedDays}
                    />
                  </label>
                  <label className="field-block">
                    <span>Одиниця очікуваного строку</span>
                    <select
                      className="field-input"
                      onChange={(event) =>
                        setStageTemplateDrafts((current) => ({
                          ...current,
                          [template.id]: { ...draft, expectedDaysType: event.target.value },
                        }))
                      }
                      value={draft.expectedDaysType}
                    >
                      {Object.entries(durationUnitLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-block">
                    <span>Типовий граничний строк</span>
                    <input
                      className="field-input"
                      min="0"
                      onChange={(event) =>
                        setStageTemplateDrafts((current) => ({
                          ...current,
                          [template.id]: { ...draft, defaultDueDays: event.target.value },
                        }))
                      }
                      type="number"
                      value={draft.defaultDueDays}
                    />
                  </label>
                  <label className="field-block">
                    <span>Одиниця граничного строку</span>
                    <select
                      className="field-input"
                      onChange={(event) =>
                        setStageTemplateDrafts((current) => ({
                          ...current,
                          [template.id]: { ...draft, dueDaysType: event.target.value },
                        }))
                      }
                      value={draft.dueDaysType}
                    >
                      {Object.entries(durationUnitLabels).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="stage-editor__footer">
                  <label className="access-toggle">
                    <input
                      checked={draft.isActive}
                      onChange={(event) =>
                        setStageTemplateDrafts((current) => ({
                          ...current,
                          [template.id]: { ...draft, isActive: event.target.checked },
                        }))
                      }
                      type="checkbox"
                    />
                    <span>Активний етап для нових заяв</span>
                  </label>
                  <button
                    className="primary-button"
                    disabled={savingStageTemplateId === template.id}
                    onClick={() => handleSaveStageTemplate(template.id)}
                    type="button"
                  >
                    {savingStageTemplateId === template.id ? 'Збереження...' : 'Зберегти шаблон'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="surface-card manager-card application-detail-grid__wide" hidden={activeConfigSection !== 'settings'}>
        <div className="section-header">
          <div>
            <span className="section-kicker">Адмін</span>
            <h2>Сталі дані</h2>
          </div>
        </div>
        <div className="stage-editor-list">
          {settings.map((setting) => (
            <article className="stage-editor" key={setting.key}>
              <label className="field-block">
                <span>{setting.label}</span>
                {setting.valueType === 'textarea' ? (
                  <textarea
                    className="field-input field-textarea"
                    onChange={(event) =>
                      setSettingDrafts((current) => ({ ...current, [setting.key]: event.target.value }))
                    }
                    rows={4}
                    value={settingDrafts[setting.key] ?? setting.value}
                  />
                ) : (
                  <input
                    className="field-input"
                    onChange={(event) =>
                      setSettingDrafts((current) => ({ ...current, [setting.key]: event.target.value }))
                    }
                    value={settingDrafts[setting.key] ?? setting.value}
                  />
                )}
              </label>
              <p className="muted-copy">{setting.groupName} · {setting.description}</p>
              <button
                className="primary-button"
                disabled={savingSettingKey === setting.key}
                onClick={() => handleSaveSetting(setting.key)}
                type="button"
              >
                {savingSettingKey === setting.key ? 'Збереження...' : 'Зберегти'}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-card manager-card application-detail-grid__wide" hidden={activeConfigSection !== 'audit'}>
        <div className="section-header">
          <div>
            <span className="section-kicker">Адмін</span>
            <h2>Журнал дій</h2>
          </div>
          <span className="counter-chip">{auditEntries.length}</span>
        </div>
        <div className="email-log">
          {auditEntries.map((entry) => (
            <article className="email-log-item" key={entry.id}>
              <strong>{entry.summary}</strong>
              <span>
                {entry.actorName} · {roleLabels[entry.actorRole] ?? entry.actorRole}
                {entry.stationName ? ` · ${entry.stationName}` : ''}
              </span>
              <small>{formatDateTime(entry.createdAt)}</small>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
