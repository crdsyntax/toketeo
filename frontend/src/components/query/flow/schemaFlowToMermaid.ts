import type { SqlFlowGraph } from '@/types/sqlFlow';
import { MermaidCardinalitySymbol, SqlFlowJoinKeyword } from './types';

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function sanitizeName(raw: string, used: Set<string>): string {
  let safe = raw
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1');
  if (!safe) safe = 'TABLE';
  let candidate = safe;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${safe}_${i++}`;
  }
  used.add(candidate);
  return candidate;
}

function sanitizeColumn(raw: string): string {
  if (SAFE_IDENTIFIER.test(raw)) return raw;
  return `"${raw.replace(/"/g, '\\"')}"`;
}

function resolveCardinalitySymbol(joinType: string): MermaidCardinalitySymbol {
  const normalized = joinType.toUpperCase();
  if (normalized.includes(SqlFlowJoinKeyword.INNER)) {
    return MermaidCardinalitySymbol.ONE_TO_MANY_INNER;
  }
  if (normalized.includes(SqlFlowJoinKeyword.FULL)) {
    return MermaidCardinalitySymbol.MANY_TO_MANY;
  }
  if (normalized.includes(SqlFlowJoinKeyword.RIGHT)) {
    return MermaidCardinalitySymbol.MANY_TO_ONE;
  }
  return MermaidCardinalitySymbol.ONE_TO_MANY;
}

export function schemaFlowToMermaid(graph: SqlFlowGraph): string {
  const lines: string[] = ['erDiagram'];
  const entityMap = new Map<string, string>();
  const used = new Set<string>();

  for (const node of graph.nodes) {
    const displayName = node.alias ? `${node.id}_${node.alias}` : node.id;
    const entity = sanitizeName(displayName, used);
    entityMap.set(node.id, entity);

    const cols = node.columns ?? [];
    lines.push(`    ${entity} {`);
    if (cols.length > 0) {
      for (const col of cols) {
        lines.push(`        string ${sanitizeColumn(col)}`);
      }
    } else {
      lines.push(`        string entity`);
    }
    lines.push(`    }`);
  }

  for (const edge of graph.edges) {
    const src = entityMap.get(edge.source) || sanitizeName(edge.source, used);
    const tgt = entityMap.get(edge.target) || sanitizeName(edge.target, used);
    const symbol = resolveCardinalitySymbol(edge.joinType || '');

    const labelClean = (edge.label ? `${edge.joinType} ${edge.label}` : edge.joinType)
      .replace(/"/g, "'")
      .replace(/[\r\n]+/g, ' ')
      .trim();

    lines.push(`    ${src} ${symbol} ${tgt} : "${labelClean}"`);
  }

  return lines.join('\n');
}
