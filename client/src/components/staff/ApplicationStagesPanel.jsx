import {
  deadlineStatusLabels,
  stageStatusLabels,
  stageStatusOptions,
} from '../../connectionContent';

export function ApplicationStagesPanel({
  getStageDraft,
  onSaveStage,
  savingStageId,
  selectedApplication,
  stageDrafts,
  updateStageDraft,
}) {
  return (
    <section className="surface-card manager-card application-detail-grid__wide">
      <div className="section-header">
        <div>
          <h2>Етапи виконання приєднання</h2>
          <p className="muted-copy">
            Очікуваний і граничний строки показуються замовнику відповідно до пункту 1.14 Порядку.
          </p>
        </div>
      </div>

      <div className="stage-editor-list">
        {selectedApplication.stages.map((stage) => {
          const draft = stageDrafts[stage.id] ?? getStageDraft(stage);

          return (
            <article className="stage-editor" key={stage.id}>
              <div className="stage-editor__title">
                <span className="counter-chip">{stage.sortOrder}</span>
                <div>
                  <h3>{stage.title}</h3>
                  <p className="muted-copy">{stage.description}</p>
                </div>
                <StatusPill status={stage.deadlineStatus} />
              </div>

              <div className="stage-editor__controls">
                <label className="field-block">
                  <span>Стадія виконання</span>
                  <select
                    className="field-input"
                    onChange={(event) => updateStageDraft(stage.id, { status: event.target.value })}
                    value={draft.status}
                  >
                    {stageStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-block">
                  <span>Очікуваний строк</span>
                  <input
                    className="field-input"
                    onChange={(event) => updateStageDraft(stage.id, { expectedAt: event.target.value })}
                    type="date"
                    value={draft.expectedAt}
                  />
                </label>

                <label className="field-block">
                  <span>Граничний строк</span>
                  <input
                    className="field-input"
                    onChange={(event) => updateStageDraft(stage.id, { dueAt: event.target.value })}
                    type="date"
                    value={draft.dueAt}
                  />
                </label>

                <label className="field-block">
                  <span>Дата початку</span>
                  <input
                    className="field-input"
                    onChange={(event) => updateStageDraft(stage.id, { startedAt: event.target.value })}
                    type="date"
                    value={draft.startedAt}
                  />
                </label>

                <label className="field-block">
                  <span>Виконано, дата виконання</span>
                  <input
                    className="field-input"
                    onChange={(event) => updateStageDraft(stage.id, { completedAt: event.target.value })}
                    type="date"
                    value={draft.completedAt}
                  />
                </label>
              </div>

              <label className="field-block">
                <span>Коментар для замовника</span>
                <textarea
                  className="field-input field-textarea"
                  onChange={(event) => updateStageDraft(stage.id, { publicNote: event.target.value })}
                  rows={3}
                  value={draft.publicNote}
                />
              </label>

              <div className="stage-editor__footer">
                <label className="access-toggle">
                  <input
                    checked={draft.isVisible}
                    onChange={(event) => updateStageDraft(stage.id, { isVisible: event.target.checked })}
                    type="checkbox"
                  />
                  <span>Показувати замовнику</span>
                </label>

                <span className="muted-copy">{stageStatusLabels[stage.status]}</span>

                <button
                  className="primary-button"
                  disabled={savingStageId === stage.id}
                  onClick={() => onSaveStage(stage)}
                  type="button"
                >
                  {savingStageId === stage.id ? 'Збереження...' : 'Зберегти етап'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StatusPill({ status }) {
  return (
    <span className={`summary-pill deadline-pill deadline-pill--${status}`}>
      {deadlineStatusLabels[status] ?? status}
    </span>
  );
}
