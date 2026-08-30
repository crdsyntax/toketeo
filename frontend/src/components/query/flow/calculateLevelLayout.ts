import { MarkerType, type Edge } from '@xyflow/react';
import type { SqlFlowGraph } from '@/types/sqlFlow';
import type { FlowLayoutResult, SqlTableNodeType } from './types';

const NODE_WIDTH = 380;
const NODE_HEIGHT = 280;
const GAP_X = 140;
const GAP_Y = 80;
const INITIAL_OFFSET = 60;

export function calculateLevelLayout(graph: SqlFlowGraph): FlowLayoutResult {
  const { nodes: rawNodes, edges: rawEdges } = graph;

  const inDegrees = new Map<string, number>();
  const childrenMap = new Map<string, string[]>();

  rawNodes.forEach((n) => {
    inDegrees.set(n.id, 0);
    childrenMap.set(n.id, []);
  });

  rawEdges.forEach((e) => {
    const currentIn = inDegrees.get(e.target) ?? 0;
    inDegrees.set(e.target, currentIn + 1);
    const existingChildren = childrenMap.get(e.source) ?? [];
    existingChildren.push(e.target);
    childrenMap.set(e.source, existingChildren);
  });

  const levelMap = new Map<string, number>();
  const queue: Array<{ id: string; level: number }> = [];

  rawNodes.forEach((n) => {
    if (n.isRoot || (inDegrees.get(n.id) ?? 0) === 0) {
      levelMap.set(n.id, 0);
      queue.push({ id: n.id, level: 0 });
    }
  });

  if (queue.length === 0 && rawNodes.length > 0) {
    levelMap.set(rawNodes[0].id, 0);
    queue.push({ id: rawNodes[0].id, level: 0 });
  }

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const children = childrenMap.get(item.id) ?? [];
    children.forEach((childId) => {
      const nextLevel = item.level + 1;
      const currentAssigned = levelMap.get(childId);
      if (currentAssigned === undefined || nextLevel > currentAssigned) {
        levelMap.set(childId, nextLevel);
        queue.push({ id: childId, level: nextLevel });
      }
    });
  }

  rawNodes.forEach((n) => {
    if (!levelMap.has(n.id)) {
      levelMap.set(n.id, 0);
    }
  });

  const levels: Record<number, string[]> = {};
  rawNodes.forEach((n) => {
    const lvl = levelMap.get(n.id) ?? 0;
    if (!levels[lvl]) levels[lvl] = [];
    levels[lvl].push(n.id);
  });

  const nodes: SqlTableNodeType[] = rawNodes.map((n) => {
    const lvl = levelMap.get(n.id) ?? 0;
    const nodesInLevel = levels[lvl] ?? [];
    const indexInLevel = nodesInLevel.indexOf(n.id);

    const x = lvl * (NODE_WIDTH + GAP_X) + INITIAL_OFFSET;
    const y = indexInLevel * (NODE_HEIGHT + GAP_Y) + INITIAL_OFFSET;

    return {
      id: n.id,
      type: 'sqlTable',
      position: { x, y },
      data: {
        label: n.label,
        tableName: n.id,
        isRoot: n.isRoot,
        alias: n.alias,
        columns: n.columns,
        rows: n.rows,
      },
    };
  });

  const edges: Edge[] = rawEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label ? `${e.joinType} ${e.label}`.trim() : e.joinType,
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#38bdf8', strokeWidth: 2 },
    labelStyle: { fill: '#e2e8f0', fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: '#0f172a', fillOpacity: 0.85, rx: 6, ry: 6 },
    labelBgPadding: [6, 4],
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 18,
      height: 18,
      color: '#38bdf8',
    },
  }));

  return { nodes, edges };
}
