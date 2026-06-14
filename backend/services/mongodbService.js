const mongoose = require('mongoose');
const { gzip, gunzip } = require('zlib');
const { promisify } = require('util');
const SGProject = require('../models/SGProject');
const SGFolder = require('../models/SGFolder');
const SGFile = require('../models/SGFile');
const Settings = require('../models/Settings');
const GSDSession = require('../models/GSDSession');
const GSDPlan = require('../models/GSDPlan');
const GSDScene = require('../models/GSDScene');
const GSDRunLog = require('../models/GSDRunLog');
const { encryptPlanPartTitles, decryptPlanPartTitles } = require('../utils/gsdPlanTitleCrypto');
const { MONGODB_URL, DATABASE_NAME } = require('../constants/mongodb_constants');

// Promisify zlib functions
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// Helper functions for compression/decompression with empty string handling
// Matches Python approach: gzip -> base64 encode
const compressContent = async (content) => {
  // If content is empty, return empty string (which will be stored as empty)
  if (!content || content === '') {
    return '';
  }
  // Compress using zlib gzip (matches Python: gzip.compress)
  const input = Buffer.from(content, 'utf-8');
  const compressed = await gzipAsync(input);
  // Base64 encode (matches Python: base64.b64encode)
  const base64Encoded = compressed.toString('base64');
  return base64Encoded;
};

// Matches Python approach: base64 decode -> gzip decompress
const decompressContent = async (compressedData) => {
  // If data is empty or null, return empty string
  if (!compressedData || (typeof compressedData === 'string' && compressedData === '') || 
      (Buffer.isBuffer(compressedData) && compressedData.length === 0)) {
    return '';
  }
  // Try to decompress, but if it fails or is empty, return empty string
  try {
    // Handle both Buffer and string inputs
    let base64String;
    if (Buffer.isBuffer(compressedData)) {
      // If it's a buffer, convert to string first (might be base64 string stored as buffer)
      base64String = compressedData.toString('utf-8');
    } else {
      base64String = compressedData;
    }
    
    // Base64 decode (matches Python: base64.b64decode)
    const decoded = Buffer.from(base64String, 'base64');
    
    // Decompress using zlib gunzip (matches Python: gzip.decompress)
    const decompressed = await gunzipAsync(decoded);
    
    // Decode to UTF-8 string (matches Python: .decode('utf-8'))
    const content = decompressed.toString('utf-8');
    return content || '';
  } catch (error) {
    // If decompression fails (might be empty or invalid), return empty string
    console.error('Decompression error:', error.message);
    return '';
  }
};

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(`${MONGODB_URL}/${DATABASE_NAME}`);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
};

// ============ PROJECT OPERATIONS ============

const createProject = async (name) => {
  const project = new SGProject({ Name: name, folderIds: [] });
  return await project.save();
};

const getAllProjects = async () => {
  return await SGProject.find().select('_id Name folderIds createdAt');
};

