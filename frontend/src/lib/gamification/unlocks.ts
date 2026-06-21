export interface Perk {
  id: string;
  title: string;
  description: string;
  requiredLevel: number;
  icon: string;
}

/**
 * List of unlockable features (bonuses) in the application.
 * As the user levels up, these features become permanently unlocked.
 * UI components can check `useGamificationStore(s => s.unlockedPerks.includes('perk_id'))`
 * to conditionally render or enable these features.
 */
export const APP_PERKS: Perk[] = [
  {
    id: 'theme_customizer',
    title: 'Advanced Theming',
    description: 'Unlock custom RGB themes and dynamic backgrounds for the editor.',
    requiredLevel: 5,
    icon: 'Palette',
  },
  {
    id: 'ai_assistant',
    title: 'AI Query Assistant',
    description: 'Unlock the AI-powered SQL generator and automated optimizer.',
    requiredLevel: 10,
    icon: 'Bot',
  },
  {
    id: 'data_visualizer',
    title: 'Data Visualizer',
    description: 'Unlock one-click charts, graphs, and visual dashboards for your query results.',
    requiredLevel: 15,
    icon: 'LineChart',
  },
  {
    id: 'query_scheduler',
    title: 'Query Scheduler',
    description: 'Automate queries to run in the background on a cron schedule.',
    requiredLevel: 20,
    icon: 'Clock',
  },
  {
    id: 'multi_connection',
    title: 'Cross-DB Sync',
    description: 'Run queries and join data across multiple databases simultaneously.',
    requiredLevel: 30,
    icon: 'Network',
  }
];
