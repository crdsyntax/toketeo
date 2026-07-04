#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const docsDir = path.join(root, 'docs', 'agent-context');
const outputFiles = {
  'project-overview.md': '',
  'architecture.md': '',
  'tech-stack.md': '',
  'entrypoints.md': '',
  'conventions.md': '',
  'tasks.md': ''
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function listDir(dir, depth = 0) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'build')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({
      name: entry.name,
      path: path.join(dir, entry.name),
      isDirectory: entry.isDirectory()
    }));
}

function toRelative(p) {
  return path.relative(root, p).split(path.sep).join('/');
}

function detectPackageManager() {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'package-lock.json'))) return 'npm';
  if (fs.existsSync(path.join(root, 'bun.lockb')) || fs.existsSync(path.join(root, 'bun.lock'))) return 'bun';
  return 'npm';
}

function detectMainFiles() {
  const candidates = [
    'package.json',
    'Cargo.toml',
    'src-tauri/Cargo.toml',
    'frontend/package.json',
    'src/main.ts',
    'src/main.tsx',
    'src/index.ts',
    'src/index.tsx',
    'src-tauri/src/main.rs',
    'index.html'
  ];
  return candidates.filter((c) => fs.existsSync(path.join(root, c))).map((c) => toRelative(path.join(root, c)));
}

function detectTopLevelFolders() {
  return listDir(root)
    .filter((entry) => entry.isDirectory)
    .map((entry) => entry.name)
    .filter((name) => !['docs', 'node_modules', 'dist', 'build', '.git'].includes(name));
}

function detectScripts() {
  const pkg = readJson(path.join(root, 'package.json'));
  return pkg && pkg.scripts ? Object.entries(pkg.scripts).map(([name, cmd]) => `${name}: ${cmd}`) : [];
}

function inferProjectType() {
  if (fs.existsSync(path.join(root, 'src-tauri'))) return 'Tauri desktop application';
  if (fs.existsSync(path.join(root, 'frontend'))) return 'web application';
  if (fs.existsSync(path.join(root, 'src'))) return 'TypeScript/Node project';
  return 'software project';
}

function summarizeFiles(baseDir, limit = 20) {
  const walk = [];
  function visit(dir) {
    const entries = listDir(dir);
    for (const entry of entries) {
      const fullPath = entry.path;
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', 'build', '.git'].includes(entry.name)) continue;
        visit(fullPath);
      } else {
        walk.push(toRelative(fullPath));
      }
    }
  }
  visit(baseDir);
  return walk.slice(0, limit);
}

function generateOverview() {
  const pkg = readJson(path.join(root, 'package.json'));
  return [
    '# Project Overview',
    '',
    `- Project root: ${root.split(path.sep).pop()}`,
    `- Type: ${inferProjectType()}`,
    `- Package manager: ${detectPackageManager()}`,
    `- Main files: ${detectMainFiles().join(', ') || 'not detected'}`,
    `- Top-level folders: ${detectTopLevelFolders().join(', ') || 'none'}`,
    `- Description: ${pkg?.description || 'No description available'}`,
    '',
    '## Important Context for Agents',
    '',
    '- Prefer existing architecture and documentation over introducing new abstractions.',
    '- Respect project boundaries between frontend, backend, database, and desktop integration layers.',
    '- Keep changes minimal and targeted unless a clear architecture decision is requested.',
    ''
  ].join('\n');
}

function generateArchitecture() {
  const topFolders = detectTopLevelFolders();
  return [
    '# Architecture Summary',
    '',
    '## Layers',
    '',
    ...topFolders.map((folder) => `- ${folder}: detected project area`),
    '',
    '## Expected Flow',
    '',
    '- UI or client layer interacts with project services or commands.',
    '- Business or orchestration logic should remain isolated from transport details.',
    '- Data access and external integrations should be concentrated in dedicated modules.',
    '',
    '## Guidance for Agents',
    '',
    '- Follow the existing layering and avoid cross-cutting coupling.',
    '- Preserve the current boundaries between runtime, infrastructure, and presentation code.',
    '- Favor incremental changes that keep the architecture consistent.',
    ''
  ].join('\n');
}

