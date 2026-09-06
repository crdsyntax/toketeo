/**
 * runtime/hosts/driver.js
 * Host Integration Driver & Governance Interceptor (§F9.2).
 * Mediates between external host environments (Antigravity, OpenCode) and Toketeo AgentSession.
 * 
 * Invariants:
 * - Host tool calls are intercepted before native execution.
 * - Tool names are normalized to Toketeo canonical capabilities.
 * - Capabilities, Lifecycle, Policy, and Approvals are strictly evaluated.
 */

const {
  HOST_DECISIONS,
  createHostDecision
} = require('./contracts');
const { ALLOWED_WRITE_PHASES, WRITE_TOOLS } = require('../lifecycle');

/**
 * Normalizes host-specific tool names to Toketeo canonical tool names.
 */
const TOOL_NORMALIZATION_MAP = {
  // Antigravity tools
  replace_file_content: 'write',
  multi_replace_file_content: 'write',
  write_to_file: 'write',
  view_file: 'read',
  read_url_content: 'read',
  list_dir: 'read',
  grep_search: 'read',
  run_command: 'bash',
  // Standard fallbacks
  edit: 'write',
  patch: 'write'
};

class HostDriver {
  constructor() {
    this.normalizationMap = { ...TOOL_NORMALIZATION_MAP };
  }

  /**
   * Normalizes a host tool name to Toketeo canonical tool name.
   */
  normalizeToolName(hostToolName) {
    return this.normalizationMap[hostToolName] || hostToolName;
  }

  /**
   * Evaluates a host tool invocation against session governance.
   *
   * @param {Object} hostInvocation - Immutable HostToolInvocation
   * @param {Object} session - AgentSession
   * @returns {Object} Immutable HostDecision
   */
  evaluateInvocation(hostInvocation, session) {
    const rawTool = hostInvocation.tool_name;
    const canonicalTool = this.normalizeToolName(rawTool);
    const args = hostInvocation.args || {};
    const agentDef = session.agentDefinition;
    const currentPhase = session.getPhase();

    // 1. Capability Boundary: Agent must be permitted to use the tool
    if (agentDef && agentDef.capabilities && Array.isArray(agentDef.capabilities.tools)) {
      const allowedTools = agentDef.capabilities.tools;
      const isAllowed = allowedTools.includes(canonicalTool) || allowedTools.includes(rawTool);

      if (!isAllowed) {
        return createHostDecision({
          decision: HOST_DECISIONS.DENY,
          code: 'AGENT_TOOL_DENIED',
          category: 'CAPABILITY_VIOLATION',
          reason: `Tool '${rawTool}' (canonical: '${canonicalTool}') is not permitted by capabilities for agent '${agentDef.identity?.id || 'unknown'}'`
        });
      }
    }

    // 2. Lifecycle Boundary: Write tools are forbidden outside write phases
    const isWrite = (WRITE_TOOLS.has && (WRITE_TOOLS.has(canonicalTool) || WRITE_TOOLS.has(rawTool))) ||
      ['replace_file_content', 'write_to_file', 'multi_replace_file_content', 'write', 'edit', 'patch'].includes(rawTool);
    const isAllowedPhase = ALLOWED_WRITE_PHASES.has ? ALLOWED_WRITE_PHASES.has(currentPhase) : Array.from(ALLOWED_WRITE_PHASES).includes(currentPhase);

    if (isWrite && !isAllowedPhase) {
      return createHostDecision({
        decision: HOST_DECISIONS.DENY,
        code: 'LIFECYCLE_DENIED',
        category: 'LIFECYCLE_VIOLATION',
        reason: `Write tool '${rawTool}' is forbidden in phase '${currentPhase}'. Allowed write phases are: [${Array.from(ALLOWED_WRITE_PHASES).join(', ')}]`
      });
    }

    // 3. Policy Boundary: Inspect shell commands / destructive patterns
    if (canonicalTool === 'bash' || rawTool === 'run_command') {
      const commandLine = args.CommandLine || args.command || args.cmd || '';
      
      if (/git\s+push.*--force/i.test(commandLine)) {
        return createHostDecision({
          decision: HOST_DECISIONS.DENY,
          code: 'P1_FORCE_PUSH_DENIED',
          category: 'POLICY_VIOLATION',
          reason: 'Policy Deny: Force-pushing to remote git repository is strictly forbidden.'
        });
      }

      if (/rm\s+-rf\s+[\/\\]/i.test(commandLine) || /rmdir\s+\/s/i.test(commandLine)) {
        return createHostDecision({
          decision: HOST_DECISIONS.DENY,
          code: 'P2_DESTRUCTIVE_COMMAND_DENIED',
          category: 'POLICY_VIOLATION',
          reason: 'Policy Deny: Destructive root recursive deletion is strictly forbidden.'
        });
      }

      if (/git\s+push/i.test(commandLine)) {
        return createHostDecision({
          decision: HOST_DECISIONS.ASK,
          code: 'P3_GIT_PUSH_CONFIRMATION',
          category: 'POLICY_APPROVAL',
          reason: 'Git push requires explicit user confirmation.'
        });
      }
    }

    // 4. Human-in-the-Loop Approvals
    if (session.state.pendingApproval) {
      return createHostDecision({
        decision: HOST_DECISIONS.ASK,
        code: 'PENDING_APPROVAL_REQUIRED',
        category: 'APPROVAL_GATE',
        reason: `Session has a pending approval '${session.state.pendingApproval}' that must be decided first.`
      });
    }

    // 5. Authorized
    return createHostDecision({
      decision: HOST_DECISIONS.ALLOW,
      code: 'AUTHORIZED',
      reason: `Tool '${rawTool}' is authorized in phase '${currentPhase}'.`
    });
  }
}

module.exports = {
  TOOL_NORMALIZATION_MAP,
  HostDriver
};
