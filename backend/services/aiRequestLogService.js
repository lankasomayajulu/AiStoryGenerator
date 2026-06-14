const AiRequestLog = require('../models/AiRequestLog');
const { encryptRequestPayload, decryptRequestPayload } = require('../utils/aiRequestLogCrypto');

const sanitizeRequestForStorage = (body) => {
  if (!body || typeof body !== 'object') return {};
  try {
    return JSON.parse(JSON.stringify(body));
  } catch {
    return { _note: 'unserializable request body' };
  }
};

const mapRowSummary = (row) => ({
  _id: row._id,
  operation: row.operation,
  requestType: row.requestType || 'Plain Text',
  model: row.model,
  inputTokens: row.inputTokens,
  outputTokens: row.outputTokens,
  totalTokens: row.totalTokens,
  costUsd: row.costUsd,
  finishReason: row.finishReason,
  errorMessage: row.errorMessage,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const persistLog = async (entry) => {
  const encryptedRequestPayload = encryptRequestPayload(
    JSON.stringify(sanitizeRequestForStorage(entry.requestBody))
  );

  const docPayload = {
    operation: entry.operation,
    requestType: entry.requestType || 'Plain Text',
    model: entry.model != null ? String(entry.model) : '',
    encryptedRequestPayload,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    totalTokens: entry.totalTokens,
    costUsd: entry.costUsd,
    finishReason: entry.finishReason != null ? String(entry.finishReason) : null,
    errorMessage: entry.errorMessage != null ? String(entry.errorMessage) : null,
  };

  if (entry.responseBody != null) {
    docPayload.encryptedResponsePayload = encryptRequestPayload(
      JSON.stringify(sanitizeRequestForStorage(entry.responseBody))
    );
  }

  const doc = new AiRequestLog(docPayload);

  await doc.save();
};

const enqueueAiLog = (entry) => {
  persistLog(entry).catch((err) => {
    console.error('AI Logs: failed to persist entry:', err.message);
  });
};

const listLogsSummary = async () => {
  const items = await AiRequestLog.find({})
    .sort({ createdAt: -1 })
    .select('-encryptedRequestPayload -encryptedResponsePayload')
    .lean();

  const total = items.length;
  return {
    total,
    items: items.map(mapRowSummary),
  };
};

const listLogsSummaryPaginated = async (page = 1, pageSize = 25) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(200, Math.max(1, Number(pageSize) || 25));
  const skip = (safePage - 1) * safePageSize;

  const [items, total] = await Promise.all([
    AiRequestLog.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safePageSize)
      .select('-encryptedRequestPayload -encryptedResponsePayload')
      .lean(),
    AiRequestLog.countDocuments({}),
  ]);

  return {
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    items: items.map(mapRowSummary),
  };
};

const getDailyCostSummary = async () => {
  const rows = await AiRequestLog.aggregate([
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        totalCostUsd: { $sum: { $ifNull: ['$costUsd', 0] } },
        requestCount: { $sum: 1 },
      },
    },
    { $sort: { _id: -1 } },
  ]);

  return rows.map((row) => ({
    date: row._id,
    totalCostUsd: row.totalCostUsd,
    requestCount: row.requestCount,
  }));
};

const exportAllLogsDecrypted = async () => {
  const rows = await AiRequestLog.find({}).sort({ createdAt: -1 }).lean();
  return rows.map((row) => {
    const request = decryptRequestPayload(row.encryptedRequestPayload);
    let response = null;
    if (row.encryptedResponsePayload) {
      response = decryptRequestPayload(row.encryptedResponsePayload);
    }
    return {
      _id: row._id,
      operation: row.operation,
      requestType: row.requestType || 'Plain Text',
      model: row.model,
      request,
      response,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.totalTokens,
      costUsd: row.costUsd,
      finishReason: row.finishReason,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
};

const getLogByIdDecrypted = async (id) => {
  const row = await AiRequestLog.findById(id).lean();
  if (!row) return null;

  const decryptedRequest = decryptRequestPayload(row.encryptedRequestPayload);
  let response = null;
  if (row.encryptedResponsePayload) {
    response = decryptRequestPayload(row.encryptedResponsePayload);
  }

  return {
    _id: row._id,
    operation: row.operation,
    requestType: row.requestType || 'Plain Text',
    model: row.model,
    request: decryptedRequest,
    response,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    costUsd: row.costUsd,
    finishReason: row.finishReason,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const deleteLogById = async (id) => {
  const result = await AiRequestLog.deleteOne({ _id: id });
  return result.deletedCount === 1;
};

/**
 * Deletes all logs with createdAt in [year, month) in the server's local timezone interpretation
 * of calendar month boundaries (UTC components from query params).
 */
const deleteLogsByYearMonth = async (year, month) => {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error('Invalid year or month');
  }
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const res = await AiRequestLog.deleteMany({
    createdAt: { $gte: start, $lt: end },
  });
  return res.deletedCount;
};

module.exports = {
  enqueueAiLog,
  listLogsSummary,
  listLogsSummaryPaginated,
  getDailyCostSummary,
  exportAllLogsDecrypted,
  getLogByIdDecrypted,
  deleteLogById,
  deleteLogsByYearMonth,
};
