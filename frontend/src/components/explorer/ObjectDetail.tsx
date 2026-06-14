import type {
  DatabaseObject,
  ColumnResponse,
  QueryResult,
  IndexResponse,
  ForeignKeyResponse,
  ConstraintResponse,
  DbRow,
  DbValue,
} from '@/types/database';
import { ExecutionStatus, ExplorerTab, DatabaseObjectType } from '@/types/database';
import { Table2, Eye, Terminal, Zap, List, Table, Database, Binary, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UseMutationResult } from '@tanstack/react-query';
import { ColumnsTab } from './tabs/ColumnsTab';
import { IndexesTab } from './tabs/IndexesTab';
import { ForeignKeysTab } from './tabs/ForeignKeysTab';
import { ConstraintsTab } from './tabs/ConstraintsTab';
import { DataTab } from './tabs/DataTab';
import { DdlTab } from './tabs/DdlTab';

interface ObjectDetailProps {
  selectedItem: DatabaseObject | null;
  activeTab: ExplorerTab;
  setActiveTab: (tab: ExplorerTab) => void;
  columns?: ColumnResponse[];
  isLoadingColumns: boolean;
  indexes?: IndexResponse[];
  isLoadingIndexes: boolean;
  foreignKeys?: ForeignKeyResponse[];
  isLoadingForeignKeys: boolean;
  constraints?: ConstraintResponse[];
  isLoadingConstraints: boolean;
  isLoadingData: boolean;
  executionStatus: ExecutionStatus;
  executionError: string | null;
  queryData: QueryResult | null;
  pageSize: number;
  setPageSize: (size: number) => void;
  page: number;
  setPage: (updater: (p: number) => number) => void;
  handleExecute: () => void;
  handleCancel: () => void;
  updateCell: (row: DbRow, column: string, newValue: DbValue) => void;
  isLoadingDDL: boolean;
  editableDdl: string;
  setEditableDdl: (ddl: string) => void;
  updateDdlMutation: UseMutationResult<unknown, Error, string>;
  editColumnMutation: UseMutationResult<unknown, Error, string>;
  dropColumnMutation: UseMutationResult<unknown, Error, string>;
  dropIndexMutation: UseMutationResult<unknown, Error, string>;
  renameIndexMutation: UseMutationResult<unknown, Error, { oldName: string; newName: string }>;
  dropForeignKeyMutation: UseMutationResult<unknown, Error, string>;
  dropConstraintMutation: UseMutationResult<unknown, Error, string>;
}

