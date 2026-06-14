import React, { useState } from 'react';

const StageExportV2 = ({ activeSession, folders, exportFolderId, onExportFolderChange, onExportArtifacts }) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!activeSession || !exportFolderId) return;
    try {
      setExporting(true);
      await onExportArtifacts();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="export-stage">
      <div className="stage-row">
        <h3>Export Artifacts To Files</h3>
      </div>

      <label className="field">
        Export Folder
        <select value={exportFolderId} onChange={(e) => onExportFolderChange(e.target.value)}>
          <option value="">Select folder</option>
          {folders.map((folder) => (
            <option key={folder._id} value={folder._id}>
              {folder.name}
            </option>
          ))}
        </select>
      </label>

      <button onClick={handleExport} disabled={exporting || !activeSession || !exportFolderId}>
        {exporting ? 'Exporting...' : 'Export Plan + Scenes + Instructions + Chapter'}
      </button>
    </div>
  );
};

export default StageExportV2;
