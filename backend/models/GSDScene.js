const mongoose = require('mongoose');

const GSDSceneSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'GSDSession',
    index: true
  },
  partIndex: {
    type: Number,
    required: true,
    index: true
  },
  sceneTitle: {
    type: String,
    required: true
  },
  sceneBeat: {
    type: String,
    default: ''
  },
  draftText: {
    type: String,
    default: ''
  },
  dependsOnSceneIds: {
    type: [mongoose.Schema.Types.ObjectId],
    default: []
  },
  rawModelOutput: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GSDScene', GSDSceneSchema, 'GSDScene');
