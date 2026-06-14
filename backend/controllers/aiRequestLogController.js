const aiRequestLogService = require('../services/aiRequestLogService');
const mongoose = require('mongoose');

const isValidLogId = (id) => mongoose.isValidObjectId(id);

const listAiLogs = async (req, res) => {
  try {
    const result = await aiRequestLogService.listLogsSummary();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const listAiLogsPaginated = async (req, res) => {
  try {
    const { page, pageSize } = req.query;
    const result = await aiRequestLogService.listLogsSummaryPaginated(page, pageSize);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAiLogsDailyCostSummary = async (req, res) => {
  try {
    const items = await aiRequestLogService.getDailyCostSummary();
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const exportAiLogs = async (req, res) => {
  try {
    const items = await aiRequestLogService.exportAllLogsDecrypted();
    res.json({ total: items.length, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAiLogById = async (req, res) => {
  try {
    if (!isValidLogId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid log id' });
    }
    const doc = await aiRequestLogService.getLogByIdDecrypted(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Log not found' });
    }
    res.json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteAiLog = async (req, res) => {
  try {
    if (!isValidLogId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid log id' });
    }
    const ok = await aiRequestLogService.deleteLogById(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Log not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteAiLogsByMonth = async (req, res) => {
  try {
    const { year, month } = req.query;
    const deletedCount = await aiRequestLogService.deleteLogsByYearMonth(year, month);
    res.json({ success: true, deletedCount });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  listAiLogs,
  listAiLogsPaginated,
  getAiLogsDailyCostSummary,
  exportAiLogs,
  getAiLogById,
  deleteAiLog,
  deleteAiLogsByMonth,
};
