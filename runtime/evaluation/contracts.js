/**
 * runtime/evaluation/contracts.js
 * Formal Evaluation and Benchmark Contracts (§F8A).
 * Defines structured schemas for EvaluationScenarios, AssertionResults, and Scorecards.
 */

const { deepFreeze } = require('../agents');

const SCENARIO_CATEGORIES = Object.freeze({
  SECURITY: 'security',
  LIFECYCLE: 'lifecycle',
  DELEGATION: 'delegation',
  RETRIEVAL: 'retrieval',
  BEHAVIORAL: 'behavioral',
  ADVERSARIAL: 'adversarial'
});

const EVALUATION_STATUS = Object.freeze({
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  ERROR: 'ERROR',
  SKIPPED: 'SKIPPED'
});

/**
 * Validates an EvaluationScenario definition.
 */
function validateEvaluationScenario(scenario) {
  if (!scenario || typeof scenario !== 'object') {
    return { valid: false, error: 'Scenario must be an object' };
  }
  if (!scenario.id || typeof scenario.id !== 'string') {
    return { valid: false, error: "Missing or invalid 'id' in Scenario" };
  }
  if (!scenario.name || typeof scenario.name !== 'string') {
    return { valid: false, error: "Missing or invalid 'name' in Scenario" };
  }
  if (!scenario.agent || typeof scenario.agent !== 'string') {
    return { valid: false, error: "Missing string 'agent' in Scenario" };
  }
  if (!Array.isArray(scenario.assertions) || scenario.assertions.length === 0) {
    return { valid: false, error: "'assertions' must be a non-empty array" };
  }

  return { valid: true, error: null };
}

/**
 * Factory for creating an immutable EvaluationScenario.
 */
function createEvaluationScenario({
  id,
  name,
  description = '',
  category = SCENARIO_CATEGORIES.SECURITY,
  agent = 'orchestrator',
  initial_phase = 'REQUEST',
  goal = '',
  steps = [],
  executeFn = null,
  expected = {},
  forbidden = {},
  assertions = [],
  limits = {}
}) {
  const scenario = {
    id,
    name,
    description,
    category: Object.values(SCENARIO_CATEGORIES).includes(category) ? category : SCENARIO_CATEGORIES.SECURITY,
    agent,
    initial_phase,
    goal,
    steps: Array.isArray(steps) ? [...steps] : [],
    executeFn,
    expected: { ...expected },
    forbidden: { ...forbidden },
    assertions: [...assertions],
    limits: {
      max_tokens: limits.max_tokens || 8000,
      timeout_ms: limits.timeout_ms || 5000,
      max_iterations: limits.max_iterations || 3,
      ...limits
    }
  };

  const validation = validateEvaluationScenario(scenario);
  if (!validation.valid) {
    const err = new Error(`SCENARIO_DEFINITION_INVALID: ${validation.error}`);
    err.code = 'SCENARIO_DEFINITION_INVALID';
    throw err;
  }

  return deepFreeze(scenario);
}

/**
 * Factory for creating an immutable EvaluationResult for a single scenario.
 */
function createEvaluationResult({
  scenarioId,
  category = 'security',
  status = EVALUATION_STATUS.PASSED,
  durationMs = 0,
  assertionsPassed = [],
  assertionsFailed = [],
  trace = [],
  metrics = {},
  error = null
}) {
  return deepFreeze({
    scenario_id: scenarioId,
    category,
    status,
    duration_ms: durationMs,
    assertions_passed: [...assertionsPassed],
    assertions_failed: [...assertionsFailed],
    trace: [...trace],
    metrics: { ...metrics },
    error: error ? { message: error.message, code: error.code } : null,
    evaluated_at: new Date().toISOString()
  });
}

module.exports = {
  SCENARIO_CATEGORIES,
  EVALUATION_STATUS,
  validateEvaluationScenario,
  createEvaluationScenario,
  createEvaluationResult
};
