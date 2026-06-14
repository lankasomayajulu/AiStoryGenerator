import React, { useState } from 'react';

const StageElaborateV2 = ({
  activeSession,
  chapterGeneratedTitle,
  finalChapterDraft,
  instructionPack,
  onChapterTitleChange,
  onFinalChapterDraftChange,
  onInstructionPackChange,
  onGenerateElaboration,
  onSaveElaboration
}) => {
  const [busy, setBusy] = useState('');

  const runBusy = async (key, fn) => {
    try {
      setBusy(key);
      await fn();
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="elaborate-stage">
      <div className="stage-row">
        <h3>Elaborate Final Chapter</h3>
        <div className="stage-actions">
          <button
            onClick={() => runBusy('generate', onGenerateElaboration)}
            disabled={!activeSession || !!busy}
          >
            {busy === 'generate' ? 'Elaborating...' : 'Generate / Regenerate Chapter'}
          </button>
          <button
            onClick={() => runBusy('save', onSaveElaboration)}
            disabled={!activeSession || !!busy}
          >
            {busy === 'save' ? 'Saving...' : 'Save Chapter Draft'}
          </button>
        </div>
      </div>

      <label className="field">
        Chapter title (in language set above)
        <input
          type="text"
          value={chapterGeneratedTitle}
          onChange={(e) => onChapterTitleChange(e.target.value)}
          placeholder="Populated when you generate; you can edit before save"
        />
      </label>

      <label className="field">
        Instruction Pack
        <textarea
          value={instructionPack}
          onChange={(e) => onInstructionPackChange(e.target.value)}
          placeholder="Prompt instructions and chapter execution notes..."
        />
      </label>

      <label className="field">
        Final Chapter Draft
        <textarea
          className="large-editor"
          value={finalChapterDraft}
          onChange={(e) => onFinalChapterDraftChange(e.target.value)}
          placeholder="Final elaborated chapter text..."
        />
      </label>
    </div>
  );
};

export default StageElaborateV2;
