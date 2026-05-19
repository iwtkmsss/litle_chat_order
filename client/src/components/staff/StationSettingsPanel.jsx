function normalizeStationDraft(station) {
  return {
    name: station.name ?? '',
    edrpou: station.edrpou ?? '',
    address: station.address ?? '',
    phone: station.phone ?? '',
    email: station.email ?? '',
    directorName: station.directorName ?? '',
    notes: station.notes ?? '',
    isActive: station.isActive,
  };
}

export function StationSettingsPanel({
  active,
  handleSaveStation,
  savingStationId,
  setStationDrafts,
  stationDrafts,
  stations,
}) {
  return (
    <section className="surface-card manager-card application-detail-grid__wide" hidden={!active}>
      <div className="section-header">
        <div>
          <span className="section-kicker">Адмін</span>
          <h2>Станції/компанії</h2>
        </div>
        <span className="counter-chip">{stations.length}</span>
      </div>

      <div className="admin-edit-list">
        {stations.map((station) => {
          const draft = stationDrafts[station.id] ?? normalizeStationDraft(station);

          return (
            <article className="stage-editor" key={station.id}>
              <div className="stage-editor__controls">
                {['name', 'edrpou', 'address', 'phone', 'email', 'directorName'].map((field) => (
                  <label className="field-block" key={field}>
                    <span>
                      {{
                        name: 'Назва',
                        edrpou: 'ЄДРПОУ',
                        address: 'Адреса',
                        phone: 'Телефон',
                        email: 'Email',
                        directorName: 'ПІБ керівника',
                      }[field]}
                    </span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        setStationDrafts((current) => ({
                          ...current,
                          [station.id]: { ...draft, [field]: event.target.value },
                        }))
                      }
                      type={field === 'email' ? 'email' : 'text'}
                      value={draft[field]}
                    />
                  </label>
                ))}
              </div>

              <label className="field-block">
                <span>Примітки</span>
                <textarea
                  className="field-input field-textarea"
                  onChange={(event) =>
                    setStationDrafts((current) => ({
                      ...current,
                      [station.id]: { ...draft, notes: event.target.value },
                    }))
                  }
                  rows={2}
                  value={draft.notes}
                />
              </label>

              <div className="stage-editor__footer">
                <label className="access-toggle">
                  <input
                    checked={draft.isActive}
                    onChange={(event) =>
                      setStationDrafts((current) => ({
                        ...current,
                        [station.id]: { ...draft, isActive: event.target.checked },
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Активна</span>
                </label>
                <button
                  className="primary-button"
                  disabled={savingStationId === station.id}
                  onClick={() => handleSaveStation(station.id)}
                  type="button"
                >
                  {savingStationId === station.id ? 'Збереження...' : 'Зберегти'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function StationCreateForm({ disabled, onSubmit, setStationForm, stationForm }) {
  return (
    <form className="application-form" onSubmit={onSubmit}>
      <label className="field-block">
        <span>Назва</span>
        <input
          className="field-input"
          disabled={disabled}
          onChange={(event) => setStationForm((current) => ({ ...current, name: event.target.value }))}
          required
          value={stationForm.name}
        />
      </label>

      <label className="field-block">
        <span>ЄДРПОУ</span>
        <input
          className="field-input"
          disabled={disabled}
          onChange={(event) => setStationForm((current) => ({ ...current, edrpou: event.target.value }))}
          value={stationForm.edrpou}
        />
      </label>

      <label className="field-block field-block--wide">
        <span>Адреса</span>
        <input
          className="field-input"
          disabled={disabled}
          onChange={(event) => setStationForm((current) => ({ ...current, address: event.target.value }))}
          value={stationForm.address}
        />
      </label>

      <label className="field-block">
        <span>Телефон</span>
        <input
          className="field-input"
          disabled={disabled}
          onChange={(event) => setStationForm((current) => ({ ...current, phone: event.target.value }))}
          value={stationForm.phone}
        />
      </label>

      <label className="field-block">
        <span>Email</span>
        <input
          className="field-input"
          disabled={disabled}
          onChange={(event) => setStationForm((current) => ({ ...current, email: event.target.value }))}
          type="email"
          value={stationForm.email}
        />
      </label>

      <label className="field-block">
        <span>ПІБ керівника</span>
        <input
          className="field-input"
          disabled={disabled}
          onChange={(event) => setStationForm((current) => ({ ...current, directorName: event.target.value }))}
          value={stationForm.directorName}
        />
      </label>

      <label className="access-toggle">
        <input
          checked={stationForm.isActive}
          disabled={disabled}
          onChange={(event) => setStationForm((current) => ({ ...current, isActive: event.target.checked }))}
          type="checkbox"
        />
        <span>Активна</span>
      </label>

      <label className="field-block field-block--wide">
        <span>Примітки</span>
        <textarea
          className="field-input field-textarea"
          disabled={disabled}
          onChange={(event) => setStationForm((current) => ({ ...current, notes: event.target.value }))}
          rows={3}
          value={stationForm.notes}
        />
      </label>

      <button className="primary-button field-block--wide" disabled={disabled} type="submit">
        {disabled ? 'Створення...' : 'Створити станцію'}
      </button>
    </form>
  );
}
