import { AppLogo } from '../AppLogo';
import { ToastMessage } from '../ToastMessage';

function getToastTone(message, fallbackTone = 'info') {
  if (!message) {
    return fallbackTone;
  }

  const normalized = String(message).toLocaleLowerCase('uk-UA');

  if (
    normalized.includes('не ') ||
    normalized.includes('помил') ||
    normalized.includes('заборон') ||
    normalized.includes('некорект') ||
    normalized.includes('не знайдено')
  ) {
    return 'error';
  }

  if (normalized.includes('заяву завершено') || normalized.includes('відновіть')) {
    return 'warning';
  }

  return fallbackTone;
}

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
  onNavigate,
  onRefresh,
  panelMessage,
  onPanelMessageClose,
  user,
}) {
  return (
    <main className="workspace-shell">
      <ToastMessage
        message={error || panelMessage}
        onClose={error ? undefined : onPanelMessageClose}
        tone={error ? 'error' : getToastTone(panelMessage, 'success')}
      />

      <header className="workspace-header">
        <AppLogo onClick={() => onNavigate?.('/')} />

        <nav className="workspace-nav" aria-label="Навігація кабінету">
          {dashboardPages.map((page) => (
            <button
              className={activeDashboardPage === page.id ? 'workspace-nav__link is-active' : 'workspace-nav__link'}
              key={page.id}
              onClick={() => onDashboardPageChange(page.id)}
              type="button"
            >
              {page.label}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <button className="primary-button" onClick={onOpenApplication} type="button">
            Нова заява
          </button>
          {isAdmin ? (
            <button className="secondary-button" onClick={onOpenUser} type="button">
              Новий користувач
            </button>
          ) : null}
          {isAdmin ? (
            <button className="secondary-button" onClick={onOpenStation} type="button">
              Нова станція
            </button>
          ) : null}
          <button className="secondary-button" onClick={onRefresh} type="button">
            Оновити
          </button>
          <button className="primary-button" onClick={onLogout} type="button">
            Вийти
          </button>
        </div>
      </header>

      <section className="dashboard-actions surface-card">
        <div>
          <span className="section-kicker">{isAdmin ? 'Адміністрування сервісу' : 'Реєстр заявників'}</span>
          <p className="muted-copy">
            {isAdmin
              ? 'Користувачі, станції/компанії, сталі дані, етапи, строки та журнал дій.'
              : `Станція/компанія: ${user.stationName || 'не прив’язано'}. Заявки, замовники та сталі дані компанії.`}
          </p>
        </div>
        <span className="workspace-badge">
          {isAdmin ? 'Адмін-панель' : 'Менеджер'}
        </span>
      </section>

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
