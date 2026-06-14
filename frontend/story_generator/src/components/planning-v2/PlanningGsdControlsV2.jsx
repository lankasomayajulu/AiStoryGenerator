import React from 'react';

const LEVEL_OPTIONS = [
  { label: 'Brief', value: 'brief' },
  { label: 'Medium', value: 'medium' },
  { label: 'Detailed', value: 'detailed' }
];

const PlanningGsdControlsV2 = ({
  sceneBeatDetailLevel,
  sceneDraftDetailLevel,
  chapterDraftDetailLevel,
  chapterTitleLanguage,
  onSceneBeatDetailChange,
  onSceneDraftDetailChange,
  onChapterDraftDetailChange,
  onChapterTitleLanguageChange,
  onOpenModelModal,
  disabled
}) => (
  <div className="planning-gsd-controls-v2 planning-panel">
    <div className="gsd-controls-header">
      <h2>OpenRouter & generation depth</h2>
      <button type="button" onClick={onOpenModelModal} disabled={disabled}>
        Choose models…
      </button>
    </div>
    <div className="gsd-controls-grid">
      <label className="field">
        Scene beat detail
        <select
          value={sceneBeatDetailLevel}
          disabled={disabled}
          onChange={(e) => onSceneBeatDetailChange(e.target.value)}
        >
          {LEVEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Scene draft detail
        <select
          value={sceneDraftDetailLevel}
          disabled={disabled}
          onChange={(e) => onSceneDraftDetailChange(e.target.value)}
        >
          {LEVEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Final chapter elaboration depth
        <select
          value={chapterDraftDetailLevel}
          disabled={disabled}
          onChange={(e) => onChapterDraftDetailChange(e.target.value)}
        >
          {LEVEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Chapter title language
        <input
          type="text"
          value={chapterTitleLanguage}
          disabled={disabled}
          onChange={(e) => onChapterTitleLanguageChange(e.target.value)}
          placeholder="English, Türkçe, 中文…"
        />
      </label>
    </div>
  </div>
);

export default PlanningGsdControlsV2;
