// ══════════════════════════════════════════════
//   models/Simulation.js — Simulation Schema
// ══════════════════════════════════════════════
const mongoose = require('mongoose');

const ProcessSchema = new mongoose.Schema({
  pid:      { type: String, required: true },
  arrival:  { type: Number, required: true },
  burst:    { type: Number, required: true },
  priority: { type: Number, default: 1 },
  color:    { type: String, default: '#00e5a0' }
}, { _id: false });

const ResultSchema = new mongoose.Schema({
  pid:        String,
  arrival:    Number,
  burst:      Number,
  priority:   Number,
  color:      String,
  completion: Number,
  turnaround: Number,
  waiting:    Number,
  response:   Number
}, { _id: false });

const GanttBlockSchema = new mongoose.Schema({
  pid:   String,
  start: Number,
  end:   Number,
  color: String
}, { _id: false });

const SimulationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', required: true
  },
  name: {
    type: String, default: 'Untitled Simulation', maxlength: 80
  },
  algorithm: {
    type: String,
    enum: ['fcfs','sjf','srtf','rr','priority','priority_pre'],
    required: true
  },
  quantum:   { type: Number, default: 2 },
  processes: [ProcessSchema],
  results:   [ResultSchema],
  gantt:     [GanttBlockSchema],
  stats: {
    awt:       Number,
    atat:      Number,
    art:       Number,
    cpuUtil:   Number,
    throughput: Number,
    n:         Number
  },
  createdAt: { type: Date, default: Date.now }
});

// Update user's total simulations count after save
SimulationSchema.post('save', async function() {
  await mongoose.model('User').findByIdAndUpdate(
    this.user, { $inc: { totalSimulations: 1 }, lastActive: Date.now() }
  );
});

module.exports = mongoose.model('Simulation', SimulationSchema);
