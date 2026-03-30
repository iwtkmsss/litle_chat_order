import { useEffect, useState } from 'react';

const initialStatus = {
  label: 'Проверяем сервер...',
  tone: 'pending',
};

export default function App() {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    let active = true;

    async function loadHealth() {
      try {
        const response = await fetch('/api/health');

        if (!response.ok) {
          throw new Error('API temporarily unavailable');
        }

        const payload = await response.json();

        if (!active) {
          return;
        }

        setStatus({
          label: `Сервер на связи: ${payload.message}`,
          tone: 'success',
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setStatus({
          label: 'Сервер пока не отвечает. Проверь запуск backend.',
          tone: 'error',
        });
      }
    }

    loadHealth();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">Workspace Ready</p>
        <h1>Основа под сайт и чат уже подготовлена</h1>
        <p className="lead">
          Здесь будет небольшой интерфейс общения с одним менеджером. Пока мы
          подняли рабочий фронтенд и backend, чтобы дальше спокойно наращивать
          функциональность.
        </p>

        <div className={`status-chip status-chip--${status.tone}`}>
          {status.label}
        </div>

        <div className="info-grid">
          <article className="info-card">
            <h2>Frontend</h2>
            <p>React + Vite, готовый для UI чата, форм и статусов.</p>
          </article>

          <article className="info-card">
            <h2>Backend</h2>
            <p>Express API с базовой структурой под сообщения и уведомления.</p>
          </article>

          <article className="info-card">
            <h2>Следующий шаг</h2>
            <p>Добавить хранение комментариев и отправку email при новых событиях.</p>
          </article>
        </div>
      </section>
    </main>
  );
}

