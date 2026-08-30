import type { Node } from '@xyflow/react';
import type { DbValue } from '@/types/database';
import type { SqlFlowGraph } from '@/types/sqlFlow';

export enum SqlTableNodeViewMode {
  TABLE = 'table',
  JSON = 'json',
}

export enum SqlFlowJoinKeyword {
  INNER = 'INNER',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  FULL = 'FULL',
  CROSS = 'CROSS',
}

export enum MermaidCardinalitySymbol {
  ONE_TO_MANY = '||--o{',
  ONE_TO_ONE = '||--||',
  ONE_TO_MANY_INNER = '||--|{',
  MANY_TO_ONE = '}o--||',
  MANY_TO_MANY = '}o--o{',
}

export interface SqlTableNodeData extends Record<string, unknown> {
  label: string;
  isRoot: boolean;
  alias?: string;
  tableName: string;
  columns?: string[];
  rows?: Record<string, DbValue>[];
}

export type SqlTableNodeType = Node<SqlTableNodeData, 'sqlTable'>;

export interface SchemaFlowChartProps {
  graph: SqlFlowGraph;
}

export interface SchemaFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  graph: SqlFlowGraph | null;
  isLoading: boolean;
  onReload: () => void;
}

export interface FlowLayoutResult {
  nodes: SqlTableNodeType[];
  edges: import('@xyflow/react').Edge[];
}

export interface DisplayValueResult {
  text: string;
  isNull?: boolean;
  isBool?: boolean;
}
