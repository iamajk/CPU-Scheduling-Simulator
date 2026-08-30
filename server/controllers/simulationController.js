// ══════════════════════════════════════════════
//   controllers/simulationController.js
// ══════════════════════════════════════════════
const { validationResult } = require('express-validator');
const Simulation = require('../models/Simulation');
const Analytics  = require('../models/Analytics');
const { dispatch, computeStats, runComparison } = require('../services/schedulerService');

/* ── Track analytics helper ── */
async function trackAnalytics(algo) {
  const today = new Date().toISOString().split('T')[0];
  await Analytics.findOneAndUpdate(
    { date: today },
    { $inc: { totalRuns: 1, [`algoUsage.${algo}`]: 1 } },
    { upsert: true, new: true }
  );
}

/* ── POST /api/simulations/run — Run algorithm, return results ── */
exports.runSimulation = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { algorithm, processes, quantum = 2 } = req.body;
    const { schedule, results } = dispatch(algorithm, processes, quantum);
    const stats = computeStats(results, schedule);

    // Track analytics (don't block response)
    trackAnalytics(algorithm).catch(() => {});

    // Emit real-time event via Socket.IO (attached to req.app)
    const io = req.app.get('io');
    if (io) io.emit('simulation:complete', { algorithm, stats, userId: req.user?._id });

    res.json({ success: true, data: { algorithm, schedule, results, stats } });
  } catch (err) { next(err); }
};

/* ── POST /api/simulations/save — Save to DB ── */
exports.saveSimulation = async (req, res, next) => {
  try {
    const { name, algorithm, processes, quantum, results, gantt, stats } = req.body;
    const sim = await Simulation.create({
      user: req.user._id, name, algorithm, quantum,
      processes, results, gantt, stats
    });
    res.status(201).json({ success: true, message: 'Simulation saved', data: sim });
  } catch (err) { next(err); }
};

/* ── GET /api/simulations — Get user's simulations ── */
exports.getSimulations = async (req, res, next) => {
  try {
    const sims = await Simulation.find({ user: req.user._id })
      .select('name algorithm stats createdAt')
      .sort('-createdAt')
      .limit(50);
    res.json({ success: true, count: sims.length, data: sims });
  } catch (err) { next(err); }
};

/* ── GET /api/simulations/:id — Get single simulation ── */
exports.getSimulation = async (req, res, next) => {
  try {
    const sim = await Simulation.findOne({ _id: req.params.id, user: req.user._id });
    if (!sim) return res.status(404).json({ success: false, message: 'Simulation not found' });
    res.json({ success: true, data: sim });
  } catch (err) { next(err); }
};

/* ── DELETE /api/simulations/:id ── */
exports.deleteSimulation = async (req, res, next) => {
  try {
    const sim = await Simulation.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!sim) return res.status(404).json({ success: false, message: 'Simulation not found' });
    res.json({ success: true, message: 'Simulation deleted' });
  } catch (err) { next(err); }
};

/* ── POST /api/simulations/compare — Run all algorithms ── */
exports.compareAll = async (req, res, next) => {
  try {
    const { processes, quantum = 2 } = req.body;
    if (!processes || !processes.length) return res.status(400).json({ success: false, message: 'No processes provided' });
    const comparison = runComparison(processes, quantum);
    res.json({ success: true, data: comparison });
  } catch (err) { next(err); }
};
