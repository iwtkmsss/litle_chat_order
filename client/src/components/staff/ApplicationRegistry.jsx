import { useMemo, useState } from 'react';
import {
  getApplicationStatusDescription,
  getApplicationStatusLabel,
} from '../../connectionContent';
import { formatDate } from '../../utils';

const registryFilters = [
  { id: 'all', label: 'Усі', emptyText: 'Заяв ще немає.' },
  { id: 'submitted', label: 'Нові', statuses: ['submitted'], emptyText: 'Нових заявок немає.' },
  { id: 'in_work', label: 'В роботі', statuses: ['accepted', 'in_progress'], emptyText: 'Заявок у роботі немає.' },
  {
    id: 'needs_clarification',
    label: 'Потребують уточнення',
    statuses: ['needs_clarification'],
    emptyText: 'Заявок, що потребують уточнення, немає.',
  },
  {
    id: 'under_review',
    label: 'На технічному розгляді',
    statuses: ['under_review'],
    emptyText: 'Заявок на технічному розгляді немає.',
  },
  {
    id: 'technical_conditions_ready',
    label: 'ТУ підготовлено',
    statuses: ['technical_conditions_ready'],
    emptyText: 'Заявок із підготовленими технічними умовами немає.',
  },
  {
    id: 'agreement_ready',
    label: 'Договір підготовлено',
    statuses: ['agreement_ready'],
    emptyText: 'Заявок із підготовленим договором немає.',
  },
  { id: 'overdue', label: 'Прострочені', emptyText: 'Прострочених заявок немає.' },
  { id: 'completed', label: 'Завершені', statuses: ['completed'], emptyText: 'Завершених заявок немає.' },
  { id: 'rejected', label: 'Відмовлені', statuses: ['rejected'], emptyText: 'Відмовлених або повернутих заявок немає.' },
];

const sortOptions = [
  { value: 'attention', label: 'Спочатку потребують уваги' },
  { value: 'newest', label: 'Спочатку новіші' },
  { value: 'oldest', label: 'Спочатку старіші' },
  { value: 'overdue', label: 'Спочатку прострочені' },
  { value: 'needs_clarification', label: 'Спочатку уточнення' },
];

function normalizeSearchValue(value) {
  return String(value ?? '').trim().toLocaleLowerCase('uk-UA');
}

