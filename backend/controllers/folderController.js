const mongodbService = require('../services/mongodbService');

const createFolder = async (req, res) => {
  try {
    const { Name, projectId } = req.body;
    if (!Name || !projectId) {
      return res.status(400).json({ error: 'Folder name and project ID are required' });
    }
    const folder = await mongodbService.createFolder(Name, projectId);
    res.status(201).json(folder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const folder = await mongodbService.getFolderById(id);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    res.json(folder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const folder = await mongodbService.updateFolder(id, updates);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    res.json(folder);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteFolder = async (req, res) => {
  try {
    const { id } = req.params;
    await mongodbService.deleteFolder(id);
    res.json({ success: true, message: 'Folder deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const importFiles = async (req, res) => {
  try {
    const { id } = req.params;
    const { fileIds } = req.body;
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: 'fileIds array is required' });
    }
    const files = await mongodbService.importFilesToFolder(id, fileIds);
    res.status(201).json({ files, count: files.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createFolder,
  getFolder,
  updateFolder,
  deleteFolder,
  importFiles,
};

