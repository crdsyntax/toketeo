export interface Perk {
  id: string;
  title: string;
  description: string;
  requiredLevel: number;
  requiredQuests: string[];
  icon: string;
}

/**
 * Perk configuration file.
 *
 * Add or remove perks from this array to control which features
 * are unlockable. Each perk can require:
 *   - requiredLevel: minimum player level
 *   - requiredQuests: array of quest/mission IDs that must be completed
 *
 * Quest IDs reference the `id` field in missions.ts.
 */
export const APP_PERKS: Perk[] = [
  {
    id: 'theme_customizer',
    title: 'Advanced Theming',
    description: 'Unlock custom RGB themes and dynamic backgrounds for the editor.',
    requiredLevel: 5,
    requiredQuests: ['first_blood', 'connection_first'],
    icon: 'Palette',
  },
  {
    id: 'ai_assistant',
    title: 'AI Query Assistant',
    description: 'Unlock the AI-powered SQL generator and automated optimizer.',
    requiredLevel: 10,
    requiredQuests: ['query_novice', 'connection_explorer', 'first_edit'],
    icon: 'Bot',
  },
  {
    id: 'data_visualizer',
    title: 'Data Visualizer',
    description: 'Unlock one-click charts, graphs, and visual dashboards for your query results.',
    requiredLevel: 15,
    requiredQuests: ['query_adept', 'exporter_first'],
    icon: 'LineChart',
  },
  {
    id: 'query_scheduler',
    title: 'Query Scheduler',
    description: 'Automate queries to run in the background on a cron schedule.',
    requiredLevel: 20,
    requiredQuests: ['query_master', 'data_janitor', 'exporter_adept'],
    icon: 'Clock',
  },
  {
    id: 'multi_connection',
    title: 'Cross-DB Sync',
    description: 'Run queries and join data across multiple databases simultaneously.',
    requiredLevel: 30,
    requiredQuests: ['query_grandmaster', 'connection_collector', 'data_surgeon'],
    icon: 'Network',
  }
];
