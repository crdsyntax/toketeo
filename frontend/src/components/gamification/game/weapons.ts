import type { WeaponId } from './types'

export interface WeaponDef {
  id: WeaponId
  name: string
  attackDur: number
  attackCd: number
  damage: number
  reach: number
  hitHeight: number
  hitYOffset: number
  activeStart: number
  activeEnd: number
  scorePerKill: number
  projectile: boolean
  projectileSpeed: number
  projectileDamage: number
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sword: {
    id: 'sword',
    name: 'Penitent Blade',
    attackDur: 260,
    attackCd: 320,
    damage: 2,
    reach: 30,
    hitHeight: 34,
    hitYOffset: -10,
    activeStart: 40,
    activeEnd: 200,
    scorePerKill: 25,
    projectile: false,
    projectileSpeed: 0,
    projectileDamage: 0,
  },
  staff: {
    id: 'staff',
    name: 'Void Staff',
    attackDur: 340,
    attackCd: 480,
    damage: 1,
    reach: 22,
    hitHeight: 28,
    hitYOffset: -6,
    activeStart: 80,
    activeEnd: 240,
    scorePerKill: 30,
    projectile: true,
    projectileSpeed: 380,
    projectileDamage: 2,
  },
}

export const WEAPON_ORDER: WeaponId[] = ['sword', 'staff']
