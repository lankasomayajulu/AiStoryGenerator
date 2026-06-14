const mongoose = require('mongoose');

const GSDPlanPartSchema = new mongoose.Schema({
  partIndex: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  objective: {
    type: String,
    default: ''
  },
  conflict: {
    type: String,
    default: ''
  },
  outcome: {
    type: String,
    default: ''
  }
}, { _id: false });

const GSDPlanSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'GSDSession',
    index: true
  },
  chapterGoal: {
    type: String,
    default: ''
  },
  nextChapterIntent: {
    type: String,
    default: ''
  },
  parts: {
    type: [GSDPlanPartSchema],
    default: []
  },
  rawModelOutput: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GSDPlan', GSDPlanSchema, 'GSDPlan');
