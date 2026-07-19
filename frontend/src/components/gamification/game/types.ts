export type Phase = 'menu' | 'playing' | 'over' | 'won'
export type WeaponId = 'sword' | 'staff'
export type Difficulty = 'easy' | 'medium' | 'hard'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface TilePoint {
  x: number
  y: number
}

export interface MapDefinition {
  id: string
  name: string
  subtitle: string
  difficulty: Difficulty
  cols: number
  rows: number
  ground: Rect[]
  platforms: Rect[]
  spikes: TilePoint[]
  enemies: TilePoint[]
  spawn: TilePoint
  shrine: Rect
  enemyHp: number
  enemySpeed: number
  lives: number
  clearBonus: number
}

export interface Enemy {
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  dir: number
  speed: number
  hp: number
  flash: number
  dead: boolean
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

export interface FloatText {
  x: number
  y: number
  life: number
  text: string
  color: string
}

export interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  damage: number
  radius: number
}

export interface PlayerState {
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  onGround: boolean
  facing: number
  inv: number
  coyote: number
  jumpBuf: number
  attackT: number
  attackCd: number
  weapon: WeaponId
  legFrame: number
  legTimer: number
  animTime: number
  hitSet: Set<Enemy>
}

export interface GameState {
  keys: Set<string>
  player: PlayerState
  enemies: Enemy[]
  particles: Particle[]
  texts: FloatText[]
  projectiles: Projectile[]
  score: number
  lives: number
  camX: number
  checkpoint: { x: number; y: number }
  xpAwarded: boolean
  mapId: string
}
