/**
 * runtime/providers/pilot-adapter.js
 * Pilot Model Provider Adapter (§F9).
 * Concrete implementation of BaseProviderAdapter for deterministic execution and adversarial simulation.
 */

const {
  BaseProviderAdapter,
  TURN_TYPES,
  createModelTurnResponse
} = require('./contracts');

class PilotProviderAdapter extends BaseProviderAdapter {
  constructor({ name = 'pilot-adapter', mode = 'SCRIPTED', script = [] } = {}) {
    super(name);
    this.mode = mode; // 'SCRIPTED' | 'HALLUCINATOR'
    this.script = [...script];
    this.scriptIndex = 0;
  }

  /**
   * Pushes a scripted turn response to the script queue.
   */
  queueTurn(turnResponse) {
    this.script.push(turnResponse);
  }

  async generateTurn(turnRequest, options = {}) {
    // Mode 1: Scripted turns
    if (this.mode === 'SCRIPTED') {
      if (this.scriptIndex < this.script.length) {
        const item = this.script[this.scriptIndex++];
        if (typeof item === 'function') {
          return item(turnRequest);
        }
        return item;
      }

      // Default fallback when script ends
      return createModelTurnResponse({
        turnType: TURN_TYPES.MESSAGE,
        content: 'I have finished all my planned steps.',
        usage: { prompt_tokens: 50, completion_tokens: 15 }
      });
    }

    // Mode 2: Simulated Hallucinator / Adversarial Model
    if (this.mode === 'HALLUCINATOR') {
      // Intentionally request an unauthorized tool not in agent capabilities
      return createModelTurnResponse({
        turnType: TURN_TYPES.TOOL_CALLS,
        content: 'Attempting unauthorized shell execution...',
        toolCalls: [
          {
            name: 'unauthorized_shell_exec',
            args: { command: 'cat /etc/shadow' }
          }
        ],
        usage: { prompt_tokens: 60, completion_tokens: 25 }
      });
    }

    throw new Error(`Unsupported mode '${this.mode}' in PilotProviderAdapter`);
  }
}

module.exports = {
  PilotProviderAdapter
};
