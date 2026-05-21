import { AppLogo } from '../AppLogo';

export function StaffLayout({
  activeDashboardPage,
  children,
  dashboardPages,
  error,
  isAdmin,
  onDashboardPageChange,
  onLogout,
  onOpenApplication,
  onOpenStation,
  onOpenUser,
  onRefresh,
  panelMessage,
  user,
}) {
  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <AppLogo compact />
          <div className="workspace-title-row">
            <h1>{isAdmin ? 'Адміністрування сервісу' : 'Реєстр заявників'}</h1>
            <span className="workspace-badge">
              {isAdmin ? 'Адмін-панель' : `Станція: ${user.stationName || 'не прив’язано'}`}
            </span>
          </div>
          <p className="muted-copy">
            Приєднання до теплових мереж, станції/компанії, етапи, документи, строки та журнал дій.
          </p>
        </div>

        <div className="header-actions">
          <button className="secondary-button" onClick={onRefresh} type="button">
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
            onClick={() => onDashboardPageChange(page.id)}
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
          <button className="primary-button" onClick={onOpenApplication} type="button">
            Нова заява
          </button>
          <button className="secondary-button" onClick={onOpenUser} type="button">
            {isAdmin ? 'Новий користувач' : 'Новий замовник'}
          </button>
          {isAdmin ? (
            <button className="secondary-button" onClick={onOpenStation} type="button">
              Нова станція/компанія
            </button>
          ) : null}
        </div>
      </section>

      {!isAdmin ? (
        <section className="surface-card manager-card manager-context-card">
          <div>
            <strong>Станція/компанія менеджера</strong>
            <span>{user.stationName || 'Не прив’язано'}</span>
          </div>
          <p className="muted-copy">
            Нові замовники та заявки автоматично належать до цієї станції/компанії.
          </p>
        </section>
      ) : null}

      {children}
    </main>
  );
}

export function DashboardModal({ children, isWide = false, onClose, title }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-label={title}
        aria-modal="true"
        className={isWide ? 'modal-shell modal-shell--wide surface-card' : 'modal-shell surface-card'}
        role="dialog"
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
