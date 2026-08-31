export interface Perk {
  id: string;
  title: string;
  description: string;
  requiredLevel: number;
  requiredQuests: string[];
  icon: string;
}



export const APP_PERKS: Perk[] = [
  {
    id: 'theme_customizer',
    title: 'Advanced Theming',
    description: 'Unlock custom RGB themes and dynamic backgrounds for the editor.',
    requiredLevel: 1,
    requiredQuests: [],
    icon: 'Palette',
  },
  {
    id: 'ai_assistant',
    title: 'AI Query Assistant',
    description: 'Unlock the AI-powered SQL generator and automated optimizer.',
    requiredLevel: 1,
    requiredQuests: [],
    icon: 'Bot',
  },
  {
    id: 'data_visualizer',
    title: 'Data Visualizer',
    description: 'Unlock one-click charts, graphs, and visual dashboards for your query results.',
    requiredLevel: 15,
    requiredQuests: [],
    icon: 'LineChart',
  },
  {
    id: 'query_scheduler',
    title: 'Query Scheduler',
    description: 'Automate queries to run in the background on a cron schedule.',
    requiredLevel: 1,
    requiredQuests: [],
    icon: 'Clock',
  },
  {
    id: 'multi_connection',
    title: 'Cross-DB Sync',
    description: 'Run queries and join data across multiple databases simultaneously.',
    requiredLevel: 1,
    requiredQuests: [],
    icon: 'Network',
  },
  {
    id: 'schema_diagram',
    title: 'Schema Diagram',
    description: 'Visualize your database schema with interactive entity-relationship diagrams.',
    requiredLevel: 1,
    requiredQuests: [],
    icon: 'GitBranch',
  }
];
