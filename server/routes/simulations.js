// ══════════════════════════════════════════════
//   routes/simulations.js
// ══════════════════════════════════════════════
const express = require('express');
const router  = express.Router();
const {
  runSimulation, saveSimulation, getSimulations,
  getSimulation, deleteSimulation, compareAll
} = require('../controllers/simulationController');
const { protect } = require('../middleware/auth');
const { simulationValidation } = require('../utils/validators');

// Public run (results not saved); protected save
router.post('/run',        protect, simulationValidation, runSimulation);
router.post('/save',       protect, saveSimulation);
router.post('/compare',    protect, compareAll);
router.get('/',            protect, getSimulations);
router.get('/:id',         protect, getSimulation);
router.delete('/:id',      protect, deleteSimulation);

module.exports = router;
