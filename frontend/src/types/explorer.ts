import type { DbRow, DbValue } from './database'

export interface PendingCellEdit {
  row: DbRow;
  column: string;
  prevValue: DbValue;
  nextValue: DbValue;
}

export interface SqlPreviewState {
  isOpen: boolean;
  sql: string;
  title: string;
}

export interface ReviewPanelPosition {
  top?: number;
  bottom?: number;
  left: number;
}
