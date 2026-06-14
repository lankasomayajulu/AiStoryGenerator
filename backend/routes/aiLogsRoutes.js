const express = require('express');
const aiRequestLogController = require('../controllers/aiRequestLogController');

const router = express.Router();

router.get('/', aiRequestLogController.listAiLogs);
router.get('/paginated', aiRequestLogController.listAiLogsPaginated);
router.get('/daily-costs', aiRequestLogController.getAiLogsDailyCostSummary);
router.get('/export', aiRequestLogController.exportAiLogs);
router.delete('/', aiRequestLogController.deleteAiLogsByMonth);
router.get('/:id', aiRequestLogController.getAiLogById);
router.delete('/:id', aiRequestLogController.deleteAiLog);

module.exports = router;
