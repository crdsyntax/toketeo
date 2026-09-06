/**
 * runtime/state.js
 * Implements session state persistence in .agent/sessions/<session-id>/state.json (§4.3).
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_SESSIONS_ROOT = path.join(process.cwd(), '.agent', 'sessions');

class SessionState {
  constructor({
    sessionId,
    agentId = 'orchestrator',
    goal = '',
    context = {},
    status = 'running',
    iteration = 0,
    currentPhase = 'REQUEST',
    pendingApproval = null,
    sessionsRoot = DEFAULT_SESSIONS_ROOT
  }) {
    this.version = '1.0';
    this.sessionId = sessionId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.agentId = agentId;
    this.goal = goal;
    this.context = context;
    this.status = status;
    this.iteration = iteration;
    this.currentPhase = currentPhase;
    this.pendingApproval = pendingApproval;
    this.sessionsRoot = sessionsRoot;
    this.sessionDir = path.join(this.sessionsRoot, this.sessionId);
    this.filePath = path.join(this.sessionDir, 'state.json');

    this.ensureDirectory();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  toJSON() {
    return {
      version: this.version,
      session_id: this.sessionId,
      agent_id: this.agentId,
      status: this.status,
      iteration: this.iteration,
      current_phase: this.currentPhase,
      goal: this.goal,
      context: this.context,
      pending_approval: this.pendingApproval,
      updated_at: new Date().toISOString()
    };
  }

  save() {
    this.ensureDirectory();
    fs.writeFileSync(this.filePath, JSON.stringify(this.toJSON(), null, 2), 'utf8');
    return this.filePath;
  }

  static load(sessionId, sessionsRoot = DEFAULT_SESSIONS_ROOT) {
    const sessionDir = path.join(sessionsRoot, sessionId);
    const filePath = path.join(sessionDir, 'state.json');
    if (!fs.existsSync(filePath)) {
      throw new Error(`Session state file not found: ${filePath}`);
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return new SessionState({
        sessionId: data.session_id,
        agentId: data.agent_id,
        goal: data.goal,
        context: data.context,
        status: data.status,
        iteration: data.iteration,
        currentPhase: data.current_phase,
        pendingApproval: data.pending_approval,
        sessionsRoot
      });
    } catch (err) {
      // Fallback on corruption
      console.warn(`[SessionState] State corrupted for ${sessionId}, initializing fallback: ${err.message}`);
      return new SessionState({ sessionId, sessionsRoot });
    }
  }
}

module.exports = {
  SessionState,
  DEFAULT_SESSIONS_ROOT
};