function generateTechStack() {
  const pkg = readJson(path.join(root, 'package.json'));
  const deps = pkg && pkg.dependencies ? Object.keys(pkg.dependencies) : [];
  return [
    '# Tech Stack',
    '',
    `- Runtime/package manager: ${detectPackageManager()}`,
    `- Scripts: ${detectScripts().join(' | ') || 'none'}`,
    '',
    '## Dependencies',
    '',
    ...deps.slice(0, 40).map((dep) => `- ${dep}`),
    '',
    '## Notes',
    '',
    '- Prefer existing tooling and conventions over introducing new stacks.',
    '- If a change affects runtime or build flows, verify the relevant scripts before editing.',
    ''
  ].join('\n');
}

function generateEntrypoints() {
  const files = detectMainFiles();
  return [
    '# Entrypoints',
    '',
    ...files.map((file) => `- ${file}`),
    '',
    '## Suggested Starting Points for Agents',
    '',
    '- Review the main application entry file first for execution flow.',
    '- Inspect configuration and build scripts before making system-wide changes.',
    '- Use existing docs and module folders as the primary source of context.',
    ''
  ].join('\n');
}

function generateConventions() {
  return [
    '# Conventions',
    '',
    '- Keep changes scoped and atomic.',
    '- Use existing naming patterns and folder organization.',
    '- Prefer strong typing and explicit contracts.',
    '- Avoid introducing unnecessary abstractions.',
    '- Preserve existing documentation when behavior changes.',
    '',
    '## Agent Operating Notes',
    '',
    '- Work from the existing architecture rather than inventing a new one.',
    '- If the task touches multiple layers, explain the impact before proceeding.',
    '- Prefer smaller, verifiable changes over broad rewrites.',
    ''
  ].join('\n');
}

function generateTasks() {
  return [
    '# Common Task Hints',
    '',
    '- Feature implementation: inspect the relevant module, its entrypoint, and the existing documentation first.',
    '- Bug fix: reproduce or identify the failing path, then patch the smallest affected surface.',
    '- Refactor: preserve public contracts and verify behavior with the project’s existing checks.',
    '- Documentation change: update the closest reference docs and the agent context bundle.',
    '',
    '## Suggested Workflow',
    '',
    '1. Review the project overview and architecture docs.',
    '2. Locate the relevant module or entrypoint.',
    '3. Apply a minimal change aligned with existing conventions.',
    '4. Verify the relevant build or test command before finishing.',
    ''
  ].join('\n');
}

function writeOutputs() {
  ensureDir(docsDir);
  const docs = {
    'project-overview.md': generateOverview(),
    'architecture.md': generateArchitecture(),
    'tech-stack.md': generateTechStack(),
    'entrypoints.md': generateEntrypoints(),
    'conventions.md': generateConventions(),
    'tasks.md': generateTasks()
  };
  for (const [name, content] of Object.entries(docs)) {
    fs.writeFileSync(path.join(docsDir, name), content);
  }

  const indexContent = [
    '# Agent Context Bundle',
    '',
    'This directory contains a compact, agent-friendly architecture snapshot for the project.',
    '',
    '## Files',
    '',
    '- [project-overview.md](project-overview.md): high-level context and project identity',
    '- [architecture.md](architecture.md): layout and architectural guidance',
    '- [tech-stack.md](tech-stack.md): package manager, scripts, and dependencies',
    '- [entrypoints.md](entrypoints.md): main execution and integration entrypoints',
    '- [conventions.md](conventions.md): coding and workflow conventions',
    '- [tasks.md](tasks.md): common task guidance for agents',
    ''
  ].join('\n');

  fs.writeFileSync(path.join(docsDir, 'README.md'), indexContent);
}

writeOutputs();
console.log(`Agent documentation generated in ${path.relative(root, docsDir)}`);
