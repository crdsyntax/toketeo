import type { MapDefinition } from './types'
import { TILE } from './constants'

/** Easy — short pilgrimage, sparse hazards */
const penitentsPath: MapDefinition = {
  id: 'penitents-path',
  name: "Penitent's Path",
  subtitle: 'A gentle walk through the outer ruins',
  difficulty: 'easy',
  cols: 120,
  rows: 18,
  ground: [
    { x: 0, y: 15, w: 28, h: 3 },
    { x: 32, y: 15, w: 20, h: 3 },
    { x: 56, y: 15, w: 24, h: 3 },
    { x: 84, y: 15, w: 18, h: 3 },
    { x: 106, y: 15, w: 14, h: 3 },
  ],
  platforms: [
    { x: 28, y: 13, w: 4, h: 1 },
    { x: 40, y: 12, w: 4, h: 1 },
    { x: 52, y: 13, w: 4, h: 1 },
    { x: 68, y: 12, w: 5, h: 1 },
    { x: 80, y: 13, w: 4, h: 1 },
    { x: 96, y: 12, w: 4, h: 1 },
    { x: 102, y: 13, w: 4, h: 1 },
  ],
  spikes: [
    { x: 42, y: 14 },
    { x: 70, y: 14 },
    { x: 98, y: 14 },
  ],
  enemies: [
    { x: 18, y: 13 },
    { x: 38, y: 13 },
    { x: 62, y: 13 },
    { x: 90, y: 13 },
    { x: 110, y: 13 },
  ],
  spawn: { x: 2, y: 13 },
  shrine: { x: 110, y: 13, w: 3, h: 2 },
  enemyHp: 1,
  enemySpeed: 35,
  lives: 5,
  clearBonus: 150,
}

/** Medium — original-style mesa climb with denser packs */
const corruptedCatacombs: MapDefinition = {
  id: 'corrupted-catacombs',
  name: 'Corrupted Catacombs',
  subtitle: 'Climb the broken mesas. Watch every ledge.',
  difficulty: 'medium',
  cols: 160,
  rows: 18,
  ground: [
    { x: 0, y: 15, w: 20, h: 3 },
    { x: 24, y: 15, w: 14, h: 3 },
    { x: 41, y: 15, w: 14, h: 3 },
    { x: 55, y: 12, w: 8, h: 6 },
    { x: 67, y: 15, w: 18, h: 3 },
    { x: 90, y: 10, w: 15, h: 8 },
    { x: 105, y: 15, w: 22, h: 3 },
    { x: 130, y: 15, w: 19, h: 3 },
    { x: 149, y: 15, w: 11, h: 3 },
  ],
  platforms: [
    { x: 20, y: 12, w: 4, h: 1 },
    { x: 31, y: 11, w: 4, h: 1 },
    { x: 43, y: 12, w: 4, h: 1 },
    { x: 49, y: 10, w: 3, h: 1 },
    { x: 54, y: 13, w: 2, h: 1 },
    { x: 63, y: 13, w: 3, h: 1 },
    { x: 68, y: 12, w: 4, h: 1 },
    { x: 74, y: 10, w: 4, h: 1 },
    { x: 80, y: 12, w: 4, h: 1 },
    { x: 85, y: 13, w: 2, h: 1 },
    { x: 87, y: 11, w: 2, h: 1 },
    { x: 106, y: 12, w: 4, h: 1 },
    { x: 116, y: 11, w: 4, h: 1 },
    { x: 127, y: 13, w: 3, h: 1 },
    { x: 131, y: 11, w: 4, h: 1 },
    { x: 144, y: 12, w: 4, h: 1 },
  ],
  spikes: [
    { x: 30, y: 14 }, { x: 31, y: 14 },
    { x: 112, y: 14 }, { x: 113, y: 14 }, { x: 114, y: 14 },
    { x: 140, y: 14 }, { x: 141, y: 14 },
  ],
  enemies: [
    { x: 46, y: 13 }, { x: 72, y: 13 }, { x: 79, y: 13 }, { x: 96, y: 8 },
    { x: 110, y: 13 }, { x: 120, y: 13 }, { x: 136, y: 13 }, { x: 145, y: 13 },
  ],
  spawn: { x: 2, y: 13 },
  shrine: { x: 152, y: 13, w: 3, h: 2 },
  enemyHp: 2,
  enemySpeed: 48,
  lives: 5,
  clearBonus: 200,
}

