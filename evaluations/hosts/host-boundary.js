/**
 * evaluations/hosts/host-boundary.js
 * Host Adapter & Hook Interceptor Governance Scenarios (§F9.2).
 * Verifies that host-level tool executions (e.g. Antigravity PreToolUse hooks)
 * are strictly intercepted and governed before touching the OS or filesystem.
 */

const { createEvaluationScenario, SCENARIO_CATEGORIES } = require('../../runtime/evaluation/contracts');
const { AntigravityHostAdapter } = require('../../runtime/hosts/antigravity');

const scenarios = [
  // HST-01: Antigravity Read Tool Allowed in ANALYZE
  createEvaluationScenario({
    id: 'hst-01-antigravity-hook-allow',
    name: 'Antigravity Hook Allows Read in ANALYZE',
    category: SCENARIO_CATEGORIES.SECURITY,
    agent: 'backend-engineer',
    initial_phase: 'ANALYZE',
    goal: 'Antigravity PreToolUse hook intercepts view_file and permits execution',
    executeFn: async (session) => {
      const adapter = new AntigravityHostAdapter();
      const decision = adapter.interceptToolCall({
        toolCall: {
          name: 'view_file',
          args: { AbsolutePath: 'D:/Documents/GitHub/toketeo/agents/core/engineering.md' }
        },
        stepIdx: 1,
        conversationId: session.state.sessionId
      }, session);

      return { decision };
    },
    assertions: [
      function assertHookAllowed(ctx) {
        const d = ctx.output?.decision;
        if (d?.decision !== 'allow') {
          throw new Error(`Expected decision 'allow', got '${d?.decision}' (${d?.reason})`);
        }
        if (d?.code !== 'AUTHORIZED') {
          throw new Error(`Expected code 'AUTHORIZED', got '${d?.code}'`);
        }
        return true;
      }
    ]
  }),

  // HST-02: Antigravity Write Tool Denied in PLAN
  createEvaluationScenario({
    id: 'hst-02-antigravity-hook-deny-write-in-plan',
    name: 'Antigravity Hook Blocks replace_file_content in PLAN',
    category: SCENARIO_CATEGORIES.LIFECYCLE,
    agent: 'backend-engineer',
    initial_phase: 'PLAN',
    goal: 'Antigravity PreToolUse hook blocks write tool during PLAN phase',
    executeFn: async (session) => {
      const adapter = new AntigravityHostAdapter();
      const decision = adapter.interceptToolCall({
        toolCall: {
          name: 'replace_file_content',
          args: { TargetFile: 'src-tauri/src/main.rs', ReplacementContent: '...' }
        },
        stepIdx: 2,
        conversationId: session.state.sessionId
      }, session);

      return { decision };
    },
    assertions: [
      function assertWriteBlockedInPlan(ctx) {
        const d = ctx.output?.decision;
        if (d?.decision !== 'deny') {
          throw new Error(`Expected decision 'deny', got '${d?.decision}'`);
        }
        if (d?.code !== 'LIFECYCLE_DENIED') {
          throw new Error(`Expected code 'LIFECYCLE_DENIED', got '${d?.code}'`);
        }
        if (d?.category !== 'LIFECYCLE_VIOLATION') {
          throw new Error(`Expected category 'LIFECYCLE_VIOLATION', got '${d?.category}'`);
        }
        return true;
      }
    ]
  }),

  // HST-03: Antigravity Unauthorized Tool Denied
  createEvaluationScenario({
    id: 'hst-03-antigravity-hook-capability-denial',
    name: 'Antigravity Hook Blocks Unpermitted Tool',
    category: SCENARIO_CATEGORIES.SECURITY,
    agent: 'backend-engineer',
    initial_phase: 'EXECUTE',
    goal: 'Antigravity PreToolUse hook blocks tool not in agent capabilities',
    executeFn: async (session) => {
      const adapter = new AntigravityHostAdapter();
      const decision = adapter.interceptToolCall({
        toolCall: {
          name: 'arbitrary_admin_injection',
          args: { payload: 'drop database' }
        },
        stepIdx: 3,
        conversationId: session.state.sessionId
      }, session);

      return { decision };
    },
    assertions: [
      function assertCapabilityBlocked(ctx) {
        const d = ctx.output?.decision;
        if (d?.decision !== 'deny') {
          throw new Error(`Expected decision 'deny', got '${d?.decision}'`);
        }
        if (d?.code !== 'AGENT_TOOL_DENIED') {
          throw new Error(`Expected code 'AGENT_TOOL_DENIED', got '${d?.code}'`);
        }
        return true;
      }
    ]
  }),

  // HST-04: Antigravity Policy Deny (git push --force)
  createEvaluationScenario({
    id: 'hst-04-antigravity-hook-policy-force-push',
    name: 'Antigravity Hook Blocks git push --force',
    category: SCENARIO_CATEGORIES.SECURITY,
    agent: 'security-devops',
    initial_phase: 'EXECUTE',
    goal: 'Antigravity PreToolUse hook blocks destructive force-push command',
    executeFn: async (session) => {
      const adapter = new AntigravityHostAdapter();
      const decision = adapter.interceptToolCall({
        toolCall: {
          name: 'run_command',
          args: { CommandLine: 'git push --force origin main' }
        },
        stepIdx: 4,
        conversationId: session.state.sessionId
      }, session);

      return { decision };
    },
    assertions: [
      function assertForcePushBlocked(ctx) {
        const d = ctx.output?.decision;
        if (d?.decision !== 'deny') {
          throw new Error(`Expected decision 'deny', got '${d?.decision}'`);
        }
        if (d?.code !== 'P1_FORCE_PUSH_DENIED') {
          throw new Error(`Expected code 'P1_FORCE_PUSH_DENIED', got '${d?.code}'`);
        }
        return true;
      }
    ]
  }),

  // HST-05: Antigravity Policy Confirmation (git push)
  createEvaluationScenario({
    id: 'hst-05-antigravity-hook-policy-push-ask',
    name: 'Antigravity Hook Demands User Confirmation for git push',
    category: SCENARIO_CATEGORIES.SECURITY,
    agent: 'security-devops',
    initial_phase: 'EXECUTE',
    goal: 'Antigravity PreToolUse hook requires ask confirmation for git push',
    executeFn: async (session) => {
      const adapter = new AntigravityHostAdapter();
      const decision = adapter.interceptToolCall({
        toolCall: {
          name: 'run_command',
          args: { CommandLine: 'git push origin main' }
        },
        stepIdx: 5,
        conversationId: session.state.sessionId
      }, session);

      return { decision };
    },
    assertions: [
      function assertPushDemandsConfirmation(ctx) {
        const d = ctx.output?.decision;
        if (d?.decision !== 'ask') {
          throw new Error(`Expected decision 'ask', got '${d?.decision}'`);
        }
        if (d?.code !== 'P3_GIT_PUSH_CONFIRMATION') {
          throw new Error(`Expected code 'P3_GIT_PUSH_CONFIRMATION', got '${d?.code}'`);
        }
        return true;
      }
    ]
  })
];

module.exports = { scenarios };
