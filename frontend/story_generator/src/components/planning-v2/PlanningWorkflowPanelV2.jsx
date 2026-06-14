import React, { useState } from 'react';
import StageDiscussV2 from './StageDiscussV2';
import StagePlanPartsV2 from './StagePlanPartsV2';
import StageScenesV2 from './StageScenesV2';
import StageElaborateV2 from './StageElaborateV2';
import StageExportV2 from './StageExportV2';
import PlanningGsdControlsV2 from './PlanningGsdControlsV2';
import PlanningModelPickerModalV2 from './PlanningModelPickerModalV2';

const PlanningWorkflowPanelV2 = ({
  activeSession,
  models = [],
  planningSettings = null,
  sceneBeatDetailLevel,
  sceneDraftDetailLevel,
  chapterDraftDetailLevel,
  chapterTitleLanguage,
  modelDiscuss,
  modelPlan,
  modelScene,
  modelElaborate,
  onSceneBeatDetailChange,
  onSceneDraftDetailChange,
  onChapterDraftDetailChange,
  onChapterTitleLanguageChange,
  onApplyModelChoices,
  chapterGoal,
  nextChapterIntent,
  discussionMessages,
  planParts,
  scenes,
  chapterGeneratedTitle,
  finalChapterDraft,
  instructionPack,
  folders,
  exportFolderId,
  onChapterGoalChange,
  onNextChapterIntentChange,
  onSaveContext,
  onDiscussSend,
  onChangePlanParts,
  onGeneratePlan,
  onSavePlan,
  onDeletePlanPart,
  onDeleteAllPlanParts,
  onChangeScenes,
  onGenerateAllScenes,
  onGeneratePartScenes,
  onSaveScenes,
  onReviseScene,
  onChapterTitleChange,
  onFinalChapterDraftChange,
  onInstructionPackChange,
  onGenerateElaboration,
  onSaveElaboration,
  onExportFolderChange,
  onExportArtifacts
}) => {
  const [saving, setSaving] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);

  const handleSave = async () => {
    if (!activeSession) return;
    try {
      setSaving(true);
      await onSaveContext();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="planning-panel planning-workflow-panel">
      <h2>Planning Workflow</h2>
      {!activeSession ? (
        <p className="muted">Create or select a planning session to begin.</p>
      ) : (
        <>
          <div className="workflow-meta">
            <strong>{activeSession.title}</strong>
            <span className="badge">{activeSession.status}</span>
          </div>

          <PlanningGsdControlsV2
            sceneBeatDetailLevel={sceneBeatDetailLevel}
            sceneDraftDetailLevel={sceneDraftDetailLevel}
            chapterDraftDetailLevel={chapterDraftDetailLevel}
            chapterTitleLanguage={chapterTitleLanguage}
            onSceneBeatDetailChange={onSceneBeatDetailChange}
            onSceneDraftDetailChange={onSceneDraftDetailChange}
            onChapterDraftDetailChange={onChapterDraftDetailChange}
            onChapterTitleLanguageChange={onChapterTitleLanguageChange}
            onOpenModelModal={() => setModelModalOpen(true)}
            disabled={!activeSession}
          />

          <PlanningModelPickerModalV2
            open={modelModalOpen}
            onClose={() => setModelModalOpen(false)}
            models={models}
            favouriteModelIds={planningSettings?.FavouriteModels}
            modelDiscuss={modelDiscuss}
            modelPlan={modelPlan}
            modelScene={modelScene}
            modelElaborate={modelElaborate}
            onApply={(m) => {
              onApplyModelChoices?.(m);
            }}
          />

          <label className="field">
            Chapter Goal
            <textarea
              value={chapterGoal}
              onChange={(e) => onChapterGoalChange(e.target.value)}
              placeholder="What should this chapter accomplish?"
            />
          </label>
          <label className="field">
            Next Chapter Intent
            <textarea
              value={nextChapterIntent}
              onChange={(e) => onNextChapterIntentChange(e.target.value)}
              placeholder="What should happen in the next chapter?"
            />
          </label>
          <button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Context & Preferences'}
          </button>

          <div className="phase-note muted">
            Model choices and depth settings are configured in the bar above this column (save applies them with context
            files and goals).
          </div>

          <StageDiscussV2
            activeSession={activeSession}
            discussionMessages={discussionMessages}
            onSendMessage={onDiscussSend}
          />

          <StagePlanPartsV2
            activeSession={activeSession}
            parts={planParts}
            onChangeParts={onChangePlanParts}
            onGeneratePlan={onGeneratePlan}
            onSavePlan={onSavePlan}
            onDeletePart={onDeletePlanPart}
            onDeleteAllParts={onDeleteAllPlanParts}
          />

          <StageScenesV2
            activeSession={activeSession}
            planParts={planParts}
            scenes={scenes}
            onChangeScenes={onChangeScenes}
            onGenerateAllScenes={onGenerateAllScenes}
            onGeneratePartScenes={onGeneratePartScenes}
            onSaveScenes={onSaveScenes}
            onReviseScene={onReviseScene}
          />

          <StageElaborateV2
            activeSession={activeSession}
            chapterGeneratedTitle={chapterGeneratedTitle}
            finalChapterDraft={finalChapterDraft}
            instructionPack={instructionPack}
            onChapterTitleChange={onChapterTitleChange}
            onFinalChapterDraftChange={onFinalChapterDraftChange}
            onInstructionPackChange={onInstructionPackChange}
            onGenerateElaboration={onGenerateElaboration}
            onSaveElaboration={onSaveElaboration}
          />

          <StageExportV2
            activeSession={activeSession}
            folders={folders}
            exportFolderId={exportFolderId}
            onExportFolderChange={onExportFolderChange}
            onExportArtifacts={onExportArtifacts}
          />
        </>
      )}
    </section>
  );
};

export default PlanningWorkflowPanelV2;
