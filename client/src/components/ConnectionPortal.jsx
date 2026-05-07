import { useState } from 'react';
import { api } from '../api';
import {
  appendixDocumentDetails,
  connectionInfoSections,
  documentSamples,
  legalBase,
} from '../connectionContent';
import { ApplicationProgress } from './ApplicationProgress';
import { LoginScreen } from './LoginScreen';

const navItems = [
  { id: 'connection', label: 'Приєднання' },
  { id: 'status', label: 'Перевірити заяву' },
  { id: 'documents', label: 'Документи' },
  { id: 'login', label: 'Вхід' },
];

export function ConnectionPortal({ error, isSubmitting, onLogin }) {
  const [activePage, setActivePage] = useState('connection');
  const [lookupForm, setLookupForm] = useState({
    phone: '',
    fullName: '',
    applicationNumber: '',
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
      setLookupResult(response.application);
    } catch (lookupIssue) {
      setLookupError(lookupIssue.message);
    } finally {
      setIsLookingUp(false);
    }
  }

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
              onClick={() => setActivePage(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {activePage === 'connection' ? (
        <>
          <header className="workspace-header public-header">
            <div>
              <span className="section-kicker">Окрема сторінка «Приєднання»</span>
              <h1>Приєднання до теплових мереж</h1>
              <p className="muted-copy">
                Загальна інформація, алгоритм приєднання, строки, підстави для відмови
                та особливості тимчасового приєднання на період воєнного стану.
              </p>
            </div>
          </header>

          <section className="public-main">
            {connectionInfoSections.map((section) => (
              <section className="surface-card info-card" key={section.title}>
                <h2>{section.title}</h2>
                <div className="info-copy">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>

                {section.list ? (
                  <ol className="official-list">
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                ) : null}
              </section>
            ))}
          </section>
        </>
      ) : null}

      {activePage === 'status' ? (
        <section className="public-page-narrow">
          <header className="public-page-header">
            <span className="section-kicker">Отримати інформацію</span>
            <h1>Перевірити стан заяви</h1>
            <p className="muted-copy">
              Введіть номер телефону та ПІБ або номер заяви, щоб побачити етапи виконання
              приєднання до теплових мереж.
            </p>
          </header>

          <section className="surface-card lookup-card">
            <form className="lookup-form" onSubmit={handleLookup}>
              <label className="field-block">
                <span>Номер телефону</span>
                <input
                  className="field-input"
                  disabled={isLookingUp}
                  onChange={(event) =>
                    setLookupForm((current) => ({ ...current, phone: event.target.value }))
                  }
                  required
                  value={lookupForm.phone}
                />
              </label>

              <label className="field-block">
                <span>Прізвище Ім’я По батькові</span>
                <input
                  className="field-input"
                  disabled={isLookingUp}
                  onChange={(event) =>
                    setLookupForm((current) => ({ ...current, fullName: event.target.value }))
                  }
                  value={lookupForm.fullName}
                />
              </label>

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

              <button className="primary-button" disabled={isLookingUp} type="submit">
                {isLookingUp ? 'Пошук...' : 'Отримати інформацію'}
              </button>
            </form>

            {lookupError ? <p className="form-error">{lookupError}</p> : null}
            {lookupResult ? <ApplicationProgress application={lookupResult} compact /> : null}
          </section>
        </section>
      ) : null}

      {activePage === 'documents' ? (
        <section className="public-page-narrow">
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
            <div className="document-grid">
              {documentSamples.map((document) => (
                <a
                  className="document-chip"
                  download
                  href={document.href}
                  key={document.href}
                >
                  <strong>{document.title}</strong>
                  <span>{document.fileName}</span>
                </a>
              ))}
            </div>
          </section>

          <section className="surface-card info-card">
            <h2>Що містять додатки</h2>
            <div className="appendix-detail-list">
              {appendixDocumentDetails.map((document) => (
                <article className="appendix-detail" key={document.title}>
                  <h3>{document.title}</h3>
                  <p className="muted-copy">{document.summary}</p>
                  <ul>
                    {document.fields.map((field) => (
                      <li key={field}>{field}</li>
                    ))}
                  </ul>
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

      {activePage === 'login' ? (
        <section className="public-page-narrow public-login-page">
          <header className="public-page-header">
            <span className="section-kicker">Особистий кабінет</span>
            <h1>Вхід</h1>
            <p className="muted-copy">
              Вхід для працівників виробничо-технічного відділу та замовників,
              яким створено кабінет.
            </p>
          </header>

          <section className="surface-card login-aside-card">
            <LoginScreen
              embedded
              error={error}
              isSubmitting={isSubmitting}
              onSubmit={onLogin}
            />
          </section>
        </section>
      ) : null}
    </main>
  );
}
