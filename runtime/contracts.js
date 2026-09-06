/**
 * runtime/contracts.js
 * Formal Tool Contracts for Toketeo Agent Runtime (§F2).
 * Establishes immutable contracts for ToolRequest, ToolResult, and ToolError.
 */

const RISK_LEVELS = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

const TOOL_STATUS = Object.freeze({
  OK: 'OK',
  DENIED: 'DENIED',
  ERROR: 'ERROR'
});

const ERROR_CATEGORIES = Object.freeze({
  POLICY_DENIED: 'POLICY_DENIED',
  LIFECYCLE_DENIED: 'LIFECYCLE_DENIED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  INVALID_ARGUMENTS: 'INVALID_ARGUMENTS',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  TIMEOUT: 'TIMEOUT'
});

/**
 * Creates a structured ToolError object.
 */
function createToolError({ code, message, category, details = null }) {
  if (!code || typeof code !== 'string') {
    throw new Error("ToolError requires a string 'code'");
  }
  if (!message || typeof message !== 'string') {
    throw new Error("ToolError requires a string 'message'");
  }
  if (!category || !ERROR_CATEGORIES[category]) {
    throw new Error(`ToolError invalid category '${category}'. Valid: ${Object.keys(ERROR_CATEGORIES).join(', ')}`);
  }

  return Object.freeze({
    code,
    message,
    category,
    details: details ? Object.freeze({ ...details }) : null
  });
}

/**
 * Infers default risk level based on tool name and arguments.
 */
function inferRiskLevel(toolName, args = {}) {
  const highRiskTools = new Set(['write', 'edit', 'patch', 'replace_file_content', 'write_to_file']);
  if (highRiskTools.has(toolName)) {
    return RISK_LEVELS.HIGH;
  }

  if (toolName === 'bash' || toolName === 'run_command') {
    const cmd = String(args.cmd || args.CommandLine || '');
    if (/git\s+push/i.test(cmd) || /rm\s+-rf/i.test(cmd) || /reset\s+--hard/i.test(cmd)) {
      return RISK_LEVELS.CRITICAL;
    }
    return RISK_LEVELS.MEDIUM;
  }

  const lowRiskTools = new Set(['read', 'view_file', 'list_dir', 'grep_search', 'search_web']);
  if (lowRiskTools.has(toolName)) {
    return RISK_LEVELS.LOW;
  }

  return RISK_LEVELS.MEDIUM;
}

/**
 * Creates an immutable ToolRequest.
 */
function createToolRequest({
  requestId,
  runId,
  agentId = 'orchestrator',
  toolName,
  args = {},
  phase,
  riskLevel = null,
  requestedAt = null
}) {
  if (!runId || typeof runId !== 'string') {
    throw new Error("ToolRequest requires 'runId'");
  }
  if (!toolName || typeof toolName !== 'string') {
    throw new Error("ToolRequest requires 'toolName'");
  }
  if (!phase || typeof phase !== 'string') {
    throw new Error("ToolRequest requires 'phase'");
  }

  const resolvedRisk = riskLevel && RISK_LEVELS[riskLevel] ? riskLevel : inferRiskLevel(toolName, args);

  return Object.freeze({
    request_id: requestId || `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    run_id: runId,
    agent_id: agentId,
    tool_name: toolName,
    arguments: Object.freeze({ ...args }),
    phase,
    risk_level: resolvedRisk,
    requested_at: requestedAt || new Date().toISOString()
  });
}

/**
 * Validates a ToolRequest structure.
 */
function validateToolRequest(request) {
  if (!request || typeof request !== 'object') {
    return { valid: false, error: 'ToolRequest must be an object' };
  }
  const required = ['request_id', 'run_id', 'agent_id', 'tool_name', 'arguments', 'phase', 'risk_level', 'requested_at'];
  for (const field of required) {
    if (!request[field]) {
      return { valid: false, error: `Missing required field '${field}' in ToolRequest` };
    }
  }
  if (!RISK_LEVELS[request.risk_level]) {
    return { valid: false, error: `Invalid risk_level '${request.risk_level}' in ToolRequest` };
  }
  return { valid: true, error: null };
}

/**
 * Creates an immutable ToolResult.
 */
function createToolResult({
  requestId,
  status = TOOL_STATUS.OK,
  output = null,
  durationMs = 0,
  completedAt = null,
  error = null
}) {
  if (!requestId || typeof requestId !== 'string') {
    throw new Error("ToolResult requires 'requestId'");
  }
  if (!TOOL_STATUS[status]) {
    throw new Error(`ToolResult invalid status '${status}'. Valid: ${Object.keys(TOOL_STATUS).join(', ')}`);
  }

  let validatedError = null;
  if (error) {
    validatedError = typeof error === 'object' && error.category
      ? error
      : createToolError({
          code: error.code || 'UNKNOWN_ERROR',
          message: error.message || String(error),
          category: ERROR_CATEGORIES.EXECUTION_FAILED,
          details: error.details || null
        });
  }

  return Object.freeze({
    request_id: requestId,
    status,
    output,
    duration_ms: Math.max(0, durationMs),
    completed_at: completedAt || new Date().toISOString(),
    error: validatedError
  });
}

/**
 * Validates a ToolResult structure.
 */
function validateToolResult(result) {
  if (!result || typeof result !== 'object') {
    return { valid: false, error: 'ToolResult must be an object' };
  }
  const required = ['request_id', 'status', 'duration_ms', 'completed_at'];
  for (const field of required) {
    if (result[field] === undefined || result[field] === null) {
      return { valid: false, error: `Missing required field '${field}' in ToolResult` };
    }
  }
  if (!TOOL_STATUS[result.status]) {
    return { valid: false, error: `Invalid status '${result.status}' in ToolResult` };
  }
  return { valid: true, error: null };
}

module.exports = {
  RISK_LEVELS,
  TOOL_STATUS,
  ERROR_CATEGORIES,
  createToolError,
  createToolRequest,
  validateToolRequest,
  createToolResult,
  validateToolResult,
  inferRiskLevel
};
