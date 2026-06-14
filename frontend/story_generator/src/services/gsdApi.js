import axios from 'axios';

const GSD_API_BASE_URL = 'http://localhost:13700/api';

const gsdHttp = axios.create({
  baseURL: GSD_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 300000
});

export const gsdSessionApi = {
  create: (projectId, title) => gsdHttp.post('/gsd/sessions', { projectId, title }),
  listByProject: (projectId) => gsdHttp.get(`/gsd/sessions/${projectId}`),
  getById: (sessionId) => gsdHttp.get(`/gsd/session/${sessionId}`),
  updateContext: (sessionId, updates) => gsdHttp.put(`/gsd/session/${sessionId}/context`, updates),
  getContextPreview: (sessionId) => gsdHttp.get(`/gsd/session/${sessionId}/context-preview`),
  suggestContextImprovements: (sessionId, body = {}) =>
    gsdHttp.post(`/gsd/session/${sessionId}/suggest-context`, body),
  discuss: (sessionId, payload) => gsdHttp.post(`/gsd/session/${sessionId}/discuss`, payload),
  generatePlan: (sessionId, body = {}) => gsdHttp.post(`/gsd/session/${sessionId}/plan`, body),
  savePlanParts: (sessionId, payload) => gsdHttp.post(`/gsd/session/${sessionId}/plan`, payload),
  deletePlanParts: (sessionId, payload) =>
    gsdHttp.post(`/gsd/session/${sessionId}/plan/parts/delete`, payload),
  generateScenes: (sessionId, body = {}) =>
    gsdHttp.post(`/gsd/session/${sessionId}/scenes`, body || {}),
  saveScenes: (sessionId, payload) => gsdHttp.post(`/gsd/session/${sessionId}/scenes`, payload),
  reviseScene: (sessionId, payload) => gsdHttp.post(`/gsd/session/${sessionId}/scenes/revise`, payload),
  elaborateChapter: (sessionId, body = {}) => gsdHttp.post(`/gsd/session/${sessionId}/elaborate`, body),
  saveElaboration: (sessionId, payload) => gsdHttp.post(`/gsd/session/${sessionId}/elaborate`, payload),
  exportArtifacts: (sessionId, payload) => gsdHttp.post(`/gsd/session/${sessionId}/export`, payload)
};

export const planningProjectApi = {
  getById: (projectId) => gsdHttp.get(`/projects/${projectId}`)
};

export const planningFileApi = {
  create: (name, folderId) => gsdHttp.post('/files', { Name: name, FolderId: folderId }),
  update: (id, updates) => gsdHttp.put(`/files/${id}`, updates),
};

export const planningSettingsApi = {
  get: () => gsdHttp.get('/settings'),
  update: (updates) => gsdHttp.put('/settings', updates)
};

export const planningOpenRouterApi = {
  getModels: () => gsdHttp.get('/openrouter/models')
};

export default gsdHttp;
