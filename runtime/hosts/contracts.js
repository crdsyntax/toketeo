/**
 * runtime/hosts/contracts.js
 * Formal Host Adapter Contracts and Decision Schemas (§F9.2).
 * Defines standardized boundaries for intercepting host-level tool executions
 * from external environments (Antigravity, OpenCode, MCP clients).
 * 
 * Invariant:
 * Host ≠ Authority. The Host proposes tool executions on behalf of a model;
 * Toketeo's ExecutionGateway grants or denies execution permission.
 */

const { deepFreeze } = require('../agents');

const HOST_DECISIONS = Object.freeze({
  ALLOW: 'allow',
  DENY: 'deny',
  ASK: 'ask',
  FORCE_ASK: 'force_ask'
});

/**
 * Validates a HostToolInvocation payload from an external host.
 */
function validateHostToolInvocation(inv) {
  if (!inv || typeof inv !== 'object') {
    return { valid: false, error: 'HostToolInvocation must be an object' };
  }
  if (!inv.tool_name || typeof inv.tool_name !== 'string') {
    return { valid: false, error: "Missing string 'tool_name' in HostToolInvocation" };
  }
  if (typeof inv.args !== 'object' || inv.args === null) {
    return { valid: false, error: "'args' must be an object in HostToolInvocation" };
  }
  return { valid: true, error: null };
}

/**
 * Factory for creating an immutable HostToolInvocation.
 */
function createHostToolInvocation({
  host = 'generic',
  toolName,
  args = {},
  agentId = 'orchestrator',
  stepIdx = 0,
  conversationId = '',
  metadata = {}
}) {
  const inv = {
    host,
    tool_name: toolName,
    args: { ...args },
    agent_id: agentId,
    step_idx: Number(stepIdx) || 0,
    conversation_id: String(conversationId || ''),
    metadata: { ...metadata },
    timestamp: new Date().toISOString()
  };

  const validation = validateHostToolInvocation(inv);
  if (!validation.valid) {
    const err = new Error(`HOST_TOOL_INVOCATION_INVALID: ${validation.error}`);
    err.code = 'HOST_TOOL_INVOCATION_INVALID';
    throw err;
  }

  return deepFreeze(inv);
}

/**
 * Factory for creating an immutable HostDecision response.
 */
function createHostDecision({
  decision = HOST_DECISIONS.ALLOW,
  reason = '',
  code = null,
  category = null,
  permissionOverrides = [],
  overwrite = null
}) {
  if (!Object.values(HOST_DECISIONS).includes(decision)) {
    throw new Error(`Invalid HostDecision: ${decision}. Must be one of: ${Object.values(HOST_DECISIONS).join(', ')}`);
  }

  return deepFreeze({
    decision,
    reason: typeof reason === 'string' ? reason : '',
    code: code || null,
    category: category || null,
    permissionOverrides: Array.isArray(permissionOverrides) ? [...permissionOverrides] : [],
    overwrite: overwrite && typeof overwrite === 'object' ? { ...overwrite } : null,
    decided_at: new Date().toISOString()
  });
}

/**
 * Base class for all Host Adapters (Antigravity, OpenCode, MCP).
 */
class BaseHostAdapter {
  constructor(name = 'base-host') {
    this.name = name;
  }

  /**
   * Evaluates a host tool invocation against the active session's governance.
   *
   * @param {Object} hostInvocation - Immutable HostToolInvocation
   * @param {Object} session - AgentSession
   * @returns {Promise<Object>} HostDecision
   */
  async interceptToolCall(hostInvocation, session) {
    throw new Error(`interceptToolCall() must be implemented by HostAdapter '${this.name}'`);
  }

  /**
   * Formats the HostDecision into host-native response format (e.g. stdout JSON).
   *
   * @param {Object} hostDecision
   * @returns {*}
   */
  formatResponse(hostDecision) {
    return {
      decision: hostDecision.decision,
      reason: hostDecision.reason,
      ...(hostDecision.permissionOverrides.length > 0 ? { permissionOverrides: hostDecision.permissionOverrides } : {}),
      ...(hostDecision.overwrite ? { overwrite: hostDecision.overwrite } : {})
    };
  }
}

module.exports = {
  HOST_DECISIONS,
  validateHostToolInvocation,
  createHostToolInvocation,
  createHostDecision,
  BaseHostAdapter
};
