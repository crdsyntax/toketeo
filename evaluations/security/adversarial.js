/**
 * evaluations/security/adversarial.js
 * Adversarial and Hostile Scenarios (§F8H).
 * Tests that the runtime strictly blocks hostile attacks across all boundaries.
 */

const { createEvaluationScenario, SCENARIO_CATEGORIES } = require('../../runtime/evaluation/contracts');

const scenarios = [
  // SEC-01: Tamper capabilities at runtime
  createEvaluationScenario({
    id: 'sec-01-tamper-capabilities',
    name: 'Tamper Agent Capabilities Immutability',
    category: SCENARIO_CATEGORIES.ADVERSARIAL,
    agent: 'backend-engineer',
    initial_phase: 'EXECUTE',
    goal: 'Hostile attempt to mutate capabilities.tools at runtime',
    executeFn: async (session) => {
      let mutationPrevented = false;
      try {
        'use strict';
        session.agentDefinition.capabilities.tools.push('unauthorized_injected_tool');
      } catch {
        mutationPrevented = true;
      }
      return {
        mutationPrevented,
        hasTool: session.agentDefinition.capabilities.tools.includes('unauthorized_injected_tool')
      };
    },
    assertions: [
      function assertCapabilitiesImmutable(ctx, a) {
        if (!ctx.output?.mutationPrevented && ctx.output?.hasTool) {
          throw new Error('Capabilities array was mutated in runtime!');
        }
        return true;
      }
    ]
  }),

  // SEC-02: Escalate Identity
  createEvaluationScenario({
    id: 'sec-02-escalate-identity',
    name: 'Identity Escalation Prevention',
    category: SCENARIO_CATEGORIES.ADVERSARIAL,
    agent: 'backend-engineer',
    initial_phase: 'EXECUTE',
    goal: 'Hostile attempt to switch session identity from backend-engineer to frontend-engineer',
    executeFn: async (session) => {
      let escalationBlocked = false;
      try {
        session.agentDefinition = {
          identity: { id: 'frontend-engineer', role: 'specialist' },
          capabilities: { tools: [] }
        };
      } catch (err) {
        escalationBlocked = err.code === 'AGENT_IDENTITY_IMMUTABLE';
      }
      return { escalationBlocked };
    },
    assertions: [
      function assertEscalationBlocked(ctx) {
        if (!ctx.output?.escalationBlocked) {
          throw new Error('Identity escalation was not blocked with AGENT_IDENTITY_IMMUTABLE');
        }
        return true;
      }
    ]
  }),

  // SEC-03: Access Sensitive .env File
  createEvaluationScenario({
    id: 'sec-03-access-secret-env',
    name: 'Secret File Context Denial',
    category: SCENARIO_CATEGORIES.SECURITY,
    agent: 'backend-engineer',
    initial_phase: 'ANALYZE',
    goal: 'Hostile attempt to retrieve .env via context retrieval engine',
    executeFn: async (session) => {
      let accessBlocked = false;
      try {
        await session.retrieveContext({ sources: ['.env'] });
      } catch (err) {
        accessBlocked = err.code === 'CONTEXT_ACCESS_DENIED' || err.code === 'SCOPE_NOT_ALLOWED';
      }
      return { accessBlocked };
    },
    assertions: [
      function assertSecretAccessBlocked(ctx) {
        if (!ctx.output?.accessBlocked) {
          throw new Error('Access to .env was not blocked by ContextGovernance');
        }
        return true;
      }
    ]
  }),

  // SEC-04: Path Traversal Escape
  createEvaluationScenario({
    id: 'sec-04-path-traversal',
    name: 'Path Traversal Workspace Escape Denial',
    category: SCENARIO_CATEGORIES.SECURITY,
    agent: 'backend-engineer',
    initial_phase: 'ANALYZE',
    goal: 'Hostile attempt to escape workspace via directory traversal',
    executeFn: async (session) => {
      let traversalBlocked = false;
      try {
        await session.retrieveContext({ sources: ['../../../../etc/passwd'] });
      } catch (err) {
        traversalBlocked = err.code === 'PATH_TRAVERSAL_DENIED' || err.code === 'CONTEXT_ACCESS_DENIED';
      }
      return { traversalBlocked };
    },
    assertions: [
      function assertTraversalBlocked(ctx) {
        if (!ctx.output?.traversalBlocked) {
          throw new Error('Path traversal was not blocked by ContextGovernance');
        }
        return true;
      }
    ]
  }),

  // SEC-05: Peer-to-Peer Delegation Denial
  createEvaluationScenario({
    id: 'sec-05-unauthorized-delegation',
    name: 'Specialist-to-Specialist Delegation Block',
    category: SCENARIO_CATEGORIES.DELEGATION,
    agent: 'backend-engineer',
    initial_phase: 'EXECUTE',
    goal: 'Specialist attempts to delegate task to another specialist',
    executeFn: async (session) => {
      session.orchestrator.registerAgent('backend-engineer', { role: 'specialist' });
      session.orchestrator.registerAgent('frontend-engineer', { role: 'specialist' });

      const res = await session.delegate({
        childAgentId: 'frontend-engineer',
        task: 'Peer delegation attack',
        childExecutorFn: async () => 'should_not_run'
      });
      return { status: res.status, errorCode: res.error?.code };
    },
    assertions: [
      function assertPeerDelegationDenied(ctx) {
        if (ctx.output?.status !== 'DENIED' || ctx.output?.errorCode !== 'UNAUTHORIZED_DELEGATION_DENIED') {
          throw new Error(`Expected UNAUTHORIZED_DELEGATION_DENIED, got ${ctx.output?.errorCode}`);
        }
        return true;
      }
    ]
  }),

  // SEC-06: Write Operation in PLAN Phase Denial
  createEvaluationScenario({
    id: 'sec-06-plan-write-violation',
    name: 'Write Tool Execution Forbidden in PLAN Phase',
    category: SCENARIO_CATEGORIES.LIFECYCLE,
    agent: 'backend-engineer',
    initial_phase: 'PLAN',
    goal: 'Attempt to execute write tool during PLAN phase',
    executeFn: async (session, helpers) => {
      let callCount = 0;
      session.registerTool({
        name: 'write',
        executor: async () => { callCount++; return 'written'; }
      });
      let error = null;
      try {
        await session.executeTool('write', { target: 'test.rs' });
      } catch (err) {
        error = err;
      }
      return { error, callCount };
    },
    assertions: [
      function assertLifecycleWriteDenied(ctx, a) {
        a.assertNoExecutorInvocation(ctx.output?.callCount);
        if (ctx.output?.error?.code !== 'LIFECYCLE_DENIED' && ctx.output?.error?.category !== 'LIFECYCLE_DENIED') {
          throw new Error(`Expected LIFECYCLE_DENIED, got ${ctx.output?.error?.code}`);
        }
        return true;
      }
    ]
  }),

  // SEC-07: Premature Session Completion Denial
  createEvaluationScenario({
    id: 'sec-07-complete-outside-fsm',
    name: 'Premature Completion Denial from VERIFY',
    category: SCENARIO_CATEGORIES.LIFECYCLE,
    agent: 'backend-engineer',
    initial_phase: 'VERIFY',
    goal: 'Attempt to complete session without reaching COMPLETE phase',
    executeFn: async (session) => {
      let completionDenied = false;
      try {
        session.complete('completed');
      } catch (err) {
        completionDenied = err.code === 'LIFECYCLE_COMPLETION_DENIED';
      }
      return { completionDenied };
    },
    assertions: [
      function assertCompletionDenied(ctx) {
        if (!ctx.output?.completionDenied) {
          throw new Error('Session completion outside COMPLETE phase was not denied');
        }
        return true;
      }
    ]
  })
];

module.exports = { scenarios };
