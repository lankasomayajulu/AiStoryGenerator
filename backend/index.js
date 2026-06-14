require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const mongodbService = require('./services/mongodbService');

const app = express();
const port = 13700;

// Middleware
app.use(cors());
// Increase payload size limit to 50MB (remove restrictions)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
const projectController = require('./controllers/projectController');
const folderController = require('./controllers/folderController');
const fileController = require('./controllers/fileController');
const settingsController = require('./controllers/settingsController');
const openRouterController = require('./controllers/openRouterController');
const batchController = require('./controllers/batchController');
const pdfOcrController = require('./controllers/pdfOcrController');
const pdfToJpegController = require('./controllers/pdfToJpegController');
const gsdController = require('./controllers/gsdController');
const aiLogsRoutes = require('./routes/aiLogsRoutes');

// Project routes
app.get('/api/projects', projectController.getAllProjects);
app.get('/api/projects/import-catalog', projectController.getImportCatalog);
app.post('/api/projects/create', projectController.createProject);
app.get('/api/projects/:id', projectController.getProject);
app.put('/api/projects/:id', projectController.updateProject);
app.delete('/api/projects/:id', projectController.deleteProject);

// Folder routes
app.post('/api/folders', folderController.createFolder);
app.get('/api/folders/:id', folderController.getFolder);
app.put('/api/folders/:id', folderController.updateFolder);
app.delete('/api/folders/:id', folderController.deleteFolder);
app.post('/api/folders/:id/import-files', folderController.importFiles);

// File routes
app.post('/api/files', fileController.createFile);
app.get('/api/files/:id', fileController.getFile);
app.put('/api/files/:id', fileController.updateFile);
app.delete('/api/files/:id', fileController.deleteFile);

// Settings routes
app.get('/api/settings', settingsController.getSettings);
app.put('/api/settings', settingsController.updateSettings);

// OpenRouter routes
app.get('/api/openrouter/models', openRouterController.getAllModels);
app.post('/api/openrouter/stream', openRouterController.getStreamingResponse);
app.post('/api/openrouter/chat', openRouterController.getResponse);
app.post('/api/openrouter/image/generate', openRouterController.generateImage);

app.use('/api/ai-logs', aiLogsRoutes);

// Batch operations
app.post('/api/batch', batchController.batchUpdate);

// GSD planning routes
app.post('/api/gsd/sessions', gsdController.createSession);
app.get('/api/gsd/sessions/:projectId', gsdController.getSessionsByProject);
app.get('/api/gsd/session/:sessionId', gsdController.getSession);
app.put('/api/gsd/session/:sessionId/context', gsdController.updateSessionContext);
app.get('/api/gsd/session/:sessionId/context-preview', gsdController.previewContextAssembly);
app.post('/api/gsd/session/:sessionId/suggest-context', gsdController.suggestContextImprovements);
app.post('/api/gsd/session/:sessionId/discuss', gsdController.discuss);
app.post('/api/gsd/session/:sessionId/plan', gsdController.generatePlan);
app.post('/api/gsd/session/:sessionId/plan/parts/delete', gsdController.deletePlanParts);
app.post('/api/gsd/session/:sessionId/scenes', gsdController.generateScenes);
app.post('/api/gsd/session/:sessionId/scenes/revise', gsdController.reviseScene);
app.post('/api/gsd/session/:sessionId/elaborate', gsdController.elaborateChapter);
app.post('/api/gsd/session/:sessionId/export', gsdController.exportArtifacts);

// PDF OCR routes
app.post('/api/pdf-ocr/extract', pdfOcrController.uploadPdf, pdfOcrController.extractPdfText);
app.get('/api/pdf-ocr/models', pdfOcrController.getRecommendedModels);

// PDF to JPEG routes
app.post('/api/pdf-to-jpeg/convert', pdfToJpegController.uploadPdf, pdfToJpegController.convertPdfToJpeg);

// Health check
app.get('/', (req, res) => res.json({ status: 'OK', message: 'Story Generator API' }));

// Connect to MongoDB and start server
mongodbService.connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });