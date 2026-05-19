import { useEffect, useState } from 'react';
import { api } from '../api';
import { DynamicApplicationFields } from './forms/DynamicApplicationFields';
import {
  DEFAULT_APPLICATION_TYPE_ID,
  getApplicationTypeConfig,
  getApplicationTypeOptions,
} from '../config/applicationFormConfig';

const initialRegistrationForm = {
  fullName: '',
  password: '',
  stationId: '',
  phone: '',
  email: '',
  mailingAddress: '',
  objectName: '',
  objectAddress: '',
  connectionReason: '',
  connectionType: 'standard',
  questionnaireType: DEFAULT_APPLICATION_TYPE_ID,
  designOrganization: '',
  constructionStartYear: '',
  commissioningYear: '',
  permittedHeatLoad: '',
  heatSupplyContractNumber: '',
  personalAccountNumber: '',
  additionalHeatLoad: '',
  totalHeatLoad: '',
  heatingLoad: '',
  hotWaterMaxLoad: '',
  hotWaterAverageLoad: '',
  ventilationLoad: '',
  technologyLoad: '',
  additionalCapacity: '',
  totalCapacity: '',
  projectDeveloper: '',
  constructionExecutor: '',
  existingHeatSource: '',
  heatObjectDescription: '',
  thirdPartyConnection: '',
  notificationMethod: '',
  notes: '',
};

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
  const [registrationForm, setRegistrationForm] = useState(initialRegistrationForm);
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
    event.preventDefault();
    await onRegister({
      ...registrationForm,
      customerName: registrationForm.customerName || registrationForm.fullName,
      customerAddress: registrationForm.customerAddress || registrationForm.mailingAddress,
      customerEmail: registrationForm.customerEmail || registrationForm.email,
      customerPhone: registrationForm.customerPhone || registrationForm.phone,
      notificationMethod: registrationForm.notificationMethod || registrationForm.email,
    });
  }

  function updateRegistrationField(key, value) {
    setRegistrationForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  const selectedApplicationType = getApplicationTypeConfig(registrationForm.questionnaireType);

  const loginForm = (
    <form className={embedded ? 'login-panel login-panel--embedded' : 'login-panel'} onSubmit={handleSubmit}>
      {embedded ? (
        <div>
          <h1>Вхід</h1>
          <p className="muted-copy">Кабінет працівника або замовника</p>
        </div>
      ) : null}

      <label className="field-block">
        <span>Прізвище Ім’я По батькові</span>
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

          <div className="auth-tabs" role="tablist" aria-label="Вхід або реєстрація">
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

        {mode === 'register' ? (
          <form className="registration-form" onSubmit={handleRegistrationSubmit}>
            <section className="registration-section">
              <h2>Дані замовника</h2>

              <label className="field-block">
                <span>Прізвище Ім’я По батькові</span>
                <input
                  autoComplete="name"
                  className="field-input"
                  disabled={isRegistering}
                  onChange={(event) =>
                    setRegistrationForm((current) => ({
                      ...current,
                      fullName: event.target.value,
                      customerName: current.customerName || event.target.value,
                    }))
                  }
                  required
                  value={registrationForm.fullName}
                />
              </label>

              <label className="field-block">
                <span>Пароль до кабінету</span>
                <input
                  autoComplete="new-password"
                  className="field-input"
                  disabled={isRegistering}
                  minLength={6}
                  onChange={(event) => updateRegistrationField('password', event.target.value)}
                  required
                  type="password"
                  value={registrationForm.password}
                />
              </label>

              <label className="field-block">
                <span>Телефон</span>
                <input
                  autoComplete="tel"
                  className="field-input"
                  disabled={isRegistering}
                  onChange={(event) =>
                    setRegistrationForm((current) => ({
                      ...current,
                      phone: event.target.value,
                      customerPhone: current.customerPhone || event.target.value,
                    }))
                  }
                  required
                  value={registrationForm.phone}
                />
              </label>

              <label className="field-block">
                <span>Email для листування</span>
                <input
                  autoComplete="email"
                  className="field-input"
                  disabled={isRegistering}
                  onChange={(event) =>
                    setRegistrationForm((current) => ({
                      ...current,
                      email: event.target.value,
                      customerEmail: current.customerEmail || event.target.value,
                      notificationMethod: current.notificationMethod || event.target.value,
                    }))
                  }
                  required
                  type="email"
                  value={registrationForm.email}
                />
              </label>

              <label className="field-block field-block--wide">
                <span>Адреса для листування</span>
                <input
                  className="field-input"
                  disabled={isRegistering}
                  onChange={(event) =>
                    setRegistrationForm((current) => ({
                      ...current,
                      mailingAddress: event.target.value,
                      customerAddress: current.customerAddress || event.target.value,
                    }))
                  }
                  required
                  value={registrationForm.mailingAddress}
                />
              </label>
            </section>

            <section className="registration-section">
              <h2>Дані заяви</h2>

              <label className="field-block field-block--wide">
                <span>Станція/компанія</span>
                <select
                  className="field-input"
                  disabled={isRegistering || isLoadingStations}
                  onChange={(event) => updateRegistrationField('stationId', event.target.value)}
                  required
                  value={registrationForm.stationId}
                >
                  <option value="">{isLoadingStations ? 'Завантаження...' : 'Оберіть станцію'}</option>
                  {stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-block">
                <span>Тип приєднання</span>
                <select
                  className="field-input"
                  disabled={isRegistering}
                  onChange={(event) => updateRegistrationField('connectionType', event.target.value)}
                  value={registrationForm.connectionType}
                >
                  <option value="standard">Приєднання до теплових мереж</option>
                  <option value="temporary">Тимчасове приєднання</option>
                </select>
              </label>

              <div className="appendix-form-section field-block--wide">
                <div>
                  <span className="section-kicker">Опитувальний лист</span>
                  <h3>{selectedApplicationType.appendix}. {selectedApplicationType.title}</h3>
                  <p className="muted-copy">{selectedApplicationType.description}</p>
                </div>

                <div className="questionnaire-type-grid field-block--wide">
                  {getApplicationTypeOptions().map((typeConfig) => (
                    <button
                      className={selectedApplicationType.id === typeConfig.id ? 'questionnaire-type-card is-active' : 'questionnaire-type-card'}
                      disabled={isRegistering}
                      key={typeConfig.id}
                      onClick={() => updateRegistrationField('questionnaireType', typeConfig.id)}
                      type="button"
                    >
                      <strong>{typeConfig.userLabel}</strong>
                      <span>{typeConfig.appendix}. {typeConfig.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              <DynamicApplicationFields
                applicationType={selectedApplicationType}
                disabled={isRegistering}
                onChange={updateRegistrationField}
                values={registrationForm}
              />

              <label className="field-block field-block--wide">
                <span>Підстава або причина приєднання</span>
                <textarea
                  className="field-input field-textarea"
                  disabled={isRegistering}
                  onChange={(event) => updateRegistrationField('connectionReason', event.target.value)}
                  rows={3}
                  value={registrationForm.connectionReason}
                />
              </label>

              <label className="field-block field-block--wide">
                <span>Примітки</span>
                <textarea
                  className="field-input field-textarea"
                  disabled={isRegistering}
                  onChange={(event) => updateRegistrationField('notes', event.target.value)}
                  rows={3}
                  value={registrationForm.notes}
                />
              </label>
            </section>

            {stationsError ? <p className="form-error field-block--wide">{stationsError}</p> : null}
            {registrationError ? <p className="form-error field-block--wide">{registrationError}</p> : null}

            <button className="primary-button field-block--wide" disabled={isRegistering} type="submit">
              {isRegistering ? 'Створення...' : 'Створити кабінет і подати заяву'}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
