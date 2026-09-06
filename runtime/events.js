/**
 * runtime/events.js
 * Implements the append-only event log (events.jsonl) from agent_runtime_architecture.md (§4.4).
 */

const fs = require('fs');
const path = require('path');

class EventLogger {
  constructor(sessionDir, sessionId, agentId = 'orchestrator') {
    this.sessionDir = sessionDir;
    this.sessionId = sessionId;
    this.agentId = agentId;
    this.filePath = path.join(this.sessionDir, 'events.jsonl');
  }

  emit(eventType, payload = {}) {
    const event = {
      run_id: this.sessionId,
      timestamp: new Date().toISOString(),
      agent_id: payload.agentId || this.agentId,
      event_type: eventType,
      phase: payload.phase || null,
      tool_name: payload.toolName || null,
      tool_args: payload.toolArgs ? this.sanitizeArgs(payload.toolArgs) : null,
      duration_ms: payload.durationMs || 0,
      status: payload.status || 'ok',
      error: payload.error || null,
      input_tokens: payload.inputTokens || 0,
      output_tokens: payload.outputTokens || 0,
      model: payload.model || null,
      estimated_cost_usd: payload.costUsd || 0.0
    };

    fs.appendFileSync(this.filePath, JSON.stringify(event) + '\n', 'utf8');
    return event;
  }

  sanitizeArgs(args) {
    // Policy P3: Prevent credentials/secrets leaking into events
    const sanitized = { ...args };
    const secretKeys = ['password', 'secret', 'token', 'key', 'apiKey', 'signing_pass'];
    for (const k of Object.keys(sanitized)) {
      if (secretKeys.some(s => k.toLowerCase().includes(s))) {
        sanitized[k] = '[REDACTED]';
      }
    }
    return sanitized;
  }

  getEvents() {
    if (!fs.existsSync(this.filePath)) return [];
    return fs.readFileSync(this.filePath, 'utf8')
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line));
  }
}

module.exports = {
  EventLogger
};
