import React from 'react';

const ROLE_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'outline', label: 'Outline' },
  { value: 'instructions', label: 'Instructions' },
  { value: 'scene_details', label: 'Scene Details' },
];

const PlanningFilePanelV2 = ({
  project,
  selectedFileIds,
  onToggleFile,
  onCreateFile,
  onUpdateFilePromptRole,
  activeSessionId,
  onPreviewContextAssembly,
  onSuggestContextImprovements,
  contextPreviewLoading,
  suggestLoading,
}) => {
  return (
    <section className="planning-panel planning-files-panel">
      <div className="panel-title-row">
        <h2>Files</h2>
      </div>

      <div className="planning-context-tools">
        <p className="muted small-gap">
          GSD reads the same <strong>Instructions</strong> / <strong>Scene Details</strong> / filename tags as the main editor.
          Use <strong>Check context assembly</strong> to verify wrapping before generating.
        </p>
        <div className="context-tool-buttons">
          <button
            type="button"
            className="btn-context-tool"
            disabled={!activeSessionId || contextPreviewLoading}
            onClick={() => onPreviewContextAssembly?.()}
          >
            {contextPreviewLoading ? 'Checking…' : 'Check context assembly'}
          </button>
          <button
            type="button"
            className="btn-context-tool secondary"
            disabled={!activeSessionId || suggestLoading}
            onClick={() => onSuggestContextImprovements?.()}
          >
            {suggestLoading ? 'Suggesting…' : 'Suggest file improvements'}
          </button>
        </div>
      </div>

      {!project ? (
        <p className="muted">Loading project files...</p>
      ) : (
        <div className="folder-blocks">
          {project.folders.map((folder) => (
            <div key={folder._id} className="folder-block">
              <div className="folder-title-row">
                <h3>{folder.name}</h3>
                <button type="button" onClick={() => onCreateFile(folder._id)}>
                  + File
                </button>
              </div>
              {folder.files.length === 0 ? (
                <p className="muted">No files in this folder.</p>
              ) : (
                folder.files.map((file) => (
                  <div key={file._id} className="file-row planning-file-row">
                    <label className="file-check-label">
                      <input
                        type="checkbox"
                        checked={selectedFileIds.includes(String(file._id))}
                        onChange={() => onToggleFile(file._id)}
                      />
                      <span className="file-title">{file.name}</span>
                    </label>
                    <select
                      className="planning-file-role"
                      value={file.promptRole || 'default'}
                      title="Prompt wrapping for GSD and editor"
                      onChange={(e) => onUpdateFilePromptRole?.(file._id, e.target.value)}
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default PlanningFilePanelV2;
