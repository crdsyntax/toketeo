import type {
  DatabaseObject,
  ColumnResponse,
  QueryResult,
  IndexResponse,
  ForeignKeyResponse,
  ConstraintResponse,
  DbRow,
  DbValue,
  Connection,
} from '@/types/database';
import { ExecutionStatus, ExplorerTab, DatabaseObjectType } from '@/types/database';
import { Table2, Eye, Terminal, Zap, List, Table, Database, Binary, X, Code } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UseMutationResult } from '@tanstack/react-query';
import { ColumnsTab } from './tabs/ColumnsTab';
import { IndexesTab } from './tabs/IndexesTab';
import { ForeignKeysTab } from './tabs/ForeignKeysTab';
import { ConstraintsTab } from './tabs/ConstraintsTab';
import { DataTab } from './tabs/DataTab';
import { RedisDataTab } from './tabs/RedisDataTab';
import { DdlTab } from './tabs/DdlTab';
import { ModelExportModal } from './ModelExportModal';
import type { ExplorerTabState } from '@/store/useAppStore';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { AddColumnModal } from './AddColumnModal';
import { AddIndexModal } from './AddIndexModal';
import { AddForeignKeyModal } from './AddForeignKeyModal';

interface ObjectDetailProps {
  explorerTabs: Record<string, ExplorerTabState>;
  activeExplorerTabId: string | null;
  removeExplorerTab: (id: string) => void;
  setExplorerState: (state: Partial<{ activeExplorerTabId: string | null }>) => void;
  connection?: Connection | null;
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
  refreshExplorerData: () => void;
  isLoadingDDL: boolean;
  errorDDL: Error | null;
  editableDdl: string;
  setEditableDdl: (ddl: string) => void;
  updateDdlMutation: UseMutationResult<unknown, Error, string>;
  editColumnMutation: UseMutationResult<unknown, Error, string>;
  dropColumnMutation: UseMutationResult<unknown, Error, string>;
  dropIndexMutation: UseMutationResult<unknown, Error, string>;
  renameIndexMutation: UseMutationResult<unknown, Error, { oldName: string; newName: string }>;
  dropForeignKeyMutation: UseMutationResult<unknown, Error, string>;
  renameForeignKeyMutation: UseMutationResult<unknown, Error, { oldName: string; newName: string }>;
  dropConstraintMutation: UseMutationResult<unknown, Error, string>;
  filter: string;
  setFilter: (f: string) => void;
  currentSchema?: string;
  isMongoDB?: boolean;
  isRedis?: boolean;
}

