/**
 * runtime/approvals.js
 * Implements human-in-the-loop approval management (approvals.jsonl) (§4.5).
 */

const fs = require('fs');
const path = require('path');

class ApprovalManager {
  constructor(sessionDir, sessionId, eventLogger = null) {
    this.sessionDir = sessionDir;
    this.sessionId = sessionId;
    this.eventLogger = eventLogger;
    this.filePath = path.join(this.sessionDir, 'approvals.jsonl');
  }

  requestApproval({ action, description, metadata = {} }) {
    const approvalId = `appr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const record = {
      approval_id: approvalId,
      run_id: this.sessionId,
      timestamp: new Date().toISOString(),
      action,
      description,
      status: 'pending',
      decision: null,
      decided_at: null,
      metadata
    };

    fs.appendFileSync(this.filePath, JSON.stringify(record) + '\n', 'utf8');

    if (this.eventLogger) {
      this.eventLogger.emit('approval.requested', {
        status: 'pending',
        toolName: action,
        error: null
      });
    }

    return record;
  }

  decide(approvalId, decision, comment = '') {
    if (!['granted', 'denied'].includes(decision)) {
      throw new Error(`Invalid decision: ${decision}. Must be 'granted' or 'denied'.`);
    }

    const records = this.getApprovals();
    const target = records.find(r => r.approval_id === approvalId);
    if (!target) {
      throw new Error(`Approval record not found: ${approvalId}`);
    }

    target.status = decision;
    target.decision = decision;
    target.decided_at = new Date().toISOString();
    target.comment = comment;

    // Rewrite approvals.jsonl
    fs.writeFileSync(
      this.filePath,
      records.map(r => JSON.stringify(r)).join('\n') + '\n',
      'utf8'
    );

    if (this.eventLogger) {
      this.eventLogger.emit(`approval.${decision}`, {
        status: decision,
        toolName: target.action
      });
    }

    return target;
  }

  getApprovals() {
    if (!fs.existsSync(this.filePath)) return [];
    return fs.readFileSync(this.filePath, 'utf8')
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line));
  }

  getPending() {
    return this.getApprovals().filter(r => r.status === 'pending');
  }
}

module.exports = {
  ApprovalManager
};
