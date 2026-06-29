import { useEffect, useState } from 'react';
import { PublicApplicationForm } from '../components/PublicApplicationForm';
import { SiteHeader } from '../components/SiteHeader';
import { ToastMessage } from '../components/ToastMessage';

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
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (registrationError) {
      setToast({
        id: Date.now(),
        message: registrationError,
        tone: 'error',
      });
    }
  }, [registrationError]);

  async function handleSubmit(input) {
    const result = await onRegister(input);

    if (!result) {
      return;
    }

    setPendingResult(result);
    setToast({
      id: Date.now(),
      message: result.accountLinked
        ? 'Заяву подано та додано до вашого особистого кабінету.'
        : 'Заяву подано. Тимчасовий кабінет створено.',
      tone: 'success',
    });
    onPendingAccessChange?.(result.accountLinked
      ? null
      : result.pendingAccess ?? {
        applicationId: result.application.id,
        applicationNumber: result.application.applicationNumber,
        path: '/application-access/session',
      });
  }

  return (
    <main className="workspace-shell public-shell">
      <ToastMessage
        key={toast?.id}
        message={toast?.message}
        onClose={() => setToast(null)}
        tone={toast?.tone}
      />
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
            Заповніть коротку форму. Якщо для email вже є особистий кабінет, заява автоматично
            з’явиться там. Якщо кабінету ще немає, після перевірки оператор підготує доступ.
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
              {pendingResult.application.objectRegion ? (
                <span><strong>Область</strong>{pendingResult.application.objectRegion}</span>
              ) : null}
            </div>
            <p className="muted-copy">
              {pendingResult.accountLinked
                ? 'Заяву додано до вашого існуючого особистого кабінету. Увійдіть з чинним паролем, щоб переглянути всі заявки за цим email.'
                : 'Збережіть цей номер. Він потрібен для перевірки стану заявки. Після прийняття заявки оператором буде підготовлено email-повідомлення з доступом до особистого кабінету.'}
            </p>
            <div className="form-actions">
              <button
                className="primary-button"
                onClick={() => onNavigate?.(pendingResult.accountLinked ? '/login' : pendingResult.pendingAccess?.path ?? '/application-access/session')}
                type="button"
              >
                {pendingResult.accountLinked ? 'Увійти в особистий кабінет' : 'Перейти до моєї заявки'}
              </button>
              <button className="secondary-button" onClick={() => onNavigate?.('/status')} type="button">
                Перевірити заяву
              </button>
            </div>
          </section>
        ) : (
          <section className="surface-card apply-form-card">
            {registrationError ? <p className="form-error field-block--wide">{registrationError}</p> : null}
            <PublicApplicationForm
              disabled={isRegistering}
              onSubmit={handleSubmit}
              submitLabel="Надіслати заяву"
            />
          </section>
        )}
      </section>
    </main>
  );
}
