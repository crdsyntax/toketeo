/**
 * runtime/policy.js
 * Evaluates tool execution permissions against active lifecycle phase and policies P1-P8 (§4.2).
 */

const { ALLOWED_WRITE_PHASES, WRITE_TOOLS } = require('./lifecycle');

class PolicyEngine {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * canExecute(request, state)
   * Determines whether a tool request is allowed in the current state.
   *
   * @param {Object} request - { tool: string, args: Object }
   * @param {Object} state - { current_phase: string, pending_approval: any }
   * @returns {Object} - { allowed: boolean, reason: string, policy: string }
   */
  canExecute(request, state) {
    const phase = state.current_phase || 'REQUEST';
    const toolName = request.tool;
    const args = request.args || {};

    // Policy P5: No execution if run completed or failed
    if (state.status === 'completed' || state.status === 'failed') {
      return {
        allowed: false,
        reason: `Run is ${state.status}; no further tool execution permitted (Policy P5).`,
        policy: 'P5_ZOMBIE_PREVENTION'
      };
    }

    // Policy P1: Shell safety guards
    if (toolName === 'bash' || toolName === 'run_command') {
      const cmd = String(args.cmd || args.CommandLine || '');
      if (/git\s+push.*--force/i.test(cmd)) {
        return {
          allowed: false,
          reason: 'git push --force is strictly forbidden (Policy P1).',
          policy: 'P1_FORCE_PUSH_DENIED'
        };
      }
      if (/rm\s+-rf\s+[\/\*]/i.test(cmd)) {
        return {
          allowed: false,
          reason: 'rm -rf on root/wildcard is strictly forbidden (Policy P1).',
          policy: 'P1_DESTRUCTIVE_COMMAND_DENIED'
        };
      }
      if (/git\s+push/i.test(cmd) && !args.hasApproval) {
        return {
          allowed: false,
          reason: 'git push requires prior human approval (Policy P1).',
          policy: 'P1_PUSH_APPROVAL_REQUIRED'
        };
      }
    }

    // Policy P6 / P7: Lifecycle Write Gate
    const isWrite = WRITE_TOOLS.has(toolName) || request.isWrite === true;
    if (isWrite) {
      if (!ALLOWED_WRITE_PHASES.has(phase)) {
        return {
          allowed: false,
          reason: `Write tool '${toolName}' is forbidden in lifecycle phase '${phase}'. Allowed only in EXECUTE and DOCUMENT.`,
          policy: 'P6_LIFECYCLE_WRITE_VIOLATION'
        };
      }
    }

    // Allowed
    return {
      allowed: true,
      reason: `Tool '${toolName}' allowed in phase '${phase}'.`,
      policy: 'ALLOW'
    };
  }

  /**
   * Validates an entire event log post-execution against P1-P8.
   */
  validateEventLog(events) {
    const violations = [];

    // P1: Check for unauthorized push or force-push
    for (const e of events) {
      if (e.tool_name === 'bash' && e.tool_args) {
        const cmd = String(e.tool_args.cmd || e.tool_args.CommandLine || '');
        if (/--force/i.test(cmd)) {
          violations.push({ policy: 'P1', message: 'Detected force-push in event log' });
        }
      }
    }

    // P6: Check for write tools executed outside allowed phases
    for (const e of events) {
      if (e.event_type === 'tool.completed' && WRITE_TOOLS.has(e.tool_name)) {
        if (!ALLOWED_WRITE_PHASES.has(e.phase)) {
          violations.push({
            policy: 'P6',
            message: `Write tool '${e.tool_name}' executed in prohibited phase '${e.phase}'`
          });
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }
}

module.exports = {
  PolicyEngine
};
