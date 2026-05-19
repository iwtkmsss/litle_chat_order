export function NotFoundPage({ cabinetPath, onNavigate, user }) {
  return (
    <main className="app-shell splash-shell">
      <section className="surface-card splash-card not-found-card">
        <span className="section-kicker">404</span>
        <h1>Сторінку не знайдено</h1>
        <p className="muted-copy">
          Можливо, посилання застаріло або адресу введено неправильно.
        </p>
        <div className="not-found-actions">
          <button className="primary-button" onClick={() => onNavigate('/')} type="button">
            На головну
          </button>
          {user ? (
            <button className="secondary-button" onClick={() => onNavigate(cabinetPath)} type="button">
              До кабінету
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
