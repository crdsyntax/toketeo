/**
 * runtime/evaluation/assertions.js
 * Invariant Assertions Library for the Evaluation Harness (§F8B).
 * Provides reusable, deterministic assertions for runtime validation.
 */

class AssertionError extends Error {
  constructor(message, { expected, actual, assertionName } = {}) {
    super(message);
    this.name = 'AssertionError';
    this.code = 'ASSERTION_FAILED';
    this.assertionName = assertionName;
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Asserts current session lifecycle phase.
 */
function assertLifecycle(session, expectedPhase) {
  const actual = session?.getPhase ? session.getPhase() : session?.lifecycle?.currentPhase;
  if (actual !== expectedPhase) {
    throw new AssertionError(
      `assertLifecycle failed: Expected phase '${expectedPhase}', but got '${actual}'`,
      { expected: expectedPhase, actual, assertionName: 'assertLifecycle' }
    );
  }
  return true;
}

/**
 * Asserts that a ToolResult was DENIED with specific code/category.
 */
function assertToolDenied(result, expectedCode = null, expectedCategory = null) {
  if (!result || result.status !== 'DENIED') {
    throw new AssertionError(
      `assertToolDenied failed: Expected status 'DENIED', but got '${result?.status}'`,
      { expected: 'DENIED', actual: result?.status, assertionName: 'assertToolDenied' }
    );
  }
  if (expectedCode && result.error?.code !== expectedCode) {
    throw new AssertionError(
      `assertToolDenied failed: Expected error code '${expectedCode}', but got '${result.error?.code}'`,
      { expected: expectedCode, actual: result.error?.code, assertionName: 'assertToolDenied' }
    );
  }
  if (expectedCategory && result.error?.category !== expectedCategory) {
    throw new AssertionError(
      `assertToolDenied failed: Expected error category '${expectedCategory}', but got '${result.error?.category}'`,
      { expected: expectedCategory, actual: result.error?.category, assertionName: 'assertToolDenied' }
    );
  }
  return true;
}

/**
 * Asserts that a ToolResult executed successfully.
 */
function assertToolExecuted(result) {
  if (!result || result.status !== 'OK') {
    throw new AssertionError(
      `assertToolExecuted failed: Expected status 'OK', but got '${result?.status}' (${result?.error?.message || ''})`,
      { expected: 'OK', actual: result?.status, assertionName: 'assertToolExecuted' }
    );
  }
  return true;
}

/**
 * Asserts that the underlying executor was never invoked (executorCalls === 0).
 */
function assertNoExecutorInvocation(executorCalls) {
  if (executorCalls !== 0) {
    throw new AssertionError(
      `assertNoExecutorInvocation failed: Underlying executor was invoked ${executorCalls} times, expected 0`,
      { expected: 0, actual: executorCalls, assertionName: 'assertNoExecutorInvocation' }
    );
  }
  return true;
}

/**
 * Asserts agent identity integrity.
 */
function assertAgentIdentity(session, expectedId) {
  const actualSessionId = session?.state?.agentId;
  const actualDefId = session?.agentDefinition?.identity?.id;

  if (actualSessionId !== expectedId || actualDefId !== expectedId) {
    throw new AssertionError(
      `assertAgentIdentity failed: Expected '${expectedId}', got session '${actualSessionId}' and def '${actualDefId}'`,
      { expected: expectedId, actual: { session: actualSessionId, def: actualDefId }, assertionName: 'assertAgentIdentity' }
    );
  }
  return true;
}

/**
 * Asserts that the agent's capability tools match expected set.
 */
function assertCapabilitySet(agentDef, expectedTools) {
  const actual = agentDef?.capabilities?.tools || [];
  const matches = expectedTools.every(t => actual.includes(t)) && actual.length === expectedTools.length;
  if (!matches) {
    throw new AssertionError(
      `assertCapabilitySet failed: Expected tools [${expectedTools.join(', ')}], got [${actual.join(', ')}]`,
      { expected: expectedTools, actual, assertionName: 'assertCapabilitySet' }
    );
  }
  return true;
}

/**
 * Asserts context bundle hash matches expected SHA-256.
 */
function assertContextHash(bundle, expectedHash) {
  const actual = bundle?.bundle_hash;
  if (actual !== expectedHash) {
    throw new AssertionError(
      `assertContextHash failed: Expected hash '${expectedHash}', got '${actual}'`,
      { expected: expectedHash, actual, assertionName: 'assertContextHash' }
    );
  }
  return true;
}

/**
 * Asserts that events contain a valid delegation trace from parent to child.
 */
function assertDelegationTrace(events, parentId, childId) {
  const started = events.find(
    e => e.type === 'delegation.started' && e.parent_agent_id === parentId && e.child_agent_id === childId
  );
  if (!started) {
    throw new AssertionError(
      `assertDelegationTrace failed: Missing 'delegation.started' from '${parentId}' to '${childId}' in events`,
      { expected: { parentId, childId }, actual: events.map(e => e.type), assertionName: 'assertDelegationTrace' }
    );
  }
  return true;
}

/**
 * Asserts sequential trace of phases.
 */
function assertTraceSequence(events, expectedSequence) {
  const phaseEvents = events
    .filter(e => e.type === 'lifecycle.phase_changed')
    .map(e => e.phase);

  for (let i = 0; i < expectedSequence.length; i++) {
    if (phaseEvents[i] !== expectedSequence[i]) {
      throw new AssertionError(
        `assertTraceSequence failed at step ${i}: Expected phase '${expectedSequence[i]}', got '${phaseEvents[i]}'`,
        { expected: expectedSequence, actual: phaseEvents, assertionName: 'assertTraceSequence' }
      );
    }
  }
  return true;
}

module.exports = {
  AssertionError,
  assertLifecycle,
  assertToolDenied,
  assertToolExecuted,
  assertNoExecutorInvocation,
  assertAgentIdentity,
  assertCapabilitySet,
  assertContextHash,
  assertDelegationTrace,
  assertTraceSequence
};
