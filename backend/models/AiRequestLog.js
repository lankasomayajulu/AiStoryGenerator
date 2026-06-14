const mongoose = require('mongoose');

/** Stored in MongoDB collection "AI Logs" (requested name). */
const aiRequestLogSchema = new mongoose.Schema(
  {
    operation: { type: String, required: true },
    /**
     * High-level category for filtering: GSD | OCR | Image | Plain Text
     */
    requestType: {
      type: String,
      enum: ['GSD', 'OCR', 'Image', 'Plain Text'],
      default: 'Plain Text',
    },
    model: { type: String, default: '' },
    encryptedRequestPayload: { type: String, required: true },
    /** Encrypted OpenRouter-style completion JSON (or aggregated stream summary). */
    encryptedResponsePayload: { type: String, default: null },
    inputTokens: { type: Number, default: null },
    outputTokens: { type: Number, default: null },
    totalTokens: { type: Number, default: null },
    costUsd: { type: Number, default: null },
    finishReason: { type: String, default: null },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true, collection: 'AI Logs' }
);

module.exports = mongoose.model('AiRequestLog', aiRequestLogSchema);
