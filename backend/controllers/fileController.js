const mongodbService = require('../services/mongodbService');

const createFile = async (req, res) => {
  try {
    const { Name, FolderId } = req.body;
    if (!Name || !FolderId) {
      return res.status(400).json({ error: 'File name and folder ID are required' });
    }
    const file = await mongodbService.createFile(Name, FolderId);
    // Decompress for response
    const decompressed = await mongodbService.decompressContent(file.Content);
    res.status(201).json({
      ...file.toObject(),
      Content: decompressed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getFile = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await mongodbService.getFileById(id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.json(file);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateFile = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const file = await mongodbService.updateFile(id, updates);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    // Omit decompressed body — clients already have the content they sent
    res.json({
      _id: file._id,
      Name: file.Name,
      FolderId: file.FolderId,
      promptRole: file.promptRole,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    await mongodbService.deleteFile(id);
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createFile,
  getFile,
  updateFile,
  deleteFile
};

