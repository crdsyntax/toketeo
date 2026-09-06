#!/usr/bin/env node
/**
 * scripts/evaluate-agent-runtime.js
 * Independent CLI runner for the Toketeo Runtime Evaluation & Benchmark Harness (§F8).
 * Evaluates adversarial scenarios, behavioral traces, and compares against baselines.
 */

const path = require('path');
const { EvaluationRunner } = require('../runtime/evaluation/runner');
const { Scorecard } = require('../runtime/evaluation/scorecard');
const { RegressionTracker } = require('../runtime/evaluation/regression');

// Load Scenario Suites
const { scenarios: adversarialScenarios } = require('../evaluations/security/adversarial');
const { scenarios: behavioralScenarios } = require('../evaluations/behavioral/database-optimization');
const { scenarios: retrievalScenarios } = require('../evaluations/retrieval/context-governance');
const { scenarios: lifecycleScenarios } = require('../evaluations/lifecycle/fsm-circuit');
const { scenarios: delegationScenarios } = require('../evaluations/delegation/depth-concurrency');
const { scenarios: modelScenarios } = require('../evaluations/providers/model-governance');
const { scenarios: hostScenarios } = require('../evaluations/hosts/host-boundary');

const ALL_SCENARIOS = [
  ...adversarialScenarios,
  ...behavioralScenarios,
  ...retrievalScenarios,
  ...lifecycleScenarios,
  ...delegationScenarios,
  ...modelScenarios,
  ...hostScenarios
];

async function runEvaluation() {
  console.log('\x1b[1m\x1b[35m=== Launching Toketeo Runtime Evaluation Harness (§F8) ===\x1b[0m\n');
  console.log(`Loaded ${ALL_SCENARIOS.length} scenarios across Security, Lifecycle, Delegation, and Behavioral suites.\n`);

  const runner = new EvaluationRunner();
  const tracker = new RegressionTracker();

  // 1. Run all scenarios through the harness
  const results = await runner.runSuite(ALL_SCENARIOS);

  // 2. Load and compare against baseline
  const baseline = tracker.getBaseline('baseline-v1');
  const comparison = tracker.compare(results, baseline);

  // 3. Generate Scorecard
  const scorecard = new Scorecard({
    runId: `run-${Date.now()}`,
    version: '0.8.0',
    results,
    baselineComparison: comparison
  });

  // 4. Print ASCII Scorecard
  console.log(scorecard.formatAscii());

  // 5. Save Run Artifact
  const scorecardJson = scorecard.toJSON();
  const savedRunPath = tracker.saveRun(scorecardJson);
  console.log(`Saved evaluation run artifact to: ${savedRunPath}`);

  // 6. Save baseline if none exists
  if (!baseline) {
    const savedBaselinePath = tracker.saveBaseline('baseline-v1', scorecardJson);
    console.log(`Initialized first baseline artifact at: ${savedBaselinePath}`);
  }

  // 7. Check pass criteria
  const metrics = scorecard.calculateMetrics();
  const hasRegressions = comparison.regressions.length > 0;
  const hasFailures = metrics.failed > 0;

  if (hasRegressions || hasFailures) {
    console.error(`\x1b[31mEvaluation Harness completed with ${metrics.failed} failures and ${comparison.regressions.length} regressions.\x1b[0m\n`);
    process.exit(1);
  } else {
    console.log(`\x1b[32mAll ${metrics.total} scenarios passed with 0 regressions (100% Invariant Compliance).\x1b[0m\n`);
    process.exit(0);
  }
}

if (require.main === module) {
  runEvaluation().catch(err => {
    console.error('Fatal Evaluation Harness Error:', err);
    process.exit(1);
  });
}

module.exports = { runEvaluation };