/** Hard — long gauntlet, tight jumps, dense spikes & packs */
const voidAscent: MapDefinition = {
  id: 'void-ascent',
  name: 'Void Ascent',
  subtitle: 'No mercy. Precision or penance.',
  difficulty: 'hard',
  cols: 180,
  rows: 18,
  ground: [
    { x: 0, y: 15, w: 14, h: 3 },
    { x: 18, y: 15, w: 10, h: 3 },
    { x: 32, y: 14, w: 8, h: 4 },
    { x: 46, y: 15, w: 12, h: 3 },
    { x: 62, y: 12, w: 6, h: 6 },
    { x: 72, y: 15, w: 10, h: 3 },
    { x: 88, y: 11, w: 10, h: 7 },
    { x: 104, y: 15, w: 14, h: 3 },
    { x: 124, y: 13, w: 8, h: 5 },
    { x: 138, y: 15, w: 12, h: 3 },
    { x: 156, y: 12, w: 10, h: 6 },
    { x: 170, y: 15, w: 10, h: 3 },
  ],
  platforms: [
    { x: 14, y: 13, w: 3, h: 1 },
    { x: 28, y: 12, w: 3, h: 1 },
    { x: 40, y: 11, w: 3, h: 1 },
    { x: 42, y: 13, w: 3, h: 1 },
    { x: 58, y: 13, w: 3, h: 1 },
    { x: 68, y: 13, w: 3, h: 1 },
    { x: 82, y: 13, w: 3, h: 1 },
    { x: 84, y: 11, w: 3, h: 1 },
    { x: 98, y: 13, w: 3, h: 1 },
    { x: 100, y: 10, w: 3, h: 1 },
    { x: 118, y: 12, w: 4, h: 1 },
    { x: 132, y: 11, w: 3, h: 1 },
    { x: 150, y: 13, w: 4, h: 1 },
    { x: 152, y: 11, w: 3, h: 1 },
    { x: 166, y: 13, w: 3, h: 1 },
  ],
  spikes: [
    { x: 20, y: 14 }, { x: 21, y: 14 },
    { x: 34, y: 13 }, { x: 35, y: 13 },
    { x: 50, y: 14 }, { x: 51, y: 14 }, { x: 52, y: 14 },
    { x: 74, y: 14 }, { x: 75, y: 14 },
    { x: 92, y: 10 }, { x: 93, y: 10 },
    { x: 108, y: 14 }, { x: 109, y: 14 }, { x: 110, y: 14 },
    { x: 126, y: 12 }, { x: 127, y: 12 },
    { x: 142, y: 14 }, { x: 143, y: 14 }, { x: 144, y: 14 },
    { x: 160, y: 11 }, { x: 161, y: 11 },
  ],
  enemies: [
    { x: 10, y: 13 }, { x: 22, y: 13 }, { x: 36, y: 12 },
    { x: 48, y: 13 }, { x: 54, y: 13 }, { x: 64, y: 10 },
    { x: 76, y: 13 }, { x: 90, y: 9 }, { x: 95, y: 9 },
    { x: 112, y: 13 }, { x: 128, y: 11 }, { x: 146, y: 13 },
    { x: 162, y: 10 }, { x: 174, y: 13 },
  ],
  spawn: { x: 2, y: 13 },
  shrine: { x: 174, y: 13, w: 3, h: 2 },
  enemyHp: 3,
  enemySpeed: 62,
  lives: 4,
  clearBonus: 350,
}

/** Extra medium-hard — vertical-ish hopscotch with mid-air chains */
const ashbridgeGauntlet: MapDefinition = {
  id: 'ashbridge-gauntlet',
  name: 'Ashbridge Gauntlet',
  subtitle: 'Chain the platforms. Fall and start again.',
  difficulty: 'hard',
  cols: 140,
  rows: 18,
  ground: [
    { x: 0, y: 15, w: 16, h: 3 },
    { x: 22, y: 15, w: 8, h: 3 },
    { x: 38, y: 15, w: 10, h: 3 },
    { x: 56, y: 15, w: 8, h: 3 },
    { x: 72, y: 15, w: 12, h: 3 },
    { x: 94, y: 15, w: 10, h: 3 },
    { x: 114, y: 15, w: 10, h: 3 },
    { x: 128, y: 15, w: 12, h: 3 },
  ],
  platforms: [
    { x: 16, y: 13, w: 3, h: 1 },
    { x: 18, y: 11, w: 3, h: 1 },
    { x: 30, y: 12, w: 4, h: 1 },
    { x: 34, y: 10, w: 3, h: 1 },
    { x: 48, y: 13, w: 4, h: 1 },
    { x: 50, y: 11, w: 3, h: 1 },
    { x: 52, y: 9, w: 3, h: 1 },
    { x: 64, y: 12, w: 4, h: 1 },
    { x: 66, y: 10, w: 3, h: 1 },
    { x: 84, y: 13, w: 4, h: 1 },
    { x: 86, y: 11, w: 3, h: 1 },
    { x: 88, y: 9, w: 4, h: 1 },
    { x: 104, y: 12, w: 4, h: 1 },
    { x: 106, y: 10, w: 3, h: 1 },
    { x: 108, y: 13, w: 3, h: 1 },
    { x: 124, y: 13, w: 3, h: 1 },
    { x: 126, y: 11, w: 3, h: 1 },
  ],
  spikes: [
    { x: 24, y: 14 }, { x: 25, y: 14 },
    { x: 42, y: 14 }, { x: 43, y: 14 }, { x: 44, y: 14 },
    { x: 58, y: 14 }, { x: 59, y: 14 },
    { x: 78, y: 14 }, { x: 79, y: 14 }, { x: 80, y: 14 },
    { x: 98, y: 14 }, { x: 99, y: 14 },
    { x: 118, y: 14 }, { x: 119, y: 14 },
  ],
  enemies: [
    { x: 10, y: 13 }, { x: 26, y: 13 }, { x: 40, y: 13 },
    { x: 60, y: 13 }, { x: 76, y: 13 }, { x: 88, y: 7 },
    { x: 100, y: 13 }, { x: 120, y: 13 }, { x: 132, y: 13 },
  ],
  spawn: { x: 2, y: 13 },
  shrine: { x: 133, y: 13, w: 3, h: 2 },
  enemyHp: 2,
  enemySpeed: 58,
  lives: 4,
  clearBonus: 300,
}

export const MAPS: MapDefinition[] = [
  penitentsPath,
  corruptedCatacombs,
  voidAscent,
  ashbridgeGauntlet,
]

export function getMap(id: string): MapDefinition {
  return MAPS.find((m) => m.id === id) ?? MAPS[0]
}

export function shrineWorldRect(map: MapDefinition) {
  return {
    x: map.shrine.x * TILE,
    y: map.shrine.y * TILE,
    w: map.shrine.w * TILE,
    h: map.shrine.h * TILE,
  }
}

export function spawnWorld(map: MapDefinition) {
  return { x: map.spawn.x * TILE, y: map.spawn.y * TILE }
}