/** All projects with file metadata for cross-project import UI (no file content). */
const getAllProjectsImportCatalog = async () => {
  const projects = await SGProject.find().select('_id Name').sort({ Name: 1 }).lean();
  if (!projects.length) return [];

  const projectIds = projects.map((p) => p._id);
  const folders = await SGFolder.find({ projectId: { $in: projectIds } })
    .select('_id Name projectId')
    .lean();

  if (!folders.length) {
    return projects.map((p) => ({
      _id: p._id,
      name: p.Name,
      files: [],
    }));
  }

  const folderNameById = new Map(folders.map((f) => [f._id.toString(), f.Name]));
  const folderIds = folders.map((f) => f._id);
  const files = await SGFile.find({ FolderId: { $in: folderIds } })
    .select('_id Name FolderId promptRole')
    .lean();

  const filesByProjectId = new Map(projectIds.map((id) => [id.toString(), []]));
  const folderProjectId = new Map(
    folders.map((f) => [f._id.toString(), f.projectId.toString()])
  );

  for (const file of files) {
    const folderId = file.FolderId.toString();
    const projectId = folderProjectId.get(folderId);
    if (!projectId || !filesByProjectId.has(projectId)) continue;
    filesByProjectId.get(projectId).push({
      _id: file._id,
      name: file.Name,
      folderId: file.FolderId,
      folderName: folderNameById.get(folderId) || 'Unknown',
      promptRole: file.promptRole || 'default',
    });
  }

  return projects.map((p) => {
    const list = filesByProjectId.get(p._id.toString()) || [];
    list.sort((a, b) => {
      const folderCmp = a.folderName.localeCompare(b.folderName, undefined, { sensitivity: 'base' });
      if (folderCmp !== 0) return folderCmp;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return {
      _id: p._id,
      name: p.Name,
      files: list,
    };
  });
};

const makeUniqueFileNameInSet = (baseName, existingNames) => {
  if (!existingNames.has(baseName)) return baseName;
  let index = 2;
  while (existingNames.has(`${baseName} (${index})`)) {
    index += 1;
  }
  return `${baseName} (${index})`;
};

const importFilesToFolder = async (targetFolderId, sourceFileIds) => {
  const targetFolder = await SGFolder.findById(targetFolderId);
  if (!targetFolder) {
    throw new Error('Target folder not found');
  }

  const ids = [...new Set((sourceFileIds || []).filter(Boolean))];
  if (!ids.length) {
    throw new Error('No files selected for import');
  }

  const existingFiles = targetFolder.fileIds?.length
    ? await SGFile.find({ _id: { $in: targetFolder.fileIds } }).select('Name').lean()
    : [];
  const usedNames = new Set(existingFiles.map((f) => f.Name));

  const imported = [];

  for (const sourceFileId of ids) {
    const source = await SGFile.findById(sourceFileId);
    if (!source) continue;

    const content = await decompressContent(source.Content);
    const fileName = makeUniqueFileNameInSet(source.Name, usedNames);
    usedNames.add(fileName);

    const compressed = await compressContent(content ?? '');
    const contentBuffer = compressed ? Buffer.from(compressed, 'utf-8') : Buffer.alloc(0);

    const newFile = new SGFile({
      Name: fileName,
      FolderId: targetFolderId,
      Content: contentBuffer,
      promptRole: source.promptRole || 'default',
    });
    const saved = await newFile.save();

    await SGFolder.findByIdAndUpdate(targetFolderId, {
      $push: { fileIds: saved._id },
    });

    imported.push({
      _id: saved._id,
      Name: saved.Name,
      FolderId: saved.FolderId,
      Content: content ?? '',
      promptRole: saved.promptRole || 'default',
    });
  }

  if (!imported.length) {
    throw new Error('No valid source files found to import');
  }

  return imported;
};

const getProjectById = async (projectId) => {
  return await SGProject.findById(projectId);
};

const updateProject = async (projectId, updates) => {
  return await SGProject.findByIdAndUpdate(projectId, updates, { new: true });
};

const deleteProject = async (projectId) => {
  const project = await SGProject.findById(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  // Delete all files in all folders
  for (const folderId of project.folderIds) {
    const folder = await SGFolder.findById(folderId);
    if (folder) {
      await SGFile.deleteMany({ _id: { $in: folder.fileIds } });
    }
  }

  // Delete all folders
  await SGFolder.deleteMany({ _id: { $in: project.folderIds } });

  // Delete the project
  await SGProject.findByIdAndDelete(projectId);
  return { success: true };
};

const readProjectComplete = async (projectId, { includeContent = false } = {}) => {
  const project = await SGProject.findById(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const folders = await SGFolder.find({ projectId: project._id }).lean();
  const folderIds = folders.map((f) => f._id);

  const files = await SGFile.find({ FolderId: { $in: folderIds } })
    .select(includeContent ? undefined : '_id Name FolderId promptRole')
    .lean();

  let filePayload;
  if (includeContent) {
    // Decompress sequentially to limit peak memory when many large files exist
    filePayload = [];
    for (const file of files) {
      const full = await SGFile.findById(file._id).select('Content').lean();
      const decompressed = await decompressContent(full?.Content);
      filePayload.push({
        ...file,
        Content: decompressed,
      });
    }
  } else {
    filePayload = files.map((file) => ({
      ...file,
      Content: '',
    }));
  }

  return {
    project: project.toObject(),
    folders,
    files: filePayload,
  };
};

// ============ FOLDER OPERATIONS ============

const createFolder = async (name, projectId) => {
  const folder = new SGFolder({ Name: name, projectId, fileIds: [] });
  const savedFolder = await folder.save();
  
  // Add folder to project
  await SGProject.findByIdAndUpdate(projectId, {
    $push: { folderIds: savedFolder._id }
  });
  
  return savedFolder;
};

const getFolderById = async (folderId) => {
  return await SGFolder.findById(folderId);
};

const getFoldersByProjectId = async (projectId) => {
  return await SGFolder.find({ projectId });
};

const updateFolder = async (folderId, updates) => {
  return await SGFolder.findByIdAndUpdate(folderId, updates, { new: true });
};

const deleteFolder = async (folderId) => {
  const folder = await SGFolder.findById(folderId);
  if (!folder) {
    throw new Error('Folder not found');
  }

  // Delete all files in the folder
  await SGFile.deleteMany({ _id: { $in: folder.fileIds } });

  // Remove folder from project
  await SGProject.findByIdAndUpdate(folder.projectId, {
    $pull: { folderIds: folderId }
  });

  // Delete the folder
  await SGFolder.findByIdAndDelete(folderId);
  return { success: true };
};

// ============ FILE OPERATIONS ============

const createFile = async (name, folderId) => {
  const emptyContent = '';
  const compressed = await compressContent(emptyContent);
  // Convert base64 string to Buffer for storage (schema expects Buffer)
  // If compressed is empty string, create a minimal buffer (empty Buffer is valid)
  const contentBuffer = compressed ? Buffer.from(compressed, 'utf-8') : Buffer.alloc(0);
  
  const file = new SGFile({ Name: name, FolderId: folderId, Content: contentBuffer });
  const savedFile = await file.save();
  
  // Add file to folder
  await SGFolder.findByIdAndUpdate(folderId, {
    $push: { fileIds: savedFile._id }
  });
  
  return savedFile;
};

const getFileById = async (fileId) => {
  const file = await SGFile.findById(fileId);
  if (!file) {
    return null;
  }
  
  const decompressed = await decompressContent(file.Content);
  return {
    ...file.toObject(),
    Content: decompressed
  };
};

const updateFile = async (fileId, updates) => {
  const updateData = { ...updates };
  
  // If Content is being updated, compress it
  if (updateData.Content !== undefined) {
    const compressed = await compressContent(updateData.Content);
    // Convert base64 string to Buffer for storage (schema expects Buffer)
    updateData.Content = compressed ? Buffer.from(compressed, 'utf-8') : Buffer.from('', 'utf-8');
  }
  
  return await SGFile.findByIdAndUpdate(fileId, updateData, { new: true });
};

const deleteFile = async (fileId) => {
  const file = await SGFile.findById(fileId);
  if (!file) {
    throw new Error('File not found');
  }

  // Remove file from folder
  await SGFolder.findByIdAndUpdate(file.FolderId, {
    $pull: { fileIds: fileId }
  });

  // Delete the file
  await SGFile.findByIdAndDelete(fileId);
  return { success: true };
};

// ============ BATCH OPERATIONS ============

const batchUpdateFilesAndFolders = async (operations) => {
  const results = [];
  
  for (const op of operations) {
    if (op.type === 'updateFolder') {
      const folder = await updateFolder(op.folderId, op.updates);
      results.push({ type: 'folder', data: folder });
    } else if (op.type === 'updateFile') {
      const file = await updateFile(op.fileId, op.updates);
      results.push({
        type: 'file',
        data: {
          _id: file._id,
          Name: file.Name,
          FolderId: file.FolderId,
          promptRole: file.promptRole,
        },
      });
    }
  }
  
  return results;
};

// ============ SETTINGS OPERATIONS ============

const getSettings = async () => {
  let settings = await Settings.findOne();
  if (!settings) {
    // Create default settings if none exist
    settings = new Settings();
    await settings.save();
  }
  return settings;
};

const updateSettings = async (updates) => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = new Settings(updates);
    return await settings.save();
  }
  
  Object.assign(settings, updates);
  return await settings.save();
};

// ============ GSD OPERATIONS ============

const createGSDSession = async (payload) => {
  const session = new GSDSession(payload);
  return await session.save();
};

const getGSDSessionsByProject = async (projectId) => {
  return await GSDSession.find({ projectId }).sort({ updatedAt: -1 });
};

const getGSDSessionById = async (sessionId) => {
  return await GSDSession.findById(sessionId);
};

const updateGSDSession = async (sessionId, updates) => {
  return await GSDSession.findByIdAndUpdate(sessionId, updates, { new: true });
};

const getGSDSessionFull = async (sessionId) => {
  const session = await GSDSession.findById(sessionId);
  if (!session) {
    return { session: null, plan: null, scenes: [] };
  }

  const planDoc = await GSDPlan.findOne({ sessionId: session._id }).sort({ updatedAt: -1 });
  const scenes = await GSDScene.find({ sessionId: session._id }).sort({ partIndex: 1, createdAt: 1 });

  let plan = planDoc;
  if (planDoc && Array.isArray(planDoc.parts)) {
    const obj = planDoc.toObject();
    plan = {
      ...obj,
      parts: decryptPlanPartTitles(obj.parts)
    };
  }

  return { session, plan, scenes };
};

const upsertGSDPlan = async (sessionId, planData) => {
  const payload = { ...planData, sessionId };
  if (Array.isArray(payload.parts)) {
    payload.parts = encryptPlanPartTitles(payload.parts);
  }
  const saved = await GSDPlan.findOneAndUpdate(
    { sessionId },
    payload,
    { new: true, upsert: true }
  );
  if (saved && Array.isArray(saved.parts)) {
    const obj = saved.toObject();
    return {
      ...obj,
      parts: decryptPlanPartTitles(obj.parts)
    };
  }
  return saved;
};

/**
 * Delete all plan parts or one part by partIndex. Renumbers remaining parts; updates scene partIndex.
 * partIndex: number to delete one, or null/undefined to clear all parts and all scenes.
 */
const deleteGSDPlanParts = async (sessionId, partIndex) => {
  const planDoc = await GSDPlan.findOne({ sessionId }).sort({ updatedAt: -1 });
  if (!planDoc) {
    return { plan: null, scenesUpdated: 0 };
  }

  const obj = planDoc.toObject();
  let parts = decryptPlanPartTitles(obj.parts || []);

  if (partIndex === undefined || partIndex === null || partIndex === 'all') {
    await GSDScene.deleteMany({ sessionId });
    const plan = await upsertGSDPlan(sessionId, {
      chapterGoal: obj.chapterGoal || '',
      nextChapterIntent: obj.nextChapterIntent || '',
      parts: [],
      rawModelOutput: ''
    });
    return { plan, scenesUpdated: -1 };
  }

  const target = Number(partIndex);
  const remaining = parts.filter((p) => Number(p.partIndex) !== target);
  const sorted = remaining.slice().sort((a, b) => Number(a.partIndex) - Number(b.partIndex));
  const oldToNew = {};
  sorted.forEach((p, idx) => {
    oldToNew[Number(p.partIndex)] = idx + 1;
  });

  const reindexed = sorted.map((p, idx) => ({
    ...p,
    partIndex: idx + 1
  }));

  await GSDScene.deleteMany({ sessionId, partIndex: target });

  const allScenes = await GSDScene.find({ sessionId });
  for (const scene of allScenes) {
    const oldIdx = Number(scene.partIndex);
    if (oldToNew[oldIdx] === undefined) {
      await GSDScene.findByIdAndDelete(scene._id);
    } else if (oldToNew[oldIdx] !== oldIdx) {
      await GSDScene.findByIdAndUpdate(scene._id, { partIndex: oldToNew[oldIdx] });
    }
  }

  const plan = await upsertGSDPlan(sessionId, {
    chapterGoal: obj.chapterGoal || '',
    nextChapterIntent: obj.nextChapterIntent || '',
    parts: reindexed,
    rawModelOutput: obj.rawModelOutput || ''
  });

  return { plan, scenesUpdated: allScenes.length };
};

const createGSDScene = async (sceneData) => {
  const scene = new GSDScene(sceneData);
  return await scene.save();
};

const createManyGSDScenes = async (scenesData = []) => {
  if (!Array.isArray(scenesData) || scenesData.length === 0) return [];
  return await GSDScene.insertMany(scenesData);
};

const deleteGSDScenesBySession = async (sessionId) => {
  return await GSDScene.deleteMany({ sessionId });
};

const deleteGSDScenesBySessionAndPart = async (sessionId, partIndex) => {
  return await GSDScene.deleteMany({ sessionId, partIndex });
};

const getGSDScenesBySession = async (sessionId) => {
  return await GSDScene.find({ sessionId }).sort({ partIndex: 1, createdAt: 1 });
};

const createGSDRunLog = async (logData) => {
  const log = new GSDRunLog(logData);
  return await log.save();
};

module.exports = {
  connectDB,
  // Compression helpers
  decompressContent,
  // Project
  createProject,
  getAllProjects,
  getAllProjectsImportCatalog,
  getProjectById,
  updateProject,
  deleteProject,
  readProjectComplete,
  // Folder
  createFolder,
  getFolderById,
  getFoldersByProjectId,
  updateFolder,
  deleteFolder,
  // File
  createFile,
  getFileById,
  updateFile,
  deleteFile,
  importFilesToFolder,
  // Batch
  batchUpdateFilesAndFolders,
  // Settings
  getSettings,
  updateSettings,
  // GSD
  createGSDSession,
  getGSDSessionsByProject,
  getGSDSessionById,
  updateGSDSession,
  getGSDSessionFull,
  upsertGSDPlan,
  deleteGSDPlanParts,
  createGSDScene,
  createManyGSDScenes,
  deleteGSDScenesBySession,
  deleteGSDScenesBySessionAndPart,
  getGSDScenesBySession,
  createGSDRunLog
};

