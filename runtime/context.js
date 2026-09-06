/**
 * runtime/context.js
 * Deterministic Retrieval and Context Governance Engine (§F7).
 * Provides structured, audited, reproducible ContextBundles with SHA-256 canonical hashing.
 * 
 * Invariants:
 * - Skill ≠ Capability
 * - Retrieval ≠ Capability
 * - Context ≠ Permission
 * 
 * Retrieval NEVER elevates or grants new tool permissions beyond the AgentDefinition.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { deepFreeze } = require('./agents');

const CONTEXT_SOURCE_TYPES = Object.freeze({
  FILE: 'file',
  DIRECTORY: 'directory',
  SPECIFICATION: 'specification',
  CODE_SNAPSHOT: 'code_snapshot',
  SCHEMA_SNAPSHOT: 'schema_snapshot',
  SKILL: 'skill',
  ARTIFACT: 'artifact'
});

const DEFAULT_MAX_TOKENS = 8000;
const DEFAULT_MAX_ITEMS = 10;
const MAX_FILE_SIZE_BYTES = 250 * 1024; // 250 KB ceiling

const DENIED_SECRET_PATTERNS = [
  /\.env(\..+)?$/i,
  /signing\.key$/i,
  /signing_pass\.txt$/i,
  /\.git[\/\\]/i,
  /node_modules[\/\\]/i,
  /target[\/\\]/i
];

const ALLOWED_SCOPES = [
  'agents',
  'docs',
  'src-tauri',
  'frontend',
  'skills'
];

/**
 * Deterministic token estimator (~4 chars per token).
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 4);
}

/**
 * SHA-256 hash helper.
 */
function sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Context Governance Evaluator.
 */
class ContextGovernance {
  constructor({
    rootDir = process.cwd(),
    allowedScopes = ALLOWED_SCOPES,
    deniedPatterns = DENIED_SECRET_PATTERNS,
    maxFileSizeBytes = MAX_FILE_SIZE_BYTES
  } = {}) {
    this.rootDir = path.resolve(rootDir);
    this.allowedScopes = allowedScopes;
    this.deniedPatterns = deniedPatterns;
    this.maxFileSizeBytes = maxFileSizeBytes;
  }

  isAccessAllowed(targetPath) {
    const resolved = path.resolve(this.rootDir, targetPath);

    // 1. Path traversal escape check
    if (!resolved.startsWith(this.rootDir)) {
      return { allowed: false, reason: 'PATH_TRAVERSAL_DENIED', message: 'Target path escapes workspace root' };
    }

    const relPath = path.relative(this.rootDir, resolved).replace(/\\/g, '/');

    // 2. Secret / Denied Patterns Check
    for (const pattern of this.deniedPatterns) {
      if (pattern.test(relPath) || pattern.test(path.basename(resolved))) {
        return {
          allowed: false,
          reason: 'CONTEXT_ACCESS_DENIED',
          message: `Access denied to sensitive or restricted resource: '${relPath}'`
        };
      }
    }

    // 3. Allowed Scopes Check
    const topDir = relPath.split('/')[0];
    if (!this.allowedScopes.includes(topDir) && relPath !== 'AGENTS.md' && relPath !== 'package.json') {
      return {
        allowed: false,
        reason: 'SCOPE_NOT_ALLOWED',
        message: `Scope '${topDir}' is not within permitted context scopes: [${this.allowedScopes.join(', ')}]`
      };
    }

    // 4. File Size Check (if exists on disk)
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      const stats = fs.statSync(resolved);
      if (stats.size > this.maxFileSizeBytes) {
        return {
          allowed: false,
          reason: 'FILE_SIZE_EXCEEDED',
          message: `File '${relPath}' size (${stats.size} bytes) exceeds maximum limit of ${this.maxFileSizeBytes} bytes`
        };
      }
    }

    return { allowed: true, reason: null, resolvedPath: resolved, relativePath: relPath };
  }
}

/**
 * Factory for creating an immutable RetrievalRequest.
 */
