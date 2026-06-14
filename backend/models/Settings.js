const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  ApiKey: {
    type: String,
    default: ''
  },
  FavouriteModels: {
    type: [String],
    default: []
  },
  DefaultModel: {
    type: String,
    default: ''
  },
  OutputLength: {
    type: Number,
    default: 1000
  },
  Temperature: {
    type: Number,
    default: 0.7,
    min: 0,
    max: 1
  },
  /** When true, Project page OpenRouter SSE uses GSD-aligned options (same as planner streaming path). */
  UseGsdForStreaming: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Settings', SettingsSchema, 'Settings');

