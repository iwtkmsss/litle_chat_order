import { useState } from 'react';
import { api } from '../api';
import {
  appendixDocumentDetails,
  applicationStatusDescriptions,
  applicationStatusLabels,
  connectionInfoSections,
  documentSamples,
  legalBase,
} from '../connectionContent';

function getCabinetPath(user) {
  if (user?.role === 'admin') {
    return '/admin';
  }

  if (user?.role === 'manager') {
    return '/manager';
  }

  return '/customer';
}

const deadlineHighlights = [
  ['10', 'робочих днів', 'підготовка договору, ТУ та рахунку'],
  ['10', 'календарних днів', 'оплата рахунку замовником'],
  ['3', 'місяці', 'повернення підписаного договору'],
  ['1', 'календарний день', 'тимчасове приєднання'],
];

export function ConnectionPortal({ activePage = 'connection', onNavigate, pendingAccess, user }) {
  const [activeModal, setActiveModal] = useState(null);
  const [lookupForm, setLookupForm] = useState({
    applicationNumber: '',
    email: '',
  });
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);

  async function handleLookup(event) {
    event.preventDefault();
    setIsLookingUp(true);
    setLookupError('');
    setLookupResult(null);

    try {
      const response = await api.lookupApplication(lookupForm);
      setLookupResult(response);
    } catch (lookupIssue) {
      setLookupError(lookupIssue.message);
    } finally {
      setIsLookingUp(false);
    }
  }

  function handleNavigate(item) {
    onNavigate?.(item.path);
  }

  const navItems = [
    { id: 'connection', label: 'Приєднання', path: '/' },
    { id: 'status', label: 'Перевірити заяву', path: '/status' },
    { id: 'documents', label: 'Документи', path: '/documents' },
    user
      ? { id: 'cabinet', label: 'Особистий кабінет', path: getCabinetPath(user) }
      : pendingAccess
        ? { id: 'pending', label: 'Моя заява', path: pendingAccess.path }
        : { id: 'login', label: 'Вхід', path: '/login' },
  ];

  return (
    <main className="workspace-shell public-shell">
      <nav className="public-nav" aria-label="Навігація сторінки приєднання">
        <div>
          <strong>Приєднання</strong>
          <span>Електронний сервіс теплових мереж</span>
        </div>

        <div className="public-nav__links">
          {navItems.map((item) => (
            <button
              className={activePage === item.id ? 'public-nav__link is-active' : 'public-nav__link'}
              key={item.id}
              onClick={() => handleNavigate(item)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {activePage === 'connection' ? (
        <section className="connection-clean-page">
          <header className="connection-clean-header surface-card">
            <div>
              <span className="section-kicker">Електронний сервіс</span>
              <h1>Приєднання до теплових мереж</h1>
              <p>
                Порядок подання заяви, перелік документів, контроль строків, підстави для відмови
                та особливості тимчасового приєднання в одному зручному просторі.
              </p>
            </div>

            <aside className="connection-deadline-panel" aria-label="Ключові строки">
              <span className="section-kicker">Контроль строків</span>
              <div className="connection-deadline-grid">
                {deadlineHighlights.map(([amount, unit, description]) => (
                  <span className="connection-deadline-item" key={description}>
                    <strong>{amount}</strong>
                    <small>{unit}</small>
                    <em>{description}</em>
                  </span>
                ))}
              </div>
            </aside>
          </header>

          <section className="connection-info-grid">
            {connectionInfoSections.map((section, index) => (
              <article
                className="connection-info-card surface-card"
                key={section.title}
              >
                <span className="counter-chip">{index + 1}</span>
                <h2>{section.title}</h2>
                <div className="info-copy">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {section.list ? (
                  <ol className="official-list connection-info-list">
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                ) : null}
              </article>
            ))}
          </section>
        </section>
      ) : null}

      {activePage === 'status' ? (
        <section className="public-page-narrow public-centered-page">
          <header className="public-page-header">
            <span className="section-kicker">Отримати інформацію</span>
            <h1>Перевірити стан заяви</h1>
            <p className="muted-copy">
              Введіть номер заявки та email, які були вказані під час подання заяви.
            </p>
          </header>

          <section className="surface-card lookup-card">
            <form className="lookup-form" onSubmit={handleLookup}>
              <label className="field-block">
                <span>Номер заяви</span>
                <input
                  className="field-input"
                  disabled={isLookingUp}
                  onChange={(event) =>
                    setLookupForm((current) => ({ ...current, applicationNumber: event.target.value }))
                  }
                  value={lookupForm.applicationNumber}
                />
              </label>

              <label className="field-block">
                <span>Email</span>
                <input
                  className="field-input"
                  disabled={isLookingUp}
                  onChange={(event) =>
                    setLookupForm((current) => ({ ...current, email: event.target.value }))
                  }
                  required
                  type="email"
                  value={lookupForm.email}
                />
              </label>

              <button className="primary-button" disabled={isLookingUp} type="submit">
                {isLookingUp ? 'Пошук...' : 'Отримати інформацію'}
              </button>
            </form>

            {lookupError ? <p className="form-error">{lookupError}</p> : null}
            {lookupResult ? (
              <div className="lookup-result">
                <article className="stage-note">
                  <strong>Заява {lookupResult.application.applicationNumber}</strong>
                  <br />
                  Статус: {applicationStatusLabels[lookupResult.application.status] ?? lookupResult.application.status}
                  <br />
                  {applicationStatusDescriptions[lookupResult.application.status] ?? 'Поточний статус заявки.'}
                </article>
                {lookupResult.requiresLogin ? (
                  <p className="stage-note">
                    Заявку прийнято. Для перегляду деталей увійдіть в особистий кабінет.
                  </p>
                ) : null}
                {lookupResult.accessPath ? (
                  <button className="primary-button" onClick={() => onNavigate?.(lookupResult.accessPath)} type="button">
                    Перейти до заявки
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        </section>
      ) : null}

      {activePage === 'documents' ? (
        <section className="public-page-narrow public-centered-page documents-page">
          <header className="public-page-header">
            <span className="section-kicker">Зразки та нормативна база</span>
            <h1>Документи</h1>
            <p className="muted-copy">
              Перелік зразків документів і нормативної бази, передбачених сторінкою
              «Приєднання».
            </p>
          </header>

          <section className="surface-card info-card">
            <h2>Зразки документів</h2>
            <div className="document-list">
              {documentSamples.map((document, index) => (
                <article className="document-row" key={document.href}>
                  <a
                    className="document-row__file"
                    download
                    href={document.href}
                  >
                    <strong>{document.title}</strong>
                    <span>{document.fileName}</span>
                  </a>
                  <button
                    className="secondary-button document-row__details"
                    onClick={() => setActiveModal({ type: 'appendix', index })}
                    type="button"
                  >
                    Детально
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="surface-card info-card">
            <h2>Нормативна база</h2>
            <div className="document-grid">
              {legalBase.map((documentName) => (
                <span className="document-chip document-chip--legal" key={documentName}>
                  {documentName}
                </span>
              ))}
            </div>
          </section>
        </section>
      ) : null}

      {activeModal ? (
        <InfoModal onClose={() => setActiveModal(null)}>
          <article className="modal-content">
            <h2>{appendixDocumentDetails[activeModal.index].title}</h2>
            <p className="muted-copy">{appendixDocumentDetails[activeModal.index].summary}</p>
            <div className="appendix-detail-list">
              <article className="appendix-detail">
                <ul>
                  {appendixDocumentDetails[activeModal.index].fields.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ul>
              </article>
            </div>
          </article>
        </InfoModal>
      ) : null}
    </main>
  );
}

function InfoModal({ children, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-shell surface-card" role="dialog" aria-modal="true">
        <div className="modal-toolbar">
          <button className="secondary-button" onClick={onClose} type="button">
            Закрити
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
