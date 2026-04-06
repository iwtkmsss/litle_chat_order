import { useState } from 'react';

export function LoginScreen({ error, isSubmitting, onSubmit }) {
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    await onSubmit({
      fullName,
      password,
    });
  }

  return (
    <main className="app-shell login-shell">
      <section className="login-layout">
        <form className="surface-card login-panel" onSubmit={handleSubmit}>
          <div>
            <h1>Вхід</h1>
          </div>

          <label className="field-block">
            <span>Ім'я та прізвище</span>
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
      </section>
    </main>
  );
}
