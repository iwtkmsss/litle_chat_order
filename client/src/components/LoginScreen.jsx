import { useState } from 'react';
import { SiteHeader } from './SiteHeader';

export function LoginScreen({
  embedded = false,
  error,
  isSubmitting,
  onNavigate,
  onSubmit,
  pendingAccess,
  user,
}) {
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    await onSubmit({
      fullName,
      password,
    });
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
        <span>Email</span>
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
      <SiteHeader
        activePath="/login"
        onNavigate={onNavigate}
        pendingAccess={pendingAccess}
        user={user}
      />
      <section className="auth-page">
        <div className="auth-card surface-card">
          <div>
            <h1>Вхід до кабінету</h1>
            <p className="muted-copy auth-panel__lead">
              Увійдіть за email і тимчасовим паролем.
            </p>
          </div>

          {loginForm}

          <div className="auth-helper-links">
            <button className="link-button" onClick={() => onNavigate?.('/apply')} type="button">
              Подати нову заяву
            </button>
            <button className="link-button" onClick={() => onNavigate?.('/status')} type="button">
              Перевірити подану заяву
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
