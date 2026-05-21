import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { ApplicationProgress } from '../components/ApplicationProgress';
import {
  PublicApplicationForm,
  createPublicApplicationInitialValues,
} from '../components/PublicApplicationForm';
import { SiteHeader } from '../components/SiteHeader';
import {
  connectionTypeLabels,
  getApplicationStatusDescription,
  getApplicationStatusLabel,
} from '../connectionContent';
import { getApplicationTypeConfig } from '../config/applicationFormConfig';
import { formatDate } from '../utils';

function getCabinetPath(user) {
  if (user?.role === 'admin') {
    return '/admin';
  }

  if (user?.role === 'manager') {
    return '/manager';
  }

  return '/customer';
}

function getLatestClarification(application) {
  return application?.statusHistory?.find(
    (entry) => entry.toStatus === 'needs_clarification' && entry.comment,
  );
}

export function PendingApplicationAccessPage({
  onNavigate,
  onPendingAccessChange,
  token,
  user,
}) {
  const [application, setApplication] = useState(null);
  const [stations, setStations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      if (user) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError('');

      try {
        const [applicationResponse, stationsResponse] = await Promise.all([
          token === 'session'
            ? api.getPendingApplication()
            : api.activatePendingApplicationAccess(token),
          api.listPublicStations(),
        ]);

        if (!active) {
          return;
        }

        setApplication(applicationResponse.application);
        setStations(stationsResponse.stations);
        onPendingAccessChange?.(applicationResponse.pendingAccess ?? {
          applicationId: applicationResponse.application.id,
          applicationNumber: applicationResponse.application.applicationNumber,
          path: '/application-access/session',
        });
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
          onPendingAccessChange?.(null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [onPendingAccessChange, token, user]);

  const latestClarification = useMemo(() => getLatestClarification(application), [application]);
  const applicationType = getApplicationTypeConfig(application?.appendixData?.questionnaire?.type);
  const canEdit = application?.status === 'needs_clarification' && !application?.customerUserId;

  async function handleResubmit(input) {
    setIsSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await api.updatePendingApplication(input);
      setApplication(response.application);
      setIsEditing(false);
      setMessage('Заяву повторно подано. Вона очікує перевірки оператором.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <main className="workspace-shell">
        <section className="surface-card splash-card">
          <h1>Завантажуємо заяву</h1>
        </section>
      </main>
    );
  }

  if (user) {
    return (
      <main className="workspace-shell">
        <section className="surface-card splash-card">
          <h1>Ви вже увійшли в систему</h1>
          <p className="muted-copy">
            Тимчасовий доступ не змішується з особистим кабінетом. Відкрийте свій кабінет
            або вийдіть із системи, щоб переглянути тимчасову заявку.
          </p>
          <button className="primary-button" onClick={() => onNavigate(getCabinetPath(user))} type="button">
            Особистий кабінет
          </button>
        </section>
      </main>
    );
  }

  if (error || !application) {
    return (
      <main className="workspace-shell">
        <section className="surface-card splash-card">
          <h1>Тимчасовий доступ недійсний</h1>
          <p className="muted-copy">
            {error || 'Посилання недійсне або заявка вже прийнята. Якщо заявку прийнято, увійдіть в особистий кабінет через сторінку входу.'}
          </p>
          <div className="header-actions">
            <button className="secondary-button" onClick={() => onNavigate('/status')} type="button">
              Перевірити статус
            </button>
            <button className="primary-button" onClick={() => onNavigate('/login')} type="button">
              До входу
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="workspace-shell">
      <SiteHeader
        activePath="/application-access/session"
        onNavigate={onNavigate}
        pendingAccess={{
          applicationId: application.id,
          applicationNumber: application.applicationNumber,
          path: '/application-access/session',
        }}
        user={user}
      />
      <header className="workspace-header">
        <div>
          <span className="section-kicker">Тимчасовий кабінет заявки</span>
          <h1>Заява {application.applicationNumber}</h1>
          <p className="muted-copy">
            Повноцінний особистий кабінет буде доступний після прийняття заявки оператором.
          </p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={() => onNavigate('/status')} type="button">
            Перевірити іншу заяву
          </button>
          <button className="primary-button" onClick={() => onNavigate('/login')} type="button">
            Вхід
          </button>
        </div>
      </header>

      {message ? <p className="surface-card success-message">{message}</p> : null}
      {error ? <p className="surface-card form-error">{error}</p> : null}

      <section className="surface-card manager-card">
        <div className="section-header">
          <div>
            <span className="section-kicker">Поточний стан</span>
            <h2>{getApplicationStatusLabel(application.status, 'customer')}</h2>
            <p className="muted-copy">
              {getApplicationStatusDescription(application.status, 'customer')}
            </p>
          </div>
          <span className="counter-chip">{formatDate(application.receivedAt)}</span>
        </div>

        <div className="detail-meta-grid">
          <span>Заявник: {application.applicantFullName}</span>
          <span>Email: {application.email}</span>
          <span>Телефон: {application.phone}</span>
          <span>Станція: {application.stationName}</span>
          <span>Об’єкт: {application.appendixData?.questionnaire?.objectName || application.objectAddress}</span>
          <span>Тип послуги: {connectionTypeLabels[application.connectionType]}</span>
          <span>Опитувальний лист: {applicationType.appendix}. {applicationType.title}</span>
        </div>
      </section>

      {application.status === 'submitted' ? (
        <section className="surface-card manager-card">
          <h2>Заява очікує перевірки оператором</h2>
          <p className="muted-copy">
            Редагування буде доступне, якщо оператор поверне заяву на доповнення.
          </p>
        </section>
      ) : null}

      {application.status === 'needs_clarification' ? (
        <section className="surface-card clarification-card">
          <div>
            <span className="section-kicker">Потрібна дія заявника</span>
            <h2>Потрібно уточнення</h2>
            <p>
              {latestClarification?.comment
                || 'Оператор очікує уточнення даних або додаткову інформацію.'}
            </p>
          </div>
          {!isEditing ? (
            <button className="primary-button" disabled={!canEdit} onClick={() => setIsEditing(true)} type="button">
              Редагувати заяву
            </button>
          ) : null}
        </section>
      ) : null}

      {application.status === 'accepted' || application.customerUserId ? (
        <section className="surface-card manager-card">
          <h2>Заявку прийнято</h2>
          <p className="muted-copy">
            Тимчасовий доступ закрито. Увійдіть в особистий кабінет через сторінку входу.
          </p>
          <button className="primary-button" onClick={() => onNavigate('/login')} type="button">
            До входу
          </button>
        </section>
      ) : null}

      {isEditing ? (
        <section className="surface-card manager-card">
          <div className="section-header">
            <div>
              <span className="section-kicker">Доповнення заяви</span>
              <h2>Редагувати і надіслати повторно</h2>
            </div>
          </div>
          <PublicApplicationForm
            disabled={isSaving}
            initialValues={createPublicApplicationInitialValues(application)}
            onCancel={() => setIsEditing(false)}
            onSubmit={handleResubmit}
            stations={stations}
            submitLabel="Надіслати повторно"
          />
        </section>
      ) : null}

      <section className="surface-card manager-card">
        <ApplicationProgress application={application} />
      </section>
    </main>
  );
}
