import React, { useState } from 'react';
import ProjectTab from './ProjectTab';
import SettingsTab from './SettingsTab';
import './LeftPanel.css';

const LeftPanel = ({
  project,
  projectId,
  settings,
  models,
  activeFileId,
  disabled,
  onProjectUpdate,
  onSettingsUpdate,
  onCurrentSettingsChange,
  onSetActiveFile,
  onEnsureFileContent,
}) => {
  const [activeTab, setActiveTab] = useState('project');

  return (
    <div className="left-panel">
      <div className="left-panel-tabs">
        <button
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
        <button
          className={activeTab === 'project' ? 'active' : ''}
          onClick={() => setActiveTab('project')}
        >
          Project
        </button>
      </div>
      <div className="left-panel-content">
        {activeTab === 'settings' ? (
          <SettingsTab
            settings={settings}
            models={models}
            onSettingsUpdate={onSettingsUpdate}
            onCurrentSettingsChange={onCurrentSettingsChange}
          />
        ) : (
          <ProjectTab
            project={project}
            projectId={projectId}
            activeFileId={activeFileId}
            disabled={disabled}
            settings={settings}
            onProjectUpdate={onProjectUpdate}
            onSetActiveFile={onSetActiveFile}
            onEnsureFileContent={onEnsureFileContent}
          />
        )}
      </div>
    </div>
  );
};

export default LeftPanel;

