// ══════════════════════════════════════════════
//   models/Analytics.js — Analytics Schema
// ══════════════════════════════════════════════
const mongoose = require('mongoose');

const AnalyticsSchema = new mongoose.Schema({
  date:       { type: String, required: true, unique: true }, // YYYY-MM-DD
  totalRuns:  { type: Number, default: 0 },
  algoUsage: {
    fcfs:         { type: Number, default: 0 },
    sjf:          { type: Number, default: 0 },
    srtf:         { type: Number, default: 0 },
    rr:           { type: Number, default: 0 },
    priority:     { type: Number, default: 0 },
    priority_pre: { type: Number, default: 0 }
  },
  uniqueUsers: { type: Number, default: 0 }
});

module.exports = mongoose.model('Analytics', AnalyticsSchema);
