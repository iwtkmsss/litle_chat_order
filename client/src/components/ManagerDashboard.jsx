import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { api } from '../api';
import { AdminSettingsPanel } from './staff/AdminSettingsPanel';
import { ApplicationChatPanel } from './staff/ApplicationChatPanel';
import { ApplicationDetail } from './staff/ApplicationDetail';
import { ApplicationDocumentsPanel } from './staff/ApplicationDocumentsPanel';
import { ApplicationRegistry } from './staff/ApplicationRegistry';
import { ApplicationStagesPanel } from './staff/ApplicationStagesPanel';
import { CreateApplicationPanel } from './staff/CreateApplicationPanel';
import { CustomerPanel, UserCreateForm } from './staff/CustomerPanel';
import { DashboardModal, StaffLayout } from './staff/StaffLayout';
import { StationCreateForm, StationSettingsPanel } from './staff/StationSettingsPanel';
import {
  getApplicationStatusTransitionOptions,
} from '../connectionContent';
import {
  DEFAULT_APPLICATION_TYPE_ID,
  createEmptyQuestionnaireValues,
  getApplicationTypeConfig,
  getApplicationTypeFields,
} from '../config/applicationFormConfig';

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
    region: '',
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
    status: 'submitted',
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
      questionnaire: createEmptyQuestionnaireValues(DEFAULT_APPLICATION_TYPE_ID),
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

function getQuestionnaireTypeDetails(type) {
  const config = getApplicationTypeConfig(type);

  return {
    documentType: config.documentType,
    appendixLabel: config.appendix,
    title: config.title,
    description: config.description,
  };
}

function getQuestionnaireFields(type) {
  return getApplicationTypeFields(type).map((field) => [field.name, field.label]);
}

const baseGeneratedDocumentOptions = [
  ['appendix3', 'Додаток 3'],
  ['appendix1', 'Додаток 1'],
  ['appendix2', 'Додаток 2'],
];

function getGeneratedDocumentOptions(application) {
  const questionnaireDetails = getQuestionnaireTypeDetails(application?.appendixData?.questionnaire?.type);

  return [
    baseGeneratedDocumentOptions[0],
    [questionnaireDetails.documentType, `${questionnaireDetails.appendixLabel}: ${questionnaireDetails.title}`],
    ...baseGeneratedDocumentOptions.slice(1),
  ];
}

function normalizeStationDraft(station) {
  return {
    name: station.name ?? '',
    edrpou: station.edrpou ?? '',
    address: station.address ?? '',
    phone: station.phone ?? '',
    email: station.email ?? '',
    directorName: station.directorName ?? '',
    region: station.region ?? '',
    notes: station.notes ?? '',
    isActive: station.isActive,
  };
}

function normalizeUserDraft(chatUser) {
  return {
    fullName: chatUser.fullName ?? '',
    login: chatUser.login ?? '',
    password: '',
    role: chatUser.role ?? 'customer',
    stationId: String(chatUser.stationId ?? ''),
  };
}

