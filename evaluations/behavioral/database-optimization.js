/**
 * evaluations/behavioral/database-optimization.js
 * Behavioral Evaluation Scenario (§F8G).
 * Evaluates execution trace, ordering of operations, and mandatory approval gates.
 */

const { createEvaluationScenario, SCENARIO_CATEGORIES } = require('../../runtime/evaluation/contracts');

const scenarios = [
  createEvaluationScenario({
    id: 'beh-01-index-optimization-flow',
    name: 'Database Index Optimization Behavioral Sequence',
    category: SCENARIO_CATEGORIES.BEHAVIORAL,
    agent: 'database-engineer',
    initial_phase: 'REQUEST',
    goal: 'Optimize slow query by analyzing schema and creating index with approval',
    executeFn: async (session) => {
      const trace = [];

      // 1. ANALYZE phase: inspect schema
      session.transition('ANALYZE');
      trace.push('transition:ANALYZE');

      session.registerTool({
        name: 'read',
        executor: async () => 'table: users, columns: [id, email, created_at]'
      });
      const schema = await session.executeTool('read', { path: 'src-tauri/src/db/schema.sql' });
      trace.push(`tool:read:${schema ? 'ok' : 'fail'}`);

      // 2. PLAN phase: plan migration (write must NOT be executed here)
      session.transition('PLAN');
      trace.push('transition:PLAN');

      // 3. REVIEW phase: code review & request approval for migration
      session.transition('REVIEW');
      trace.push('transition:REVIEW');

      const approval = session.requestApproval(
        'create_migration',
        'Add index idx_users_email on users(email)'
      );
      trace.push(`approval_requested:${approval.approval_id}`);

      // Approve
      session.decideApproval(approval.approval_id, 'granted', 'Approved by database architect');
      trace.push(`approval_decided:${approval.approval_id}:granted`);

      // 4. EXECUTE phase: write migration
      session.transition('EXECUTE');
      trace.push('transition:EXECUTE');

      session.registerTool({
        name: 'write',
        executor: async (args) => `Created migration file: ${args.path}`
      });
      const writeResult = await session.executeTool('write', { path: 'migrations/002_idx_users_email.sql' });
      trace.push(`tool:write:${writeResult ? 'ok' : 'fail'}`);

      // 5. VERIFY phase
      session.transition('VERIFY');
      trace.push('transition:VERIFY');

      // 6. DOCUMENT phase
      session.transition('DOCUMENT');
      trace.push('transition:DOCUMENT');

      // 7. COMPLETE phase
      session.transition('COMPLETE');
      trace.push('transition:COMPLETE');

      const finalState = session.complete('completed');
      trace.push(`completed:${finalState.status}`);

      return { trace, approvalId: approval.approval_id, finalPhase: session.getPhase() };
    },
    assertions: [
      function assertBehavioralTrace(ctx, a) {
        const trace = ctx.output?.trace || [];

        // Check required transitions
        const expectedPhases = [
          'transition:ANALYZE',
          'tool:read:ok',
          'transition:PLAN',
          'transition:REVIEW',
          'transition:EXECUTE',
          'tool:write:ok',
          'transition:VERIFY',
          'transition:DOCUMENT',
          'transition:COMPLETE',
          'completed:completed'
        ];

        for (const exp of expectedPhases) {
          if (!trace.some(t => t.startsWith(exp))) {
            throw new Error(`Behavioral flow missing required step: '${exp}'`);
          }
        }

        // Check that read occurred BEFORE write
        const readIdx = trace.findIndex(t => t.startsWith('tool:read'));
        const writeIdx = trace.findIndex(t => t.startsWith('tool:write'));
        if (readIdx >= writeIdx) {
          throw new Error('Behavioral violation: write executed before read');
        }

        // Check that approval was granted before EXECUTE
        const approvalIdx = trace.findIndex(t => t.startsWith('approval_decided'));
        const execIdx = trace.findIndex(t => t === 'transition:EXECUTE');
        if (approvalIdx >= execIdx) {
          throw new Error('Behavioral violation: EXECUTE reached before approval was decided');
        }

        a.assertLifecycle(ctx.session, 'COMPLETE');
        return true;
      }
    ]
  })
];

module.exports = { scenarios };
