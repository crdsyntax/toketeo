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
  // EXECUTE_QUERY Tier
  { id: 'first_blood', title: 'First Blood', description: 'Execute your first SQL query', type: 'EXECUTE_QUERY', targetCount: 1, xpReward: 250, icon: 'Swords' },
  { id: 'query_novice', title: 'Query Novice', description: 'Execute 50 SQL queries', type: 'EXECUTE_QUERY', targetCount: 50, xpReward: 500, icon: 'Crosshair' },
  { id: 'query_adept', title: 'Query Adept', description: 'Execute 200 SQL queries', type: 'EXECUTE_QUERY', targetCount: 200, xpReward: 1000, icon: 'Wand2' },
  { id: 'query_master', title: 'Query Master', description: 'Execute 500 SQL queries', type: 'EXECUTE_QUERY', targetCount: 500, xpReward: 2500, icon: 'Zap' },
  { id: 'query_grandmaster', title: 'Query Grandmaster', description: 'Execute 2000 SQL queries', type: 'EXECUTE_QUERY', targetCount: 2000, xpReward: 10000, icon: 'Flame' },
  { id: 'query_god', title: 'God of Queries', description: 'Execute 10000 SQL queries', type: 'EXECUTE_QUERY', targetCount: 10000, xpReward: 50000, icon: 'Skull' },

  // EDIT_ROW Tier
  { id: 'first_edit', title: 'First Edit', description: 'Edit your first row directly', type: 'EDIT_ROW', targetCount: 1, xpReward: 250, icon: 'Hammer' },
  { id: 'data_janitor', title: 'Data Janitor', description: 'Edit 5 rows directly in the explorer', type: 'EDIT_ROW', targetCount: 5, xpReward: 500, icon: 'Wrench' },
  { id: 'data_surgeon', title: 'Data Surgeon', description: 'Edit 50 rows directly', type: 'EDIT_ROW', targetCount: 50, xpReward: 1500, icon: 'Anvil' },
  { id: 'data_manipulator', title: 'Data Manipulator', description: 'Edit 200 rows directly', type: 'EDIT_ROW', targetCount: 200, xpReward: 5000, icon: 'Pickaxe' },
  { id: 'reality_bender', title: 'Reality Bender', description: 'Edit 1000 rows directly', type: 'EDIT_ROW', targetCount: 1000, xpReward: 25000, icon: 'Sparkles' },

  // CREATE_CONNECTION Tier
  { id: 'connection_first', title: 'Networker', description: 'Create your first database connection', type: 'CREATE_CONNECTION', targetCount: 1, xpReward: 250, icon: 'Map' },
  { id: 'connection_explorer', title: 'Explorer', description: 'Create 3 database connections', type: 'CREATE_CONNECTION', targetCount: 3, xpReward: 1000, icon: 'Compass' },
  { id: 'connection_collector', title: 'Collector', description: 'Create 10 database connections', type: 'CREATE_CONNECTION', targetCount: 10, xpReward: 5000, icon: 'Castle' },

  // EXPORT_DATA Tier
  { id: 'exporter_first', title: 'Data Hoarder', description: 'Export query results to CSV/JSON for the first time', type: 'EXPORT_DATA', targetCount: 1, xpReward: 250, icon: 'ScrollText' },
  { id: 'exporter_adept', title: 'Data Smuggler', description: 'Export data 10 times', type: 'EXPORT_DATA', targetCount: 10, xpReward: 1000, icon: 'BookOpen' },
  { id: 'exporter_master', title: 'Data Merchant', description: 'Export data 50 times', type: 'EXPORT_DATA', targetCount: 50, xpReward: 5000, icon: 'Backpack' },
  { id: 'exporter_god', title: 'Data Monopolist', description: 'Export data 200 times', type: 'EXPORT_DATA', targetCount: 200, xpReward: 20000, icon: 'Gem' },
  
  // DAILY_LOGIN Tier
  { id: 'login_first', title: 'New Arrival', description: 'Login for the first time', type: 'DAILY_LOGIN', targetCount: 1, xpReward: 250, icon: 'Sunrise' },
  { id: 'login_week', title: 'Consistent', description: 'Login for 7 days total', type: 'DAILY_LOGIN', targetCount: 7, xpReward: 1000, icon: 'Hourglass' },
  { id: 'login_month', title: 'Dedicated', description: 'Login for 30 days total', type: 'DAILY_LOGIN', targetCount: 30, xpReward: 5000, icon: 'CalendarClock' },
  { id: 'login_year', title: 'Veteran', description: 'Login for 365 days total', type: 'DAILY_LOGIN', targetCount: 365, xpReward: 50000, icon: 'Crown' }
];
