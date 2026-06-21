/**
 * Gamification Configuration
 * Centralized settings for the RPG engine to make it scalable and easy to balance.
 */

export const GAMIFICATION_CONFIG = {
  // Hardcore progression
  BASE_XP_REQUIREMENT: 10000,
  DIFFICULTY_CURVE: 2.2,
  
  // Daily login streak settings
  STREAK_BASE_XP: 25,
  STREAK_BONUS_PER_DAY: 5,
  STREAK_MAX_BONUS: 200,
};

/**
 * Calculates XP rewarded based on the complexity of the SQL query.
 */
export const calculateQueryXp = (sql: string): number => {
  const upperSql = sql.toUpperCase();
  let xp = 2; // Simple query base XP

  if (upperSql.includes('JOIN')) xp += 25;
  if (upperSql.includes('WITH ')) xp += 50; // CTE
  if (upperSql.includes('CREATE VIEW')) xp += 100;
  if (upperSql.includes('CREATE INDEX')) xp += 150;
  
  // Other potential complexities
  if (upperSql.includes('OVER (')) xp += 15; // Window function
  if (upperSql.split('SELECT').length > 2) xp += 10; // Subquery

  return xp;
};

/**
 * Calculates the current level based on total XP.
 * Formula: Level = floor((XP / BASE_XP_REQUIREMENT) ^ (1 / DIFFICULTY_CURVE)) + 1
 */
export const calculateLevel = (xp: number): number => {
  if (xp < GAMIFICATION_CONFIG.BASE_XP_REQUIREMENT) return 1;
  const level = Math.floor(Math.pow(xp / GAMIFICATION_CONFIG.BASE_XP_REQUIREMENT, 1 / GAMIFICATION_CONFIG.DIFFICULTY_CURVE)) + 1;
  return level;
};

/**
 * Calculates the total XP required to reach a specific level.
 * Formula: XP = BASE_XP_REQUIREMENT * ((Level - 1) ^ DIFFICULTY_CURVE)
 */
export const getXPForNextLevel = (level: number): number => {
  if (level === 1) return GAMIFICATION_CONFIG.BASE_XP_REQUIREMENT;
  return Math.floor(GAMIFICATION_CONFIG.BASE_XP_REQUIREMENT * Math.pow(level, GAMIFICATION_CONFIG.DIFFICULTY_CURVE));
};

/**
 * Returns a thematic title/rank based on the current level.
 */
export const getThematicLevelName = (level: number): string => {
  if (level < 5) return 'Data Novice';
  if (level < 10) return 'Query Scrapper';
  if (level < 15) return 'Schema Explorer';
  if (level < 20) return 'Query Knight';
  if (level < 30) return 'Database Artisan';
  if (level < 40) return 'Query Architect';
  if (level < 50) return 'Data Wizard';
  if (level < 75) return 'DBA Overlord';
  if (level < 100) return 'Grandmaster of Data';
  return 'God of Data';
};
