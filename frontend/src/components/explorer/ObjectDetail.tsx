import type {
  DatabaseObject,
  ColumnResponse,
  QueryResult,
  ExecutionStatus,
} from '@/types/database';
import { Table, Layout, Code, RefreshCw, List, Table2 } from 'lucide-react';
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
  activeTab:
    | 'columns'
    | 'data'
    | 'ddl'
    | 'indexes'
    | 'foreign-keys'
    | 'constraints';
  setActiveTab: (
    tab:
      | 'columns'
      | 'data'
      | 'ddl'
      | 'indexes'
      | 'foreign-keys'
      | 'constraints',
  ) => void;
  columns?: ColumnResponse[];
  isLoadingColumns: boolean;
  indexes?: any[];
  isLoadingIndexes: boolean;
  foreignKeys?: any[];
  isLoadingForeignKeys: boolean;
  constraints?: any[];
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
  isLoadingDDL: boolean;
  editableDdl: string;
  setEditableDdl: (ddl: string) => void;
  updateDdlMutation: UseMutationResult<unknown, Error, string>;
  editColumnMutation: UseMutationResult<unknown, Error, string>;
  dropColumnMutation: UseMutationResult<unknown, Error, string>;
  dropIndexMutation: UseMutationResult<unknown, Error, string>;
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
  isLoadingDDL,
  editableDdl,
  setEditableDdl,
  updateDdlMutation,
  editColumnMutation,
  dropColumnMutation,
  dropIndexMutation,
  dropForeignKeyMutation,
  dropConstraintMutation,
}: ObjectDetailProps) {
  const handleAddObject = (type: string) => {
    setActiveTab('ddl');
    setEditableDdl(
      `-- Add new ${type} to ${selectedItem?.name}\nALTER TABLE \`${selectedItem?.name}\` ADD ...`,
    );
  };

  if (!selectedItem) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
        <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
          <Layout className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium">Object Detail</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Select an item from the sidebar to view its structure and definition.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-background border border-border rounded-none">
            {selectedItem.type === 'table' && (
              <Table className="w-5 h-5 text-primary" />
            )}
            {selectedItem.type === 'view' && (
              <Layout className="w-5 h-5 text-primary" />
            )}
            {selectedItem.type === 'procedure' && (
              <Code className="w-5 h-5 text-primary" />
            )}
            {selectedItem.type === 'trigger' && (
              <RefreshCw className="w-5 h-5 text-primary" />
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
          {(selectedItem.type === 'table' ||
            selectedItem.type === 'view' ||
            selectedItem.type === 'procedure') && (
            <>
              {(selectedItem.type === 'table' ||
                selectedItem.type === 'view') && (
                <button
                  onClick={() => setActiveTab('columns')}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-none transition-colors',
                    activeTab === 'columns'
                      ? 'bg-background shadow-sm'
                      : 'hover:bg-background/50',
                  )}
                >
                  <List className="w-3.5 h-3.5" />
                  Columns
                </button>
              )}
              {selectedItem.type === 'table' && (
                <>
                  <button
                    onClick={() => setActiveTab('indexes')}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-none transition-colors',
                      activeTab === 'indexes'
                        ? 'bg-background shadow-sm'
                        : 'hover:bg-background/50',
                    )}
                  >
                    <List className="w-3.5 h-3.5" />
                    Indexes
                  </button>
                  <button
                    onClick={() => setActiveTab('foreign-keys')}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-none transition-colors',
                      activeTab === 'foreign-keys'
                        ? 'bg-background shadow-sm'
                        : 'hover:bg-background/50',
                    )}
                  >
                    <List className="w-3.5 h-3.5" />
                    FKs
                  </button>
                  <button
                    onClick={() => setActiveTab('constraints')}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-none transition-colors',
                      activeTab === 'constraints'
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
                onClick={() => setActiveTab('data')}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-none transition-colors',
                  activeTab === 'data'
                    ? 'bg-background shadow-sm'
                    : 'hover:bg-background/50',
                )}
              >
                <Table2 className="w-3.5 h-3.5" />
                {selectedItem.type === 'procedure' ? 'Execution' : 'Data'}
              </button>
            </>
          )}
          <button
            onClick={() => setActiveTab('ddl')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-none transition-colors',
              activeTab === 'ddl'
                ? 'bg-background shadow-sm'
                : 'hover:bg-background/50',
            )}
          >
            <Code className="w-3.5 h-3.5" />
            Definition
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto flex flex-col">
        {activeTab === 'columns' &&
          (selectedItem.type === 'table' || selectedItem.type === 'view') && (
            <ColumnsTab
              tableName={selectedItem.name}
              columns={columns}
              isLoading={isLoadingColumns}
              onAdd={() => handleAddObject('column')}
              editColumnMutation={editColumnMutation}
              dropColumnMutation={dropColumnMutation}
            />
          )}

        {activeTab === 'indexes' && selectedItem.type === 'table' && (
          <IndexesTab
            indexes={indexes}
            isLoading={isLoadingIndexes}
            onAdd={() => handleAddObject('index')}
            dropIndexMutation={dropIndexMutation}
          />
        )}

        {activeTab === 'foreign-keys' && selectedItem.type === 'table' && (
          <ForeignKeysTab
            foreignKeys={foreignKeys}
            isLoading={isLoadingForeignKeys}
            onAdd={() => handleAddObject('foreign key')}
            dropForeignKeyMutation={dropForeignKeyMutation}
          />
        )}

        {activeTab === 'constraints' && selectedItem.type === 'table' && (
          <ConstraintsTab
            constraints={constraints}
            isLoading={isLoadingConstraints}
            onAdd={() => handleAddObject('constraint')}
            dropConstraintMutation={dropConstraintMutation}
          />
        )}

        {activeTab === 'data' &&
          (selectedItem.type === 'table' ||
            selectedItem.type === 'view' ||
            selectedItem.type === 'procedure') && (
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
            />
          )}

        {activeTab === 'ddl' && (
          <DdlTab
            isLoading={isLoadingDDL}
            editableDdl={editableDdl}
            setEditableDdl={setEditableDdl}
            updateDdlMutation={updateDdlMutation}
          />
        )}
      </div>
    </>
  );
}
