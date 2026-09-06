/**
 * runtime/index.js
 * Unified facade for the Toketeo Agent Runtime Core.
 */

const fs = require('fs');
const path = require('path');
const { LifecycleMachine, PHASES, ALLOWED_WRITE_PHASES, WRITE_TOOLS } = require('./lifecycle');
const { SessionState, DEFAULT_SESSIONS_ROOT } = require('./state');
const { EventLogger } = require('./events');
const { ApprovalManager } = require('./approvals');
const { PolicyEngine } = require('./policy');
const { ToolRegistry } = require('./registry');
const { ExecutionGateway } = require('./gateway');
const contracts = require('./contracts');
const delegation = require('./delegation');
const { OrchestratorEngine } = require('./orchestration');
const agents = require('./agents');
const skills = require('./skills');
const contextModule = require('./context');
const providers = require('./providers');
const hosts = require('./hosts');

class AgentSession {
  constructor({
    sessionId,
    agentId = 'orchestrator',
    agentDefinition = null,
    goal = '',
    context = {},
    sessionsRoot = DEFAULT_SESSIONS_ROOT
  } = {}) {
    const resolvedAgentId = agentDefinition?.identity?.id || agentId;
    this._agentDefinition = agentDefinition ? agents.deepFreeze(agentDefinition) : null;
    this.attachedSkills = new Map();
    this.contextBundles = new Map();
    this.retrieval = new contextModule.RetrievalEngine();

    const sessionDir = sessionId ? path.join(sessionsRoot, sessionId) : null;
    const stateFile = sessionDir ? path.join(sessionDir, 'state.json') : null;

    if (stateFile && fs.existsSync(stateFile)) {
      this.state = SessionState.load(sessionId, sessionsRoot);
    } else {
      this.state = new SessionState({
        sessionId,
        agentId: resolvedAgentId,
        goal,
        context: {
          ...context,
          agentDefinition: this.agentDefinition
        },
        sessionsRoot
      });
    }

    // Restore agent definition from persisted state context if available
    if (!this._agentDefinition && this.state.context?.agentDefinition) {
      this._agentDefinition = agents.deepFreeze(this.state.context.agentDefinition);
    }

    this.lifecycle = new LifecycleMachine(this.state.currentPhase);
    this.events = new EventLogger(this.state.sessionDir, this.state.sessionId, this.state.agentId);
    this.approvals = new ApprovalManager(this.state.sessionDir, this.state.sessionId, this.events);
    this.policy = new PolicyEngine();
    this.registry = new ToolRegistry();
    this.gateway = new ExecutionGateway({
      registry: this.registry,
      lifecycle: this.lifecycle,
      policy: this.policy,
      approvals: this.approvals,
      events: this.events
    });
    this.orchestration = new OrchestratorEngine({
      events: this.events
    });
    this.orchestrator = this.orchestration;

    // Persist initial state
    this.state.save();
    this.events.emit('agent.started', {
      phase: this.lifecycle.getPhase(),
      agentId: this.state.agentId
    });
  }

  get agentDefinition() {
    return this._agentDefinition;
  }

  set agentDefinition(newDef) {
    if (this._agentDefinition && newDef && this._agentDefinition.identity.id !== newDef.identity?.id) {
      const err = new Error(
        `Agent identity integrity violation: Cannot mutate agent identity from '${this._agentDefinition.identity.id}' to '${newDef.identity?.id}'`
      );
      err.code = 'AGENT_IDENTITY_IMMUTABLE';
      throw err;
    }
    this._agentDefinition = newDef ? agents.deepFreeze(newDef) : null;
  }

  attachSkill(skillDef) {
    if (!skillDef || typeof skillDef !== 'object') {
      const err = new Error('Invalid skill definition: must be an object');
      err.code = 'INVALID_SKILL_DEFINITION';
      throw err;
    }

    // 1. Target Agent Alignment Gate
    const targetAgents = skillDef.target_agents || [];
    if (targetAgents.length > 0 && !targetAgents.includes(this.state.agentId)) {
      const err = new Error(
        `Skill '${skillDef.id}' cannot be attached to agent '${this.state.agentId}'. Authorized targets: [${targetAgents.join(', ')}]`
      );
      err.code = 'SKILL_AGENT_MISMATCH';
      throw err;
    }

    // 2. Prerequisite Boundary Gate (Skills cannot elevate/grant new tool capabilities)
    const agentTools = this.agentDefinition?.capabilities?.tools || [];
    const requiredTools = skillDef.required_tools || [];
    for (const tool of requiredTools) {
      if (!agentTools.includes(tool)) {
        const err = new Error(
          `Agent '${this.state.agentId}' lacks required tool '${tool}' for skill '${skillDef.id}'. Skills cannot expand agent capabilities.`
        );
        err.code = 'SKILL_TOOL_UNAUTHORIZED';
        throw err;
      }
    }

    const frozenSkill = skills.createSkillDefinition(skillDef);
    this.attachedSkills.set(frozenSkill.id, frozenSkill);

    this.events.emit('skill.attached', {
      skillId: frozenSkill.id,
      agentId: this.state.agentId
    });

    return frozenSkill;
  }

