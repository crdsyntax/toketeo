/**
 * evaluations/lifecycle/fsm-circuit.js
 * Lifecycle FSM Circuit and Transition Invariants (§F8, §F1).
 * Verifies sequential 8-phase lifecycle transitions and denies illegal phase jumps.
 */

const { createEvaluationScenario, SCENARIO_CATEGORIES } = require('../../runtime/evaluation/contracts');

const scenarios = [
  // LIF-01: Full Sequential FSM Traversal
  createEvaluationScenario({
    id: 'lif-01-sequential-fsm-traversal',
    name: 'Full Sequential 8-Phase Lifecycle Traversal',
    category: SCENARIO_CATEGORIES.LIFECYCLE,
    agent: 'orchestrator',
    initial_phase: 'REQUEST',
    goal: 'Traverse all 8 lifecycle phases sequentially from REQUEST to COMPLETE',
    executeFn: async (session) => {
      const phases = ['ANALYZE', 'PLAN', 'REVIEW', 'EXECUTE', 'VERIFY', 'DOCUMENT', 'COMPLETE'];
      const traversed = [session.getPhase()];

      for (const p of phases) {
        session.transition(p);
        traversed.push(session.getPhase());
      }

      session.complete('completed');

      return {
        traversed,
        finalStatus: session.state.status,
        phaseCount: traversed.length
      };
    },
    assertions: [
      function assertSequentialTraversal(ctx, a) {
        const expected = ['REQUEST', 'ANALYZE', 'PLAN', 'REVIEW', 'EXECUTE', 'VERIFY', 'DOCUMENT', 'COMPLETE'];
        if (JSON.stringify(ctx.output?.traversed) !== JSON.stringify(expected)) {
          throw new Error(`Invalid lifecycle sequence: ${JSON.stringify(ctx.output?.traversed)}`);
        }
        a.assertLifecycle(ctx.session, 'COMPLETE');
        return true;
      }
    ]
  }),

  // LIF-02: Illegal Phase Skip Denial
  createEvaluationScenario({
    id: 'lif-02-illegal-phase-jump-denial',
    name: 'Illegal Phase Jump Denial (REQUEST to EXECUTE)',
    category: SCENARIO_CATEGORIES.LIFECYCLE,
    agent: 'backend-engineer',
    initial_phase: 'REQUEST',
    goal: 'Verify direct jump from REQUEST to EXECUTE is strictly rejected',
    executeFn: async (session) => {
      let jumpDenied = false;
      let errorCode = null;

      try {
        session.transition('EXECUTE');
      } catch (err) {
        jumpDenied = true;
        errorCode = err.code || err.category;
      }

      return {
        jumpDenied,
        errorCode,
        currentPhase: session.getPhase()
      };
    },
    assertions: [
      function assertJumpRejected(ctx, a) {
        if (!ctx.output?.jumpDenied) {
          throw new Error('Illegal transition from REQUEST to EXECUTE was unexpectedly allowed');
        }
        if (ctx.output?.currentPhase !== 'REQUEST') {
          throw new Error(`Current phase was corrupted: ${ctx.output?.currentPhase}`);
        }
        return true;
      }
    ]
  })
];

module.exports = { scenarios };
