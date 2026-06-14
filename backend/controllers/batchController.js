const mongodbService = require('../services/mongodbService');

const batchUpdate = async (req, res) => {
  try {
    const { operations } = req.body;
    if (!Array.isArray(operations)) {
      return res.status(400).json({ error: 'Operations must be an array' });
    }
    const results = await mongodbService.batchUpdateFilesAndFolders(operations);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  batchUpdate
};