export function ObjectDetail(props: ObjectDetailProps) {
  const {
    explorerTabs,
    activeExplorerTabId,
    removeExplorerTab,
    setExplorerState,
    connection,
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
    refreshExplorerData,
    isLoadingDDL,
    errorDDL,
    editableDdl,
    setEditableDdl,
    updateDdlMutation,
    editColumnMutation,
    dropColumnMutation,
    dropIndexMutation,
    renameIndexMutation,
    dropForeignKeyMutation,
    renameForeignKeyMutation,
    dropConstraintMutation,
    filter,
    setFilter,
    currentSchema,
    isMongoDB = false,
    isRedis = false,
  } = props;
  
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [addIndexOpen, setAddIndexOpen] = useState(false);
  const [addFKOpen, setAddFKOpen] = useState(false);
  const storeConnection = useAppStore((s) => s.activeConnection);
  const activeConnection = connection ?? storeConnection;

  const handleAddObject = (type: string) => {
    if (type === 'column') {
      setAddColumnOpen(true);
      return;
    }
    if (type === 'index') {
      setAddIndexOpen(true);
      return;
    }
    if (type === 'foreign key') {
      setAddFKOpen(true);
      return;
    }
    setActiveTab(ExplorerTab.DDL);
    setEditableDdl(
      `-- Add new ${type} to ${selectedItem?.name}\nALTER TABLE \`${selectedItem?.name}\` ADD ...`,
    );
  };

  const getObjectIcon = (type: DatabaseObjectType) => {
    switch (type) {
      case DatabaseObjectType.TABLE: return <Table2 className="w-4 h-4" />;
      case DatabaseObjectType.VIEW: return <Eye className="w-4 h-4" />;
      case DatabaseObjectType.PROCEDURE: return <Terminal className="w-4 h-4" />;
      case DatabaseObjectType.TRIGGER: return <Zap className="w-4 h-4" />;
      case DatabaseObjectType.FUNCTION: return <Binary className="w-4 h-4" />;
      default: return <Table2 className="w-4 h-4" />;
    }
  };

  const tabs = Object.values(explorerTabs).filter(
    (tab) => tab.id && tab.selectedItem?.name && tab.selectedItem?.type,
  );

  if (tabs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
        <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
          <Database className="w-8 h-8 text-muted-foreground" />
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
      {/* Tab Bar */}
      <div className="flex bg-muted/30 border-b border-border overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setExplorerState({ activeExplorerTabId: tab.id })}
            className={cn(
              'group flex items-center gap-2 px-4 py-2 text-xs font-medium border-r border-border cursor-pointer min-w-[120px] max-w-[200px] transition-colors relative',
              activeExplorerTabId === tab.id
                ? 'bg-background border-t-2 border-t-primary border-b-transparent'
                : 'hover:bg-background/50',
            )}
          >
            <span className="text-primary/70">{getObjectIcon(tab.selectedItem.type)}</span>
            <span className="truncate flex-1">{tab.selectedItem.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeExplorerTab(tab.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted rounded-sm transition-all"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-background border border-border rounded-none">
            {selectedItem?.type === DatabaseObjectType.TABLE && (
              <Table2 className="w-5 h-5 text-primary" />
            )}
            {selectedItem?.type === DatabaseObjectType.VIEW && (
              <Eye className="w-5 h-5 text-primary" />
            )}
            {selectedItem?.type === DatabaseObjectType.PROCEDURE && (
              <Terminal className="w-5 h-5 text-primary" />
            )}
            {selectedItem?.type === DatabaseObjectType.TRIGGER && (
              <Zap className="w-5 h-5 text-primary" />
            )}
            {selectedItem?.type === DatabaseObjectType.FUNCTION && (
              <Binary className="w-5 h-5 text-primary" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-lg">{selectedItem?.name}</h3>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
              {selectedItem?.type}
            </p>
          </div>
        </div>

        {/* === TABS NAV === */}
        <div className="flex bg-muted p-1 rounded-none items-center">
          {isRedis ? (
            <>
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
                Keys
              </button>
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
                Command
              </button>
            </>
          ) : (
            <>
              {(selectedItem?.type === DatabaseObjectType.TABLE ||
                selectedItem?.type === DatabaseObjectType.VIEW ||
                selectedItem?.type === DatabaseObjectType.PROCEDURE) && (
                <>
                  {(selectedItem?.type === DatabaseObjectType.TABLE ||
                    selectedItem?.type === DatabaseObjectType.VIEW) && (
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
                      {isMongoDB ? 'Schema' : 'Columns'}
                    </button>
                  )}
                  {selectedItem?.type === DatabaseObjectType.TABLE && (
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
                      {!isMongoDB && (
                        <>
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
                    {selectedItem?.type === DatabaseObjectType.PROCEDURE ? 'Execution' : 'Data'}
                  </button>
                </>
              )}
              {!isMongoDB && (
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
              )}
            </>
          )}
          
          {selectedItem?.type === DatabaseObjectType.TABLE && (
            <button
              onClick={() => setModelModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-none transition-colors hover:bg-background/50 text-secondary-foreground ml-auto"
              title="Export Model"
            >
              <Code className="w-3.5 h-3.5" />
              Export Model
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto flex flex-col">
        {activeTab === ExplorerTab.COLUMNS &&
          selectedItem && (selectedItem.type === DatabaseObjectType.TABLE || selectedItem.type === DatabaseObjectType.VIEW) && (
            <ColumnsTab
              tableName={selectedItem.name}
              columns={columns}
              isLoading={isLoadingColumns}
              onAdd={() => handleAddObject('column')}
              editColumnMutation={editColumnMutation}
              dropColumnMutation={dropColumnMutation}
              isMongoDB={isMongoDB}
              isRedis={isRedis}
            />
          )}

        {activeTab === ExplorerTab.INDEXES && selectedItem && selectedItem.type === DatabaseObjectType.TABLE && (
          <IndexesTab
            indexes={indexes}
            isLoading={isLoadingIndexes}
            onAdd={() => handleAddObject('index')}
            dropIndexMutation={dropIndexMutation}
            renameIndexMutation={renameIndexMutation}
          />
        )}

        {activeTab === ExplorerTab.FOREIGN_KEYS && selectedItem && selectedItem.type === DatabaseObjectType.TABLE && (
          <ForeignKeysTab
            foreignKeys={foreignKeys}
            isLoading={isLoadingForeignKeys}
            onAdd={() => handleAddObject('foreign key')}
            dropForeignKeyMutation={dropForeignKeyMutation}
            renameForeignKeyMutation={renameForeignKeyMutation}
          />
        )}

        {activeTab === ExplorerTab.CONSTRAINTS && selectedItem && selectedItem.type === DatabaseObjectType.TABLE && (
          <ConstraintsTab
            constraints={constraints}
            isLoading={isLoadingConstraints}
            onAdd={() => handleAddObject('constraint')}
            dropConstraintMutation={dropConstraintMutation}
          />
        )}

        {activeTab === ExplorerTab.DATA &&
          selectedItem &&
          (selectedItem.type === DatabaseObjectType.TABLE ||
            selectedItem.type === DatabaseObjectType.VIEW ||
            selectedItem.type === DatabaseObjectType.PROCEDURE) && (
            isRedis ? (
              <RedisDataTab
                selectedItem={selectedItem}
                connection={activeConnection}
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
                filter={filter}
                setFilter={setFilter}
              />
            ) : (
              <DataTab
                selectedItem={selectedItem}
                connection={activeConnection}
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
                filter={filter}
                setFilter={setFilter}
              />
            )
          )}

        {activeTab === ExplorerTab.DDL && (
          <DdlTab
            isLoading={isLoadingDDL}
            error={errorDDL}
            editableDdl={editableDdl}
            setEditableDdl={setEditableDdl}
            updateDdlMutation={updateDdlMutation}
          />
        )}
      </div>

      {selectedItem?.type === DatabaseObjectType.TABLE && (
        <ModelExportModal 
          isOpen={modelModalOpen} 
          onClose={() => setModelModalOpen(false)} 
          tableName={selectedItem.name} 
          schema={currentSchema}
          connection={activeConnection}
        />
      )}

      {addColumnOpen && activeConnection && selectedItem && (
        <AddColumnModal
          open={addColumnOpen}
          onClose={() => setAddColumnOpen(false)}
          tableName={selectedItem.name}
          schema={currentSchema}
          connectionId={activeConnection.id}
          isMongoDB={isMongoDB}
          onCreated={() => {
            setAddColumnOpen(false)
            refreshExplorerData()
          }}
        />
      )}

      {addIndexOpen && activeConnection && selectedItem && (
        <AddIndexModal
          open={addIndexOpen}
          onClose={() => setAddIndexOpen(false)}
          tableName={selectedItem.name}
          schema={currentSchema}
          connectionId={activeConnection.id}
          availableColumns={columns?.map(c => c.name) || []}
          onCreated={() => {
            setAddIndexOpen(false)
            refreshExplorerData()
          }}
        />
      )}

      {addFKOpen && activeConnection && selectedItem && (
        <AddForeignKeyModal
          open={addFKOpen}
          onClose={() => setAddFKOpen(false)}
          tableName={selectedItem.name}
          schema={currentSchema}
          connectionId={activeConnection.id}
          availableColumns={columns?.map(c => c.name) || []}
          onCreated={() => {
            setAddFKOpen(false)
            refreshExplorerData()
          }}
        />
      )}
    </>
  );
}
