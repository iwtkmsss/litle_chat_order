import { useEffect, useState } from 'react';
import { api } from '../api';
import { PublicApplicationForm } from '../components/PublicApplicationForm';
import { SiteHeader } from '../components/SiteHeader';

export function ApplyPage({
  isRegistering,
  onNavigate,
  onPendingAccessChange,
  onRegister,
  pendingAccess,
  registrationError,
  user,
}) {
  const [pendingResult, setPendingResult] = useState(null);
  const [stations, setStations] = useState([]);
  const [stationsError, setStationsError] = useState('');
  const [isLoadingStations, setIsLoadingStations] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadStations() {
      setIsLoadingStations(true);
      setStationsError('');

      try {
        const response = await api.listPublicStations();

        if (active) {
          setStations(response.stations);
        }
      } catch (error) {
        if (active) {
          setStationsError(error.message);
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
  }, []);

  async function handleSubmit(input) {
    const result = await onRegister(input);

    if (!result) {
      return;
    }

    setPendingResult(result);
    onPendingAccessChange?.(result.pendingAccess ?? {
      applicationId: result.application.id,
      applicationNumber: result.application.applicationNumber,
      path: '/application-access/session',
    });
  }

  return (
    <main className="workspace-shell public-shell">
      <SiteHeader
        activePath="/apply"
        onNavigate={onNavigate}
        pendingAccess={pendingAccess}
        user={user}
      />

      <section className="apply-page">
        <header className="public-page-header apply-page__header">
          <h1>Подати заяву на приєднання</h1>
          <p className="muted-copy">
            Заповніть коротку форму. Після подання буде створено тимчасовий кабінет заявки,
            а оператор перевірить дані та повідомить про наступні кроки.
          </p>
        </header>

        {pendingResult ? (
          <section className="surface-card success-card">
            <h2>Заяву подано</h2>
            <p className="muted-copy">
              Ваша заява отримана та очікує перевірки оператором.
            </p>
            <div className="appendix-data-grid">
              <span className="application-number-highlight">
                <strong>Номер вашої заявки</strong>
                <em>{pendingResult.application.applicationNumber}</em>
              </span>
              <span><strong>Статус</strong>Заяву подано</span>
            </div>
            <p className="muted-copy">
              Збережіть цей номер. Він потрібен для перевірки стану заявки. Після прийняття заявки
              оператором буде підготовлено email-повідомлення з доступом до особистого кабінету.
            </p>
            <div className="form-actions">
              <button
                className="primary-button"
                onClick={() => onNavigate?.(pendingResult.pendingAccess?.path ?? '/application-access/session')}
                type="button"
              >
                Перейти до моєї заявки
              </button>
              <button className="secondary-button" onClick={() => onNavigate?.('/status')} type="button">
                Перевірити заяву
              </button>
            </div>
          </section>
        ) : (
          <section className="surface-card apply-form-card">
            {stationsError ? <p className="form-error field-block--wide">{stationsError}</p> : null}
            {registrationError ? <p className="form-error field-block--wide">{registrationError}</p> : null}
            <PublicApplicationForm
              disabled={isRegistering || isLoadingStations}
              onSubmit={handleSubmit}
              stations={stations}
              submitLabel="Надіслати заяву"
            />
          </section>
        )}
      </section>
    </main>
  );
}