export function ObjectDetail({
  selectedItem,
  activeTab,
  setActiveTab,
  columns,
  isLoadingColumns,
  indexes,
  isLoadingIndexes,
  foreignKeys,
  isLoadingForeignKeys,
  constraints,
  isLoadingConstraints,
  isLoadingData,
  executionStatus,
  executionError,
  queryData,
  pageSize,
  setPageSize,
  page,
  setPage,
  handleExecute,
  handleCancel,
  updateCell,
  isLoadingDDL,
  editableDdl,
  setEditableDdl,
  updateDdlMutation,
  editColumnMutation,
  dropColumnMutation,
  dropIndexMutation,
  renameIndexMutation,
  dropForeignKeyMutation,
  dropConstraintMutation,
}: ObjectDetailProps) {
  const handleAddObject = (type: string) => {
    setActiveTab(ExplorerTab.DDL);
    setEditableDdl(
      `-- Add new ${type} to ${selectedItem?.name}\nALTER TABLE \`${selectedItem?.name}\` ADD ...`,
    );
  };

  const isMetadataLoading = isLoadingColumns || isLoadingIndexes || isLoadingForeignKeys || isLoadingConstraints || isLoadingDDL;

  if (!selectedItem) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
        <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
          <Database className="w-8 h-8 text-muted-foreground/30" />
        </div>
        <h3 className="text-lg font-medium">Object Detail</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Select an item from the sidebar to view its structure and definition.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {isMetadataLoading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] z-50 flex items-center justify-center animate-in fade-in duration-300">
           <div className="flex flex-col items-center gap-2">
             <Loader2 className="w-8 h-8 text-primary animate-spin" />
             <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Loading Metadata...</span>
           </div>
        </div>
      )}
      <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20 shrink-0">
        <div className="flex items-center gap-3 text-left">
          <div className="p-2 bg-background border border-border rounded-none">
            {selectedItem.type === DatabaseObjectType.TABLE && (
              <Table2 className="w-5 h-5 text-primary" />
            )}
            {selectedItem.type === DatabaseObjectType.VIEW && (
              <Eye className="w-5 h-5 text-primary" />
            )}
            {selectedItem.type === DatabaseObjectType.PROCEDURE && (
              <Terminal className="w-5 h-5 text-primary" />
            )}
            {selectedItem.type === DatabaseObjectType.TRIGGER && (
              <Zap className="w-5 h-5 text-primary" />
            )}
            {selectedItem.type === DatabaseObjectType.FUNCTION && (
              <Binary className="w-5 h-5 text-primary" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-lg">{selectedItem.name}</h3>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              {selectedItem.type}
            </p>
          </div>
        </div>
        <div className="flex bg-muted p-1 rounded-none">
          {(selectedItem.type === DatabaseObjectType.TABLE ||
            selectedItem.type === DatabaseObjectType.VIEW ||
            selectedItem.type === DatabaseObjectType.PROCEDURE) && (
            <>
              {(selectedItem.type === DatabaseObjectType.TABLE ||
                selectedItem.type === DatabaseObjectType.VIEW) && (
                <button
                  onClick={() => setActiveTab(ExplorerTab.COLUMNS)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-none transition-colors',
                    activeTab === ExplorerTab.COLUMNS
                      ? 'bg-background shadow-sm'
                      : 'hover:bg-background/50',
                  )}
                >
                  <List className="w-3.5 h-3.5" />
                  Columns
                </button>
              )}
              {selectedItem.type === DatabaseObjectType.TABLE && (
                <>
                  <button
                    onClick={() => setActiveTab(ExplorerTab.INDEXES)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-none transition-colors',
                      activeTab === ExplorerTab.INDEXES
                        ? 'bg-background shadow-sm'
                        : 'hover:bg-background/50',
                    )}
                  >
                    <List className="w-3.5 h-3.5" />
                    Indexes
                  </button>
                  <button
                    onClick={() => setActiveTab(ExplorerTab.FOREIGN_KEYS)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-none transition-colors',
                      activeTab === ExplorerTab.FOREIGN_KEYS
                        ? 'bg-background shadow-sm'
                        : 'hover:bg-background/50',
                    )}
                  >
                    <List className="w-3.5 h-3.5" />
                    FKs
                  </button>
                  <button
                    onClick={() => setActiveTab(ExplorerTab.CONSTRAINTS)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-none transition-colors',
                      activeTab === ExplorerTab.CONSTRAINTS
                        ? 'bg-background shadow-sm'
                        : 'hover:bg-background/50',
                    )}
                  >
                    <List className="w-3.5 h-3.5" />
                    Constraints
                  </button>
                </>
              )}
              <button
                onClick={() => setActiveTab(ExplorerTab.DATA)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-none transition-colors',
                  activeTab === ExplorerTab.DATA
                    ? 'bg-background shadow-sm'
                    : 'hover:bg-background/50',
                )}
              >
                <Table className="w-3.5 h-3.5" />
                {selectedItem.type === DatabaseObjectType.PROCEDURE ? 'Execution' : 'Data'}
              </button>
            </>
          )}
          <button
            onClick={() => setActiveTab(ExplorerTab.DDL)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-none transition-colors',
              activeTab === ExplorerTab.DDL
                ? 'bg-background shadow-sm'
                : 'hover:bg-background/50',
            )}
          >
            <Terminal className="w-3.5 h-3.5" />
            Definition
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto flex flex-col min-h-0">
        {activeTab === ExplorerTab.COLUMNS &&
          (selectedItem.type === DatabaseObjectType.TABLE || selectedItem.type === DatabaseObjectType.VIEW) && (
            <ColumnsTab
              tableName={selectedItem.name}
              columns={columns}
              isLoading={isLoadingColumns}
              onAdd={() => handleAddObject('column')}
              editColumnMutation={editColumnMutation}
              dropColumnMutation={dropColumnMutation}
            />
          )}

        {activeTab === ExplorerTab.INDEXES && selectedItem.type === DatabaseObjectType.TABLE && (
          <IndexesTab
            indexes={indexes}
            isLoading={isLoadingIndexes}
            onAdd={() => handleAddObject('index')}
            dropIndexMutation={dropIndexMutation}
            renameIndexMutation={renameIndexMutation}
          />
        )}

        {activeTab === ExplorerTab.FOREIGN_KEYS && selectedItem.type === DatabaseObjectType.TABLE && (
          <ForeignKeysTab
            foreignKeys={foreignKeys}
            isLoading={isLoadingForeignKeys}
            onAdd={() => handleAddObject('foreign key')}
            dropForeignKeyMutation={dropForeignKeyMutation}
          />
        )}

        {activeTab === ExplorerTab.CONSTRAINTS && selectedItem.type === DatabaseObjectType.TABLE && (
          <ConstraintsTab
            constraints={constraints}
            isLoading={isLoadingConstraints}
            onAdd={() => handleAddObject('constraint')}
            dropConstraintMutation={dropConstraintMutation}
          />
        )}

        {activeTab === ExplorerTab.DATA &&
          (selectedItem.type === DatabaseObjectType.TABLE ||
            selectedItem.type === DatabaseObjectType.VIEW ||
            selectedItem.type === DatabaseObjectType.PROCEDURE) && (
            <DataTab
              selectedItem={selectedItem}
              isLoading={isLoadingData}
              executionStatus={executionStatus}
              executionError={executionError}
              queryData={queryData}
              pageSize={pageSize}
              setPageSize={setPageSize}
              page={page}
              setPage={setPage}
              handleExecute={handleExecute}
              handleCancel={handleCancel}
              updateCell={updateCell}
            />
          )}

        {activeTab === ExplorerTab.DDL && (
          <DdlTab
            isLoading={isLoadingDDL}
            editableDdl={editableDdl}
            setEditableDdl={setEditableDdl}
            updateDdlMutation={updateDdlMutation}
          />
        )}
      </div>
    </div>
  );
}
