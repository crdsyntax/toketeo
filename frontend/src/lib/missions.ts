export type MissionType = 'EXECUTE_QUERY' | 'EDIT_ROW' | 'CREATE_CONNECTION' | 'DAILY_LOGIN' | 'EXPORT_DATA';

export interface Mission {
  id: string;
  title: string;
  description: string;
  type: MissionType;
  targetCount: number;
  xpReward: number;
  icon: string;
}

export const MISSIONS: Mission[] = [
  {
    id: 'first_blood',
    title: 'First Blood',
    description: 'Execute your first SQL query',
    type: 'EXECUTE_QUERY',
    targetCount: 1,
    xpReward: 50,
    icon: 'Terminal',
  },
  {
    id: 'query_novice',
    title: 'Query Novice',
    description: 'Execute 50 SQL queries',
    type: 'EXECUTE_QUERY',
    targetCount: 50,
    xpReward: 200,
    icon: 'Code2',
  },
  {
    id: 'query_master',
    title: 'Query Master',
    description: 'Execute 500 SQL queries',
    type: 'EXECUTE_QUERY',
    targetCount: 500,
    xpReward: 1000,
    icon: 'Cpu',
  },
  {
    id: 'data_janitor',
    title: 'Data Janitor',
    description: 'Edit 5 rows directly in the explorer',
    type: 'EDIT_ROW',
    targetCount: 5,
    xpReward: 100,
    icon: 'Edit',
  },
  {
    id: 'connection_first',
    title: 'Networker',
    description: 'Create your first database connection',
    type: 'CREATE_CONNECTION',
    targetCount: 1,
    xpReward: 50,
    icon: 'Database',
  },
  {
    id: 'exporter_first',
    title: 'Data Hoarder',
    description: 'Export query results to CSV/JSON for the first time',
    type: 'EXPORT_DATA',
    targetCount: 1,
    xpReward: 80,
    icon: 'Download',
  }
];
