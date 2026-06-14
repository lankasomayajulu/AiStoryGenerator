import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { projectApi, settingsApi, openRouterApi, fileApi } from '../services/api';
import { saveProjectStructure } from '../utils/saveProjectStructure';
import { normalizeFileId } from '../utils/normalizeFileId';
import { useStatusBar } from '../context/StatusBarContext';
import LeftPanel from '../components/LeftPanel';
import RightPanel from '../components/RightPanel';
import './ProjectPage.css';

const patchFileInProject = (project, fileId, patch) => {
  const targetId = normalizeFileId(fileId);
  return {
    ...project,
    folders: project.folders.map((folder) => ({
      ...folder,
      files: folder.files.map((file) =>
        normalizeFileId(file._id) === targetId ? { ...file, ...patch } : file
      ),
    })),
  };
};

const ProjectPage = () => {
  const { projectId } = useParams();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [settings, setSettings] = useState(null);
  const [currentSettings, setCurrentSettings] = useState(null);
  const [models, setModels] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [savingFile, setSavingFile] = useState(false);
  const [currentEditorContent, setCurrentEditorContent] = useState(null);
  const [isGenerationDisabled, setIsGenerationDisabled] = useState(false);
  const [continuePrompt, setContinuePrompt] = useState(
    "Instructions: \nContinue the story below without repeating the story unless it is for literary effect. Include only the text you are adding. You should read what is before the tag and match the same style and tone, so the next text fits into the narrative properly. Please read all the data before, it may contain more detailed instructions.\n\n"
  );
  const [revisePrompt, setRevisePrompt] = useState(
    "Revise the part between [Passage] tags with the instructions provided."
  );
  const [continueSystemPrompt, setContinueSystemPrompt] = useState('');
  const [reviseSystemPrompt, setReviseSystemPrompt] = useState('');
  const { showStatus } = useStatusBar();

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  const loadFileContent = useCallback(async (fileId) => {
    const response = await fileApi.getById(fileId);
    const content = response.data.Content || '';
    setProject((prev) => {
      if (!prev) return prev;
      return patchFileInProject(prev, fileId, { content, contentLoaded: true });
    });
    return content;
  }, []);

  const ensureFilesContent = useCallback(
    async (fileIds) => {
      if (!project || !fileIds?.length) return {};
      const uniqueIds = [...new Set(fileIds.filter(Boolean))];
      const loaded = {};

      for (const fileId of uniqueIds) {
        const normalizedId = normalizeFileId(fileId);
        let found = null;
        for (const folder of project.folders) {
          found = folder.files.find((f) => normalizeFileId(f._id) === normalizedId);
          if (found) break;
        }
        if (!found) continue;
        if (found.contentLoaded) {
          loaded[normalizedId] = found.content;
          continue;
        }
        const response = await fileApi.getById(fileId);
        const content = response.data.Content || '';
        loaded[normalizedId] = content;
        setProject((prev) =>
          patchFileInProject(prev, fileId, { content, contentLoaded: true })
        );
      }

      return loaded;
    },
    [project]
  );

  const loadData = async () => {
    try {
      setLoading(true);

      const projectResponse = await projectApi.getById(projectId);
      const projectData = projectResponse.data;

      const folderMap = new Map(projectData.folders.map((f) => [f._id.toString(), f]));
      const folderIds = projectData.project.folderIds || [];
      const sortedFolders =
        folderIds.length > 0
          ? folderIds.map((id) => folderMap.get(id.toString())).filter(Boolean)
          : projectData.folders;

      const transformedProject = {
        name: projectData.project.Name,
        folders: sortedFolders.map((folder) => {
          const fileMap = new Map(
            projectData.files
              .filter((f) => f.FolderId === folder._id.toString())
              .map((f) => [f._id.toString(), f])
          );
          const fileIds = folder.fileIds || [];
          const sortedFiles =
            fileIds.length > 0
              ? fileIds.map((id) => fileMap.get(id.toString())).filter(Boolean)
              : Array.from(fileMap.values());

          return {
            _id: folder._id,
            name: folder.Name,
            projectId: folder.projectId,
            files: sortedFiles.map((file) => ({
              _id: file._id,
              name: file.Name,
              content: '',
              contentLoaded: false,
              folderId: file.FolderId,
              promptRole: file.promptRole || 'default',
              isSelected: false,
              isActive: false,
            })),
          };
        }),
      };

      let firstFile = null;
      for (const folder of transformedProject.folders) {
        if (folder.files.length > 0) {
          firstFile = folder.files[0];
          firstFile.isActive = true;
          break;
        }
      }

      if (firstFile) {
        setActiveFileId(firstFile._id);
        try {
          const fileResponse = await fileApi.getById(firstFile._id);
          firstFile.content = fileResponse.data.Content || '';
          firstFile.contentLoaded = true;
        } catch (error) {
          console.error('Failed to load initial file content:', error);
        }
      }

      setProject(transformedProject);

      const settingsResponse = await settingsApi.get();
      const loadedSettings = settingsResponse.data;
      setSettings(loadedSettings);
      setCurrentSettings(loadedSettings);

      const modelsResponse = await openRouterApi.getModels();
      const sortedModels = (modelsResponse.data || []).slice().sort((a, b) => {
        const aKey = a?.id || a?.name || '';
        const bKey = b?.id || b?.name || '';
        return aKey.localeCompare(bKey, undefined, { sensitivity: 'base' });
      });
      setModels(sortedModels);
    } catch (error) {
      console.error('Failed to load project:', error);
      showStatus('Failed to load project: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const updateProject = (updatedProject) => {
    setProject(updatedProject);
  };

  const updateSettings = (updatedSettings) => {
    setSettings(updatedSettings);
    setCurrentSettings(updatedSettings);
  };

  const updateCurrentSettings = (updatedCurrentSettings) => {
    setCurrentSettings(updatedCurrentSettings);
  };

  const getActiveFile = () => {
    if (!project || !activeFileId) return null;
    const targetId = normalizeFileId(activeFileId);
    for (const folder of project.folders) {
      const file = folder.files.find((f) => normalizeFileId(f._id) === targetId);
      if (file) return file;
    }
    return null;
  };

  const saveActiveFile = useCallback(
    async (content) => {
      if (!activeFileId || !project) {
        throw new Error('No active file to save');
      }

      setSavingFile(true);
      try {
        await fileApi.update(activeFileId, { Content: content });

        let updatedProject;
        setProject((prev) => {
          if (!prev) return prev;
          updatedProject = patchFileInProject(prev, activeFileId, {
            content,
            contentLoaded: true,
          });
          return updatedProject;
        });

        setCurrentEditorContent(content);

        const projectSnapshot =
          updatedProject ||
          patchFileInProject(project, activeFileId, { content, contentLoaded: true });

        await saveProjectStructure(projectId, projectSnapshot);
      } finally {
        setSavingFile(false);
      }
    },
    [activeFileId, project, projectId]
  );

  const setActiveFile = async (fileId) => {
    if (!project) return;

    if (activeFileId && activeFileId !== fileId && currentEditorContent !== null) {
      const currentActiveFile = getActiveFile();
      if (currentActiveFile) {
        try {
          await saveActiveFile(currentEditorContent);
          setProject((prev) =>
            patchFileInProject(prev, activeFileId, {
              isActive: false,
            })
          );
        } catch (error) {
          console.error('Failed to save file:', error);
          showStatus('Failed to save current file: ' + (error.response?.data?.error || error.message), 'error');
          return;
        }
      }
    }

    let targetFile = null;
    for (const folder of project.folders) {
      targetFile = folder.files.find((f) => f._id === fileId);
      if (targetFile) break;
    }

    if (targetFile && !targetFile.contentLoaded) {
      try {
        setSavingFile(true);
        await loadFileContent(fileId);
      } catch (error) {
        console.error('Failed to load file content:', error);
        showStatus('Failed to load file: ' + (error.response?.data?.error || error.message), 'error');
        setSavingFile(false);
        return;
      } finally {
        setSavingFile(false);
      }
    }

    setProject((prev) => ({
      ...prev,
      folders: prev.folders.map((folder) => ({
        ...folder,
        files: folder.files.map((file) => ({
          ...file,
          isActive: file._id === fileId,
        })),
      })),
    }));

    setActiveFileId(fileId);
    setCurrentEditorContent(null);
  };

  const updateActiveFileContent = (content) => {
    setCurrentEditorContent(content);
  };

  const syncActiveFileToProject = (content) => {
    if (!activeFileId) return;
    setProject((prev) => {
      if (!prev) return prev;
      return patchFileInProject(prev, activeFileId, {
        content,
        contentLoaded: true,
      });
    });
  };

  if (loading) {
    return (
      <div className="project-page">
        <div className="spinner">Loading project...</div>
      </div>
    );
  }

  if (!project || !settings || !currentSettings) {
    return (
      <div className="project-page">
        <div className="error">Failed to load project data</div>
      </div>
    );
  }

  const activeFile = getActiveFile();

  return (
    <div className="project-page">
      <LeftPanel
        project={project}
        projectId={projectId}
        settings={currentSettings}
        models={models}
        activeFileId={activeFileId}
        disabled={isGenerationDisabled}
        onProjectUpdate={updateProject}
        onSettingsUpdate={updateSettings}
        onCurrentSettingsChange={updateCurrentSettings}
        onSetActiveFile={setActiveFile}
        onEnsureFileContent={loadFileContent}
      />
      <RightPanel
        project={project}
        activeFile={activeFile}
        settings={currentSettings}
        savingFile={savingFile}
        continuePrompt={continuePrompt}
        revisePrompt={revisePrompt}
        continueSystemPrompt={continueSystemPrompt}
        reviseSystemPrompt={reviseSystemPrompt}
        onContentUpdate={updateActiveFileContent}
        onEditorContentChange={setCurrentEditorContent}
        onSyncActiveFileContent={syncActiveFileToProject}
        onSaveFile={saveActiveFile}
        onEnsureFilesContent={ensureFilesContent}
        onSetActiveFile={setActiveFile}
        onGenerationDisabledChange={setIsGenerationDisabled}
        onContinuePromptChange={setContinuePrompt}
        onRevisePromptChange={setRevisePrompt}
        onContinueSystemPromptChange={setContinueSystemPrompt}
        onReviseSystemPromptChange={setReviseSystemPrompt}
      />
    </div>
  );
};

export default ProjectPage;
