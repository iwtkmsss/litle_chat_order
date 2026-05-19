import { useState } from 'react';
import { AuditLogPanel } from './AuditLogPanel';
import { DeadlineRulesPanel } from './DeadlineRulesPanel';
import { StageTemplatesPanel } from './StageTemplatesPanel';
import { StationSettingsPanel } from './StationSettingsPanel';

export function AdminSettingsPanel({
  auditEntries,
  deadlineDrafts,
  deadlineRules,
  handleSaveDeadlineRule,
  handleSaveSetting,
  handleSaveStageTemplate,
  handleSaveStation,
  isAdmin,
  savingDeadlineKey,
  savingSettingKey,
  savingStageTemplateId,
  savingStationId,
  setDeadlineDrafts,
  setSettingDrafts,
  setStageTemplateDrafts,
  setStationDrafts,
  settingDrafts,
  settings,
  stageTemplateDrafts,
  stageTemplates,
  stationDrafts,
  stations,
}) {
  const [activeConfigSection, setActiveConfigSection] = useState('stations');
  const configSections = [
    ['stations', 'Станції'],
    ['deadlines', 'Строки'],
    ['stages', 'Етапи'],
    ['settings', 'Сталі дані'],
    ['audit', 'Журнал дій'],
  ];

  if (!isAdmin) {
    return null;
  }

  return (
    <section className="admin-config-layout">
      <nav className="dashboard-subtabs" aria-label="Розділи налаштувань">
        {configSections.map(([id, label]) => (
          <button
            className={activeConfigSection === id ? 'dashboard-subtab is-active' : 'dashboard-subtab'}
            key={id}
            onClick={() => setActiveConfigSection(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      <StationSettingsPanel
        active={activeConfigSection === 'stations'}
        handleSaveStation={handleSaveStation}
        savingStationId={savingStationId}
        setStationDrafts={setStationDrafts}
        stationDrafts={stationDrafts}
        stations={stations}
      />

      <DeadlineRulesPanel
        active={activeConfigSection === 'deadlines'}
        deadlineDrafts={deadlineDrafts}
        deadlineRules={deadlineRules}
        handleSaveDeadlineRule={handleSaveDeadlineRule}
        savingDeadlineKey={savingDeadlineKey}
        setDeadlineDrafts={setDeadlineDrafts}
      />

      <StageTemplatesPanel
        active={activeConfigSection === 'stages'}
        handleSaveStageTemplate={handleSaveStageTemplate}
        savingStageTemplateId={savingStageTemplateId}
        setStageTemplateDrafts={setStageTemplateDrafts}
        stageTemplateDrafts={stageTemplateDrafts}
        stageTemplates={stageTemplates}
      />

      <StaticSettingsPanel
        active={activeConfigSection === 'settings'}
        handleSaveSetting={handleSaveSetting}
        savingSettingKey={savingSettingKey}
        setSettingDrafts={setSettingDrafts}
        settingDrafts={settingDrafts}
        settings={settings}
      />

      <AuditLogPanel active={activeConfigSection === 'audit'} auditEntries={auditEntries} />
    </section>
  );
}

function StaticSettingsPanel({
  active,
  handleSaveSetting,
  savingSettingKey,
  setSettingDrafts,
  settingDrafts,
  settings,
}) {
  return (
    <section className="surface-card manager-card application-detail-grid__wide" hidden={!active}>
      <div className="section-header">
        <div>
          <span className="section-kicker">Адмін</span>
          <h2>Сталі дані</h2>
        </div>
      </div>
      <div className="stage-editor-list">
        {settings.map((setting) => (
          <article className="stage-editor" key={setting.key}>
            <label className="field-block">
              <span>{setting.label}</span>
              {setting.valueType === 'textarea' ? (
                <textarea
                  className="field-input field-textarea"
                  onChange={(event) =>
                    setSettingDrafts((current) => ({ ...current, [setting.key]: event.target.value }))
                  }
                  rows={4}
                  value={settingDrafts[setting.key] ?? setting.value}
                />
              ) : (
                <input
                  className="field-input"
                  onChange={(event) =>
                    setSettingDrafts((current) => ({ ...current, [setting.key]: event.target.value }))
                  }
                  value={settingDrafts[setting.key] ?? setting.value}
                />
              )}
            </label>
            <p className="muted-copy">{setting.groupName} · {setting.description}</p>
            <button
              className="primary-button"
              disabled={savingSettingKey === setting.key}
              onClick={() => handleSaveSetting(setting.key)}
              type="button"
            >
              {savingSettingKey === setting.key ? 'Збереження...' : 'Зберегти'}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
