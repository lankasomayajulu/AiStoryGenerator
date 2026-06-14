const mongoose = require('mongoose');

const SGFileSchema = new mongoose.Schema({
  Name: {
    type: String,
    required: true
  },
  FolderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'SGFolder'
  },
  Content: {
    type: Buffer
  },
  /** How this file is wrapped in LLM prompts: outline, Instructions, Scene Details, or filename tags. */
  promptRole: {
    type: String,
    enum: ['default', 'instructions', 'scene_details', 'outline'],
    default: 'default'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SGFile', SGFileSchema, 'SGFile');

