import { durationUnitLabels } from '../../connectionContent';

export function DeadlineRulesPanel({
  active,
  deadlineDrafts,
  deadlineRules,
  handleSaveDeadlineRule,
  savingDeadlineKey,
  setDeadlineDrafts,
}) {
  return (
    <section className="surface-card manager-card application-detail-grid__wide" hidden={!active}>
      <div className="section-header">
        <div>
          <span className="section-kicker">Адмін</span>
          <h2>Правила строків</h2>
        </div>
      </div>

      <div className="stage-editor-list">
        {deadlineRules.map((rule) => {
          const draft = deadlineDrafts[rule.key] ?? rule;

          return (
            <article className="stage-editor" key={rule.key}>
              <div>
                <h3>{rule.label}</h3>
                <p className="muted-copy">{rule.description}</p>
              </div>
              <div className="stage-editor__controls">
                <label className="field-block">
                  <span>Кількість</span>
                  <input
                    className="field-input"
                    min="0"
                    onChange={(event) =>
                      setDeadlineDrafts((current) => ({
                        ...current,
                        [rule.key]: { ...draft, amount: event.target.value },
                      }))
                    }
                    type="number"
                    value={draft.amount}
                  />
                </label>
                <label className="field-block">
                  <span>Одиниця</span>
                  <select
                    className="field-input"
                    onChange={(event) =>
                      setDeadlineDrafts((current) => ({
                        ...current,
                        [rule.key]: { ...draft, unit: event.target.value },
                      }))
                    }
                    value={draft.unit}
                  >
                    {Object.entries(durationUnitLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Попереджати за днів</span>
                  <input
                    className="field-input"
                    min="0"
                    onChange={(event) =>
                      setDeadlineDrafts((current) => ({
                        ...current,
                        [rule.key]: { ...draft, warningDays: event.target.value },
                      }))
                    }
                    type="number"
                    value={draft.warningDays}
                  />
                </label>
              </div>
              <div className="stage-editor__footer">
                <label className="access-toggle">
                  <input
                    checked={draft.isActive}
                    onChange={(event) =>
                      setDeadlineDrafts((current) => ({
                        ...current,
                        [rule.key]: { ...draft, isActive: event.target.checked },
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Активне правило</span>
                </label>
                <button
                  className="primary-button"
                  disabled={savingDeadlineKey === rule.key}
                  onClick={() => handleSaveDeadlineRule(rule.key)}
                  type="button"
                >
                  {savingDeadlineKey === rule.key ? 'Збереження...' : 'Зберегти правило'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
