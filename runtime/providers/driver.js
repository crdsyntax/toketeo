/**
 * runtime/providers/driver.js
 * Runtime Provider Driver & Host Orchestration Loop (§F9).
 * Bridges AgentSession with a ProviderAdapter, enforcing strict runtime mediation.
 * 
 * Invariants:
 * - Model requests are always intercepted and validated by the ExecutionGateway.
 * - An unauthorized tool call produces an error feedback turn; the model cannot bypass security.
 * - Uncaught model errors or hallucinations never crash the host runtime.
 */

const {
  TURN_TYPES,
  createModelTurnRequest
} = require('./contracts');

class ProviderDriver {
  constructor({ session, adapter, maxTurns = 10 } = {}) {
    if (!session) throw new Error("ProviderDriver requires an 'session'");
    if (!adapter) throw new Error("ProviderDriver requires an 'adapter'");

    this.session = session;
    this.adapter = adapter;
    this.maxTurns = maxTurns;
    this.history = [];
    this.trace = [];
    this.totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    // Metrics tracking (§F8/F9.1)
    this.metrics = {
      turns_used: 0,
      tool_calls: 0,
      successful_tool_calls: 0,
      denial_count: 0,
      repeated_denials: 0,
      recovery_attempts: 0,
      recovered_count: 0,
      retried_count: 0,
      aborted_count: 0
    };

    // Tracks last denial event to evaluate recovery in subsequent turns
    this.lastDenial = null;
  }

  /**
   * Computes tools allowed for the current agent and current phase.
   */
  getAvailableTools() {
    const agentDef = this.session.agentDefinition;
    if (!agentDef || !agentDef.capabilities || !Array.isArray(agentDef.capabilities.tools)) {
      return [];
    }

    const currentPhase = this.session.getPhase();
    const isWritePhase = ['EXECUTE', 'DOCUMENT'].includes(currentPhase);
    const writeTools = ['write', 'edit', 'patch', 'replace_file_content', 'write_to_file'];

    return agentDef.capabilities.tools.filter(toolName => {
      if (writeTools.includes(toolName) && !isWritePhase) {
        return false; // Filter out write tools during read/planning phases
      }
      return true;
    });
  }