function createRetrievalRequest({
  requestId,
  runId,
  agentId,
  query = '',
  sources = [],
  maxTokens = DEFAULT_MAX_TOKENS,
  maxItems = DEFAULT_MAX_ITEMS,
  priority = 'normal',
  purpose = ''
}) {
  if (!runId) throw new Error("Missing 'runId' in RetrievalRequest");
  if (!agentId) throw new Error("Missing 'agentId' in RetrievalRequest");
  if (!Array.isArray(sources)) throw new Error("'sources' must be an array in RetrievalRequest");

  const req = {
    request_id: requestId || `retrieval-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    run_id: runId,
    agent_id: agentId,
    query: typeof query === 'string' ? query : '',
    sources: [...sources],
    max_tokens: Number(maxTokens) > 0 ? Number(maxTokens) : DEFAULT_MAX_TOKENS,
    max_items: Number(maxItems) > 0 ? Number(maxItems) : DEFAULT_MAX_ITEMS,
    priority: ['high', 'normal', 'low'].includes(priority) ? priority : 'normal',
    purpose: typeof purpose === 'string' ? purpose : '',
    requested_at: new Date().toISOString()
  };

  return deepFreeze(req);
}

/**
 * Deterministic Context Retrieval Engine.
 */
class RetrievalEngine {
  constructor({ rootDir = process.cwd(), governance = null } = {}) {
    this.rootDir = path.resolve(rootDir);
    this.governance = governance || new ContextGovernance({ rootDir: this.rootDir });
  }

  /**
   * Deterministically resolves context items for a RetrievalRequest.
   *
   * @param {Object} retrievalRequest
   * @returns {Object} Immutable ContextBundle
   */
  async resolve(retrievalRequest) {
    const { request_id, sources, max_tokens, max_items } = retrievalRequest;
    const collectedItems = [];

    for (const source of sources) {
      if (collectedItems.length >= max_items) break;

      const sourcePath = typeof source === 'string' ? source : (source.path || source.target);
      if (!sourcePath) continue;

      // Check section specification (e.g. "path/to/file.md#Section Name")
      let filePath = sourcePath;
      let targetSection = null;
      if (sourcePath.includes('#')) {
        const parts = sourcePath.split('#');
        filePath = parts[0];
        targetSection = parts[1];
      }

      // 1. Governance Gate
      const govCheck = this.governance.isAccessAllowed(filePath);
      if (!govCheck.allowed) {
        const err = new Error(`Governance Denied: ${govCheck.message}`);
        err.code = govCheck.reason;
        err.details = { path: filePath, reason: govCheck.reason };
        throw err;
      }

      const fullPath = govCheck.resolvedPath;
      if (!fs.existsSync(fullPath)) continue;

      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        let content = fs.readFileSync(fullPath, 'utf8');
        if (content.charCodeAt(0) === 0xFEFF) {
          content = content.slice(1);
        }

        // Section extractor
        if (targetSection) {
          const sectionRegex = new RegExp(`(^##+\\s+.*${targetSection.trim()}.*$[\\s\\S]*?)(?=^##+\\s|$)`, 'im');
          const match = content.match(sectionRegex);
          content = match ? match[1].trim() : content;
        }

        const itemHash = sha256(content);
        const tokenEst = estimateTokens(content);

        collectedItems.push({
          source_id: govCheck.relativePath + (targetSection ? `#${targetSection}` : ''),
          type: targetSection ? CONTEXT_SOURCE_TYPES.SPECIFICATION : CONTEXT_SOURCE_TYPES.FILE,
          path: govCheck.relativePath,
          section: targetSection || null,
          content,
          hash: itemHash,
          token_estimate: tokenEst
        });
      }
    }

    // 2. Deterministic Canonical Sorting (Alphabetical by source_id)
    collectedItems.sort((a, b) => a.source_id.localeCompare(b.source_id));

    // 3. Greedy Token Budget Allocation (Strictly <= max_tokens)
    const budgetItems = [];
    let currentTokens = 0;

    for (const item of collectedItems) {
      if (currentTokens + item.token_estimate <= max_tokens) {
        budgetItems.push(item);
        currentTokens += item.token_estimate;
      } else {
        // If an item exceeds remaining budget, truncate deterministically or skip
        const remainingBudget = max_tokens - currentTokens;
        if (remainingBudget >= 20 && budgetItems.length === 0) {
          const suffix = '\n... [TRUNCATED]';
          const maxChars = remainingBudget * 4;
          const sliceChars = Math.max(0, maxChars - suffix.length);
          const truncatedContent = item.content.slice(0, sliceChars) + suffix;
          const tokenEst = estimateTokens(truncatedContent);

          if (tokenEst <= remainingBudget) {
            const truncatedItem = {
              ...item,
              content: truncatedContent,
              hash: sha256(truncatedContent),
              token_estimate: tokenEst
            };
            budgetItems.push(truncatedItem);
            currentTokens += tokenEst;
          }
        }
        break;
      }
    }

    // 4. Canonical Bundle Hashing (SHA-256 of all items' content hashes + paths in order)
    const canonicalDescriptor = budgetItems
      .map(i => `${i.source_id}:${i.hash}:${i.token_estimate}`)
      .join('|');
    const bundleHash = sha256(canonicalDescriptor);

    const bundle = {
      bundle_id: `bundle-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      request_id,
      generated_at: new Date().toISOString(),
      bundle_hash: bundleHash,
      items: budgetItems,
      total_items: budgetItems.length,
      total_tokens: currentTokens,
      max_tokens_budget: max_tokens
    };

    return deepFreeze(bundle);
  }
}

module.exports = {
  CONTEXT_SOURCE_TYPES,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MAX_ITEMS,
  ContextGovernance,
  createRetrievalRequest,
  RetrievalEngine,
  estimateTokens,
  sha256
};
