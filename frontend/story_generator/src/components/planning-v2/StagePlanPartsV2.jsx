import React, { useState } from 'react';

const createBlankPart = (index) => ({
  partIndex: index,
  title: `Part ${index}`,
  objective: '',
  conflict: '',
  outcome: ''
});

const StagePlanPartsV2 = ({
  activeSession,
  parts,
  onChangeParts,
  onGeneratePlan,
  onSavePlan,
  onDeletePart,
  onDeleteAllParts
}) => {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleGenerate = async () => {
    if (!activeSession) return;
    try {
      setGenerating(true);
      await onGeneratePlan();
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!activeSession) return;
    try {
      setSaving(true);
      await onSavePlan();
    } finally {
      setSaving(false);
    }
  };

  const handlePartChange = (index, key, value) => {
    const next = parts.map((part, i) => (i === index ? { ...part, [key]: value } : part));
    onChangeParts(next);
  };

  const handleAddPart = () => {
    onChangeParts([...parts, createBlankPart(parts.length + 1)]);
  };

  return (
    <div className="plan-parts-stage">
      <div className="stage-row">
        <h3>Plan Chapter In Parts</h3>
        <div className="stage-actions">
          <button onClick={handleGenerate} disabled={generating || !activeSession}>
            {generating ? 'Generating...' : 'Generate / Regenerate Parts'}
          </button>
          <button onClick={handleSave} disabled={saving || !activeSession}>
            {saving ? 'Saving...' : 'Save Parts'}
          </button>
          <button onClick={handleAddPart} disabled={!activeSession}>+ Part</button>
          <button
            type="button"
            className="btn-danger-lite"
            disabled={!activeSession || parts.length === 0}
            onClick={() => {
              if (window.confirm('Delete all plan parts? Related scenes will also be removed.')) {
                onDeleteAllParts?.();
              }
            }}
          >
            Delete all parts
          </button>
        </div>
      </div>

      {parts.length === 0 ? (
        <p className="muted">No parts yet. Generate parts or add one manually.</p>
      ) : (
        <div className="plan-parts-list">
          {parts.map((part, index) => (
            <div key={`${part.partIndex}-${index}`} className="plan-part-card">
              <div className="plan-part-card-header">
                <span className="part-badge">Part {part.partIndex}</span>
                <button
                  type="button"
                  className="btn-danger-lite"
                  disabled={!activeSession}
                  onClick={() => {
                    if (window.confirm(`Delete part ${part.partIndex} and its scenes?`)) {
                      onDeletePart?.(part.partIndex);
                    }
                  }}
                >
                  Delete part
                </button>
              </div>
              <label className="field">
                Part Title
                <input
                  value={part.title}
                  onChange={(e) => handlePartChange(index, 'title', e.target.value)}
                />
              </label>
              <label className="field">
                Objective
                <textarea
                  value={part.objective || ''}
                  onChange={(e) => handlePartChange(index, 'objective', e.target.value)}
                />
              </label>
              <label className="field">
                Conflict
                <textarea
                  value={part.conflict || ''}
                  onChange={(e) => handlePartChange(index, 'conflict', e.target.value)}
                />
              </label>
              <label className="field">
                Outcome
                <textarea
                  value={part.outcome || ''}
                  onChange={(e) => handlePartChange(index, 'outcome', e.target.value)}
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StagePlanPartsV2;
