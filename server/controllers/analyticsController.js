// ══════════════════════════════════════════════
//   controllers/analyticsController.js
// ══════════════════════════════════════════════
const User       = require('../models/User');
const Simulation = require('../models/Simulation');
const Analytics  = require('../models/Analytics');

/* ── GET /api/analytics/stats — Admin dashboard stats ── */
exports.getStats = async (req, res, next) => {
  try {
    const [totalUsers, totalSims, recentUsers, analytics] = await Promise.all([
      User.countDocuments(),
      Simulation.countDocuments(),
      User.countDocuments({ lastActive: { $gte: new Date(Date.now() - 7*24*60*60*1000) } }),
      Analytics.find().sort('-date').limit(7)
    ]);

    // Aggregate algo usage across all analytics days
    const algoTotals = { fcfs:0, sjf:0, srtf:0, rr:0, priority:0, priority_pre:0 };
    analytics.forEach(day => {
      Object.keys(algoTotals).forEach(k => { algoTotals[k] += (day.algoUsage?.[k] || 0); });
    });

    const mostUsed = Object.entries(algoTotals).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'fcfs';

    res.json({
      success: true,
      data: { totalUsers, totalSims, recentUsers, mostUsed, algoTotals, recentAnalytics: analytics }
    });
  } catch (err) { next(err); }
};

/* ── GET /api/analytics/comparison — Algorithm comparison from DB ── */
exports.getComparison = async (req, res, next) => {
  try {
    const algos = ['fcfs','sjf','srtf','rr','priority','priority_pre'];
    const results = await Promise.all(algos.map(async algo => {
      const sims = await Simulation.find({ algorithm: algo }).select('stats').limit(100);
      if (!sims.length) return { algo, awt: 0, atat: 0, art: 0, cpuUtil: 0, throughput: 0, count: 0 };
      const avg = field => sims.reduce((s,x) => s + (x.stats?.[field]||0), 0) / sims.length;
      return { algo, awt: avg('awt'), atat: avg('atat'), art: avg('art'),
               cpuUtil: avg('cpuUtil'), throughput: avg('throughput'), count: sims.length };
    }));
    res.json({ success: true, data: results });
  } catch (err) { next(err); }
};