export function ManagerDashboard({ user, onLogout, onNavigate, mode = user.role === 'admin' ? 'admin' : 'manager' }) {
  const isAdmin = mode === 'admin';
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
  const [userDrafts, setUserDrafts] = useState({});
  const [settingDrafts, setSettingDrafts] = useState({});
  const [deadlineDrafts, setDeadlineDrafts] = useState({});
  const [stageTemplateDrafts, setStageTemplateDrafts] = useState({});
  const [deadlineDataDraft, setDeadlineDataDraft] = useState({});
  const [statusDraft, setStatusDraft] = useState({ status: '', comment: '' });
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
  const [savingUserId, setSavingUserId] = useState(null);
  const [savingSettingKey, setSavingSettingKey] = useState('');
  const [savingDeadlineKey, setSavingDeadlineKey] = useState('');
  const [savingDeadlineData, setSavingDeadlineData] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingStageTemplateId, setSavingStageTemplateId] = useState(null);
  const [deletingApplicationId, setDeletingApplicationId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [generatingDocumentType, setGeneratingDocumentType] = useState('');
  const [retryingNotificationId, setRetryingNotificationId] = useState(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState(null);
  const [uploadingStageFileId, setUploadingStageFileId] = useState(null);
  const [deletingStageFileId, setDeletingStageFileId] = useState(null);
  const [activeDashboardPage, setActiveDashboardPage] = useState(isAdmin ? 'registry' : 'people');
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
      setUserDrafts(Object.fromEntries(usersResponse.users.map((chatUser) => [chatUser.id, normalizeUserDraft(chatUser)])));
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
      setStatusDraft({ status: '', comment: '' });
      return;
    }

    setStageDrafts(
      Object.fromEntries(
        selectedApplication.stages.map((stage) => [stage.id, getStageDraft(stage)]),
      ),
    );
    setDeadlineDataDraft(selectedApplication.deadlineData ?? {});
    setStatusDraft({ status: selectedApplication.status, comment: '' });
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

  async function handleSaveUser(chatUser) {
    setSavingUserId(chatUser.id);
    setPanelMessage('');

    try {
      await api.updateUser(chatUser.id, userDrafts[chatUser.id]);
      setPanelMessage('Користувача оновлено.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setSavingUserId(null);
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
      setPanelMessage('Етап оновлено. Email-лист сформовано, якщо етап виконано.');
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

  async function handleSaveStatus(nextDraft = statusDraft) {
    if (!selectedApplication || nextDraft.status === selectedApplication.status) {
      return;
    }

    setSavingStatus(true);
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
        status: nextDraft.status,
        statusComment: nextDraft.comment,
        receivedAt: selectedApplication.receivedAt,
        responsibleName: selectedApplication.responsibleName ?? '',
        notes: selectedApplication.notes ?? '',
        appendixData: selectedApplication.appendixData ?? {},
        deadlineData: selectedApplication.deadlineData ?? {},
        customerUserId: selectedApplication.customerUserId ?? null,
      });

      setApplications((current) =>
        current.map((application) =>
          application.id === response.application.id ? response.application : application,
        ),
      );
      setPanelMessage(response.accessPrepared
        ? 'Заяву прийнято. Кабінет замовника створено або прив’язано, email-повідомлення з доступом підготовлено.'
        : 'Статус заяви оновлено.');
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setSavingStatus(false);
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

  async function handleDeleteGeneratedDocument(document) {
    const confirmed = window.confirm(`Прибрати документ "${document.originalName}"?`);

    if (!confirmed) {
      return;
    }

    setDeletingDocumentId(document.id);
    setPanelMessage('');

    try {
      await api.deleteGeneratedDocument(document.id);
      setPanelMessage('Документ прибрано.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setDeletingDocumentId(null);
    }
  }

  async function handleUploadStageFinalFile(stage, file) {
    if (!selectedApplication || !file) {
      return;
    }

    setUploadingStageFileId(stage.id);
    setPanelMessage('');

    try {
      const response = await api.uploadStageFinalFile(selectedApplication.id, stage.id, file);
      setApplications((current) =>
        current.map((application) =>
          application.id === response.application.id ? response.application : application,
        ),
      );
      setPanelMessage('Остаточний файл етапу додано.');
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setUploadingStageFileId(null);
    }
  }

  async function handleDeleteStageFinalFile(stage) {
    if (!selectedApplication) {
      return;
    }

    const confirmed = window.confirm(`Прибрати остаточний файл етапу "${stage.title}"?`);

    if (!confirmed) {
      return;
    }

    setDeletingStageFileId(stage.id);
    setPanelMessage('');

    try {
      const response = await api.deleteStageFinalFile(selectedApplication.id, stage.id);
      setApplications((current) =>
        current.map((application) =>
          application.id === response.application.id ? response.application : application,
        ),
      );
      setPanelMessage('Остаточний файл етапу прибрано.');
    } catch (actionError) {
      setPanelMessage(actionError.message);
    } finally {
      setDeletingStageFileId(null);
    }
  }

  async function handleRetryEmailNotification(notificationId) {
    if (!selectedApplication) {
      return;
    }

    setRetryingNotificationId(notificationId);
    setPanelMessage('');

    try {
      await api.retryEmailNotification(notificationId);
      setPanelMessage('Email-лист надіслано повторно.');
      await loadDashboard({ silent: true });
    } catch (actionError) {
      setPanelMessage(actionError.message);
      await loadDashboard({ silent: true });
    } finally {
      setRetryingNotificationId(null);
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

  function openApplicationFromRegistry(applicationId) {
    setSelectedApplicationId(applicationId);
    setActiveDashboardPage('registry');
  }

  const dashboardPages = [
    { id: 'registry', label: isAdmin ? 'Заяви' : 'Заява' },
    { id: 'people', label: isAdmin ? 'Користувачі' : 'Замовники' },
    ...(!isAdmin ? [{ id: 'staticData', label: 'Сталі дані' }] : []),
    ...(isAdmin ? [{ id: 'settings', label: 'Налаштування' }] : []),
  ];

  return (
    <StaffLayout
      activeDashboardPage={activeDashboardPage}
      dashboardPages={dashboardPages}
      error={error}
      isAdmin={isAdmin}
      onDashboardPageChange={setActiveDashboardPage}
      onLogout={onLogout}
      onOpenApplication={() => setActiveModal('application')}
      onOpenStation={() => setActiveModal('station')}
      onOpenUser={() => setActiveModal('user')}
      onNavigate={onNavigate}
      onRefresh={() => loadDashboard()}
      panelMessage={panelMessage}
      user={user}
    >
      {activeModal === 'station' && isAdmin ? (
        <DashboardModal title="Нова станція/компанія" onClose={() => setActiveModal(null)}>
          <StationCreateForm
            disabled={isCreatingStation}
            onSubmit={handleCreateStation}
            setStationForm={setStationForm}
            stationForm={stationForm}
          />
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

      {activeModal === 'application' ? (
        <DashboardModal title="Нова заява на приєднання" isWide onClose={() => setActiveModal(null)}>
          <CreateApplicationPanel
            appendix3Fields={appendix3Fields}
            applicationForm={applicationForm}
            customerUsers={customerUsers}
            disabled={isCreatingApplication}
            isAdmin={isAdmin}
            onSubmit={handleCreateApplication}
            setApplicationForm={setApplicationForm}
            stations={stations}
            updateAppendixField={updateAppendixField}
            users={users}
          />
        </DashboardModal>
      ) : null}

      {activeDashboardPage === 'settings' && isAdmin ? (
        <AdminSettingsPanel
          auditEntries={auditEntries}
          deadlineDrafts={deadlineDrafts}
          deadlineRules={deadlineRules}
          handleSaveDeadlineRule={handleSaveDeadlineRule}
          handleSaveSetting={handleSaveSetting}
          handleSaveStageTemplate={handleSaveStageTemplate}
          handleSaveStation={handleSaveStation}
          isAdmin={isAdmin}
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

      {activeDashboardPage === 'registry' && isAdmin ? (
        <ApplicationRegistry
          applications={applications}
          deletingApplicationId={deletingApplicationId}
          isAdmin={isAdmin}
          isLoading={isLoading}
          onDeleteApplication={handleDeleteApplication}
          onSelectApplication={setSelectedApplicationId}
          selectedApplicationId={selectedApplicationId}
          stations={stations}
        />
      ) : null}

      {activeDashboardPage === 'people' && isAdmin ? (
        <CustomerPanel
          deletingUserId={deletingUserId}
          isAdmin={isAdmin}
          onDeleteUser={handleDeleteUser}
          onSaveUser={handleSaveUser}
          savingUserId={savingUserId}
          setUserDrafts={setUserDrafts}
          stations={stations}
          userDrafts={userDrafts}
          users={users}
        />
      ) : null}

      {activeDashboardPage === 'people' && !isAdmin ? (
        <ApplicationRegistry
          applications={applications}
          deletingApplicationId={deletingApplicationId}
          isAdmin={isAdmin}
          isLoading={isLoading}
          onDeleteApplication={handleDeleteApplication}
          onOpenApplication={openApplicationFromRegistry}
          onSelectApplication={setSelectedApplicationId}
          selectedApplicationId={selectedApplicationId}
          stations={stations}
          title="Заявки замовників"
        />
      ) : null}

      {activeDashboardPage === 'staticData' && !isAdmin ? (
        <StationSettingsPanel
          active
          canManageOperationalFields={false}
          handleSaveStation={handleSaveStation}
          savingStationId={savingStationId}
          setStationDrafts={setStationDrafts}
          stationDrafts={stationDrafts}
          stations={stations}
          title="Дані компанії"
          kicker="Сталі дані"
        />
      ) : null}

      {activeDashboardPage === 'registry' && !isAdmin && !selectedApplication ? (
        <section className="surface-card manager-card">
          <div className="section-header">
            <div>
              <span className="section-kicker">Заява</span>
              <h2>Оберіть заявку</h2>
              <p className="muted-copy">Перейдіть у вкладку “Замовники” та відкрийте потрібну заявку зі списку.</p>
            </div>
          </div>
        </section>
      ) : null}

      {activeDashboardPage === 'registry' && selectedApplication ? (
        <section className="application-detail-grid">
          <ApplicationDetail
            appendix3Fields={appendix3Fields}
            availableStatusOptions={getApplicationStatusTransitionOptions(selectedApplication.status, {
              isAdmin,
              role: 'manager',
            })}
            deadlineDataDraft={deadlineDataDraft}
            disabledDeadlineData={savingDeadlineData}
            disabledStatus={savingStatus}
            getQuestionnaireFields={getQuestionnaireFields}
            getQuestionnaireTypeDetails={getQuestionnaireTypeDetails}
            onSaveDeadlineData={handleSaveDeadlineData}
            onSaveStatus={handleSaveStatus}
            isAdmin={isAdmin}
            selectedApplication={selectedApplication}
            setDeadlineDataDraft={setDeadlineDataDraft}
            setStatusDraft={setStatusDraft}
            statusDraft={statusDraft}
          />

          <ApplicationDocumentsPanel
            generatingDocumentType={generatingDocumentType}
            getGeneratedDocumentOptions={getGeneratedDocumentOptions}
            isAdmin={isAdmin}
            deletingDocumentId={deletingDocumentId}
            onDeleteGeneratedDocument={handleDeleteGeneratedDocument}
            onGenerateDocument={handleGenerateDocument}
            onEmailSent={() => loadDashboard({ silent: true })}
            selectedApplication={selectedApplication}
          />

          <ApplicationStagesPanel
            getStageDraft={getStageDraft}
            deletingStageFileId={deletingStageFileId}
            onSaveStage={handleSaveStage}
            onDeleteStageFinalFile={handleDeleteStageFinalFile}
            onUploadStageFinalFile={handleUploadStageFinalFile}
            savingStageId={savingStageId}
            selectedApplication={selectedApplication}
            stageDrafts={stageDrafts}
            uploadingStageFileId={uploadingStageFileId}
            updateStageDraft={updateStageDraft}
          />

          <ApplicationChatPanel
            onThreadUpdated={() => loadDashboard({ silent: true })}
            selectedApplication={selectedApplication}
          />
        </section>
      ) : null}
    </StaffLayout>
  );
}
