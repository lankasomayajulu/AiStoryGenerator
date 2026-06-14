import React, { useEffect, useMemo, useState } from 'react';
import { projectApi } from '../services/api';
import './ImportFilesModal.css';

const formatFileLabel = (file) => `${file.name} (${file.folderName})`;

const ImportFilesModal = ({ targetFolderName, onClose, onImport }) => {
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setCatalogLoading(true);
        setCatalogError(null);
        const response = await projectApi.getImportCatalog();
        if (cancelled) return;
        const items = response.data || [];
        setCatalog(items);
        if (items.length > 0) {
          setSelectedProjectId(items[0]._id);
        }
      } catch (err) {
        if (!cancelled) {
          setCatalogError(
            err.response?.data?.error || err.message || 'Failed to load projects'
          );
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProject = useMemo(
    () => catalog.find((p) => p._id === selectedProjectId),
    [catalog, selectedProjectId]
  );

  const projectFiles = selectedProject?.files || [];

  useEffect(() => {
    setSelectedFileIds(new Set());
  }, [selectedProjectId]);

  const handleProjectChange = (e) => {
    setSelectedProjectId(e.target.value);
  };

  const toggleFile = (fileId) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedFileIds.size === 0 || submitting) return;
    setSubmitting(true);
    try {
      await onImport([...selectedFileIds]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="import-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
      <div className="import-modal-content">
        <div className="import-modal-header">
          <h4 id="import-modal-title">Import files</h4>
          <button
            type="button"
            className="import-modal-close"
            onClick={onClose}
            disabled={submitting}
            title="Close"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="import-modal-hint">
          Import copies of files from another project into folder{' '}
          <strong>{targetFolderName || 'selected folder'}</strong>.
        </p>

        {catalogLoading && <p className="import-modal-status">Loading projects…</p>}
        {catalogError && <p className="import-modal-error">{catalogError}</p>}

        {!catalogLoading && !catalogError && (
          <>
            <label className="import-field-label" htmlFor="import-project-select">
              Project
            </label>
            <select
              id="import-project-select"
              className="import-project-select"
              value={selectedProjectId}
              onChange={handleProjectChange}
              disabled={submitting || catalog.length === 0}
            >
              {catalog.length === 0 ? (
                <option value="">No projects available</option>
              ) : (
                catalog.map((project) => (
                  <option key={project._id} value={project._id}>
                    {project.name}
                  </option>
                ))
              )}
            </select>

            <label className="import-field-label">Files</label>
            <div className="import-files-list" role="listbox" aria-multiselectable="true">
              {projectFiles.length === 0 ? (
                <p className="import-modal-muted">No files in this project.</p>
              ) : (
                projectFiles.map((file) => (
                  <label key={file._id} className="import-file-row">
                    <input
                      type="checkbox"
                      checked={selectedFileIds.has(file._id)}
                      onChange={() => toggleFile(file._id)}
                      disabled={submitting}
                    />
                    <span className="import-file-label">{formatFileLabel(file)}</span>
                  </label>
                ))
              )}
            </div>
          </>
        )}

        <div className="import-modal-actions">
          <button
            type="button"
            className="import-btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Close
          </button>
          <button
            type="button"
            className="import-btn-primary"
            onClick={handleSubmit}
            disabled={
              submitting ||
              catalogLoading ||
              !!catalogError ||
              selectedFileIds.size === 0
            }
          >
            {submitting ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportFilesModal;
