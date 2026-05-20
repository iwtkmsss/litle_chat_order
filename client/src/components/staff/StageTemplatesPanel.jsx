import { durationUnitLabels } from '../../connectionContent';

export function StageTemplatesPanel({
  active,
  handleSaveStageTemplate,
  savingStageTemplateId,
  setStageTemplateDrafts,
  stageTemplateDrafts,
  stageTemplates,
}) {
  return (
    <section className="surface-card manager-card application-detail-grid__wide" hidden={!active}>
      <div className="section-header">
        <div>
          <span className="section-kicker">Адмін</span>
          <h2>Шаблони етапів</h2>
        </div>
      </div>

      <div className="stage-editor-list">
        {stageTemplates.map((template) => {
          const draft = stageTemplateDrafts[template.id] ?? template;

          return (
            <article className="stage-editor" key={template.id}>
              <label className="field-block">
                <span>Назва етапу</span>
                <textarea
                  className="field-input"
                  onChange={(event) =>
                    setStageTemplateDrafts((current) => ({
                      ...current,
                      [template.id]: { ...draft, title: event.target.value },
                    }))
                  }
                  rows={2}
                  value={draft.title}
                />
              </label>
              <label className="field-block">
                <span>Опис</span>
                <textarea
                  className="field-input field-textarea"
                  onChange={(event) =>
                    setStageTemplateDrafts((current) => ({
                      ...current,
                      [template.id]: { ...draft, description: event.target.value },
                    }))
                  }
                  rows={2}
                  value={draft.description}
                />
              </label>
              <div className="stage-editor__controls">
                <label className="field-block">
                  <span>Порядок</span>
                  <input
                    className="field-input"
                    min="1"
                    onChange={(event) =>
                      setStageTemplateDrafts((current) => ({
                        ...current,
                        [template.id]: { ...draft, sortOrder: event.target.value },
                      }))
                    }
                    type="number"
                    value={draft.sortOrder}
                  />
                </label>
                <label className="field-block">
                  <span>Типовий очікуваний строк</span>
                  <input
                    className="field-input"
                    min="0"
                    onChange={(event) =>
                      setStageTemplateDrafts((current) => ({
                        ...current,
                        [template.id]: { ...draft, defaultExpectedDays: event.target.value },
                      }))
                    }
                    type="number"
                    value={draft.defaultExpectedDays}
                  />
                </label>
                <label className="field-block">
                  <span>Одиниця очікуваного строку</span>
                  <select
                    className="field-input"
                    onChange={(event) =>
                      setStageTemplateDrafts((current) => ({
                        ...current,
                        [template.id]: { ...draft, expectedDaysType: event.target.value },
                      }))
                    }
                    value={draft.expectedDaysType}
                  >
                    {Object.entries(durationUnitLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="field-block">
                  <span>Типовий граничний строк</span>
                  <input
                    className="field-input"
                    min="0"
                    onChange={(event) =>
                      setStageTemplateDrafts((current) => ({
                        ...current,
                        [template.id]: { ...draft, defaultDueDays: event.target.value },
                      }))
                    }
                    type="number"
                    value={draft.defaultDueDays}
                  />
                </label>
                <label className="field-block">
                  <span>Одиниця граничного строку</span>
                  <select
                    className="field-input"
                    onChange={(event) =>
                      setStageTemplateDrafts((current) => ({
                        ...current,
                        [template.id]: { ...draft, dueDaysType: event.target.value },
                      }))
                    }
                    value={draft.dueDaysType}
                  >
                    {Object.entries(durationUnitLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="stage-editor__footer">
                <label className="access-toggle">
                  <input
                    checked={Boolean(draft.isOptional)}
                    onChange={(event) =>
                      setStageTemplateDrafts((current) => ({
                        ...current,
                        [template.id]: { ...draft, isOptional: event.target.checked },
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Етап за необхідності</span>
                </label>
                <label className="access-toggle">
                  <input
                    checked={draft.isActive}
                    onChange={(event) =>
                      setStageTemplateDrafts((current) => ({
                        ...current,
                        [template.id]: { ...draft, isActive: event.target.checked },
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Активний етап для нових заяв</span>
                </label>
                <button
                  className="primary-button"
                  disabled={savingStageTemplateId === template.id}
                  onClick={() => handleSaveStageTemplate(template.id)}
                  type="button"
                >
                  {savingStageTemplateId === template.id ? 'Збереження...' : 'Зберегти шаблон'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
