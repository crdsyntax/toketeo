/**
 * runtime/lifecycle.js
 * Implements the strict Phase State Machine from agent_runtime_architecture.md (§4.1).
 */

const PHASES = [
  'REQUEST',
  'ANALYZE',
  'PLAN',
  'REVIEW',
  'EXECUTE',
  'VERIFY',
  'DOCUMENT',
  'COMPLETE'
];

const ALLOWED_WRITE_PHASES = new Set(['EXECUTE', 'DOCUMENT']);
const WRITE_TOOLS = new Set(['write', 'edit', 'patch', 'replace_file_content', 'write_to_file', 'multi_replace_file_content']);

// Sequential allowed transitions
const TRANSITION_GRAPH = {
  REQUEST: new Set(['ANALYZE']),
  ANALYZE: new Set(['PLAN']),
  PLAN: new Set(['REVIEW']),
  REVIEW: new Set(['EXECUTE', 'PLAN']),
  EXECUTE: new Set(['VERIFY']),
  VERIFY: new Set(['DOCUMENT', 'ANALYZE']), // Return to analyze if verification fails
  DOCUMENT: new Set(['COMPLETE']),
  COMPLETE: new Set(['REQUEST'])
};

class LifecycleMachine {
  constructor(initialPhase = 'REQUEST') {
    if (!PHASES.includes(initialPhase)) {
      throw new Error(`Invalid initial phase: ${initialPhase}`);
    }
    this.currentPhase = initialPhase;
  }

  getPhase() {
    return this.currentPhase;
  }

  canTransition(targetPhase) {
    if (targetPhase === 'REQUEST') return true; // New user input always resets to REQUEST
    const allowed = TRANSITION_GRAPH[this.currentPhase];
    return allowed ? allowed.has(targetPhase) : false;
  }

  transition(targetPhase) {
    if (!this.canTransition(targetPhase)) {
      const error = new Error(
        `Lifecycle violation: Cannot transition from ${this.currentPhase} to ${targetPhase}. Sequential order required.`
      );
      error.code = 'LIFECYCLE_SKIP_DENIED';
      error.currentPhase = this.currentPhase;
      error.targetPhase = targetPhase;
      throw error;
    }
    const previous = this.currentPhase;
    this.currentPhase = targetPhase;
    return { previous, current: this.currentPhase };
  }

  isWriteAllowed() {
    return ALLOWED_WRITE_PHASES.has(this.currentPhase);
  }

  isWriteTool(toolName) {
    return WRITE_TOOLS.has(toolName);
  }
}

module.exports = {
  PHASES,
  ALLOWED_WRITE_PHASES,
  WRITE_TOOLS,
  TRANSITION_GRAPH,
  LifecycleMachine
};
