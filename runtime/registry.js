/**
 * runtime/registry.js
 * Tool Registry for Toketeo Agent Runtime (§F3).
 * Decoupled catalog of tool definitions, input/output contracts, and capabilities.
 * Does not execute anything directly.
 */

const { RISK_LEVELS } = require('./contracts');

class ToolRegistry {
  constructor() {
    this.definitions = new Map();
  }

  /**
   * Registers a tool definition into the catalog.
   *
   * @param {Object} definition
   * @param {string} definition.name - Unique name of the tool
   * @param {string} definition.description - Functional summary
   * @param {Function} [definition.inputValidator] - Optional schema validator function
   * @param {string} [definition.riskLevel] - Base risk level: LOW, MEDIUM, HIGH, CRITICAL
   * @param {boolean} [definition.requiresApproval] - Whether tool requires human approval
   * @param {number} [definition.timeoutMs] - Execution timeout in ms (default 30000)
   * @param {Function} definition.executor - Async execution function (args, context) => output
   * @param {string[]} [definition.capabilities] - List of capability tags
   */
  register(definition) {
    if (!definition || typeof definition !== 'object') {
      throw new Error('ToolRegistry.register requires a tool definition object');
    }
    if (!definition.name || typeof definition.name !== 'string') {
      throw new Error("Tool definition requires a valid string 'name'");
    }
    if (typeof definition.executor !== 'function') {
      throw new Error(`Tool '${definition.name}' requires an async 'executor' function`);
    }

    const toolDef = Object.freeze({
      name: definition.name,
      description: definition.description || '',
      inputValidator: typeof definition.inputValidator === 'function' ? definition.inputValidator : null,
      riskLevel: definition.riskLevel || RISK_LEVELS.MEDIUM,
      requiresApproval: Boolean(definition.requiresApproval),
      timeoutMs: typeof definition.timeoutMs === 'number' && definition.timeoutMs > 0 ? definition.timeoutMs : 30000,
      executor: definition.executor,
      capabilities: Object.freeze(Array.isArray(definition.capabilities) ? [...definition.capabilities] : [])
    });

    this.definitions.set(toolDef.name, toolDef);
    return toolDef;
  }

  get(toolName) {
    return this.definitions.get(toolName) || null;
  }

  has(toolName) {
    return this.definitions.has(toolName);
  }

  list() {
    return Array.from(this.definitions.values());
  }

  validateArguments(toolName, args) {
    const def = this.get(toolName);
    if (!def) {
      return { valid: false, error: `Tool '${toolName}' not found in registry` };
    }
    if (def.inputValidator) {
      try {
        const res = def.inputValidator(args);
        if (typeof res === 'boolean') {
          return { valid: res, error: res ? null : `Invalid arguments for tool '${toolName}'` };
        }
        if (res && typeof res === 'object') {
          return { valid: Boolean(res.valid), error: res.error || null };
        }
      } catch (err) {
        return { valid: false, error: `Argument validation threw: ${err.message}` };
      }
    }
    return { valid: true, error: null };
  }
}

module.exports = {
  ToolRegistry
};
