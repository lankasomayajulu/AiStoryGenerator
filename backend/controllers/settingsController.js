const mongodbService = require('../services/mongodbService');

const getSettings = async (req, res) => {
  try {
    const settings = await mongodbService.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    const updates = req.body;
    const settings = await mongodbService.updateSettings(updates);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getSettings,
  updateSettings
};

