const mongoose = require('mongoose');

const SGFolderSchema = new mongoose.Schema({
  Name: {
    type: String,
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'SGProject'
  },
  fileIds: {
    type: [mongoose.Schema.Types.ObjectId],
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SGFolder', SGFolderSchema, 'SGFolder');

