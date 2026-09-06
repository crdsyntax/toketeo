/**
 * runtime/skills.js
 * Formal Skills System for Toketeo Agent Runtime (§F6).
 * Skills encapsulate reusable procedures, schemas, and domain-specific knowledge.
 * Security Invariant: Skills can NEVER elevate or grant new tool permissions beyond
 * the AgentDefinition's capabilities.
 */

const fs = require('fs');
const path = require('path');
const { deepFreeze } = require('./agents');

/**
 * Validates a structured SkillDefinition.
 */
function validateSkillDefinition(def) {
  if (!def || typeof def !== 'object') {
    return { valid: false, error: 'SkillDefinition must be an object' };
  }
  if (!def.id || typeof def.id !== 'string') {
    return { valid: false, error: "Missing or invalid string 'id' in SkillDefinition" };
  }
  if (!def.name || typeof def.name !== 'string') {
    return { valid: false, error: "Missing or invalid string 'name' in SkillDefinition" };
  }
  if (!Array.isArray(def.target_agents)) {
    return { valid: false, error: "'target_agents' must be an array of strings" };
  }
  if (!Array.isArray(def.required_tools)) {
    return { valid: false, error: "'required_tools' must be an array of strings" };
  }
  if (typeof def.instructions !== 'string') {
    return { valid: false, error: "'instructions' must be a string" };
  }

  return { valid: true, error: null };
}

/**
 * Factory for creating an immutable SkillDefinition.
 */
function createSkillDefinition({
  id,
  name,
  description = '',
  target_agents = [],
  required_tools = [],
  instructions = '',
  version = '1.0'
}) {
  const def = {
    id: id || name,
    name: name || id,
    description: typeof description === 'string' ? description : '',
    target_agents: Array.isArray(target_agents) ? [...target_agents] : [],
    required_tools: Array.isArray(required_tools) ? [...required_tools] : [],
    instructions: typeof instructions === 'string' ? instructions : '',
    version: typeof version === 'string' ? version : '1.0'
  };

  const validation = validateSkillDefinition(def);
  if (!validation.valid) {
    const err = new Error(`SKILL_DEFINITION_INVALID: ${validation.error}`);
    err.code = 'SKILL_DEFINITION_INVALID';
    throw err;
  }

  return deepFreeze(def);
}

/**
 * Parses frontmatter lines supporting scalars, lists, and flow arrays.
 */
function parseFrontmatter(rawYaml) {
  const result = {};
  const lines = rawYaml.split(/\r?\n/);
  let currentKey = null;
  let currentList = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('- ') && currentKey && currentList) {
      const item = line.slice(2).trim().replace(/^['"]|['"]$/g, '');
      currentList.push(item);
      continue;
    }

    const colon = line.indexOf(':');
    if (colon !== -1) {
      if (currentList && currentKey) {
        result[currentKey] = currentList;
        currentList = null;
      }
      const key = line.slice(0, colon).trim();
      const val = line.slice(colon + 1).trim();

      if (val === '' || val === '[]') {
        if (val === '[]') {
          result[key] = [];
        } else {
          currentKey = key;
          currentList = [];
        }
      } else if (val.startsWith('[') && val.endsWith(']')) {
        const items = val
          .slice(1, -1)
          .split(',')
          .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
        result[key] = items;
      } else if (val === 'true' || val === 'false') {
        result[key] = val === 'true';
      } else {
        result[key] = val.replace(/^['"]|['"]$/g, '');
      }
    }
  }

  if (currentList && currentKey) {
    result[currentKey] = currentList;
  }

  return result;
}

/**
 * Parses markdown skill content into a SkillDefinition.
 */
function parseMarkdownSkill(content, filename) {
  let frontmatter = {};
  let body = content;

  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3);
    if (end !== -1) {
      const rawYaml = content.slice(3, end).trim();
      body = content.slice(end + 3).trim();
      frontmatter = parseFrontmatter(rawYaml);
    }
  }

  const baseName = path.basename(filename, '.md');
  const skillId = frontmatter.id || frontmatter.name || baseName;

  const targetAgents = Array.isArray(frontmatter.target_agents)
    ? frontmatter.target_agents
    : (frontmatter.target ? [frontmatter.target] : []);

  const requiredTools = Array.isArray(frontmatter.required_tools)
    ? frontmatter.required_tools
    : (frontmatter.tools ? [frontmatter.tools] : []);

  return createSkillDefinition({
    id: skillId,
    name: frontmatter.name || skillId,
    description: frontmatter.description || '',
    target_agents: targetAgents,
    required_tools: requiredTools,
    instructions: body,
    version: frontmatter.version || '1.0'
  });
}

/**
 * Loads a SkillDefinition from a markdown file.
 */
function loadSkillFromMarkdown(filePath) {
  if (!fs.existsSync(filePath)) {
    const err = new Error(`Skill file not found: ${filePath}`);
    err.code = 'SKILL_FILE_NOT_FOUND';
    throw err;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  return parseMarkdownSkill(content, filePath);
}

/**
 * SkillCatalog holds in-memory SkillDefinitions.
 */
class SkillCatalog {
  constructor() {
    this.skills = new Map();
  }

  register(skillDefinition) {
    const val = validateSkillDefinition(skillDefinition);
    if (!val.valid) {
      throw new Error(`Cannot register invalid SkillDefinition: ${val.error}`);
    }
    this.skills.set(skillDefinition.id, deepFreeze(skillDefinition));
    return skillDefinition;
  }

  get(skillId) {
    return this.skills.get(skillId) || null;
  }

  has(skillId) {
    return this.skills.has(skillId);
  }

  list() {
    return Array.from(this.skills.values());
  }

  loadFromDir(dirPath) {
    if (!fs.existsSync(dirPath)) return [];
    const loaded = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dirPath, e.name);
      if (e.isDirectory()) {
        loaded.push(...this.loadFromDir(full));
      } else if (e.name.endsWith('.md')) {
        try {
          const skill = loadSkillFromMarkdown(full);
          this.register(skill);
          loaded.push(skill);
        } catch (err) {
          // ignore non-skill files
        }
      }
    }
    return loaded;
  }
}

module.exports = {
  createSkillDefinition,
  validateSkillDefinition,
  loadSkillFromMarkdown,
  SkillCatalog
};
