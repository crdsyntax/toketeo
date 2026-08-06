import {
  Database,
  Leaf,
  Zap,
  Circle,
  Server,
  HardDrive,
} from 'lucide-react'
import { DatabaseType } from '@/types/database'
import type { LucideIcon } from 'lucide-react'

interface EngineConfig {
  icon: LucideIcon
  label: string
  color: string
  bgClass: string
  textClass: string
  borderClass: string
}

export const ENGINE_CONFIG: Record<DatabaseType, EngineConfig> = {
  [DatabaseType.POSTGRES]: {
    icon: Database,
    label: 'PostgreSQL',
    color: '#60a5fa',
    bgClass: 'bg-blue-500/10',
    textClass: 'text-blue-400',
    borderClass: 'border-blue-500/30',
  },
  [DatabaseType.MARIADB]: {
    icon: Database,
    label: 'MariaDB',
    color: '#06b6d4',
    bgClass: 'bg-cyan-500/10',
    textClass: 'text-cyan-400',
    borderClass: 'border-cyan-500/30',
  },
  [DatabaseType.MYSQL]: {
    icon: Database,
    label: 'MySQL',
    color: '#f97316',
    bgClass: 'bg-orange-500/10',
    textClass: 'text-orange-400',
    borderClass: 'border-orange-500/30',
  },
  [DatabaseType.MONGODB]: {
    icon: Leaf,
    label: 'MongoDB',
    color: '#22c55e',
    bgClass: 'bg-green-500/10',
    textClass: 'text-green-400',
    borderClass: 'border-green-500/30',
  },
  [DatabaseType.SQLSERVER]: {
    icon: Server,
    label: 'SQL Server',
    color: '#ef4444',
    bgClass: 'bg-red-500/10',
    textClass: 'text-red-400',
    borderClass: 'border-red-500/30',
  },
  [DatabaseType.SQLITE]: {
    icon: HardDrive,
    label: 'SQLite',
    color: '#a855f7',
    bgClass: 'bg-purple-500/10',
    textClass: 'text-purple-400',
    borderClass: 'border-purple-500/30',
  },
  [DatabaseType.REDIS]: {
    icon: Zap,
    label: 'Redis',
    color: '#f59e0b',
    bgClass: 'bg-amber-500/10',
    textClass: 'text-amber-400',
    borderClass: 'border-amber-500/30',
  },
}

export const ENGINE_ORDER: DatabaseType[] = [
  DatabaseType.POSTGRES,
  DatabaseType.MARIADB,
  DatabaseType.MYSQL,
  DatabaseType.MONGODB,
  DatabaseType.SQLSERVER,
  DatabaseType.SQLITE,
  DatabaseType.REDIS,
]

export function getEngineConfig(type: DatabaseType): EngineConfig {
  return ENGINE_CONFIG[type] || ENGINE_CONFIG[DatabaseType.POSTGRES]
}
