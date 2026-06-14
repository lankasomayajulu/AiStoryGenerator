import React, { useState } from 'react';

const StageScenesV2 = ({
  activeSession,
  planParts,
  scenes,
  onChangeScenes,
  onGenerateAllScenes,
  onGeneratePartScenes,
  onSaveScenes,
  onReviseScene
}) => {
  const [busyAction, setBusyAction] = useState('');
  const [reviseSceneId, setReviseSceneId] = useState(null);
  const [reviseText, setReviseText] = useState('');

  const withBusy = async (key, callback) => {
    try {
      setBusyAction(key);
      await callback();
    } finally {
      setBusyAction('');
    }
  };

  const handleSceneField = (sceneIndex, key, value) => {
    const next = scenes.map((scene, idx) => (idx === sceneIndex ? { ...scene, [key]: value } : scene));
    onChangeScenes(next);
  };

  const openRevise = (scene) => {
    setReviseSceneId(scene._id);
    setReviseText('');
  };

  const submitRevise = async () => {
    if (!reviseSceneId || !reviseText.trim()) return;
    await withBusy('revise', () => onReviseScene?.(reviseSceneId, reviseText.trim()));
    setReviseSceneId(null);
    setReviseText('');
  };

  const sceneRowKey = (scene, idx) => (scene._id ? String(scene._id) : `idx-${idx}`);

  return (
    <div className="scenes-stage">
      <div className="stage-row">
        <h3>Write Scenes By Part</h3>
        <div className="stage-actions">
          <button
            onClick={() => withBusy('all', onGenerateAllScenes)}
            disabled={!activeSession || planParts.length === 0 || !!busyAction}
          >
            {busyAction === 'all' ? 'Generating...' : 'Generate / Regenerate All Scenes'}
          </button>
          <button
            onClick={() => withBusy('save', onSaveScenes)}
            disabled={!activeSession || !!busyAction}
          >
            {busyAction === 'save' ? 'Saving...' : 'Save Scenes'}
          </button>
        </div>
      </div>

      {planParts.length > 0 && (
        <div className="part-generate-row">
          {planParts.map((part) => (
            <button
              key={part.partIndex}
              onClick={() => withBusy(`part-${part.partIndex}`, () => onGeneratePartScenes(part.partIndex))}
              disabled={!activeSession || !!busyAction}
            >
              {busyAction === `part-${part.partIndex}`
                ? `Regenerating part ${part.partIndex}...`
                : `Regenerate part ${part.partIndex}`}
            </button>
          ))}
        </div>
      )}

      {scenes.length === 0 ? (
        <p className="muted">No scenes yet. Generate scenes from your approved plan parts.</p>
      ) : (
        <div className="scenes-list">
          {scenes.map((scene, index) => (
            <div key={sceneRowKey(scene, index)} className="scene-card">
              <div className="scene-heading">Part {scene.partIndex}</div>
              <label className="field">
                Scene Title
                <input
                  value={scene.sceneTitle || ''}
                  onChange={(e) => handleSceneField(index, 'sceneTitle', e.target.value)}
                />
              </label>
              <div className="scene-beat-row">
                <label className="field scene-beat-label">
                  Scene Beat
                  <textarea
                    value={scene.sceneBeat || ''}
                    onChange={(e) => handleSceneField(index, 'sceneBeat', e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="revise-instructions-btn"
                  disabled={!activeSession || !scene._id}
                  onClick={() => openRevise(scene)}
                >
                  Revise instructions
                </button>
              </div>
              <label className="field">
                Draft Text
                <textarea
                  value={scene.draftText || ''}
                  onChange={(e) => handleSceneField(index, 'draftText', e.target.value)}
                />
              </label>
            </div>
          ))}
        </div>
      )}

      {reviseSceneId && (
        <div className="modal-backdrop-planning-v2" onClick={() => setReviseSceneId(null)}>
          <div className="modal-panel-planning-v2 modal-narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-planning-v2">
              <h3>Revise scene</h3>
              <button type="button" className="modal-close-planning-v2" onClick={() => setReviseSceneId(null)}>
                ×
              </button>
            </div>
            <p className="muted modal-sub">
              Describe how this scene’s beat and draft should change. The model will rewrite this scene only, using
              neighbouring scenes for continuity.
            </p>
            <textarea
              className="revise-textarea"
              value={reviseText}
              onChange={(e) => setReviseText(e.target.value)}
              placeholder="e.g. Slow the pacing, add more interiority for X, cut the fight, shift tone to…"
            />
            <div className="modal-footer-planning-v2">
              <button type="button" className="btn-secondary-lite" onClick={() => setReviseSceneId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary-lite"
                disabled={busyAction === 'revise' || !reviseText.trim()}
                onClick={submitRevise}
              >
                {busyAction === 'revise' ? 'Regenerating…' : 'Regenerate scene'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StageScenesV2;
