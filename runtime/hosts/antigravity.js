/**
 * runtime/hosts/antigravity.js
 * Antigravity Lifecycle Hook Host Adapter (§F9.2).
 * Intercepts Antigravity PreToolUse hook events, evaluates them against Toketeo governance,
 * and outputs structured allow/deny/ask verdicts.
 */

const {
  BaseHostAdapter,
  createHostToolInvocation
} = require('./contracts');
const { HostDriver } = require('./driver');

class AntigravityHostAdapter extends BaseHostAdapter {
  constructor({ driver = null } = {}) {
    super('antigravity');
    this.driver = driver || new HostDriver();
  }

  /**
   * Intercepts a tool call in Antigravity hook format.
   *
   * @param {Object} rawPayload - Antigravity PreToolUse stdin payload
   * @param {Object} session - Active AgentSession
   * @returns {Object} HostDecision
   */
  interceptToolCall(rawPayload, session) {
    const toolCall = rawPayload.toolCall || rawPayload;
    const toolName = toolCall.name || rawPayload.tool_name || 'unknown';
    const args = toolCall.args || rawPayload.args || {};

    const invocation = createHostToolInvocation({
      host: 'antigravity',
      toolName,
      args,
      agentId: session.state.agentId || 'orchestrator',
      stepIdx: rawPayload.stepIdx || 0,
      conversationId: rawPayload.conversationId || session.state.sessionId,
      metadata: { workspacePaths: rawPayload.workspacePaths }
    });

    return this.driver.evaluateInvocation(invocation, session);
  }

  /**
   * CLI entry point for Antigravity hooks.json execution.
   * Reads payload from process.stdin, evaluates, and writes to process.stdout.
   */
  static async runCli(sessionFactory) {
    let inputData = '';
    for await (const chunk of process.stdin) {
      inputData += chunk;
    }

    if (!inputData.trim()) {
      process.stdout.write(JSON.stringify({ decision: 'allow', reason: 'No tool call payload received' }) + '\n');
      return;
    }

    try {
      const payload = JSON.parse(inputData);
      const session = sessionFactory(payload);
      const adapter = new AntigravityHostAdapter();
      const decision = adapter.interceptToolCall(payload, session);
      const formatted = adapter.formatResponse(decision);

      process.stdout.write(JSON.stringify(formatted) + '\n');
    } catch (err) {
      // In case of parsing error or unexpected failure, output safe deny or ask
      process.stdout.write(JSON.stringify({
        decision: 'deny',
        reason: `Toketeo Host Governance Interceptor Error: ${err.message}`
      }) + '\n');
    }
  }
}

if (require.main === module) {
  // When run directly as a hook script
  const { createSession } = require('../index');
  AntigravityHostAdapter.runCli((payload) => {
    return createSession({
      sessionId: payload.conversationId || `hook-${Date.now()}`
    });
  }).catch(err => {
    process.stderr.write(`Fatal Antigravity hook error: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  AntigravityHostAdapter
};
