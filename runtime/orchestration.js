/**
 * runtime/orchestration.js
 * Multi-Agent Orchestration Engine for Toketeo Agent Runtime (§F4).
 * Enforces Depth Limit, Anti-Loop Detection, Concurrency, Iterations,
 * Task Ownership, and Topology Gates.
 */

const {
  DELEGATION_STATUS,
  DELEGATION_ERRORS,
  createDelegationResult,
  createTaskOwnership
} = require('./delegation');

class OrchestratorEngine {
  constructor({
    maxDepth = 3,
    maxIterations = 3,
    maxConcurrency = 1,
    events = null
  } = {}) {
    this.maxDepth = maxDepth;
    this.maxIterations = maxIterations;
    this.maxConcurrency = maxConcurrency;
    this.events = events;

    // Authorized agents catalog
    this.authorizedAgents = new Map();

    // Active delegations and tasks tracking
    this.activeDelegations = new Map(); // delegationId -> DelegationRequest
    this.delegationChains = new Map();  // runId -> ancestor agent chain array
    this.iterationCounts = new Map();   // key -> count
    this.taskOwnerships = new Map();    // taskId -> TaskOwnership

    // Register default known Toketeo roles
    this.registerAgent('orchestrator', { role: 'root', capabilities: ['delegate', 'analyze', 'plan'] });
  }

  registerAgent(agentId, { role = 'specialist', capabilities = [] } = {}) {
    this.authorizedAgents.set(agentId, Object.freeze({
      agentId,
      role,
      capabilities: Object.freeze([...capabilities])
    }));
  }

  hasAgent(agentId) {
    return this.authorizedAgents.has(agentId);
  }

  isRoot(agentId) {
    const agent = this.authorizedAgents.get(agentId);
    return agent ? agent.role === 'root' : false;
  }

  /**
   * Evaluates delegation gates before any child agent or session can be instantiated.
   *
   * @param {Object} delegationRequest - Immutable DelegationRequest
   * @param {Object} [parentState] - Parent session state
   * @returns {Object} { allowed: boolean, error: null | { code, message } }
   */
  canDelegate(delegationRequest, parentState = {}) {
    const {
      parent_agent_id: parentAgent,
      child_agent_id: childAgent,
      parent_run_id: parentRunId,
      depth,
      task
    } = delegationRequest;

    // 1. Agent Known Gate
    if (!this.hasAgent(childAgent)) {
      return {
        allowed: false,
        error: {
          code: DELEGATION_ERRORS.UNKNOWN_AGENT_DENIED,
          message: `Child agent '${childAgent}' is not registered or authorized in the runtime.`
        }
      };
    }

    // 2. Topology / Authorization Gate (Specialists cannot delegate among themselves)
    if (!this.isRoot(parentAgent)) {
      return {
        allowed: false,
        error: {
          code: DELEGATION_ERRORS.UNAUTHORIZED_DELEGATION_DENIED,
          message: `Specialist agent '${parentAgent}' is unauthorized to delegate. Delegation is tree-shaped with single root orchestrator.`
        }
      };
    }

    // 3. Depth Gate (depth <= 3)
    if (depth > this.maxDepth) {
      return {
        allowed: false,
        error: {
          code: DELEGATION_ERRORS.DELEGATION_DEPTH_EXCEEDED,
          message: `Delegation depth ${depth} exceeds maximum allowed depth of ${this.maxDepth}.`
        }
      };
    }

    // 4. Anti-Loop Gate
    const ancestorChain = this.delegationChains.get(parentRunId) || [parentAgent];
    if (ancestorChain.includes(childAgent)) {
      return {
        allowed: false,
        error: {
          code: DELEGATION_ERRORS.DELEGATION_LOOP_DENIED,
          message: `Delegation loop detected: Agent '${childAgent}' already exists in the ancestor chain [${ancestorChain.join(' -> ')}].`
        }
      };
    }

    // 5. Iterations Gate (iterations <= 3)
    const iterKey = `${parentRunId}:${childAgent}:${task?.description || ''}`;
    const currentIters = (this.iterationCounts.get(iterKey) || 0) + 1;
    if (currentIters > this.maxIterations) {
      return {
        allowed: false,
        error: {
          code: DELEGATION_ERRORS.ITERATION_LIMIT_EXCEEDED,
          message: `Iteration limit of ${this.maxIterations} exceeded for delegation to '${childAgent}'.`
        }
      };
    }

    // 6. Concurrency Gate (concurrency <= 1)
    const activeChildrenForParent = Array.from(this.activeDelegations.values()).filter(
      d => d.parent_run_id === parentRunId
    );
    if (activeChildrenForParent.length >= this.maxConcurrency) {
      return {
        allowed: false,
        error: {
          code: DELEGATION_ERRORS.CONCURRENCY_LIMIT_EXCEEDED,
          message: `Active delegations (${activeChildrenForParent.length}) reached concurrency limit of ${this.maxConcurrency}.`
        }
      };
    }

    return { allowed: true, error: null };
  }

