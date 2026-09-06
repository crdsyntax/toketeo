/**
 * evaluations/delegation/depth-concurrency.js
 * Multi-Agent Delegation Invariants (§F8, §F4).
 * Verifies strict depth ceilings (depth <= 3), concurrency ceilings (concurrency <= 1), and loop prevention.
 */

const { createEvaluationScenario, SCENARIO_CATEGORIES } = require('../../runtime/evaluation/contracts');

const scenarios = [
  // DEL-01: Delegation Depth Ceiling Enforcement
  createEvaluationScenario({
    id: 'del-01-depth-ceiling-enforcement',
    name: 'Delegation Depth Ceiling (depth <= 3)',
    category: SCENARIO_CATEGORIES.DELEGATION,
    agent: 'orchestrator',
    initial_phase: 'EXECUTE',
    goal: 'Ensure orchestrator cannot delegate beyond depth 3',
    executeFn: async (session) => {
      session.orchestrator.registerAgent('orchestrator', { role: 'root' });
      session.orchestrator.registerAgent('backend-engineer', { role: 'specialist' });

      const res = await session.delegate({
        childAgentId: 'backend-engineer',
        task: 'Excessive depth delegation',
        depth: 4,
        childExecutorFn: async () => 'should_not_run'
      });

      return {
        status: res.status,
        errorCode: res.error?.code
      };
    },
    assertions: [
      function assertDepthExceededDenied(ctx) {
        if (ctx.output?.status !== 'DENIED' || ctx.output?.errorCode !== 'DELEGATION_DEPTH_EXCEEDED') {
          throw new Error(`Expected DELEGATION_DEPTH_EXCEEDED, got ${ctx.output?.errorCode} (${ctx.output?.status})`);
        }
        return true;
      }
    ]
  }),

  // DEL-02: Delegation Anti-Loop Detection
  createEvaluationScenario({
    id: 'del-02-delegation-loop-prevention',
    name: 'Delegation Anti-Loop Gate',
    category: SCENARIO_CATEGORIES.DELEGATION,
    agent: 'orchestrator',
    initial_phase: 'EXECUTE',
    goal: 'Ensure an agent cannot be delegated to if it is already in the ancestor chain',
    executeFn: async (session) => {
      session.orchestrator.registerAgent('orchestrator', { role: 'root' });

      // Orchestrator attempts to delegate to orchestrator (self-loop)
      const res = await session.delegate({
        childAgentId: 'orchestrator',
        task: 'Circular self delegation',
        depth: 1,
        childExecutorFn: async () => 'loop'
      });

      return {
        status: res.status,
        errorCode: res.error?.code
      };
    },
    assertions: [
      function assertLoopDenied(ctx) {
        if (ctx.output?.status !== 'DENIED' || ctx.output?.errorCode !== 'DELEGATION_LOOP_DENIED') {
          throw new Error(`Expected DELEGATION_LOOP_DENIED, got ${ctx.output?.errorCode}`);
        }
        return true;
      }
    ]
  })
];

module.exports = { scenarios };
