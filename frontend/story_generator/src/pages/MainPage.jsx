import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectApi } from '../services/api';
import { useStatusBar } from '../context/StatusBarContext';
import './MainPage.css';

const GROUP_BY_NONE = 'none';
const GROUP_BY_CREATED_MONTH = 'createdMonth';

const getMonthYearKey = (date) => {
  if (!date || Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const formatMonthYearLabel = (key) => {
  if (key === 'unknown') return 'Unknown date';
  const [year, month] = key.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

const groupProjectsByCreatedMonth = (projects) => {
  const groups = {};

  projects.forEach((project) => {
    const createdAt = project.createdAt ? new Date(project.createdAt) : null;
    const key = getMonthYearKey(createdAt);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(project);
  });

  return Object.entries(groups)
    .sort(([a], [b]) => {
      if (a === 'unknown') return 1;
      if (b === 'unknown') return -1;
      return b.localeCompare(a);
    })
    .map(([key, groupProjects]) => ({
      key,
      label: formatMonthYearLabel(key),
      projects: groupProjects,
    }));
};

const MainPage = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const { showStatus, clearStatus } = useStatusBar();
  const [groupBy, setGroupBy] = useState(GROUP_BY_NONE);
  const [expandedGroups, setExpandedGroups] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    loadProjects();
  }, []);

  const groupedProjects = useMemo(() => {
    if (groupBy !== GROUP_BY_CREATED_MONTH) return [];
    return groupProjectsByCreatedMonth(projects);
  }, [projects, groupBy]);

  useEffect(() => {
    if (groupBy !== GROUP_BY_CREATED_MONTH) return;
    setExpandedGroups((prev) => {
      const next = { ...prev };
      groupedProjects.forEach(({ key }) => {
        if (next[key] === undefined) {
          next[key] = true;
        }
      });
      return next;
    });
  }, [groupBy, groupedProjects]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      clearStatus();
      const response = await projectApi.getAll();
      setProjects(response.data);
    } catch (error) {
      showStatus('Failed to load projects: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProject = (projectId) => {
    window.open(`/project/${projectId}`, '_blank');
  };

  const handlePlanProject = (projectId) => {
    window.open(`/project/${projectId}/plan`, '_blank');
  };

  const handleRenameProject = (project) => {
    setEditingId(project._id);
    setEditName(project.Name);
  };

  const handleSaveRename = async (projectId) => {
    try {
      clearStatus();
      await projectApi.update(projectId, { Name: editName });
      await loadProjects();
      setEditingId(null);
      showStatus('Project renamed successfully', 'success');
    } catch (error) {
      showStatus('Failed to rename project: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleDeleteProject = async (projectId) => {
    const project = projects.find(p => p._id === projectId);
    if (!project) return;

    if (window.confirm(`Are you sure you want to delete "${project.Name}"? This will delete all folders and files in this project.`)) {
      try {
        clearStatus();
        await projectApi.delete(projectId);
        await loadProjects();
        showStatus('Project deleted successfully', 'success');
      } catch (error) {
        showStatus('Failed to delete project: ' + (error.response?.data?.error || error.message), 'error');
      }
    }
  };

  const handleCreateProject = async () => {
    const name = prompt('Enter project name:');
    if (!name || !name.trim()) return;

    try {
      clearStatus();
      await projectApi.create(name.trim());
      await loadProjects();
      showStatus('Project created successfully', 'success');
    } catch (error) {
      showStatus('Failed to create project: ' + (error.response?.data?.error || error.message), 'error');
    }
  };

  const toggleGroup = (groupKey) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const renderProjectCard = (project) => (
    <div key={project._id} className="project-card">
      {editingId === project._id ? (
        <div className="edit-mode">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') handleSaveRename(project._id);
              if (e.key === 'Escape') handleCancelRename();
            }}
            autoFocus
          />
          <div className="edit-actions">
            <button onClick={() => handleSaveRename(project._id)}>✓</button>
            <button onClick={handleCancelRename}>✕</button>
          </div>
        </div>
      ) : (
        <>
          <div className="project-name" title={project.Name}>
            {project.Name}
          </div>
          <div className="project-actions">
            <button onClick={() => handleRenameProject(project)} title="Rename">
              ✏️
            </button>
            <button onClick={() => handleOpenProject(project._id)} title="Open">
              📂
            </button>
            <button onClick={() => handlePlanProject(project._id)} title="Plan">
              🧭
            </button>
            <button onClick={() => handleDeleteProject(project._id)} title="Delete">
              🗑️
            </button>
          </div>
        </>
      )}
    </div>
  );

  const renderProjectsList = (projectList) => (
    <div className="projects-list">
      {projectList.map(renderProjectCard)}
    </div>
  );

  if (loading) {
    return (
      <div className="main-page">
        <div className="spinner">Loading projects...</div>
      </div>
    );
  }

  return (
    <div className="main-page">
      <div className="main-header">
        <h1>Story Generator</h1>
        <div className="header-actions">
          <button 
            className="btn-secondary" 
            onClick={() => window.open('/pdf-to-text', '_blank')}
            style={{ marginRight: '10px' }}
          >
            📄 PDF to Text
          </button>
          <button 
            className="btn-secondary" 
            onClick={() => window.open('/pdf-to-jpeg', '_blank')}
            style={{ marginRight: '10px' }}
          >
            🖼️ PDF to JPEG
          </button>
          <button
            className="btn-secondary"
            onClick={() => window.open('/image-generator', '_blank')}
            style={{ marginRight: '10px' }}
          >
            🎨 Image Generator
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/logs')}
            style={{ marginRight: '10px' }}
          >
            Logs
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/log-summary')}
            style={{ marginRight: '10px' }}
          >
            Log Summary
          </button>
          <button className="btn-primary" onClick={handleCreateProject}>
            + New Project
          </button>
        </div>
      </div>

      {projects.length > 0 && (
        <div className="projects-toolbar">
          <label htmlFor="group-by">Group by:</label>
          <select
            id="group-by"
            className="group-by-select"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
          >
            <option value={GROUP_BY_NONE}>None</option>
            <option value={GROUP_BY_CREATED_MONTH}>Created Month and Year</option>
          </select>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="empty-state">
          <p>No projects yet. Create your first project!</p>
        </div>
      ) : groupBy === GROUP_BY_CREATED_MONTH ? (
        <div className="project-groups">
          {groupedProjects.map(({ key, label, projects: groupProjects }) => {
            const isExpanded = expandedGroups[key] !== false;

            return (
              <div key={key} className="project-group">
                <button
                  type="button"
                  className="project-group-header"
                  onClick={() => toggleGroup(key)}
                  aria-expanded={isExpanded}
                >
                  <span className="accordion-icon">{isExpanded ? '▼' : '▶'}</span>
                  <span className="project-group-label">{label}</span>
                  <span className="project-group-count">{groupProjects.length}</span>
                </button>
                {isExpanded && renderProjectsList(groupProjects)}
              </div>
            );
          })}
        </div>
      ) : (
        renderProjectsList(projects)
      )}
    </div>
  );
};

export default MainPage;
