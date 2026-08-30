// ══════════════════════════════════════════════
//   utils/validators.js — Input Validators
// ══════════════════════════════════════════════
const { body, param } = require('express-validator');

exports.registerValidation = [
  body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 chars'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 chars')
];

exports.loginValidation = [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required')
];

exports.simulationValidation = [
  body('algorithm')
    .isIn(['fcfs','sjf','srtf','rr','priority','priority_pre'])
    .withMessage('Invalid algorithm'),
  body('processes').isArray({ min: 1 }).withMessage('At least one process required'),
  body('processes.*.pid').notEmpty().withMessage('Process ID required'),
  body('processes.*.arrival').isInt({ min: 0 }).withMessage('Arrival must be >= 0'),
  body('processes.*.burst').isInt({ min: 1 }).withMessage('Burst must be >= 1'),
  body('processes.*.priority').optional().isInt({ min: 1 }),
  body('quantum').optional().isInt({ min: 1 })
];
