import React from 'react';

const PlanningArtifactsPanelV2 = ({
  activeSession,
  selectedFileCount,
  discussionCount,
  planPartCount,
  sceneCount,
  finalChapterLength,
  exportedFileCount
}) => {
  return (
    <section className="planning-panel planning-artifacts-panel">
      <h2>Artifacts</h2>
      {!activeSession ? (
        <p className="muted">No session selected.</p>
      ) : (
        <div className="artifact-list">
          <div className="artifact-card">
            <h3>Session</h3>
            <p>{activeSession.title}</p>
          </div>
          <div className="artifact-card">
            <h3>Selected Files</h3>
            <p>{selectedFileCount}</p>
          </div>
          <div className="artifact-card">
            <h3>Discussion Turns</h3>
            <p>{discussionCount}</p>
          </div>
          <div className="artifact-card">
            <h3>Plan Parts</h3>
            <p>{planPartCount}</p>
          </div>
          <div className="artifact-card">
            <h3>Scenes</h3>
            <p>{sceneCount}</p>
          </div>
          <div className="artifact-card">
            <h3>Final Chapter Length</h3>
            <p>{finalChapterLength} chars</p>
          </div>
          <div className="artifact-card">
            <h3>Exported Files</h3>
            <p>{exportedFileCount}</p>
          </div>
          <div className="artifact-card">
            <h3>Next Outputs</h3>
            <p>Discussion transcript, part-wise chapter plan, scene drafts, final chapter draft, and instruction pack.</p>
          </div>
        </div>
      )}
    </section>
  );
};

export default PlanningArtifactsPanelV2;