  /**
   * Executes a single turn through the model adapter and runtime gateway.
   */
  async step() {
    this.metrics.turns_used++;
    const currentPhase = this.session.getPhase();
    const availableTools = this.getAvailableTools();

    // 1. Build immutable ModelTurnRequest
    const turnRequest = createModelTurnRequest({
      runId: this.session.state.sessionId,
      agentId: this.session.state.agentId,
      currentPhase,
      agentDefinition: this.session.agentDefinition,
      contextBundle: this.session.contextBundles.size > 0 ? Array.from(this.session.contextBundles.values())[0] : null,
      history: this.history,
      availableTools
    });

    // 2. Generate response from adapter
    const turnResponse = await this.adapter.generateTurn(turnRequest);

    // Track token usage
    if (turnResponse.usage) {
      this.totalUsage.prompt_tokens += turnResponse.usage.prompt_tokens || 0;
      this.totalUsage.completion_tokens += turnResponse.usage.completion_tokens || 0;
      this.totalUsage.total_tokens += turnResponse.usage.total_tokens || 0;
    }

    this.trace.push({
      step: 'model_response',
      phase: currentPhase,
      turn_type: turnResponse.turn_type,
      response: turnResponse
    });

    const executionResults = [];
    let hadDenialInTurn = false;
    let hadSuccessInTurn = false;

    // 3. Dispatch actions through runtime governance
    switch (turnResponse.turn_type) {
      case TURN_TYPES.MESSAGE: {
        this.history.push({
          role: 'assistant',
          content: turnResponse.content
        });
        break;
      }

      case TURN_TYPES.TOOL_CALLS: {
        this.history.push({
          role: 'assistant',
          content: turnResponse.content || '',
          tool_calls: turnResponse.tool_calls
        });

        for (const tc of turnResponse.tool_calls) {
          this.metrics.tool_calls++;
          let toolResult = null;
          let toolError = null;

          // Check if this action repeats a previous denial
          if (this.lastDenial) {
            this.metrics.recovery_attempts++;
            if (this.lastDenial.type === 'tool' && this.lastDenial.target === tc.name) {
              this.metrics.repeated_denials++;
              this.metrics.retried_count++;
            }
          }

          try {
            toolResult = await this.session.executeTool(tc.name, tc.args || {});
            this.metrics.successful_tool_calls++;
            hadSuccessInTurn = true;
            executionResults.push({ call_id: tc.call_id, tool: tc.name, status: 'OK', output: toolResult });
            this.trace.push({ step: 'tool_execution', call_id: tc.call_id, tool: tc.name, status: 'OK' });

            // If we previously had a denial and now succeeded with a different strategy, record RECOVERED
            if (this.lastDenial && (!this.lastDenial.type || this.lastDenial.target !== tc.name)) {
              this.metrics.recovered_count++;
              this.lastDenial = null;
            }
          } catch (err) {
            this.metrics.denial_count++;
            hadDenialInTurn = true;
            toolError = {
              code: err.code || 'EXECUTION_FAILED',
              category: err.category || 'ERROR',
              message: err.message
            };
            executionResults.push({ call_id: tc.call_id, tool: tc.name, status: 'DENIED', error: toolError });
            this.trace.push({ step: 'tool_execution', call_id: tc.call_id, tool: tc.name, status: 'DENIED', error: toolError });

            this.lastDenial = {
              type: 'tool',
              target: tc.name,
              code: err.code || err.category,
              turn: this.metrics.turns_used
            };
          }

          // Feed back result to history
          this.history.push({
            role: 'tool',
            call_id: tc.call_id,
            name: tc.name,
            content: toolResult ? JSON.stringify(toolResult) : null,
            error: toolError
          });
        }
        break;
      }

      case TURN_TYPES.TRANSITION: {
        let transitionOk = false;
        let transitionError = null;

        if (this.lastDenial) {
          this.metrics.recovery_attempts++;
          if (this.lastDenial.type === 'transition' && this.lastDenial.target === turnResponse.target_phase) {
            this.metrics.repeated_denials++;
            this.metrics.retried_count++;
          }
        }

        try {
          this.session.transition(turnResponse.target_phase);
          transitionOk = true;
          hadSuccessInTurn = true;
          this.trace.push({ step: 'transition', target: turnResponse.target_phase, status: 'OK' });

          if (this.lastDenial) {
            this.metrics.recovered_count++;
            this.lastDenial = null;
          }
        } catch (err) {
          this.metrics.denial_count++;
          hadDenialInTurn = true;
          transitionError = {
            code: err.code || 'LIFECYCLE_DENIED',
            message: err.message
          };
          this.trace.push({ step: 'transition', target: turnResponse.target_phase, status: 'DENIED', error: transitionError });

          this.lastDenial = {
            type: 'transition',
            target: turnResponse.target_phase,
            code: err.code || 'LIFECYCLE_DENIED',
            turn: this.metrics.turns_used
          };
        }

        this.history.push({
          role: 'system',
          action: 'transition',
          target: turnResponse.target_phase,
          status: transitionOk ? 'OK' : 'DENIED',
          error: transitionError
        });
        break;
      }

      case TURN_TYPES.COMPLETE: {
        let completionOk = false;
        let completionError = null;

        try {
          this.session.complete('completed');
          completionOk = true;
          hadSuccessInTurn = true;
          this.trace.push({ step: 'complete', status: 'OK' });
          if (this.lastDenial) {
            this.metrics.recovered_count++;
            this.lastDenial = null;
          }
        } catch (err) {
          this.metrics.denial_count++;
          hadDenialInTurn = true;
          completionError = {
            code: err.code || 'LIFECYCLE_COMPLETION_DENIED',
            message: err.message
          };
          this.trace.push({ step: 'complete', status: 'DENIED', error: completionError });
          this.lastDenial = {
            type: 'complete',
            code: err.code || 'LIFECYCLE_COMPLETION_DENIED',
            turn: this.metrics.turns_used
          };
        }

        this.history.push({
          role: 'system',
          action: 'complete',
          status: completionOk ? 'OK' : 'DENIED',
          error: completionError
        });
        break;
      }
    }

    const isComplete = this.session.state.status === 'completed';

    return {
      turnResponse,
      executionResults,
      currentPhase: this.session.getPhase(),
      isComplete,
      metrics: { ...this.metrics }
    };
  }

  /**
   * Calculates derived performance & recovery metrics.
   */
  getDerivedMetrics() {
    const { tool_calls, successful_tool_calls, denial_count, recovered_count } = this.metrics;
    const tool_efficiency_ratio = tool_calls > 0 ? (successful_tool_calls / tool_calls) : 1.0;
    const recovery_rate = denial_count > 0 ? (recovered_count / denial_count) : 1.0;
    const denial_rate = tool_calls > 0 ? (denial_count / tool_calls) : 0.0;

    return {
      ...this.metrics,
      tool_efficiency_ratio: Number(tool_efficiency_ratio.toFixed(3)),
      recovery_rate: Number(recovery_rate.toFixed(3)),
      denial_rate: Number(denial_rate.toFixed(3)),
      max_turns_reached: this.metrics.turns_used >= this.maxTurns && this.session.state.status !== 'completed'
    };
  }

  /**
   * Runs the turn loop until completion or maxTurns limit.
   */
  async run() {
    while (this.metrics.turns_used < this.maxTurns && this.session.state.status !== 'completed') {
      const result = await this.step();
      if (result.isComplete) break;
    }

    // If loop finished with an unresolved denial, count as aborted
    if (this.lastDenial && this.session.state.status !== 'completed') {
      this.metrics.aborted_count++;
    }

    return {
      turns: this.metrics.turns_used,
      status: this.session.state.status,
      finalPhase: this.session.getPhase(),
      totalUsage: this.totalUsage,
      metrics: this.getDerivedMetrics(),
      trace: this.trace,
      history: this.history
    };
  }
}

module.exports = {
  ProviderDriver
};