  /**
   * Executes a governed delegation.
   *
   * @param {Object} delegationRequest
   * @param {Function} childExecutorFn - Async function (childSession, request) => output
   * @param {Function} sessionFactoryFn - Factory function to create child AgentSession
   * @returns {Promise<Object>} DelegationResult
   */
  async delegate(delegationRequest, childExecutorFn, sessionFactoryFn = null) {
    const startMs = Date.now();
    const { delegation_id, parent_run_id, child_run_id, parent_agent_id, child_agent_id, depth, task } = delegationRequest;

    // Evaluate Gates
    const gateCheck = this.canDelegate(delegationRequest);
    if (!gateCheck.allowed) {
      if (this.events) {
        this.events.emit('delegation.denied', {
          delegation_id,
          parent_run_id,
          child_agent_id,
          error: gateCheck.error.message,
          code: gateCheck.error.code,
          depth
        });
      }

      return createDelegationResult({
        delegationId: delegation_id,
        childRunId: child_run_id,
        status: DELEGATION_STATUS.DENIED,
        error: gateCheck.error,
        durationMs: Date.now() - startMs
      });
    }

    // Register active state
    this.activeDelegations.set(delegation_id, delegationRequest);
    const parentChain = this.delegationChains.get(parent_run_id) || [parent_agent_id];
    this.delegationChains.set(child_run_id, [...parentChain, child_agent_id]);

    const iterKey = `${parent_run_id}:${child_agent_id}:${task?.description || ''}`;
    this.iterationCounts.set(iterKey, (this.iterationCounts.get(iterKey) || 0) + 1);

    // Register Task Ownership
    const taskId = task.id || `task-${Date.now()}`;
    const taskOwnership = createTaskOwnership({
      taskId,
      ownerAgentId: child_agent_id,
      parentTaskId: task.parentTaskId || null,
      description: task.description || ''
    });
    this.taskOwnerships.set(taskId, taskOwnership);

    if (this.events) {
      this.events.emit('delegation.started', {
        delegation_id,
        parent_run_id,
        child_run_id,
        parent_agent_id,
        child_agent_id,
        depth,
        task_id: taskId
      });
    }

    // Instantiate Child Session & Execute
    try {
      let childSession = null;
      if (typeof sessionFactoryFn === 'function') {
        childSession = sessionFactoryFn({
          sessionId: child_run_id,
          agentId: child_agent_id,
          context: {
            parent_run_id,
            delegation_id,
            depth,
            task_id: taskId
          }
        });
      }

      const output = await childExecutorFn(childSession, delegationRequest);
      const durationMs = Date.now() - startMs;

      this.activeDelegations.delete(delegation_id);
      taskOwnership.status = 'COMPLETED';

      if (this.events) {
        this.events.emit('delegation.completed', {
          delegation_id,
          parent_run_id,
          child_run_id,
          child_agent_id,
          duration_ms: durationMs,
          status: 'ok'
        });
      }

      return createDelegationResult({
        delegationId: delegation_id,
        childRunId: child_run_id,
        status: DELEGATION_STATUS.COMPLETED,
        output,
        durationMs
      });
    } catch (err) {
      const durationMs = Date.now() - startMs;
      this.activeDelegations.delete(delegation_id);
      taskOwnership.status = 'FAILED';

      if (this.events) {
        this.events.emit('delegation.failed', {
          delegation_id,
          parent_run_id,
          child_run_id,
          child_agent_id,
          duration_ms: durationMs,
          status: 'error',
          error: err.message
        });
      }

      return createDelegationResult({
        delegationId: delegation_id,
        childRunId: child_run_id,
        status: DELEGATION_STATUS.FAILED,
        error: { code: 'EXECUTION_FAILED', message: err.message },
        durationMs
      });
    }
  }

  /**
   * Verifies task ownership before an agent can modify or complete a task.
   */
  assertTaskOwnership(taskId, agentId) {
    const task = this.taskOwnerships.get(taskId);
    if (!task) {
      const err = new Error(`Task '${taskId}' not found in registry`);
      err.code = DELEGATION_ERRORS.OWNERSHIP_VIOLATION;
      throw err;
    }
    if (task.owner_agent_id !== agentId) {
      const err = new Error(`Ownership violation: Agent '${agentId}' is not the owner of task '${taskId}'. Owner is '${task.owner_agent_id}'.`);
      err.code = DELEGATION_ERRORS.OWNERSHIP_VIOLATION;
      throw err;
    }
    return true;
  }
}

module.exports = {
  OrchestratorEngine
};
