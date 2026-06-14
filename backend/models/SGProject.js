const mongoose = require('mongoose');

const SGProjectSchema = new mongoose.Schema({
  Name: {
    type: String,
    required: true
  },
  folderIds: {
    type: [mongoose.Schema.Types.ObjectId],
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SGProject', SGProjectSchema, 'SGProject');

