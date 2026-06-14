import axios from 'axios';

const API_BASE_URL = 'http://localhost:13700/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
  timeout: 300000, // 5 minutes timeout for large file operations
});

// Project APIs
export const projectApi = {
  getAll: () => api.get('/projects'),
  getImportCatalog: () => api.get('/projects/import-catalog'),
  getById: (id) => api.get(`/projects/${id}`),
  create: (name) => api.post('/projects/create', { Name: name }),
  update: (id, updates) => api.put(`/projects/${id}`, updates),
  delete: (id) => api.delete(`/projects/${id}`),
};

// Folder APIs
export const folderApi = {
  getById: (id) => api.get(`/folders/${id}`),
  create: (name, projectId) => api.post('/folders', { Name: name, projectId }),
  update: (id, updates) => api.put(`/folders/${id}`, updates),
  delete: (id) => api.delete(`/folders/${id}`),
  importFiles: (folderId, fileIds) =>
    api.post(`/folders/${folderId}/import-files`, { fileIds }),
};

// File APIs
export const fileApi = {
  getById: (id) => api.get(`/files/${id}`),
  create: (name, folderId) => api.post('/files', { Name: name, FolderId: folderId }),
  update: (id, updates) => api.put(`/files/${id}`, updates),
  delete: (id) => api.delete(`/files/${id}`),
};

// Settings APIs
export const settingsApi = {
  get: () => api.get('/settings'),
  update: (updates) => api.put('/settings', updates),
};

// AI request logs (OpenRouter payloads stored encrypted server-side)
export const aiLogsApi = {
  list: () => api.get('/ai-logs'),
  listPaginated: (page, pageSize) => api.get('/ai-logs/paginated', { params: { page, pageSize } }),
  getDailyCosts: () => api.get('/ai-logs/daily-costs'),
  exportAll: () => api.get('/ai-logs/export'),
  getById: (id) => api.get(`/ai-logs/${id}`),
  delete: (id) => api.delete(`/ai-logs/${id}`),
  deleteMonthYear: (year, month) => api.delete('/ai-logs', { params: { year, month } }),
};

// OpenRouter APIs
export const openRouterApi = {
  getModels: () => api.get('/openrouter/models'),
  getImageModels: () => api.get('/openrouter/models?output_modalities=image'),
  getResponse: (messages, model, options = {}) => {
    const { max_tokens: maxTokens, temperature, ...extras } = options;
    const payload = { messages, model };
    if (maxTokens !== undefined) payload.max_tokens = maxTokens;
    if (temperature !== undefined) payload.temperature = temperature;
    if (Object.keys(extras).length > 0) payload.options = extras;
    return api.post('/openrouter/chat', payload);
  },
  getStreamingResponse: (prompt, model, max_tokens, temperature, systemPrompt, signal, extras = {}) => {
    const { useGsd } = extras;
    return fetch(`${API_BASE_URL}/openrouter/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        model,
        max_tokens,
        temperature,
        systemPrompt,
        useGsd: !!useGsd,
      }),
      signal: signal, // Pass abort signal to fetch
    });
  },
  generateImage: (prompt, model, options = {}) =>
    api.post('/openrouter/image/generate', { prompt, model, ...options }),
};

// Batch API
export const batchApi = {
  update: (operations) => api.post('/batch', { operations }),
};

// PDF OCR API
export const pdfOcrApi = {
  extractText: (formData) => {
    return fetch(`${API_BASE_URL}/pdf-ocr/extract`, {
      method: 'POST',
      body: formData,
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) {
        return Promise.reject({ response: { data } });
      }
      return { data };
    });
  },
  getRecommendedModels: () => api.get('/pdf-ocr/models'),
};

// PDF to JPEG API
export const pdfToJpegApi = {
  convertPdfToJpeg: (formData) => {
    return fetch(`${API_BASE_URL}/pdf-to-jpeg/convert`, {
      method: 'POST',
      body: formData,
    });
  },
};

export default api;

