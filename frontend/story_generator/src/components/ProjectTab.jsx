import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { folderApi, fileApi, batchApi, projectApi } from '../services/api';
import { saveProjectStructure as persistProjectStructure } from '../utils/saveProjectStructure';
import { normalizeFileId } from '../utils/normalizeFileId';
import { exportFolderToDocx, loadFolderFileContents } from '../utils/folderDocxExport';
import Spinner from './Spinner';
import ImportFilesModal from './ImportFilesModal';
import { useStatusBar } from '../context/StatusBarContext';
import './ProjectTab.css';

const SortableFolder = ({ folder, expandedFolders, editingFolderId, editName, setEditName, onToggle, onRename, onSaveRename, onAddFile, onImport, onDelete, onExport, exportingFolderId, onFileClick, onFileSelect, onToggleExclusivePromptRole, onFileRename, onFileDelete, editingFileId, activeFileId, disabled }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: `folder-${folder._id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="folder-item">
      <div className="folder-header">
        <button
          className="expand-btn"
          onClick={() => onToggle(folder._id)}
        >
          {expandedFolders.has(folder._id) ? '−' : '+'}
        </button>
        <span
          {...attributes}
          {...listeners}
          className="folder-name"
        >
          {editingFolderId === folder._id ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => onSaveRename(folder._id)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') onSaveRename(folder._id);
                if (e.key === 'Escape') onRename(null, '');
              }}
              autoFocus
            />
          ) : (
            folder.name
          )}
        </span>
        <div className="folder-actions">
          <button onClick={() => onAddFile(folder._id)} title="Add File" disabled={disabled}>
            📄
          </button>
          <button
            onClick={() => onImport(folder._id)}
            title="Import files from another project"
            disabled={disabled}
          >
            📥
          </button>
          <button
            onClick={() => onExport(folder._id)}
            title="Export folder to Word"
            disabled={exportingFolderId === folder._id || disabled}
          >
            {exportingFolderId === folder._id ? '⏳' : '📤'}
          </button>
          <button onClick={() => onRename(folder._id, folder.name)} title="Rename">
            ✏️
          </button>
          <button onClick={() => onDelete(folder._id)} title="Delete">
            🗑️
          </button>
        </div>
      </div>

      {expandedFolders.has(folder._id) && (
        <SortableFileList
          folder={folder}
          onFileClick={onFileClick}
          onFileSelect={onFileSelect}
          onToggleExclusivePromptRole={onToggleExclusivePromptRole}
          onFileRename={onFileRename}
          onFileDelete={onFileDelete}
          editingFileId={editingFileId}
          editName={editName}
          setEditName={setEditName}
          activeFileId={activeFileId}
          disabled={disabled}
        />
      )}
    </div>
  );
};

const SortableFile = ({ file, onFileClick, onFileSelect, onToggleExclusivePromptRole, onFileRename, onFileDelete, editingFileId, editName, setEditName, activeFileId, disabled }) => {
  const handleRenameClick = () => {
    onFileRename(file._id, file.name);
  };

  const handleSaveRename = () => {
    onFileRename(file._id);
  };

  const handleCancelRename = () => {
    onFileRename(null);
  };
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: `file-${file._id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`file-item ${file.isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={() => !disabled && onFileClick(file._id)}
    >
      <input
        type="checkbox"
        checked={file.isSelected || false}
        onChange={() => onFileSelect(file._id)}
        onClick={(e) => e.stopPropagation()}
      />
      <span {...attributes} {...listeners} className="file-icon">
        📝
      </span>
      {editingFileId === file._id ? (
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSaveRename}
          onKeyPress={(e) => {
            if (e.key === 'Enter') handleSaveRename();
            if (e.key === 'Escape') handleCancelRename();
          }}
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="file-name">{file.name}</span>
      )}
      <div
        className="file-role-icons"
        role="group"
        aria-label="Prompt role"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={`file-role-icon-btn ${file.promptRole === 'instructions' ? 'active' : ''}`}
          title="Instructions — only one file project-wide"
          disabled={disabled}
          aria-pressed={file.promptRole === 'instructions'}
          onClick={() => onToggleExclusivePromptRole(file._id, 'instructions')}
        >
          📋
        </button>
        <button
          type="button"
          className={`file-role-icon-btn ${file.promptRole === 'scene_details' ? 'active' : ''}`}
          title="Scene details — only one file project-wide"
          disabled={disabled}
          aria-pressed={file.promptRole === 'scene_details'}
          onClick={() => onToggleExclusivePromptRole(file._id, 'scene_details')}
        >
          🎭
        </button>
        <button
          type="button"
          className={`file-role-icon-btn ${file.promptRole === 'outline' ? 'active' : ''}`}
          title="Outline — only one file project-wide"
          disabled={disabled}
          aria-pressed={file.promptRole === 'outline'}
          onClick={() => onToggleExclusivePromptRole(file._id, 'outline')}
        >
          📑
        </button>
      </div>
      <div className="file-actions">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRenameClick();
          }}
          title="Rename"
        >
          ✏️
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFileDelete(file._id);
          }}
          title="Delete"
        >
          🗑️
        </button>
      </div>
    </div>
  );
};

const SortableFileList = ({ folder, onFileClick, onFileSelect, onToggleExclusivePromptRole, onFileRename, onFileDelete, editingFileId, editName, setEditName, activeFileId, disabled }) => {
  const fileIds = folder.files.map(f => `file-${f._id}`);
  
  return (
    <SortableContext items={fileIds} strategy={verticalListSortingStrategy}>
      <div className="files-list">
        {folder.files.map((file) => (
          <SortableFile
            key={file._id}
            file={file}
            onFileClick={onFileClick}
            onFileSelect={onFileSelect}
            onToggleExclusivePromptRole={onToggleExclusivePromptRole}
            onFileRename={onFileRename}
            onFileDelete={onFileDelete}
            editingFileId={editingFileId}
            editName={editName}
            setEditName={setEditName}
            activeFileId={activeFileId}
            disabled={disabled}
          />
        ))}
      </div>
    </SortableContext>
  );
};

const ProjectTab = ({
  project,
  projectId,
  activeFileId,
  disabled,
  settings,
  onProjectUpdate,
  onSetActiveFile,
  onEnsureFileContent,
}) => {
  const [expandedFolders, setExpandedFolders] = useState(new Set(project.folders.map(f => f._id)));
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editingFileId, setEditingFileId] = useState(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [exportingFolderId, setExportingFolderId] = useState(null);
  const [importTargetFolderId, setImportTargetFolderId] = useState(null);
  const { showStatus, clearStatus } = useStatusBar();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const toggleFolder = (folderId) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const handleAddFolder = async () => {
    const name = prompt('Enter folder name:');
    if (!name || !name.trim()) return;

    try {
      setLoading(true);
      setLoadingMessage('Creating folder...');
      const response = await folderApi.create(name.trim(), projectId);
      const newFolder = {
        _id: response.data._id,
        name: response.data.Name,
        projectId: response.data.projectId,
        files: []
      };
      const updatedProject = {
        ...project,
        folders: [...project.folders, newFolder]
      };
      onProjectUpdate(updatedProject);
      setExpandedFolders(new Set([...expandedFolders, newFolder._id]));
      
      // Save project structure with new folder order
      await saveProjectStructure(updatedProject);
    } catch (error) {
      showStatus('Failed to create folder: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleAddFile = async (folderId) => {
    const name = prompt('Enter file name:');
    if (!name || !name.trim()) return;

    try {
      setLoading(true);
      setLoadingMessage('Creating file...');
      const response = await fileApi.create(name.trim(), folderId);
      const newFile = {
        _id: response.data._id,
        name: response.data.Name,
        content: response.data.Content || '',
        contentLoaded: true,
        folderId: response.data.FolderId,
        promptRole: response.data.promptRole || 'default',
        isSelected: false,
        isActive: false,
      };
      const updatedProject = {
        ...project,
        folders: project.folders.map(folder =>
          folder._id === folderId
            ? { ...folder, files: [...folder.files, newFile] }
            : folder
        )
      };
      onProjectUpdate(updatedProject);
      await saveProjectStructure(updatedProject);
    } catch (error) {
      showStatus('Failed to create file: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleRenameFolder = (folderId, name) => {
    setEditingFolderId(folderId);
    setEditName(name);
  };

  const handleSaveFolderRename = async (folderId) => {
    try {
      setLoading(true);
      setLoadingMessage('Renaming folder...');
      await folderApi.update(folderId, { Name: editName });
      const updatedProject = {
        ...project,
        folders: project.folders.map(f =>
          f._id === folderId ? { ...f, name: editName } : f
        )
      };
      onProjectUpdate(updatedProject);
      setEditingFolderId(null);
    } catch (error) {
      showStatus('Failed to rename folder: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleRenameFile = (fileId, name) => {
    if (fileId === null) {
      setEditingFileId(null);
      setEditName('');
      return;
    }
    if (name === undefined) {
      // This is a save operation
      handleSaveFileRename(fileId);
      return;
    }
    // This is starting an edit
    const file = project.folders.flatMap(f => f.files).find(f => f._id === fileId);
    if (file) {
      setEditingFileId(fileId);
      setEditName(file.name);
    }
  };

  const handleSaveFileRename = async (fileId) => {
    if (!fileId || !editName) {
      setEditingFileId(null);
      setEditName('');
      return;
    }
    try {
      setLoading(true);
      setLoadingMessage('Renaming file...');
      await fileApi.update(fileId, { Name: editName });
      const updatedProject = {
        ...project,
        folders: project.folders.map(folder => ({
          ...folder,
          files: folder.files.map(f =>
            f._id === fileId ? { ...f, name: editName } : f
          )
        }))
      };
      onProjectUpdate(updatedProject);
      setEditingFileId(null);
      setEditName('');
    } catch (error) {
      showStatus('Failed to rename file: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleDeleteFolder = async (folderId) => {
    const folder = project.folders.find(f => f._id === folderId);
    if (!folder) return;

    if (window.confirm(`Are you sure you want to delete "${folder.name}" and all its files?`)) {
      try {
        setLoading(true);
        setLoadingMessage('Deleting folder...');
        await folderApi.delete(folderId);
        const updatedProject = {
          ...project,
          folders: project.folders.filter(f => f._id !== folderId)
        };
        onProjectUpdate(updatedProject);
        
        // Save project structure after deletion
        await saveProjectStructure(updatedProject);
      } catch (error) {
        showStatus('Failed to delete folder: ' + (error.response?.data?.error || error.message), 'error');
      } finally {
        setLoading(false);
        setLoadingMessage('');
      }
    }
  };

  const handleDeleteFile = async (fileId) => {
    const file = project.folders.flatMap(f => f.files).find(f => f._id === fileId);
    if (!file) return;

    if (window.confirm(`Are you sure you want to delete "${file.name}"?`)) {
      try {
        setLoading(true);
        setLoadingMessage('Deleting file...');
        const folderId = file.folderId;
        await fileApi.delete(fileId);
        const updatedProject = {
          ...project,
          folders: project.folders.map(folder => ({
            ...folder,
            files: folder.files.filter(f => f._id !== fileId)
          }))
        };
        onProjectUpdate(updatedProject);
        await saveProjectStructure(updatedProject);
      } catch (error) {
        showStatus('Failed to delete file: ' + (error.response?.data?.error || error.message), 'error');
      } finally {
        setLoading(false);
        setLoadingMessage('');
      }
    }
  };

  const saveProjectStructure = async (projectToSave) => {
    try {
      setLoading(true);
      setLoadingMessage('Saving project structure...');
      await persistProjectStructure(projectId, projectToSave);
    } catch (error) {
      console.error('Failed to save project structure:', error);
      throw error;
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleSaveProject = async () => {
    try {
      await saveProjectStructure(project);
      showStatus('Project structure saved successfully!', 'success');
    } catch (error) {
      showStatus('Failed to save project: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleFileSelect = async (fileId) => {
    const normalizedFileId = normalizeFileId(fileId);
    let willSelect = false;
    for (const folder of project.folders) {
      const file = folder.files.find((f) => normalizeFileId(f._id) === normalizedFileId);
      if (file) {
        willSelect = !file.isSelected;
        break;
      }
    }

    let loadedContent;
    if (willSelect && onEnsureFileContent) {
      try {
        loadedContent = await onEnsureFileContent(fileId);
      } catch (error) {
        console.error('Failed to load file for context:', error);
        showStatus('Failed to load file content: ' + (error.response?.data?.error || error.message), 'error');
        return;
      }
    }

    const updatedProject = {
      ...project,
      folders: project.folders.map((folder) => ({
        ...folder,
        files: folder.files.map((f) => {
          if (normalizeFileId(f._id) !== normalizedFileId) return f;
          return {
            ...f,
            isSelected: !f.isSelected,
            ...(loadedContent !== undefined
              ? { content: loadedContent, contentLoaded: true }
              : {}),
          };
        }),
      })),
    };
    onProjectUpdate(updatedProject);
  };

  const applyPromptRoleMap = (idToRole) => {
    const updatedProject = {
      ...project,
      folders: project.folders.map((folder) => ({
        ...folder,
        files: folder.files.map((f) =>
          idToRole.has(f._id) ? { ...f, promptRole: idToRole.get(f._id) } : f
        ),
      })),
    };
    onProjectUpdate(updatedProject);
  };

  const handleToggleExclusivePromptRole = async (fileId, role) => {
    if (role !== 'instructions' && role !== 'scene_details' && role !== 'outline') return;

    let target = null;
    for (const folder of project.folders) {
      const f = folder.files.find((ff) => ff._id === fileId);
      if (f) {
        target = f;
        break;
      }
    }
    if (!target) return;

    const current = target.promptRole || 'default';

    if (current === role) {
      try {
        setLoading(true);
        setLoadingMessage('Updating file…');
        await fileApi.update(fileId, { promptRole: 'default' });
        applyPromptRoleMap(new Map([[fileId, 'default']]));
      } catch (error) {
        showStatus('Failed to update prompt role: ' + (error.response?.data?.error || error.message), 'error');
      } finally {
        setLoading(false);
        setLoadingMessage('');
      }
      return;
    }

    const idToRole = new Map();
    for (const folder of project.folders) {
      for (const f of folder.files) {
        if (f._id === fileId) continue;
        if ((f.promptRole || 'default') === role) {
          idToRole.set(f._id, 'default');
        }
      }
    }
    idToRole.set(fileId, role);

    const operations = [];
    for (const [id, pr] of idToRole) {
      operations.push({ type: 'updateFile', fileId: id, updates: { promptRole: pr } });
    }

    try {
      setLoading(true);
      setLoadingMessage('Updating file…');
      if (operations.length === 1) {
        await fileApi.update(fileId, { promptRole: role });
      } else {
        await batchApi.update(operations);
      }
      applyPromptRoleMap(idToRole);
    } catch (error) {
      showStatus('Failed to update prompt role: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleFileClick = (fileId) => {
    if (disabled) return; // Prevent changing active file when disabled
    onSetActiveFile(fileId);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // Handle folder reordering
    if (activeId.toString().startsWith('folder-') && overId.toString().startsWith('folder-')) {
      const oldIndex = project.folders.findIndex(f => `folder-${f._id}` === activeId);
      const newIndex = project.folders.findIndex(f => `folder-${f._id}` === overId);
      
      if (oldIndex !== newIndex) {
        const updatedProject = {
          ...project,
          folders: arrayMove(project.folders, oldIndex, newIndex)
        };
        onProjectUpdate(updatedProject);
        
        // Automatically save folder order
        try {
          setLoading(true);
          setLoadingMessage('Saving folder order...');
          const folderIds = updatedProject.folders.map(f => f._id);
          await projectApi.update(projectId, { folderIds });
        } catch (error) {
          showStatus('Failed to save folder order: ' + (error.response?.data?.error || error.message), 'error');
        } finally {
          setLoading(false);
          setLoadingMessage('');
        }
      }
      return;
    }

    // Handle file dropped onto folder
    if (activeId.toString().startsWith('file-') && overId.toString().startsWith('folder-')) {
      const fileId = activeId.toString().replace('file-', '');
      const targetFolderId = overId.toString().replace('folder-', '');
      
      // Find source folder and file
      let sourceFolder = null;
      let sourceFile = null;
      
      for (const folder of project.folders) {
        const file = folder.files.find(f => f._id === fileId);
        if (file) {
          sourceFolder = folder;
          sourceFile = file;
          break;
        }
      }

      if (!sourceFolder || !sourceFile) return;
      
      // Don't do anything if already in the target folder
      if (sourceFolder._id === targetFolderId) return;

      const targetFolder = project.folders.find(f => f._id === targetFolderId);
      if (!targetFolder) return;

      const updatedProject = { ...project };
      
      // Remove from source folder
      const sourceFolderIndex = updatedProject.folders.findIndex(f => f._id === sourceFolder._id);
      updatedProject.folders[sourceFolderIndex].files = updatedProject.folders[sourceFolderIndex].files.filter(
        f => f._id !== fileId
      );

      // Add to target folder (at the end)
      const targetFolderIndex = updatedProject.folders.findIndex(f => f._id === targetFolderId);
      const updatedFile = { ...sourceFile, folderId: targetFolderId };
      updatedProject.folders[targetFolderIndex].files = [...updatedProject.folders[targetFolderIndex].files, updatedFile];
      
      onProjectUpdate(updatedProject);

      // Update backend automatically
      try {
        setLoading(true);
        setLoadingMessage('Moving file...');
        const operations = [
          {
            type: 'updateFolder',
            folderId: sourceFolder._id,
            updates: {
              fileIds: updatedProject.folders[sourceFolderIndex].files.map(f => f._id)
            }
          },
          {
            type: 'updateFolder',
            folderId: targetFolderId,
            updates: {
              fileIds: updatedProject.folders[targetFolderIndex].files.map(f => f._id)
            }
          },
          {
            type: 'updateFile',
            fileId: fileId,
            updates: {
              FolderId: targetFolderId
            }
          }
        ];

        await batchApi.update(operations);
      } catch (error) {
        showStatus('Failed to move file: ' + (error.response?.data?.error || error.message), 'error');
        window.location.reload();
      } finally {
        setLoading(false);
        setLoadingMessage('');
      }
      return;
    }

    // Handle file movement/reordering
    if (activeId.toString().startsWith('file-') && overId.toString().startsWith('file-')) {
      const fileId = activeId.toString().replace('file-', '');
      const targetFileId = overId.toString().replace('file-', '');
      
      // Find source and target folders
      let sourceFolder = null;
      let targetFolder = null;
      let sourceFile = null;
      
      for (const folder of project.folders) {
        const file = folder.files.find(f => f._id === fileId);
        if (file) {
          sourceFolder = folder;
          sourceFile = file;
        }
        const targetFile = folder.files.find(f => f._id === targetFileId);
        if (targetFile) {
          targetFolder = folder;
        }
      }

      if (!sourceFolder || !targetFolder || !sourceFile) return;

      const updatedProject = { ...project };
      
      // Remove from source folder
      const sourceFolderIndex = updatedProject.folders.findIndex(f => f._id === sourceFolder._id);
      updatedProject.folders[sourceFolderIndex].files = updatedProject.folders[sourceFolderIndex].files.filter(
        f => f._id !== fileId
      );

      // Add to target folder
      const targetFolderIndex = updatedProject.folders.findIndex(f => f._id === targetFolder._id);
      const targetFolderFiles = updatedProject.folders[targetFolderIndex].files;
      const targetFileIndex = targetFolderFiles.findIndex(f => f._id === targetFileId);
      
      const updatedFile = { ...sourceFile, folderId: targetFolder._id };
      targetFolderFiles.splice(targetFileIndex, 0, updatedFile);
      
      onProjectUpdate(updatedProject);

      // Update backend automatically
      try {
        setLoading(true);
        setLoadingMessage('Saving file order...');
        const operations = [];
        
        // If moving between folders, update both folders and the file
        if (sourceFolder._id !== targetFolder._id) {
          operations.push({
            type: 'updateFolder',
            folderId: sourceFolder._id,
            updates: {
              fileIds: updatedProject.folders[sourceFolderIndex].files.map(f => f._id)
            }
          });

          operations.push({
            type: 'updateFolder',
            folderId: targetFolder._id,
            updates: {
              fileIds: updatedProject.folders[targetFolderIndex].files.map(f => f._id)
            }
          });

          operations.push({
            type: 'updateFile',
            fileId: fileId,
            updates: {
              FolderId: targetFolder._id
            }
          });
        } else {
          // Same folder - just reordering, only update the folder
          operations.push({
            type: 'updateFolder',
            folderId: targetFolder._id,
            updates: {
              fileIds: updatedProject.folders[targetFolderIndex].files.map(f => f._id)
            }
          });
        }

        await batchApi.update(operations);
      } catch (error) {
        showStatus('Failed to save file order: ' + (error.response?.data?.error || error.message), 'error');
        window.location.reload();
      } finally {
        setLoading(false);
        setLoadingMessage('');
      }
    }
  };

  const handleOpenImport = (folderId) => {
    setImportTargetFolderId(folderId);
  };

  const handleCloseImport = () => {
    setImportTargetFolderId(null);
  };

  const handleImportFiles = async (fileIds) => {
    if (!importTargetFolderId || !fileIds.length) return;

    const targetFolder = project.folders.find((f) => f._id === importTargetFolderId);
    if (!targetFolder) return;

    try {
      setLoading(true);
      setLoadingMessage('Importing files…');
      clearStatus();

      const response = await folderApi.importFiles(importTargetFolderId, fileIds);
      const imported = response.data.files || [];

      const newFiles = imported.map((file) => ({
        _id: file._id,
        name: file.Name,
        content: file.Content || '',
        contentLoaded: true,
        folderId: file.FolderId,
        promptRole: file.promptRole || 'default',
        isSelected: false,
        isActive: false,
      }));

      const updatedProject = {
        ...project,
        folders: project.folders.map((folder) =>
          folder._id === importTargetFolderId
            ? { ...folder, files: [...folder.files, ...newFiles] }
            : folder
        ),
      };

      onProjectUpdate(updatedProject);
      await saveProjectStructure(updatedProject);
      setExpandedFolders((prev) => new Set([...prev, importTargetFolderId]));
      setImportTargetFolderId(null);
      showStatus(
        `Successfully imported ${newFiles.length} file${newFiles.length === 1 ? '' : 's'} into "${targetFolder.name}"`,
        'success'
      );
    } catch (error) {
      showStatus(
        'Failed to import files: ' + (error.response?.data?.error || error.message),
        'error'
      );
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleExportFolder = async (folderId) => {
    const folder = project.folders.find((f) => f._id === folderId);
    if (!folder) return;

    if (!folder.files.length) {
      showStatus('This folder has no files to export.', 'error');
      return;
    }

    if (!settings?.DefaultModel) {
      showStatus('Set a default AI model in Settings before exporting.', 'error');
      return;
    }

    try {
      clearStatus();
      setExportingFolderId(folderId);
      setLoading(true);
      setLoadingMessage('Loading folder files…');
      showStatus('Loading folder files…', 'info', { persist: true });

      const files = await loadFolderFileContents(folder, onEnsureFileContent);

      await exportFolderToDocx({
        projectName: project.name,
        folder,
        files,
        model: settings.DefaultModel,
        onProgress: (message) => {
          setLoadingMessage(message);
          showStatus(message, 'info', { persist: true });
        },
      });
      showStatus('Folder exported successfully', 'success');
    } catch (error) {
      showStatus('Failed to export folder: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setExportingFolderId(null);
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const folderIds = project.folders.map(f => `folder-${f._id}`);
  const importTargetFolder = importTargetFolderId
    ? project.folders.find((f) => f._id === importTargetFolderId)
    : null;

  return (
    <div className="project-tab">
      {loading && <Spinner message={loadingMessage} />}
      {importTargetFolderId && (
        <ImportFilesModal
          targetFolderName={importTargetFolder?.name}
          onClose={handleCloseImport}
          onImport={handleImportFiles}
        />
      )}
      <div className="project-tab-header">
        <button className="icon-btn" onClick={handleSaveProject} title="Save Project">
          💾
        </button>
        <button className="icon-btn" onClick={handleAddFolder} title="Add Folder">
          ➕
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={folderIds} strategy={verticalListSortingStrategy}>
          <div className="folders-list">
            {project.folders.map((folder) => (
              <SortableFolder
                key={folder._id}
                folder={folder}
                expandedFolders={expandedFolders}
                editingFolderId={editingFolderId}
                editName={editName}
                setEditName={setEditName}
                onToggle={toggleFolder}
                onRename={handleRenameFolder}
                onSaveRename={handleSaveFolderRename}
                onAddFile={handleAddFile}
                onImport={handleOpenImport}
                onDelete={handleDeleteFolder}
                onExport={handleExportFolder}
                exportingFolderId={exportingFolderId}
                onFileClick={handleFileClick}
                onFileSelect={handleFileSelect}
                onToggleExclusivePromptRole={handleToggleExclusivePromptRole}
                onFileRename={handleRenameFile}
                onFileDelete={handleDeleteFile}
                editingFileId={editingFileId}
                activeFileId={activeFileId}
                disabled={disabled}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default ProjectTab;

