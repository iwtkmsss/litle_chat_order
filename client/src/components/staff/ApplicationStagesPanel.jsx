import { useState } from 'react';
import {
  deadlineStatusLabels,
  stageStatusLabels,
  stageStatusOptions,
} from '../../connectionContent';
import { apiUrl } from '../../api';

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getStageStatusOptions(stage, draft) {
  return stageStatusOptions.filter((option) =>
    option.value !== 'not_required'
    || stage.isOptional
    || draft.status === 'not_required',
  );
}

export function ApplicationStagesPanel({
  deletingStageFileId,
  getStageDraft,
  onDeleteStageFinalFile,
  onSaveStage,
  onUploadStageFinalFile,
  savingStageId,
  selectedApplication,
  stageDrafts,
  uploadingStageFileId,
  updateStageDraft,
}) {
  const [expandedStageIds, setExpandedStageIds] = useState(() => new Set());
  const allStagesExpanded = selectedApplication.stages.every((stage) => expandedStageIds.has(stage.id));

  function toggleStage(stageId) {
    setExpandedStageIds((current) => {
      const next = new Set(current);

      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }

      return next;
    });
  }

  function toggleAllStages() {
    setExpandedStageIds((current) => {
      if (selectedApplication.stages.every((stage) => current.has(stage.id))) {
        return new Set();
      }

      return new Set(selectedApplication.stages.map((stage) => stage.id));
    });
  }

  return (
    <section className="surface-card manager-card application-detail-grid__wide">
      <div className="section-header">
        <div>
          <h2>Етапи виконання приєднання</h2>
          <p className="muted-copy">
            Очікуваний і граничний строки показуються замовнику відповідно до пункту 1.14 Порядку.
          </p>
        </div>
        <button className="secondary-button" onClick={toggleAllStages} type="button">
          {allStagesExpanded ? 'Згорнути всі' : 'Розгорнути всі'}
        </button>
      </div>

      <div className="stage-editor-list">
        {selectedApplication.stages.map((stage) => {
          const draft = stageDrafts[stage.id] ?? getStageDraft(stage);
          const isExpanded = expandedStageIds.has(stage.id);
          const contentId = `stage-editor-${stage.id}`;

          return (
            <article className={isExpanded ? 'stage-editor is-expanded' : 'stage-editor'} key={stage.id}>
              <div className="stage-editor__title">
                <span className="counter-chip">{stage.sortOrder}</span>
                <div>
                  <h3>{stage.title}</h3>
                  <p className="muted-copy">{stage.description}</p>
                  <div className="stage-editor__summary">
                    {stage.isOptional ? <span className="role-badge">За необхідності</span> : null}
                    <span className="summary-pill">{stageStatusLabels[stage.status]}</span>
                  </div>
                </div>
                <StatusPill status={stage.deadlineStatus} />
                <button
                  aria-controls={contentId}
                  aria-expanded={isExpanded}
                  className="secondary-button stage-editor__toggle"
                  onClick={() => toggleStage(stage.id)}
                  type="button"
                >
                  {isExpanded ? 'Згорнути' : 'Детально'}
                </button>
              </div>

              {isExpanded ? (
                <div className="stage-editor__body" id={contentId}>
                  <div className="stage-editor__controls">
                    <label className="field-block">
                      <span>Стадія виконання</span>
                      <select
                        className="field-input"
                        onChange={(event) => {
                          const nextStatus = event.target.value;
                          updateStageDraft(stage.id, {
                            status: nextStatus,
                            completedAt: nextStatus === 'completed'
                              ? draft.completedAt || getToday()
                              : '',
                          });
                        }}
                        value={draft.status}
                      >
                        {getStageStatusOptions(stage, draft).map((option) => (
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
                        disabled={draft.status !== 'completed'}
                        onChange={(event) => updateStageDraft(stage.id, { completedAt: event.target.value })}
                        type="date"
                        value={draft.completedAt}
                      />
                    </label>

                    <div className="field-block stage-final-file">
                      <span>Остаточний файл етапу</span>
                      <div className="stage-final-file__control">
                        <label className="secondary-button file-button">
                          {uploadingStageFileId === stage.id ? '...' : 'Файл'}
                          <input
                            disabled={uploadingStageFileId === stage.id}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = '';
                              onUploadStageFinalFile(stage, file);
                            }}
                            type="file"
                          />
                        </label>
                        {stage.finalFile ? (
                          <a className="stage-final-file__name" href={apiUrl(`/api/application-stage-files/${stage.id}`)}>
                            {stage.finalFile.originalName}
                          </a>
                        ) : (
                          <span className="stage-final-file__empty">Не додано</span>
                        )}
                        {stage.finalFile ? (
                          <button
                            aria-label="Прибрати файл"
                            className="icon-danger-button"
                            disabled={deletingStageFileId === stage.id}
                            onClick={() => onDeleteStageFinalFile(stage)}
                            title="Прибрати файл"
                            type="button"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    </div>
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
                </div>
              ) : null}
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
