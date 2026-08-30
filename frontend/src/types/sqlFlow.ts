import type { DbValue } from '@/types/database';

export interface SqlFlowNode {
  id: string;
  label: string;
  isRoot: boolean;
  alias?: string;
  columns?: string[];
  rows?: Record<string, DbValue>[];
}

export interface SqlFlowEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  joinType: string;
}

export interface SqlFlowGraph {
  nodes: SqlFlowNode[];
  edges: SqlFlowEdge[];
}

export interface ParseSqlFlowParams {
  query: string;
  dialect?: string;
}

export interface GetSqlFlowDataParams {
  query: string;
  connectionId?: string;
  schema?: string;
  dialect?: string;
}
