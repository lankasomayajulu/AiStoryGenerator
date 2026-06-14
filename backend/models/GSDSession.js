const mongoose = require('mongoose');

const GSDSessionSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'SGProject',
    index: true
  },
  title: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'in_progress', 'completed'],
    default: 'draft'
  },
  selectedFileIds: {
    type: [mongoose.Schema.Types.ObjectId],
    default: []
  },
  chapterGoal: {
    type: String,
    default: ''
  },
  nextChapterIntent: {
    type: String,
    default: ''
  },
  discussionMessages: {
    type: [
      {
        role: { type: String, enum: ['system', 'user', 'assistant'], required: true },
        content: { type: String, required: true }
      }
    ],
    default: []
  },
  finalChapterDraft: {
    type: String,
    default: ''
  },
  instructionPack: {
    type: String,
    default: ''
  },
  /** AI-generated chapter title in the language requested (`chapterTitleLanguage`). */
  chapterGeneratedTitle: {
    type: String,
    default: ''
  },
  /** Target language/name locale for chapter title and headings (e.g. English, 日本語). */
  chapterTitleLanguage: {
    type: String,
    default: 'English'
  },
  sceneBeatDetailLevel: {
    type: String,
    enum: ['brief', 'medium', 'detailed'],
    default: 'medium'
  },
  sceneDraftDetailLevel: {
    type: String,
    enum: ['brief', 'medium', 'detailed'],
    default: 'medium'
  },
  chapterDraftDetailLevel: {
    type: String,
    enum: ['brief', 'medium', 'detailed'],
    default: 'medium'
  },
  modelDiscuss: {
    type: String,
    default: ''
  },
  modelPlan: {
    type: String,
    default: ''
  },
  modelScene: {
    type: String,
    default: ''
  },
  modelElaborate: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GSDSession', GSDSessionSchema, 'GSDSession');
