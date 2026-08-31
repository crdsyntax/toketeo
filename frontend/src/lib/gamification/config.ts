



export const GAMIFICATION_CONFIG = {

  BASE_XP_REQUIREMENT: 10000,
  DIFFICULTY_CURVE: 2.2,


  STREAK_BASE_XP: 25,
  STREAK_BONUS_PER_DAY: 5,
  STREAK_MAX_BONUS: 200,
};



export const hashQuery = (sql: string): string => {
  const normalized = sql.trim().replace(/\s+/g, ' ').toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
};



export const calculateQueryXp = (sql: string, isFirstTime: boolean = false): number => {
  const upperSql = sql.toUpperCase();
  const normalized = upperSql.replace(/\s+/g, ' ');
  let xp = 2;
  let complexityScore = 0;


  const joinCount = (normalized.match(/\bJOIN\b/g) || []).length;
  if (joinCount === 1) { xp += 25; complexityScore += 1; }
  else if (joinCount >= 2) { xp += 25 + (joinCount - 1) * 15; complexityScore += joinCount; }


  if (upperSql.includes('WITH ') && normalized.match(/\bWITH\b/g)!.length > 1) {
    xp += 50; complexityScore += 2;
  } else if (upperSql.includes('WITH ')) {
    xp += 50; complexityScore += 2;
  }


  if (/\bCREATE\s+(OR\s+REPLACE\s+)?VIEW\b/i.test(sql)) { xp += 100; complexityScore += 4; }


  if (/\bCREATE\s+(UNIQUE\s+)?INDEX\b/i.test(sql)) { xp += 150; complexityScore += 5; }


  if (/\bCREATE\s+TABLE.*\bAS\b\s*$/i.test(sql.trim().replace(/[\n\r]/g, ' '))) { xp += 80; complexityScore += 3; }


  if (/\bALTER\s+TABLE\b/i.test(sql)) { xp += 40; complexityScore += 2; }


  if (/\bDROP\s+(TABLE|VIEW|INDEX|PROCEDURE|FUNCTION|TRIGGER)\b/i.test(sql)) { xp += 30; complexityScore += 1; }


  if (/\bOVER\s*\(/i.test(sql)) { xp += 15; complexityScore += 1; }


  const selectCount = upperSql.split('SELECT').length - 1;
  if (selectCount > 2) { xp += 10 * (selectCount - 1); complexityScore += selectCount - 1; }


  if (/\bUNION(\s+ALL)?\b/i.test(sql)) { xp += 20; complexityScore += 1; }
  if (/\bINTERSECT\b/i.test(sql)) { xp += 15; complexityScore += 1; }
  if (/\bEXCEPT\b/i.test(sql)) { xp += 15; complexityScore += 1; }


  if (/\bGROUP\s+BY\b/i.test(sql)) { xp += 10; complexityScore += 1; }
  if (/\bHAVING\b/i.test(sql)) { xp += 10; complexityScore += 1; }


  if (/\bDISTINCT\b/i.test(sql)) { xp += 5; }


  if (/\bINSERT\s+INTO\b.*\bSELECT\b/i.test(sql)) { xp += 30; complexityScore += 1; }


  if (isFirstTime && complexityScore >= 3) {
    xp = Math.round(xp * 1.5);
  }

  return xp;
};



export const calculateLevel = (xp: number): number => {
  if (xp < GAMIFICATION_CONFIG.BASE_XP_REQUIREMENT) return 1;
  const level = Math.floor(Math.pow(xp / GAMIFICATION_CONFIG.BASE_XP_REQUIREMENT, 1 / GAMIFICATION_CONFIG.DIFFICULTY_CURVE)) + 1;
  return level;
};



export const getXPForNextLevel = (level: number): number => {
  if (level === 1) return GAMIFICATION_CONFIG.BASE_XP_REQUIREMENT;
  return Math.floor(GAMIFICATION_CONFIG.BASE_XP_REQUIREMENT * Math.pow(level, GAMIFICATION_CONFIG.DIFFICULTY_CURVE));
};



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
