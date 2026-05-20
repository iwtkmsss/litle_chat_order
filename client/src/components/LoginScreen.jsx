import { useEffect, useState } from 'react';
import { api } from '../api';
import { PublicApplicationForm } from './PublicApplicationForm';

export function LoginScreen({
  embedded = false,
  error,
  isRegistering = false,
  isSubmitting,
  onRegister,
  onSubmit,
  registrationError,
}) {
  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [pendingResult, setPendingResult] = useState(null);
  const [stations, setStations] = useState([]);
  const [stationsError, setStationsError] = useState('');
  const [isLoadingStations, setIsLoadingStations] = useState(false);

  useEffect(() => {
    if (embedded || mode !== 'register') {
      return;
    }

    let active = true;

    async function loadStations() {
      setIsLoadingStations(true);
      setStationsError('');

      try {
        const response = await api.listPublicStations();

        if (active) {
          setStations(response.stations);
        }
      } catch (loadError) {
        if (active) {
          setStationsError(loadError.message);
        }
      } finally {
        if (active) {
          setIsLoadingStations(false);
        }
      }
    }

    loadStations();

    return () => {
      active = false;
    };
  }, [embedded, mode]);

  async function handleSubmit(event) {
    event.preventDefault();
    await onSubmit({
      fullName,
      password,
    });
  }

  async function handleRegistrationSubmit(event) {
    const result = await onRegister(event);
    setPendingResult(result);
  }

  const loginForm = (
    <form className={embedded ? 'login-panel login-panel--embedded' : 'login-panel'} onSubmit={handleSubmit}>
      {embedded ? (
        <div>
          <h1>Вхід</h1>
          <p className="muted-copy">Кабінет працівника або замовника</p>
        </div>
      ) : null}

      <label className="field-block">
        <span>ПІБ або email</span>
        <input
          autoComplete="username"
          className="field-input"
          disabled={isSubmitting}
          onChange={(event) => setFullName(event.target.value)}
          required
          value={fullName}
        />
      </label>

      <label className="field-block">
        <span>Пароль</span>
        <input
          autoComplete="current-password"
          className="field-input"
          disabled={isSubmitting}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>

      {error ? <p className="form-error">{error}</p> : null}

      <button className="primary-button" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Перевірка...' : 'Увійти'}
      </button>
    </form>
  );

  if (embedded) {
    return loginForm;
  }

  return (
    <main className="app-shell login-shell">
      <section className="surface-card auth-panel">
        <div className="auth-panel__head">
          <div>
            <span className="section-kicker">Особистий кабінет</span>
            <h1>{mode === 'login' ? 'Вхід' : 'Нова заява'}</h1>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Вхід або подання заяви">
            <button
              className={mode === 'login' ? 'auth-tab is-active' : 'auth-tab'}
              onClick={() => setMode('login')}
              type="button"
            >
              Вхід
            </button>
            <button
              className={mode === 'register' ? 'auth-tab is-active' : 'auth-tab'}
              onClick={() => setMode('register')}
              type="button"
            >
              Подати заяву
            </button>
          </div>
        </div>

        {mode === 'login' ? loginForm : null}

        {mode === 'register' && pendingResult ? (
          <section className="surface-card success-card">
            <span className="section-kicker">Заяву подано</span>
            <h2>Заяву подано</h2>
            <p className="muted-copy">
              Ваша заява отримана та очікує перевірки оператором.
            </p>
            <div className="appendix-data-grid">
              <span><strong>Номер заяви</strong>{pendingResult.application.applicationNumber}</span>
              <span><strong>Статус</strong>Подано</span>
            </div>
            <p className="muted-copy">
              Збережіть це посилання. Після прийняття заявки оператором буде підготовлено email-повідомлення з доступом до особистого кабінету.
            </p>
            <button className="primary-button" onClick={() => window.location.assign(pendingResult.accessPath)} type="button">
              Перейти до тимчасового кабінету заявки
            </button>
          </section>
        ) : null}

        {mode === 'register' && !pendingResult ? (
          <>
            {stationsError ? <p className="form-error field-block--wide">{stationsError}</p> : null}
            {registrationError ? <p className="form-error field-block--wide">{registrationError}</p> : null}
            <PublicApplicationForm
              disabled={isRegistering || isLoadingStations}
              onSubmit={handleRegistrationSubmit}
              stations={stations}
              submitLabel="Подати заяву"
            />
          </>
        ) : null}
      </section>
    </main>
  );
}