  getAttachedSkills() {
    return Array.from(this.attachedSkills.values());
  }

  async retrieveContext(options = {}) {
    const retrievalReq = contextModule.createRetrievalRequest({
      runId: this.state.sessionId,
      agentId: this.state.agentId,
      ...options
    });

    const bundle = await this.retrieval.resolve(retrievalReq);
    this.contextBundles.set(bundle.bundle_id, bundle);

    this.state.context.lastContextBundle = bundle.bundle_hash;
    this.state.save();

    this.events.emit('context.retrieved', {
      bundleId: bundle.bundle_id,
      bundleHash: bundle.bundle_hash,
      totalItems: bundle.total_items,
      totalTokens: bundle.total_tokens,
      agentId: this.state.agentId
    });

    return bundle;
  }

  registerTool(definition) {
    return this.registry.register(definition);
  }

  async executeToolRequest(toolRequest, context = {}) {
    const enrichedContext = { ...context, agentDefinition: this.agentDefinition };
    return this.gateway.execute(toolRequest, this.state.toJSON(), enrichedContext);
  }

  getPhase() {
    return this.lifecycle.getPhase();
  }

  transition(targetPhase) {
    try {
      const result = this.lifecycle.transition(targetPhase);
      this.state.currentPhase = result.current;
      this.state.save();

      this.events.emit('lifecycle.phase_changed', {
        phase: result.current,
        toolName: 'lifecycle',
        status: 'ok',
        error: null
      });

      return result;
    } catch (err) {
      this.events.emit('lifecycle.violation', {
        phase: this.lifecycle.getPhase(),
        toolName: 'lifecycle',
        status: 'error',
        error: err.message
      });
      throw err;
    }
  }

  canExecute(toolName, args = {}) {
    return this.policy.canExecute(
      { tool: toolName, args },
      this.state.toJSON()
    );
  }

  async executeTool(toolName, args = {}, executorFn = null, context = {}) {
    if (executorFn && !this.registry.has(toolName)) {
      this.registry.register({
        name: toolName,
        executor: executorFn
      });
    }

    const toolRequest = contracts.createToolRequest({
      runId: this.state.sessionId,
      agentId: this.state.agentId,
      toolName,
      args,
      phase: this.lifecycle.getPhase()
    });

    const enrichedContext = { ...context, agentDefinition: this.agentDefinition };
    const result = await this.gateway.execute(toolRequest, this.state.toJSON(), enrichedContext);
    if (result.status !== contracts.TOOL_STATUS.OK) {
      const err = new Error(result.error?.message || `Tool execution ${result.status}`);
      err.code = result.error?.code || result.status;
      err.category = result.error?.category;
      throw err;
    }
    return result.output;
  }

  requestApproval(action, description, metadata = {}) {
    const record = this.approvals.requestApproval({ action, description, metadata });
    this.state.pendingApproval = record.approval_id;
    this.state.save();
    return record;
  }

  decideApproval(approvalId, decision, comment = '') {
    const record = this.approvals.decide(approvalId, decision, comment);
    if (this.state.pendingApproval === approvalId) {
      this.state.pendingApproval = null;
      this.state.save();
    }
    return record;
  }

  complete(status = 'completed') {
    const currentPhase = this.lifecycle.getPhase();

    if (status === 'completed' && currentPhase !== 'COMPLETE') {
      const err = new Error(
        `Lifecycle completion denied: Cannot complete session from phase '${currentPhase}'. Session must reach 'COMPLETE' phase.`
      );
      err.code = 'LIFECYCLE_COMPLETION_DENIED';
      err.currentPhase = currentPhase;

      this.events.emit('lifecycle.violation', {
        phase: currentPhase,
        toolName: 'lifecycle',
        status: 'error',
        error: err.message
      });

      throw err;
    }

    this.state.status = status;
    this.state.save();
    this.events.emit(`agent.${status}`, {
      phase: currentPhase
    });
    return this.state.toJSON();
  }

  async delegate({ childAgentId, task, childExecutorFn, depth = 0 }) {
    const delegationReq = delegation.createDelegationRequest({
      parentRunId: this.state.sessionId,
      parentAgentId: this.state.agentId,
      childAgentId,
      task,
      depth: depth > 0 ? depth : (this.state.context?.depth || 0) + 1
    });

    const registered = this.orchestration.registeredAgents?.get(childAgentId);
    const childDef = registered?.definition || null;

    return this.orchestration.delegate(
      delegationReq,
      childExecutorFn,
      (childOptions) => createSession({
        ...childOptions,
        agentDefinition: childDef,
        sessionsRoot: this.state.sessionsRoot
      })
    );
  }
}

function createSession(options) {
  return new AgentSession(options);
}

module.exports = {
  AgentSession,
  createSession,
  ToolRegistry,
  ExecutionGateway,
  OrchestratorEngine,
  PHASES,
  ALLOWED_WRITE_PHASES,
  WRITE_TOOLS,
  contracts,
  delegation,
  agents,
  skills,
  context: contextModule,
  providers,
  hosts
};
