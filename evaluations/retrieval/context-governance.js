/**
 * evaluations/retrieval/context-governance.js
 * Deterministic Context and Retrieval Governance Scenarios (§F8, §F7).
 * Verifies SHA-256 canonical hashing, token ceilings, and context immutability.
 */

const { createEvaluationScenario, SCENARIO_CATEGORIES } = require('../../runtime/evaluation/contracts');

const scenarios = [
  // RET-01: Hash Reproducibility
  createEvaluationScenario({
    id: 'ret-01-hash-reproducibility',
    name: 'Context Bundle SHA-256 Hash Determinism',
    category: SCENARIO_CATEGORIES.RETRIEVAL,
    agent: 'backend-engineer',
    initial_phase: 'ANALYZE',
    goal: 'Verify identical retrieval requests produce identical canonical hashes',
    executeFn: async (session) => {
      const bundle1 = await session.retrieveContext({
        sources: ['agents/core/engineering.md'],
        purpose: 'Deterministic hash verification run 1'
      });

      const bundle2 = await session.retrieveContext({
        sources: ['agents/core/engineering.md'],
        purpose: 'Deterministic hash verification run 2'
      });

      return {
        hash1: bundle1.bundle_hash,
        hash2: bundle2.bundle_hash,
        match: bundle1.bundle_hash === bundle2.bundle_hash && Boolean(bundle1.bundle_hash)
      };
    },
    assertions: [
      function assertDeterministicHash(ctx, a) {
        if (!ctx.output?.match) {
          throw new Error(`Hash mismatch: run1=${ctx.output?.hash1} vs run2=${ctx.output?.hash2}`);
        }
        a.assertContextHash(ctx.output?.hash1);
        return true;
      }
    ]
  }),

  // RET-02: Token Ceiling Enforcement
  createEvaluationScenario({
    id: 'ret-02-token-ceiling-enforcement',
    name: 'Context Retrieval Token Budget Ceiling',
    category: SCENARIO_CATEGORIES.RETRIEVAL,
    agent: 'backend-engineer',
    initial_phase: 'ANALYZE',
    goal: 'Ensure context bundle strictly respects token ceiling constraint',
    executeFn: async (session) => {
      const maxTokens = 350;
      const bundle = await session.retrieveContext({
        sources: ['agents/core/engineering.md'],
        maxTokens,
        purpose: 'Token ceiling truncation test'
      });

      return {
        totalTokens: bundle.total_tokens,
        maxTokens,
        underCeiling: bundle.total_tokens <= maxTokens
      };
    },
    assertions: [
      function assertTokenBudgetEnforced(ctx) {
        if (!ctx.output?.underCeiling) {
          throw new Error(`Token ceiling violated: used ${ctx.output?.totalTokens} tokens, max allowed ${ctx.output?.maxTokens}`);
        }
        return true;
      }
    ]
  })
];

module.exports = { scenarios };
