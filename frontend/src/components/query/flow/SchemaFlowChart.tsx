import { useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeTypes,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { SqlTableNode } from './SqlTableNode';
import { calculateLevelLayout } from './calculateLevelLayout';
import type { SchemaFlowChartProps } from './types';

const nodeTypes: NodeTypes = {
  sqlTable: SqlTableNode,
};

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
    <div id="schema-flow-chart-container" className="w-full h-full min-h-[450px] bg-background relative overflow-hidden">
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
