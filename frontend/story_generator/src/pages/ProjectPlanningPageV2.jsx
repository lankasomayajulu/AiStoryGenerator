import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  gsdSessionApi,
  planningFileApi,
  planningProjectApi,
  planningSettingsApi,
  planningOpenRouterApi,
} from '../services/gsdApi';
import PlanningSessionBarV2 from '../components/planning-v2/PlanningSessionBarV2';
import PlanningFilePanelV2 from '../components/planning-v2/PlanningFilePanelV2';
import PlanningWorkflowPanelV2 from '../components/planning-v2/PlanningWorkflowPanelV2';
import PlanningArtifactsPanelV2 from '../components/planning-v2/PlanningArtifactsPanelV2';
import { useStatusBar } from '../context/StatusBarContext';
import './ProjectPlanningPageV2.css';

const DEFAULT_DETAIL = 'medium';

const ProjectPlanningPageV2 = () => {
  const { projectId } = useParams();
  const { showStatus } = useStatusBar();
  const [project, setProject] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [chapterGoal, setChapterGoal] = useState('');
  const [nextChapterIntent, setNextChapterIntent] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [discussionMessages, setDiscussionMessages] = useState([]);
  const [planParts, setPlanParts] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [finalChapterDraft, setFinalChapterDraft] = useState('');
  const [instructionPack, setInstructionPack] = useState('');
  const [chapterGeneratedTitle, setChapterGeneratedTitle] = useState('');
  const [exportFolderId, setExportFolderId] = useState('');
  const [exportedFileCount, setExportedFileCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [contextPreviewOpen, setContextPreviewOpen] = useState(false);
  const [contextPreviewText, setContextPreviewText] = useState('');
  const [contextPreviewLoading, setContextPreviewLoading] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestModalOpen, setSuggestModalOpen] = useState(false);
  const [suggestResult, setSuggestResult] = useState(null);

  const [models, setModels] = useState([]);
  const [planningSettings, setPlanningSettings] = useState(null);
  const [sceneBeatDetailLevel, setSceneBeatDetailLevel] = useState(DEFAULT_DETAIL);
  const [sceneDraftDetailLevel, setSceneDraftDetailLevel] = useState(DEFAULT_DETAIL);
  const [chapterDraftDetailLevel, setChapterDraftDetailLevel] = useState(DEFAULT_DETAIL);
  const [chapterTitleLanguage, setChapterTitleLanguage] = useState('English');
  const [modelDiscuss, setModelDiscuss] = useState('');
  const [modelPlan, setModelPlan] = useState('');
  const [modelScene, setModelScene] = useState('');
  const [modelElaborate, setModelElaborate] = useState('');

  const activeSession = useMemo(
    () => sessions.find((session) => session._id === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  const resetWorkspace = useCallback(() => {
    setActiveSessionId(null);
    setChapterGoal('');
    setNextChapterIntent('');
    setSelectedFileIds([]);
    setDiscussionMessages([]);
    setPlanParts([]);
    setScenes([]);
    setFinalChapterDraft('');
    setInstructionPack('');
    setChapterGeneratedTitle('');
    setSceneBeatDetailLevel(DEFAULT_DETAIL);
    setSceneDraftDetailLevel(DEFAULT_DETAIL);
    setChapterDraftDetailLevel(DEFAULT_DETAIL);
    setChapterTitleLanguage('English');
    setModelDiscuss('');
    setModelPlan('');
    setModelScene('');
    setModelElaborate('');
  }, []);

  useEffect(() => {
    if (!projectId) return;
    loadInitialData();
  }, [projectId]);

  const toFrontendProject = (projectData) => {
    const folderMap = new Map(projectData.folders.map((f) => [f._id.toString(), f]));
    const folderIds = projectData.project.folderIds || [];
    const sortedFolders = folderIds.length
      ? folderIds.map((id) => folderMap.get(id.toString())).filter(Boolean)
      : projectData.folders;

    return {
      id: projectData.project._id,
      name: projectData.project.Name,
      folders: sortedFolders.map((folder) => {
        const fileMap = new Map(
          projectData.files
            .filter((file) => file.FolderId === folder._id.toString())
            .map((file) => [file._id.toString(), file])
        );
        const fileIds = folder.fileIds || [];
        const sortedFiles = fileIds.length
          ? fileIds.map((id) => fileMap.get(id.toString())).filter(Boolean)
          : Array.from(fileMap.values());

        return {
          _id: folder._id,
          name: folder.Name,
          files: sortedFiles.map((file) => ({
            _id: file._id,
            name: file.Name,
            promptRole: file.promptRole || 'default',
          }))
        };
      })
    };
  };

  const hydrateSessionFields = useCallback((session) => {
    if (!session) return;
    setChapterGoal(session.chapterGoal || '');
    setNextChapterIntent(session.nextChapterIntent || '');
    setSelectedFileIds((session.selectedFileIds || []).map((id) => String(id)));
    setDiscussionMessages(session.discussionMessages || []);
    setFinalChapterDraft(session.finalChapterDraft || '');
    setInstructionPack(session.instructionPack || '');
    setChapterGeneratedTitle(session.chapterGeneratedTitle || '');
    setSceneBeatDetailLevel(session.sceneBeatDetailLevel || DEFAULT_DETAIL);
    setSceneDraftDetailLevel(session.sceneDraftDetailLevel || DEFAULT_DETAIL);
    setChapterDraftDetailLevel(session.chapterDraftDetailLevel || DEFAULT_DETAIL);
    setChapterTitleLanguage(session.chapterTitleLanguage || 'English');
    setModelDiscuss(session.modelDiscuss || '');
    setModelPlan(session.modelPlan || '');
    setModelScene(session.modelScene || '');
    setModelElaborate(session.modelElaborate || '');
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [projectResponse, sessionsResponse, settingsResponse, modelsResponse] = await Promise.all([
        planningProjectApi.getById(projectId),
        gsdSessionApi.listByProject(projectId),
        planningSettingsApi.get().catch(() => ({ data: null })),
        planningOpenRouterApi.getModels().catch(() => ({ data: [] }))
      ]);

      const transformedProject = toFrontendProject(projectResponse.data);
      setProject(transformedProject);
      if (transformedProject.folders.length > 0) {
        setExportFolderId(String(transformedProject.folders[0]._id));
      }

      setPlanningSettings(settingsResponse.data || null);
      const sortedModels = (modelsResponse.data || []).slice().sort((a, b) => {
        const aKey = a?.id || a?.name || '';
        const bKey = b?.id || b?.name || '';
        return aKey.localeCompare(bKey, undefined, { sensitivity: 'base' });
      });
      setModels(sortedModels);

      const fetchedSessions = sessionsResponse.data || [];
      setSessions(fetchedSessions);

      if (fetchedSessions.length > 0) {
        await handleSelectSession(fetchedSessions[0]._id, fetchedSessions);
      } else {
        resetWorkspace();
      }
    } catch (error) {
      showStatus('Failed to load planning page: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSession = async (sessionId, sessionsOverride = null) => {
    const sessionPool = sessionsOverride || sessions;
    const cached = sessionPool.find((s) => s._id === sessionId);
    setActiveSessionId(sessionId);

    try {
      const response = await gsdSessionApi.getById(sessionId);
      const session = response.data?.session || cached;
      const plan = response.data?.plan || null;
      const loadedScenes = response.data?.scenes || [];
      if (!session) return;

      hydrateSessionFields(session);
      setPlanParts(Array.isArray(plan?.parts) ? plan.parts : []);
      setScenes(Array.isArray(loadedScenes) ? loadedScenes : []);

      setSessions((prev) =>
        prev.map((item) => (item._id === sessionId ? { ...item, ...session } : item))
      );
    } catch (error) {
      showStatus('Failed to load session details: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleCreateSession = async (title) => {
    const response = await gsdSessionApi.create(projectId, title);
    const newSession = response.data;
    const updatedSessions = [newSession, ...sessions];
    setSessions(updatedSessions);
    await handleSelectSession(newSession._id, updatedSessions);
  };

  const handleToggleFile = (fileId) => {
    const key = String(fileId);
    setSelectedFileIds((prev) =>
      prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key]
    );
  };

  const handleSaveContext = async () => {
    if (!activeSessionId) return;

    const updates = {
      selectedFileIds,
      chapterGoal,
      nextChapterIntent,
      status: 'in_progress',
      sceneBeatDetailLevel,
      sceneDraftDetailLevel,
      chapterDraftDetailLevel,
      chapterTitleLanguage,
      modelDiscuss,
      modelPlan,
      modelScene,
      modelElaborate
    };
    const response = await gsdSessionApi.updateContext(activeSessionId, updates);
    const updated = response.data;
    setSessions((prev) =>
      prev.map((session) => (session._id === activeSessionId ? updated : session))
    );
  };

  const handleCreateFile = async (folderId) => {
    const name = prompt('Enter file name:');
    if (!name || !name.trim()) return;

    try {
      const response = await planningFileApi.create(name.trim(), folderId);
      const newFile = response.data;
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          folders: prev.folders.map((folder) =>
            folder._id === folderId
              ? {
                  ...folder,
                  files: [
                    ...folder.files,
                    { _id: newFile._id, name: newFile.Name, promptRole: newFile.promptRole || 'default' },
                  ],
                }
              : folder
          ),
        };
      });
    } catch (error) {
      showStatus('Failed to create file: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleUpdateFilePromptRole = async (fileId, promptRole) => {
    try {
      await planningFileApi.update(fileId, { promptRole });
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          folders: prev.folders.map((folder) => ({
            ...folder,
            files: folder.files.map((f) =>
              f._id === fileId ? { ...f, promptRole } : f
            ),
          })),
        };
      });
    } catch (error) {
      showStatus('Failed to update prompt role: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handlePreviewContextAssembly = async () => {
    if (!activeSessionId) return;
    try {
      setContextPreviewLoading(true);
      const response = await gsdSessionApi.getContextPreview(activeSessionId);
      setContextPreviewText(response.data?.previewText || '');
      setContextPreviewOpen(true);
    } catch (error) {
      showStatus(
        'Failed to build context preview: ' + (error.response?.data?.error || error.message),
        'error'
      );
    } finally {
      setContextPreviewLoading(false);
    }
  };

  const handleSuggestContextImprovements = async () => {
    if (!activeSessionId) return;
    try {
      setSuggestLoading(true);
      const response = await gsdSessionApi.suggestContextImprovements(activeSessionId, {
        ...(modelDiscuss.trim() && { model: modelDiscuss.trim() }),
      });
      setSuggestResult(response.data);
      setSuggestModalOpen(true);
    } catch (error) {
      showStatus('Failed to load suggestions: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleDiscussSend = async (message) => {
    if (!activeSessionId) return;
    const previousMessages = [...discussionMessages];
    const optimisticMessages = [...previousMessages, { role: 'user', content: message }];
    setDiscussionMessages(optimisticMessages);

    try {
      const response = await gsdSessionApi.discuss(activeSessionId, {
        message,
        ...(modelDiscuss.trim() && { model: modelDiscuss.trim() })
      });
      const assistantMessage = response.data?.assistantMessage || '';
      const merged = [...optimisticMessages, { role: 'assistant', content: assistantMessage }];
      setDiscussionMessages(merged);

      setSessions((prev) =>
        prev.map((session) =>
          session._id === activeSessionId
            ? { ...session, discussionMessages: merged, status: 'in_progress' }
            : session
        )
      );
    } catch (error) {
      setDiscussionMessages(previousMessages);
      showStatus('Failed to send discuss message: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleGeneratePlan = async () => {
    if (!activeSessionId) return;
    try {
      const response = await gsdSessionApi.generatePlan(activeSessionId, {
        ...(modelPlan.trim() && { model: modelPlan.trim() })
      });
      const generatedPlan = response.data?.plan;
      if (!generatedPlan) return;
      setPlanParts(Array.isArray(generatedPlan.parts) ? generatedPlan.parts : []);
      if (generatedPlan.chapterGoal !== undefined) setChapterGoal(generatedPlan.chapterGoal || '');
      if (generatedPlan.nextChapterIntent !== undefined) {
        setNextChapterIntent(generatedPlan.nextChapterIntent || '');
      }
    } catch (error) {
      showStatus('Failed to generate plan parts: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleSavePlan = async () => {
    if (!activeSessionId) return;
    try {
      const response = await gsdSessionApi.savePlanParts(activeSessionId, {
        chapterGoal,
        nextChapterIntent,
        parts: planParts
      });
      const savedPlan = response.data?.plan;
      if (savedPlan?.parts) {
        setPlanParts(savedPlan.parts);
      }
    } catch (error) {
      showStatus('Failed to save plan parts: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleDeletePlanPart = async (partIndex) => {
    if (!activeSessionId) return;
    try {
      const response = await gsdSessionApi.deletePlanParts(activeSessionId, { partIndex });
      const plan = response.data?.plan;
      setPlanParts(Array.isArray(plan?.parts) ? plan.parts : []);
      setScenes(Array.isArray(response.data?.scenes) ? response.data.scenes : []);
    } catch (error) {
      showStatus('Failed to delete plan part: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleDeleteAllPlanParts = async () => {
    if (!activeSessionId) return;
    try {
      const response = await gsdSessionApi.deletePlanParts(activeSessionId, { partIndex: 'all' });
      const plan = response.data?.plan;
      setPlanParts(Array.isArray(plan?.parts) ? plan.parts : []);
      setScenes(Array.isArray(response.data?.scenes) ? response.data.scenes : []);
    } catch (error) {
      showStatus('Failed to delete plan parts: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const sceneGenOptions = () => ({
    sceneBeatDetailLevel,
    sceneDraftDetailLevel,
    ...(modelScene.trim() && { model: modelScene.trim() })
  });

  const handleGenerateAllScenes = async () => {
    if (!activeSessionId) return;
    try {
      const response = await gsdSessionApi.generateScenes(activeSessionId, sceneGenOptions());
      const generatedScenes = response.data?.scenes || [];
      setScenes(Array.isArray(generatedScenes) ? generatedScenes : []);
    } catch (error) {
      showStatus('Failed to generate scenes: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleGeneratePartScenes = async (partIndex) => {
    if (!activeSessionId) return;
    try {
      const response = await gsdSessionApi.generateScenes(activeSessionId, {
        partIndex,
        ...sceneGenOptions()
      });
      const generatedScenes = response.data?.scenes || [];
      setScenes(Array.isArray(generatedScenes) ? generatedScenes : []);
    } catch (error) {
      showStatus('Failed to generate part scenes: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleReviseScene = async (sceneId, instructions) => {
    if (!activeSessionId) return;
    try {
      const response = await gsdSessionApi.reviseScene(activeSessionId, {
        sceneId,
        instructions,
        sceneBeatDetailLevel,
        sceneDraftDetailLevel,
        ...(modelScene.trim() && { model: modelScene.trim() })
      });
      const nextScenes = response.data?.scenes || [];
      setScenes(Array.isArray(nextScenes) ? nextScenes : []);
    } catch (error) {
      showStatus('Failed to revise scene: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleSaveScenes = async () => {
    if (!activeSessionId) return;
    try {
      const response = await gsdSessionApi.saveScenes(activeSessionId, { scenes });
      const savedScenes = response.data?.scenes || [];
      setScenes(Array.isArray(savedScenes) ? savedScenes : []);
    } catch (error) {
      showStatus('Failed to save scenes: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleGenerateElaboration = async () => {
    if (!activeSessionId) return;
    try {
      const response = await gsdSessionApi.elaborateChapter(activeSessionId, {
        chapterDraftDetailLevel,
        ...(modelElaborate.trim() && { model: modelElaborate.trim() }),
        ...(chapterTitleLanguage.trim() && { chapterTitleLanguage: chapterTitleLanguage.trim() })
      });
      setFinalChapterDraft(response.data?.finalChapterDraft || '');
      setInstructionPack(response.data?.instructionPack || '');
      setChapterGeneratedTitle(response.data?.chapterGeneratedTitle || '');
      setSessions((prev) =>
        prev.map((session) =>
          session._id === activeSessionId ? { ...session, status: 'completed' } : session
        )
      );
    } catch (error) {
      showStatus('Failed to elaborate chapter: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleSaveElaboration = async () => {
    if (!activeSessionId) return;
    try {
      const response = await gsdSessionApi.saveElaboration(activeSessionId, {
        finalChapterDraft,
        instructionPack,
        chapterGeneratedTitle
      });
      setFinalChapterDraft(response.data?.finalChapterDraft || '');
      setInstructionPack(response.data?.instructionPack || '');
      setChapterGeneratedTitle(response.data?.chapterGeneratedTitle || '');
      setSessions((prev) =>
        prev.map((session) =>
          session._id === activeSessionId ? { ...session, status: 'completed' } : session
        )
      );
    } catch (error) {
      showStatus('Failed to save chapter elaboration: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleExportArtifacts = async () => {
    if (!activeSessionId || !exportFolderId) return;
    try {
      const response = await gsdSessionApi.exportArtifacts(activeSessionId, {
        folderId: exportFolderId
      });
      const createdFiles = response.data?.createdFiles || [];
      setExportedFileCount(createdFiles.length);
      showStatus(`Export completed. Created ${createdFiles.length} files in selected folder.`, 'success');
      await loadInitialData();
      await handleSelectSession(activeSessionId);
    } catch (error) {
      showStatus('Failed to export artifacts: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleApplyModelChoices = (m) => {
    setModelDiscuss(m.modelDiscuss || '');
    setModelPlan(m.modelPlan || '');
    setModelScene(m.modelScene || '');
    setModelElaborate(m.modelElaborate || '');
  };

  return (
    <div className="project-planning-page-v2">
      <div className="planning-header">
        <h1>Planning Phase</h1>
        <p>{project ? `${project.name} (${projectId})` : `Project ID: ${projectId}`}</p>
      </div>

      {loading ? (
        <div className="planning-loading">Loading planning workspace...</div>
      ) : (
        <>
          <PlanningSessionBarV2
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={handleSelectSession}
            onCreateSession={handleCreateSession}
          />

          <div className="planning-layout">
            <PlanningFilePanelV2
              project={project}
              selectedFileIds={selectedFileIds}
              onToggleFile={handleToggleFile}
              onCreateFile={handleCreateFile}
              onUpdateFilePromptRole={handleUpdateFilePromptRole}
              activeSessionId={activeSessionId}
              onPreviewContextAssembly={handlePreviewContextAssembly}
              onSuggestContextImprovements={handleSuggestContextImprovements}
              contextPreviewLoading={contextPreviewLoading}
              suggestLoading={suggestLoading}
            />

            <PlanningWorkflowPanelV2
              activeSession={activeSession}
              models={models}
              planningSettings={planningSettings}
              chapterGoal={chapterGoal}
              nextChapterIntent={nextChapterIntent}
              discussionMessages={discussionMessages}
              planParts={planParts}
              scenes={scenes}
              chapterGeneratedTitle={chapterGeneratedTitle}
              finalChapterDraft={finalChapterDraft}
              instructionPack={instructionPack}
              folders={project?.folders || []}
              exportFolderId={exportFolderId}
              sceneBeatDetailLevel={sceneBeatDetailLevel}
              sceneDraftDetailLevel={sceneDraftDetailLevel}
              chapterDraftDetailLevel={chapterDraftDetailLevel}
              chapterTitleLanguage={chapterTitleLanguage}
              modelDiscuss={modelDiscuss}
              modelPlan={modelPlan}
              modelScene={modelScene}
              modelElaborate={modelElaborate}
              onSceneBeatDetailChange={setSceneBeatDetailLevel}
              onSceneDraftDetailChange={setSceneDraftDetailLevel}
              onChapterDraftDetailChange={setChapterDraftDetailLevel}
              onChapterTitleLanguageChange={setChapterTitleLanguage}
              onApplyModelChoices={handleApplyModelChoices}
              onChapterGoalChange={setChapterGoal}
              onNextChapterIntentChange={setNextChapterIntent}
              onSaveContext={handleSaveContext}
              onDiscussSend={handleDiscussSend}
              onChangePlanParts={setPlanParts}
              onGeneratePlan={handleGeneratePlan}
              onSavePlan={handleSavePlan}
              onDeletePlanPart={handleDeletePlanPart}
              onDeleteAllPlanParts={handleDeleteAllPlanParts}
              onChangeScenes={setScenes}
              onGenerateAllScenes={handleGenerateAllScenes}
              onGeneratePartScenes={handleGeneratePartScenes}
              onSaveScenes={handleSaveScenes}
              onReviseScene={handleReviseScene}
              onChapterTitleChange={setChapterGeneratedTitle}
              onFinalChapterDraftChange={setFinalChapterDraft}
              onInstructionPackChange={setInstructionPack}
              onGenerateElaboration={handleGenerateElaboration}
              onSaveElaboration={handleSaveElaboration}
              onExportFolderChange={setExportFolderId}
              onExportArtifacts={handleExportArtifacts}
            />

            <PlanningArtifactsPanelV2
              activeSession={activeSession}
              selectedFileCount={selectedFileIds.length}
              discussionCount={discussionMessages.length}
              planPartCount={planParts.length}
              sceneCount={scenes.length}
              finalChapterLength={finalChapterDraft.length}
              exportedFileCount={exportedFileCount}
            />
          </div>

          {contextPreviewOpen && (
            <div
              className="gsd-modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Context assembly preview"
            >
              <div className="gsd-modal">
                <div className="gsd-modal-head">
                  <h3>Context assembly (matches GSD prompts)</h3>
                  <button type="button" onClick={() => setContextPreviewOpen(false)}>
                    Close
                  </button>
                </div>
                <p className="gsd-modal-hint muted">
                  Selected files are wrapped with Instructions, Scene Details, or filename markers exactly as in the
                  final planner requests.
                </p>
                <pre className="gsd-modal-body">{contextPreviewText || '(empty)'}</pre>
              </div>
            </div>
          )}

          {suggestModalOpen && suggestResult && (
            <div
              className="gsd-modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Context suggestions"
            >
              <div className="gsd-modal">
                <div className="gsd-modal-head">
                  <h3>Suggested improvements</h3>
                  <button type="button" onClick={() => setSuggestModalOpen(false)}>
                    Close
                  </button>
                </div>
                {suggestResult.notes ? (
                  <p className="gsd-modal-hint">{suggestResult.notes}</p>
                ) : null}
                <div className="gsd-suggest-list">
                  {(suggestResult.suggestions || []).length === 0 ? (
                    <p className="muted">No structured suggestions returned.</p>
                  ) : (
                    suggestResult.suggestions.map((s, idx) => (
                      <div key={`${s.fileId || idx}-${idx}`} className="gsd-suggest-card">
                        <strong>{s.fileName || 'Unnamed file'}</strong>{' '}
                        <span className="muted">→ {s.recommendedPromptRole || 'default'}</span>
                        {s.summary ? <p>{s.summary}</p> : null}
                        {s.edits ? <pre className="gsd-suggest-edits">{s.edits}</pre> : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ProjectPlanningPageV2;
