const mongoose = require('mongoose');

const GSDRunLogSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'GSDSession',
    index: true
  },
  stage: {
    type: String,
    enum: ['discuss', 'plan', 'scenes', 'elaborate', 'export', 'suggest_context'],
    required: true
  },
  requestPayload: {
    type: Object,
    default: {}
  },
  responsePayload: {
    type: Object,
    default: {}
  },
  modelUsed: {
    type: String,
    default: ''
  },
  success: {
    type: Boolean,
    default: true
  },
  errorMessage: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GSDRunLog', GSDRunLogSchema, 'GSDRunLog');
