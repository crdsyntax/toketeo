/**
 * runtime/gateway.js
 * Governed Execution Gateway for Toketeo Agent Runtime (§F3).
 * Orchestrates Contract Validation, Lifecycle Gates, Policy Engine, Approval Gates,
 * and Executor invocation with timeout handling and telemetry emission.
 */

const {
  validateToolRequest,
  createToolResult,
  createToolError,
  TOOL_STATUS,
  ERROR_CATEGORIES
} = require('./contracts');

class ExecutionGateway {
  constructor({
    registry,
    lifecycle,
    policy,
    approvals = null,
    events = null
  }) {
    if (!registry) throw new Error('ExecutionGateway requires a ToolRegistry instance');
    if (!lifecycle) throw new Error('ExecutionGateway requires a LifecycleMachine instance');
    if (!policy) throw new Error('ExecutionGateway requires a PolicyEngine instance');

    this.registry = registry;
    this.lifecycle = lifecycle;
    this.policy = policy;
    this.approvals = approvals;
    this.events = events;
  }

  /**
   * Orchestrates the execution of a ToolRequest through governance gates.
   *
   * @param {Object} toolRequest - Immutable ToolRequest instance
   * @param {Object} state - State snapshot { current_phase, status, pending_approval }
   * @param {Object} [context] - Execution context passed to executor
   * @returns {Promise<Object>} - Immutable ToolResult instance
   */
  async execute(toolRequest, state, context = {}) {
    const startMs = Date.now();
    const phase = state.current_phase || this.lifecycle.getPhase();

    // 1. Validate Tool Contract
    const valReq = validateToolRequest(toolRequest);
    if (!valReq.valid) {
      const toolError = createToolError({
        code: 'INVALID_TOOL_REQUEST',
        message: valReq.error,
        category: ERROR_CATEGORIES.INVALID_ARGUMENTS
      });

      this._emitDenied(toolRequest?.request_id || 'unknown', toolRequest?.tool_name || 'unknown', phase, toolError.message, toolRequest?.arguments);

      return createToolResult({
        requestId: toolRequest?.request_id || 'unknown',
        status: TOOL_STATUS.DENIED,
        durationMs: Date.now() - startMs,
        error: toolError
      });
    }

    const requestId = toolRequest.request_id;
    const toolName = toolRequest.tool_name;
    const args = toolRequest.arguments;

    // 2. Registry Lookup
    const toolDef = this.registry.get(toolName);
    if (!toolDef) {
      const toolError = createToolError({
        code: 'TOOL_NOT_FOUND',
        message: `Tool '${toolName}' is not registered in the catalog`,
        category: ERROR_CATEGORIES.TOOL_NOT_FOUND
      });

      this._emitDenied(requestId, toolName, phase, toolError.message, args);

      return createToolResult({
        requestId,
        status: TOOL_STATUS.ERROR,
        durationMs: Date.now() - startMs,
        error: toolError
      });
    }

    // 3. Argument Contract Validation via ToolDefinition
    const valArgs = this.registry.validateArguments(toolName, args);
    if (!valArgs.valid) {
      const toolError = createToolError({
        code: 'INVALID_ARGUMENTS',
        message: valArgs.error,
        category: ERROR_CATEGORIES.INVALID_ARGUMENTS
      });

      this._emitDenied(requestId, toolName, phase, toolError.message, args);

      return createToolResult({
        requestId,
        status: TOOL_STATUS.DENIED,
        durationMs: Date.now() - startMs,
        error: toolError
      });
    }

    // 4. Agent Capabilities Boundary Gate
    const agentDef = context.agentDefinition || state.agentDefinition;
    if (agentDef && agentDef.capabilities && Array.isArray(agentDef.capabilities.tools)) {
      if (!agentDef.capabilities.tools.includes(toolName)) {
        const toolError = createToolError({
          code: 'AGENT_TOOL_DENIED',
          message: `Tool '${toolName}' is not permitted by capabilities for agent '${agentDef.identity?.id || 'unknown'}'`,
          category: ERROR_CATEGORIES.POLICY_DENIED
        });

        this._emitDenied(requestId, toolName, phase, toolError.message, args);

        return createToolResult({
          requestId,
          status: TOOL_STATUS.DENIED,
          durationMs: Date.now() - startMs,
          error: toolError
        });
      }
    }

    // 5. Lifecycle Gate
    if (this.lifecycle.isWriteTool(toolName) && !this.lifecycle.isWriteAllowed()) {
      const toolError = createToolError({
        code: 'LIFECYCLE_DENIED',
        message: `Write tool '${toolName}' is forbidden in phase '${phase}'. Allowed only in EXECUTE and DOCUMENT.`,
        category: ERROR_CATEGORIES.LIFECYCLE_DENIED,
        details: {
          reason: 'LIFECYCLE_WRITE_VIOLATION',
          phase,
          tool: toolName
        }
      });

      this._emitDenied(requestId, toolName, phase, toolError.message, args);

      return createToolResult({
        requestId,
        status: TOOL_STATUS.DENIED,
        durationMs: Date.now() - startMs,
        error: toolError
      });
    }

    // 5. Policy Engine
    const policyDecision = this.policy.canExecute({ tool: toolName, args }, state);
    if (!policyDecision.allowed) {
      const toolError = createToolError({
        code: policyDecision.policy,
        message: policyDecision.reason,
        category: ERROR_CATEGORIES.POLICY_DENIED
      });

      this._emitDenied(requestId, toolName, phase, toolError.message, args);

      return createToolResult({
        requestId,
        status: TOOL_STATUS.DENIED,
        durationMs: Date.now() - startMs,
        error: toolError
      });
    }

    // 6. Approval Gate
    const isExplicitApprovalRequired = toolDef.requiresApproval === true;
    const isApproved = Boolean(context.hasApproval || args.hasApproval);

    if (isExplicitApprovalRequired && !isApproved) {
      if (this.approvals) {
        this.approvals.requestApproval({
          action: toolName,
          description: `Execution of high-risk tool '${toolName}'`,
          metadata: { requestId, args }
        });
      }

      const toolError = createToolError({
        code: 'APPROVAL_REQUIRED',
        message: `Tool '${toolName}' requires human approval before execution`,
        category: ERROR_CATEGORIES.APPROVAL_REQUIRED
      });

      this._emitDenied(requestId, toolName, phase, toolError.message, args);

      return createToolResult({
        requestId,
        status: TOOL_STATUS.DENIED,
        durationMs: Date.now() - startMs,
        error: toolError
      });
    }

    // 7. Execution Gate (All checks passed: ALLOW)
    if (this.events) {
      this.events.emit('tool.requested', {
        phase,
        toolName,
        toolArgs: { ...args, request_id: requestId }
      });
    }

    try {
      const output = await this._executeWithTimeout(toolDef.executor, args, context, toolDef.timeoutMs);
      const durationMs = Date.now() - startMs;

      if (this.events) {
        this.events.emit('tool.completed', {
          phase,
          toolName,
          durationMs,
          status: 'ok',
          toolArgs: { request_id: requestId }
        });
      }

      return createToolResult({
        requestId,
        status: TOOL_STATUS.OK,
        output,
        durationMs
      });
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const isTimeout = err.code === 'TIMEOUT' || err.message?.includes('timed out');
      const category = isTimeout ? ERROR_CATEGORIES.TIMEOUT : ERROR_CATEGORIES.EXECUTION_FAILED;

      const toolError = createToolError({
        code: isTimeout ? 'TIMEOUT' : 'EXECUTION_FAILED',
        message: err.message,
        category,
        details: { durationMs, originalError: String(err) }
      });

      if (this.events) {
        this.events.emit('tool.failed', {
          phase,
          toolName,
          durationMs,
          status: 'error',
          error: toolError.message,
          toolArgs: { request_id: requestId }
        });
      }

      return createToolResult({
        requestId,
        status: TOOL_STATUS.ERROR,
        durationMs,
        error: toolError
      });
    }
  }

  _emitDenied(requestId, toolName, phase, errorReason, args) {
    if (this.events) {
      this.events.emit('tool.denied', {
        phase,
        toolName,
        status: 'denied',
        error: errorReason,
        toolArgs: { ...(args || {}), request_id: requestId }
      });
    }
  }

  async _executeWithTimeout(executorFn, args, context, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const err = new Error(`Tool execution timed out after ${timeoutMs}ms`);
        err.code = 'TIMEOUT';
        reject(err);
      }, timeoutMs);

      Promise.resolve(executorFn(args, context))
        .then(res => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}

module.exports = {
  ExecutionGateway
};
