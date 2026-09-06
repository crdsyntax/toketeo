/**
 * runtime/evaluation/runner.js
 * Evaluation Scenario Runner and Trace Evaluator (§F8C, §F8F).
 * Executes scenarios against isolated AgentSessions, captures telemetry, and runs assertions.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { createSession } = require('../index');
const { loadAgentFromMarkdown } = require('../agents');
const { createEvaluationResult, EVALUATION_STATUS } = require('./contracts');
const assertions = require('./assertions');

class EvaluationRunner {
  constructor({ agentsDir = null, sessionsRoot = null } = {}) {
    const root = process.cwd();
    this.agentsDir = agentsDir || path.join(root, 'agents');
    this.sessionsRoot = sessionsRoot || path.join(os.tmpdir(), `toketeo-eval-sessions-${Date.now()}`);

    if (!fs.existsSync(this.sessionsRoot)) {
      fs.mkdirSync(this.sessionsRoot, { recursive: true });
    }

    this.loadedAgents = new Map();
  }

  getAgentDefinition(agentId) {
    if (this.loadedAgents.has(agentId)) {
      return this.loadedAgents.get(agentId);
    }

    let filePath;
    if (agentId === 'orchestrator') {
      filePath = path.join(this.agentsDir, 'orchestrator.md');
    } else if (agentId === 'backend-engineer') {
      filePath = path.join(this.agentsDir, 'backend', 'engineer.md');
    } else if (agentId === 'frontend-engineer') {
      filePath = path.join(this.agentsDir, 'frontend', 'engineer.md');
    } else if (agentId === 'database-engineer') {
      filePath = path.join(this.agentsDir, 'database', 'engineer.md');
    } else if (agentId === 'qa-engineer') {
      filePath = path.join(this.agentsDir, 'qa', 'tester.md');
    } else if (agentId === 'code-reviewer') {
      filePath = path.join(this.agentsDir, 'reviews', 'review.md');
    } else if (agentId === 'security-devops') {
      filePath = path.join(this.agentsDir, 'security', 'devops.md');
    } else {
      filePath = path.join(this.agentsDir, `${agentId}.md`);
    }

    if (fs.existsSync(filePath)) {
      const def = loadAgentFromMarkdown(filePath);
      this.loadedAgents.set(agentId, def);
      return def;
    }
    return null;
  }

  async runScenario(scenario) {
    const startMs = Date.now();
    const agentDef = this.getAgentDefinition(scenario.agent);

    // Create isolated session
    const sessionId = `eval-${scenario.id}-${Date.now()}`;
    const session = createSession({
      sessionId,
      agentDefinition: agentDef,
      sessionsRoot: this.sessionsRoot
    });

    let executorCalls = 0;
    const registeredTools = new Map();

    // Register a mock executor for testing
    const defaultExecutor = async () => {
      executorCalls++;
      return 'executed';
    };

    // Helper to register tools
    session.registerTool({
      name: 'write',
      executor: defaultExecutor
    });
    session.registerTool({
      name: 'read',
      executor: async () => {
        executorCalls++;
        return 'content';
      }
    });

    // Advance phase if initial_phase is specified
    if (scenario.initial_phase && scenario.initial_phase !== 'REQUEST') {
      const phases = ['ANALYZE', 'PLAN', 'REVIEW', 'EXECUTE', 'VERIFY', 'DOCUMENT', 'COMPLETE'];
      for (const p of phases) {
        session.transition(p);
        if (p === scenario.initial_phase) break;
      }
    }

    let executionOutput = null;
    let executionError = null;
    const trace = [];

    // Execute scenario steps or custom execution function
    try {
      if (typeof scenario.executeFn === 'function') {
        executionOutput = await scenario.executeFn(session, {
          executorCalls: () => executorCalls,
          registerTool: (name, fn) => session.registerTool({ name, executor: fn })
        });
      } else if (scenario.steps && scenario.steps.length > 0) {
        for (const step of scenario.steps) {
          if (step.type === 'tool_request') {
            const req = session.executeToolRequest ? await session.executeTool(step.tool, step.args || {}) : null;
            trace.push({ step: 'tool_request', tool: step.tool, result: req });
          } else if (step.type === 'transition') {
            session.transition(step.target);
            trace.push({ step: 'transition', target: step.target });
          }
        }
      }
    } catch (err) {
      executionError = err;
    }

    const durationMs = Date.now() - startMs;
    const assertionsPassed = [];
    const assertionsFailed = [];

    // Evaluate assertions
    const evaluationContext = {
      session,
      agentDefinition: agentDef,
      output: executionOutput,
      error: executionError,
      executorCalls,
      durationMs,
      trace
    };

    for (const assertion of scenario.assertions) {
      try {
        if (typeof assertion === 'function') {
          const pass = assertion(evaluationContext, assertions);
          if (pass) assertionsPassed.push(assertion.name || 'customAssertion');
        } else if (typeof assertion === 'string' && assertions[assertion]) {
          assertions[assertion](evaluationContext);
          assertionsPassed.push(assertion);
        }
      } catch (err) {
        assertionsFailed.push({
          assertion: typeof assertion === 'string' ? assertion : (assertion.name || 'customAssertion'),
          message: err.message,
          expected: err.expected,
          actual: err.actual
        });
      }
    }

    const status = assertionsFailed.length === 0 ? EVALUATION_STATUS.PASSED : EVALUATION_STATUS.FAILED;

    return createEvaluationResult({
      scenarioId: scenario.id,
      category: scenario.category,
      status,
      durationMs,
      assertionsPassed,
      assertionsFailed,
      trace,
      metrics: {
        executor_calls: executorCalls,
        duration_ms: durationMs,
        events_emitted: session.events?.readEvents ? session.events.readEvents().length : 0
      },
      error: executionError
    });
  }

  async runSuite(scenarios = []) {
    const results = [];
    for (const scenario of scenarios) {
      const res = await this.runScenario(scenario);
      results.push(res);
    }
    return results;
  }
}

module.exports = {
  EvaluationRunner
};
