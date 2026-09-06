/**
 * runtime/evaluation/index.js
 * Unified facade for Toketeo Runtime Evaluation Harness (§F8).
 */

const contracts = require('./contracts');
const assertions = require('./assertions');
const { Scorecard } = require('./scorecard');
const { RegressionTracker } = require('./regression');
const { EvaluationRunner } = require('./runner');

module.exports = {
  ...contracts,
  assertions,
  Scorecard,
  RegressionTracker,
  EvaluationRunner
};