function toDateTime(value) {
  if (!value) {
    return 0;
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);

  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isStageOverdue(stage) {
  if (!stage?.dueAt || ['completed', 'not_required'].includes(stage.status)) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(stage.dueAt)
    ? new Date(`${stage.dueAt}T12:00:00`)
    : new Date(stage.dueAt);
  dueDate.setHours(0, 0, 0, 0);

  return dueDate.getTime() < today.getTime();
}

function hasDeadlineStatus(application, status) {
  return application.deadlineChecks?.some((check) => check.status === status);
}

function isOverdueApplication(application) {
  return hasDeadlineStatus(application, 'overdue')
    || application.stages?.some((stage) => stage.deadlineStatus === 'overdue' || isStageOverdue(stage));
}

function isDueSoonApplication(application) {
  return hasDeadlineStatus(application, 'due_soon');
}

function getAccessBadge(application) {
  if (application.customerUserId) {
    return { label: 'Кабінет створено', tone: 'done' };
  }

  if (application.status === 'needs_clarification') {
    return { label: 'Очікує доповнення', tone: 'due_soon' };
  }

  if (application.status === 'rejected') {
    return { label: 'Кабінет не створено', tone: 'overdue' };
  }

  if (application.status === 'submitted') {
    return { label: 'Тимчасовий доступ', tone: 'normal' };
  }

  return { label: 'Кабінет не створено', tone: 'normal' };
}

function isResubmittedApplication(application) {
  return application.status === 'submitted'
    && application.statusHistory?.some(
      (entry) => entry.fromStatus === 'needs_clarification' && entry.toStatus === 'submitted',
    );
}

function getObjectName(application) {
  return application.appendixData?.questionnaire?.objectName
    || application.appendixData?.appendix3?.objectName
    || '';
}

function getSearchHaystack(application) {
  return [
    application.id,
    application.applicationNumber,
    application.applicantFullName,
    application.customerUserName,
    application.phone,
    application.email,
    application.objectAddress,
    getObjectName(application),
    application.stationName,
  ].map(normalizeSearchValue).join(' ');
}

function matchesFilter(application, filterId) {
  if (filterId === 'all') {
    return true;
  }

  if (filterId === 'overdue') {
    return isOverdueApplication(application);
  }

  const filter = registryFilters.find((item) => item.id === filterId);
  return filter?.statuses?.includes(application.status) ?? true;
}

function getAttentionRank(application) {
  if (application.status === 'needs_clarification') {
    return 0;
  }

  if (isOverdueApplication(application)) {
    return 1;
  }

  if (application.status === 'submitted') {
    return 2;
  }

  if (isDueSoonApplication(application)) {
    return 3;
  }

  if (['accepted', 'in_progress', 'under_review'].includes(application.status)) {
    return 4;
  }

  if (['technical_conditions_ready', 'agreement_ready'].includes(application.status)) {
    return 5;
  }

  return 6;
}

function sortApplications(applications, sortMode) {
  return [...applications].sort((left, right) => {
    const newestFirst = toDateTime(right.receivedAt || right.createdAt) - toDateTime(left.receivedAt || left.createdAt);

    if (sortMode === 'oldest') {
      return -newestFirst;
    }

    if (sortMode === 'overdue') {
      return Number(isOverdueApplication(right)) - Number(isOverdueApplication(left)) || newestFirst;
    }

    if (sortMode === 'needs_clarification') {
      return Number(right.status === 'needs_clarification') - Number(left.status === 'needs_clarification') || newestFirst;
    }

    if (sortMode === 'attention') {
      return getAttentionRank(left) - getAttentionRank(right) || newestFirst;
    }

    return newestFirst;
  });
}

function getEmptyText(activeFilter, hasSearch) {
  if (hasSearch) {
    return 'За вашим пошуком нічого не знайдено.';
  }

  return registryFilters.find((filter) => filter.id === activeFilter)?.emptyText ?? 'Заяв за цим фільтром немає.';
}

export function ApplicationRegistry({
  applications,
  deletingApplicationId,
  isAdmin,
  isLoading,
  onDeleteApplication,
  onSelectApplication,
  selectedApplicationId,
  stations = [],
}) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stationFilter, setStationFilter] = useState('all');
  const [sortMode, setSortMode] = useState('attention');

  const stationOptions = useMemo(() => {
    if (stations.length > 0) {
      return stations;
    }

    const stationMap = new Map();
    applications.forEach((application) => {
      if (application.stationId && application.stationName) {
        stationMap.set(application.stationId, {
          id: application.stationId,
          name: application.stationName,
        });
      }
    });

    return [...stationMap.values()];
  }, [applications, stations]);

  const stationScopedApplications = useMemo(
    () =>
      isAdmin && stationFilter !== 'all'
        ? applications.filter((application) => String(application.stationId) === stationFilter)
        : applications,
    [applications, isAdmin, stationFilter],
  );

  const filterCounters = useMemo(
    () =>
      Object.fromEntries(
        registryFilters.map((filter) => [
          filter.id,
          stationScopedApplications.filter((application) => matchesFilter(application, filter.id)).length,
        ]),
      ),
    [stationScopedApplications],
  );

  const normalizedSearchQuery = normalizeSearchValue(searchQuery);
  const visibleApplications = useMemo(() => {
    const filtered = stationScopedApplications
      .filter((application) => matchesFilter(application, activeFilter))
      .filter((application) =>
        normalizedSearchQuery
          ? getSearchHaystack(application).includes(normalizedSearchQuery)
          : true,
      );

    return sortApplications(filtered, sortMode);
  }, [activeFilter, normalizedSearchQuery, sortMode, stationScopedApplications]);

  const hasSearch = normalizedSearchQuery.length > 0;
  const managerStationName = applications[0]?.stationName || stationOptions[0]?.name || 'станцію менеджера';

  return (
    <section className="manager-simple-grid manager-simple-grid--single">
      <section className="surface-card manager-card">
        <div className="section-header">
          <div>
            <h2>Заяви</h2>
            <p className="muted-copy">Швидкий реєстр для пошуку, контролю строків і роботи зі статусами.</p>
          </div>
          <span className="counter-chip">{visibleApplications.length}</span>
        </div>

        <div className="registry-toolbar">
          <label className="field-block registry-search">
            <span>Пошук</span>
            <input
              className="field-input"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Номер, ПІБ, телефон, email, адреса або об’єкт"
              type="search"
              value={searchQuery}
            />
          </label>

          {isAdmin ? (
            <label className="field-block">
              <span>Станція</span>
              <select
                className="field-input"
                onChange={(event) => setStationFilter(event.target.value)}
                value={stationFilter}
              >
                <option value="all">Усі станції</option>
                {stationOptions.map((station) => (
                  <option key={station.id} value={String(station.id)}>
                    {station.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="registry-station-note">
              <span>Станція</span>
              <strong>{managerStationName}</strong>
            </div>
          )}

          <label className="field-block">
            <span>Сортування</span>
            <select
              className="field-input"
              onChange={(event) => setSortMode(event.target.value)}
              value={sortMode}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="registry-filter-tabs" role="tablist" aria-label="Фільтри заявок">
          {registryFilters.map((filter) => (
            <button
              className={activeFilter === filter.id ? 'registry-filter-tab is-active' : 'registry-filter-tab'}
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              type="button"
            >
              <span>{filter.label}</span>
              <strong>{filterCounters[filter.id] ?? 0}</strong>
            </button>
          ))}
        </div>

        {isLoading ? <p className="muted-copy">Завантаження...</p> : null}
        {!isLoading && visibleApplications.length === 0 ? (
          <p className="muted-copy">{getEmptyText(activeFilter, hasSearch)}</p>
        ) : null}

        <div className="application-list">
          {visibleApplications.map((application) => {
            const isOverdue = isOverdueApplication(application);
            const isDueSoon = isDueSoonApplication(application);
            const objectName = getObjectName(application);
            const statusLabel = getApplicationStatusLabel(application.status, 'manager');
            const statusDescription = getApplicationStatusDescription(application.status, 'manager');
            const accessBadge = getAccessBadge(application);
            const isResubmitted = isResubmittedApplication(application);

            return (
              <article
                className={application.id === selectedApplicationId ? 'application-card is-active' : 'application-card'}
                key={application.id}
              >
                <button
                  className="application-card__main"
                  onClick={() => onSelectApplication(application.id)}
                  type="button"
                >
                  <div className="application-card__topline">
                    <span className="section-kicker">{application.applicationNumber}</span>
                    <span className={`summary-pill application-status-pill application-status-pill--${application.status}`}>
                      {statusLabel}
                    </span>
                    <span className={`summary-pill deadline-pill deadline-pill--${accessBadge.tone}`}>
                      {accessBadge.label}
                    </span>
                    {isResubmitted ? (
                      <span className="summary-pill deadline-pill deadline-pill--due_soon">Повторно подана</span>
                    ) : null}
                    {isOverdue ? (
                      <span className="summary-pill deadline-pill deadline-pill--overdue">Прострочено</span>
                    ) : null}
                    {!isOverdue && isDueSoon ? (
                      <span className="summary-pill deadline-pill deadline-pill--due_soon">Скоро строк</span>
                    ) : null}
                    {application.status === 'needs_clarification' ? (
                      <span className="summary-pill deadline-pill deadline-pill--due_soon">
                        Очікує уточнення від замовника
                      </span>
                    ) : null}
                  </div>

                  <strong>{application.applicantFullName}</strong>
                  {objectName ? <span>{objectName}</span> : null}
                  <span>{application.objectAddress}</span>
                  <div className="application-card__meta">
                    <span>Станція: {application.stationName}</span>
                    {application.objectRegion ? <span>Область: {application.objectRegion}</span> : null}
                    <span>Подано: {formatDate(application.receivedAt || application.createdAt)}</span>
                    <span>
                      Етапи: {application.stageSummary.completed}/{application.stageSummary.total}
                    </span>
                  </div>
                  <span className="application-card__status-note">{statusDescription}</span>
                </button>

                {isAdmin ? (
                  <div className="application-card__actions">
                    <button
                      className="danger-button"
                      disabled={deletingApplicationId === application.id}
                      onClick={() => onDeleteApplication(application)}
                      type="button"
                    >
                      {deletingApplicationId === application.id ? 'Видалення...' : 'Видалити'}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}
