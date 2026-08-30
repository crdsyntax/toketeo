import { useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { SqlTableNode, type SqlTableNodeType } from './SqlTableNode';
import type { SqlFlowGraph } from '@/types/sqlFlow';

interface SchemaFlowChartProps {
  graph: SqlFlowGraph;
}

const nodeTypes: NodeTypes = {
  sqlTable: SqlTableNode,
};

function calculateLevelLayout(graph: SqlFlowGraph): { nodes: Node[]; edges: Edge[] } {
  const { nodes: rawNodes, edges: rawEdges } = graph;

  // Build adjacency and compute in-degrees
  const inDegrees = new Map<string, number>();
  const childrenMap = new Map<string, string[]>();

  rawNodes.forEach((n) => {
    inDegrees.set(n.id, 0);
    childrenMap.set(n.id, []);
  });

  rawEdges.forEach((e) => {
    const currentIn = inDegrees.get(e.target) ?? 0;
    inDegrees.set(e.target, currentIn + 1);

    const children = childrenMap.get(e.source) ?? [];
    children.push(e.target);
    childrenMap.set(e.source, children);
  });

  // Assign levels
  const levelMap = new Map<string, number>();
  const queue: Array<{ id: string; level: number }> = [];

  // Start with root nodes
  rawNodes.forEach((n) => {
    if (n.isRoot || (inDegrees.get(n.id) ?? 0) === 0) {
      levelMap.set(n.id, 0);
      queue.push({ id: n.id, level: 0 });
    }
  });

  // If cyclic or no obvious root, assign level 0 to first node
  if (queue.length === 0 && rawNodes.length > 0) {
    levelMap.set(rawNodes[0].id, 0);
    queue.push({ id: rawNodes[0].id, level: 0 });
  }

  while (queue.length > 0) {
    const item = queue.shift()!;
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

  // Any unassigned nodes get level 0 or max level
  rawNodes.forEach((n) => {
    if (!levelMap.has(n.id)) {
      levelMap.set(n.id, 0);
    }
  });

  // Group nodes by level
  const levels: Record<number, string[]> = {};
  rawNodes.forEach((n) => {
    const lvl = levelMap.get(n.id) ?? 0;
    if (!levels[lvl]) levels[lvl] = [];
    levels[lvl].push(n.id);
  });

  const NODE_WIDTH = 380;
  const NODE_HEIGHT = 280;
  const GAP_X = 140;
  const GAP_Y = 80;

  const nodes: Node[] = rawNodes.map((n) => {
    const lvl = levelMap.get(n.id) ?? 0;
    const nodesInLevel = levels[lvl] ?? [];
    const indexInLevel = nodesInLevel.indexOf(n.id);

    const x = lvl * (NODE_WIDTH + GAP_X) + 60;
    const y = indexInLevel * (NODE_HEIGHT + GAP_Y) + 60;

    const nodeItem: SqlTableNodeType = {
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
    return nodeItem;
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

export function SchemaFlowChart({ graph }: SchemaFlowChartProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => calculateLevelLayout(graph),
    [graph]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    const layout = calculateLevelLayout(graph);
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [graph, setNodes, setEdges]);

  return (
    <div className="w-full h-full min-h-[450px] bg-background relative overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="opacity-40" />
        <Controls className="!bg-card !border !border-border !shadow-md !rounded-lg overflow-hidden [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted [&>button_svg]:!fill-foreground [&>button_path]:!fill-foreground" />
        <MiniMap
          zoomable
          pannable
          className="!bg-card/90 !border !border-border !rounded-lg overflow-hidden shadow-md"
          nodeColor={(node) => (node.data?.isRoot ? '#10b981' : '#3b82f6')}
        />
      </ReactFlow>
    </div>
  );
}
