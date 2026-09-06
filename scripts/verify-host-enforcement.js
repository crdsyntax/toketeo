#!/usr/bin/env node
/**
 * scripts/verify-host-enforcement.js
 * Verifies end-to-end host hook enforcement via stdin/stdout IPC.
 * Tests that `bun run runtime/hosts/antigravity.js` correctly enforces deny, ask, and allow decisions.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createSession } = require('../runtime/index');

async function sendHookRequest(payload) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve('runtime/hosts/antigravity.js');
    const child = spawn('bun', ['run', scriptPath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });

    child.on('close', code => {
      if (code !== 0 && !stdout) {
        return reject(new Error(`Hook exited with code ${code}: ${stderr}`));
      }
      try {
        const json = JSON.parse(stdout.trim());
        resolve(json);
      } catch (err) {
        reject(new Error(`Failed to parse stdout JSON: '${stdout.trim()}' (Error: ${err.message})`));
      }
    });

    child.stdin.write(JSON.stringify(payload) + '\n');
    child.stdin.end();
  });
}

async function runEnforcementVerification() {
  console.log('\x1b[1m\x1b[36m=== Verifying Real Host PreToolUse Enforcement (§F9.2) ===\x1b[0m\n');

  const testSessionId = `host-enforce-${Date.now()}`;
  const session = createSession({
    sessionId: testSessionId,
    agentId: 'backend-engineer'
  });

  // Test Case 1: Session in PLAN phase -> replace_file_content must be DENIED
  session.transition('ANALYZE');
  session.transition('PLAN');
  session.state.save(); // Save to disk: .agent/sessions/<id>/state.json

  console.log(`[Test 1] Session in PLAN phase. Intercepting 'replace_file_content'...`);
  const res1 = await sendHookRequest({
    toolCall: {
      name: 'replace_file_content',
      args: { TargetFile: 'src-tauri/src/main.rs', ReplacementContent: 'unsafe' }
    },
    conversationId: testSessionId,
    stepIdx: 1
  });

  console.log(`  Decision: ${res1.decision === 'deny' ? '\x1b[32m' : '\x1b[31m'}${res1.decision}\x1b[0m`);
  console.log(`  Reason:   ${res1.reason}`);
  if (res1.decision !== 'deny') {
    throw new Error(`Test 1 Failed: Expected 'deny', got '${res1.decision}'`);
  }

  // Test Case 2: Destructive git push --force -> must be DENIED
  console.log(`\n[Test 2] Intercepting destructive 'git push --force'...`);
  const res2 = await sendHookRequest({
    toolCall: {
      name: 'run_command',
      args: { CommandLine: 'git push --force origin main' }
    },
    conversationId: testSessionId,
    stepIdx: 2
  });

  console.log(`  Decision: ${res2.decision === 'deny' ? '\x1b[32m' : '\x1b[31m'}${res2.decision}\x1b[0m`);
  console.log(`  Reason:   ${res2.reason}`);
  if (res2.decision !== 'deny') {
    throw new Error(`Test 2 Failed: Expected 'deny', got '${res2.decision}'`);
  }

  // Test Case 3: Git push -> must demand user confirmation (ASK)
  console.log(`\n[Test 3] Intercepting 'git push origin main'...`);
  const res3 = await sendHookRequest({
    toolCall: {
      name: 'run_command',
      args: { CommandLine: 'git push origin main' }
    },
    conversationId: testSessionId,
    stepIdx: 3
  });

  console.log(`  Decision: ${res3.decision === 'ask' ? '\x1b[32m' : '\x1b[31m'}${res3.decision}\x1b[0m`);
  console.log(`  Reason:   ${res3.reason}`);
  if (res3.decision !== 'ask') {
    throw new Error(`Test 3 Failed: Expected 'ask', got '${res3.decision}'`);
  }

  // Test Case 4: Safe read in ANALYZE phase -> must be ALLOWED
  const readSessionId = `host-allow-${Date.now()}`;
  const readSession = createSession({
    sessionId: readSessionId,
    agentId: 'backend-engineer'
  });
  readSession.transition('ANALYZE');
  readSession.state.save();

  console.log(`\n[Test 4] Session in ANALYZE phase. Intercepting 'view_file'...`);
  const res4 = await sendHookRequest({
    toolCall: {
      name: 'view_file',
      args: { AbsolutePath: 'D:/Documents/GitHub/toketeo/agents/core/engineering.md' }
    },
    conversationId: readSessionId,
    stepIdx: 1
  });

  console.log(`  Decision: ${res4.decision === 'allow' ? '\x1b[32m' : '\x1b[31m'}${res4.decision}\x1b[0m`);
  console.log(`  Reason:   ${res4.reason}`);
  if (res4.decision !== 'allow') {
    throw new Error(`Test 4 Failed: Expected 'allow', got '${res4.decision}'`);
  }

  // Clean up temporary sessions
  try {
    fs.rmSync(path.join(process.cwd(), '.agent', 'sessions', testSessionId), { recursive: true, force: true });
    fs.rmSync(path.join(process.cwd(), '.agent', 'sessions', readSessionId), { recursive: true, force: true });
  } catch {}

  console.log(`\n\x1b[32m=== All Real Host PreToolUse Interceptions Verified Successfully (100% Enforcement) ===\x1b[0m\n`);
}

if (require.main === module) {
  runEnforcementVerification().catch(err => {
    console.error('\x1b[31mVerification Failed:\x1b[0m', err.message);
    process.exit(1);
  });
}

module.exports = { runEnforcementVerification };
