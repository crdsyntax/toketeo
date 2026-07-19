import {
  GRAVITY,
  JUMP_V,
  MAX_FALL,
  MOVE_SPEED,
  PLAYER_H,
  PLAYER_W,
  TILE,
  VIEW_W,
} from './constants'
import { sfx } from './audio'
import { buildGrid, createSolidCheck, type Physics } from './physics'
import { getMap, shrineWorldRect, spawnWorld } from './maps'
import { WEAPONS, WEAPON_ORDER } from './weapons'
import type {
  Enemy,
  FloatText,
  GameState,
  MapDefinition,
  Particle,
  Phase,
  Projectile,
  WeaponId,
} from './types'

export interface EngineCallbacks {
  onPhase: (phase: Phase) => void
  onScore: (score: number, xp: number) => void
  addXP: (amount: number, reason?: string) => void
}

export class GameEngine {
  state: GameState
  map: MapDefinition
  grid: Uint8Array
  physics: Physics
  phase: Phase = 'menu'
  private shrine: { x: number; y: number; w: number; h: number }
  private worldW: number
  private worldH: number
  private cb: EngineCallbacks
  private pendingAttack = false
  private pendingSwitch = false

  constructor(mapId: string, cb: EngineCallbacks) {
    this.cb = cb
    this.map = getMap(mapId)
    this.grid = buildGrid(this.map)
    this.physics = createSolidCheck(this.map, this.grid)
    this.shrine = shrineWorldRect(this.map)
    this.worldW = this.map.cols * TILE
    this.worldH = this.map.rows * TILE
    this.state = this.createState(mapId)
  }

  private createState(mapId: string): GameState {
    const map = getMap(mapId)
    const spawn = spawnWorld(map)
    return {
      keys: new Set(),
      player: {
        x: spawn.x,
        y: spawn.y,
        w: PLAYER_W,
        h: PLAYER_H,
        vx: 0,
        vy: 0,
        onGround: false,
        facing: 1,
        inv: 0,
        coyote: 0,
        jumpBuf: 0,
        attackT: 999,
        attackCd: 0,
        weapon: 'sword',
        legFrame: 0,
        legTimer: 0,
        animTime: 0,
        hitSet: new Set(),
      },
      enemies: this.spawnEnemies(map),
      particles: [],
      texts: [],
      projectiles: [],
      score: 0,
      lives: map.lives,
      camX: 0,
      checkpoint: { x: spawn.x, y: spawn.y },
      xpAwarded: false,
      mapId: map.id,
    }
  }

  private spawnEnemies(map: MapDefinition): Enemy[] {
    return map.enemies.map((t) => ({
      x: t.x * TILE + 4,
      y: t.y * TILE,
      w: 16,
      h: 14,
      vx: 0,
      vy: 0,
      dir: Math.random() > 0.5 ? 1 : -1,
      speed: map.enemySpeed + Math.random() * 12,
      hp: map.enemyHp,
      flash: 0,
      dead: false,
    }))
  }

  loadMap(mapId: string) {
    this.map = getMap(mapId)
    this.grid = buildGrid(this.map)
    this.physics = createSolidCheck(this.map, this.grid)
    this.shrine = shrineWorldRect(this.map)
    this.worldW = this.map.cols * TILE
    this.worldH = this.map.rows * TILE
    this.state = this.createState(mapId)
    this.phase = 'menu'
    this.cb.onPhase('menu')
  }

  start() {
    const id = this.state.mapId
    this.state = this.createState(id)
    this.phase = 'playing'
    this.cb.onPhase('playing')
  }

  keyDown(key: string, repeat: boolean) {
    if (this.phase === 'menu' && key === 'enter') {
      this.start()
      return
    }
    if ((this.phase === 'over' || this.phase === 'won') && key === 'r') {
      this.start()
      return
    }
    if (this.phase !== 'playing') return

    this.state.keys.add(key)

    if (!repeat && (key === ' ' || key === 'arrowup' || key === 'w')) {
      this.state.player.jumpBuf = 120
    }
    if (!repeat && (key === 'j' || key === 'k' || key === 'x' || key === 'z')) {
      this.pendingAttack = true
    }
    if (!repeat && (key === 'q' || key === 'tab' || key === '1' || key === '2')) {
      this.pendingSwitch = true
      if (key === '1') this.state.player.weapon = 'sword'
      if (key === '2') this.state.player.weapon = 'staff'
    }
  }

  keyUp(key: string) {
    this.state.keys.delete(key)
  }

  clearKeys() {
    this.state.keys.clear()
  }

  private explode(x: number, y: number, color: string, count: number) {
    const s = this.state
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 40 + Math.random() * 130
      const life = 300 + Math.random() * 350
      s.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life,
        maxLife: life,
        color,
        size: 2 + Math.random() * 2,
      })
    }
  }

  private float(x: number, y: number, text: string, color: string) {
    this.state.texts.push({ x, y, life: 800, text, color })
  }

  private endGame(won: boolean) {
    const s = this.state
    if (won) s.score += this.map.clearBonus
    const xp = Math.min(500, Math.floor(s.score * 0.5))
    this.cb.onScore(s.score, xp)
    if (!s.xpAwarded && xp > 0) {
      s.xpAwarded = true
      this.cb.addXP(xp, 'Data Defender')
    }
    if (won) sfx.win()
    else sfx.lose()
    this.phase = won ? 'won' : 'over'
    this.cb.onPhase(this.phase)
  }

  private hurtPlayer(fromDir: number) {
    const s = this.state
    const p = s.player
    if (p.inv > 0) return
    s.lives -= 1
    p.inv = 1300
    p.vy = -280
    p.vx = fromDir * 170
    p.onGround = false
    this.explode(p.x + p.w / 2, p.y + p.h / 2, '#ef4444', 14)
    sfx.hurt()
    if (s.lives <= 0) this.endGame(false)
  }

  private tryAttack() {
    const p = this.state.player
    const w = WEAPONS[p.weapon]
    if (p.attackCd > 0) return
    p.attackT = 0
    p.attackCd = w.attackCd
    p.hitSet.clear()
    if (p.weapon === 'staff') sfx.cast()
    else sfx.slash()

    if (w.projectile) {
      const dir = p.facing
      this.state.projectiles.push({
        x: p.x + p.w / 2 + dir * 18,
        y: p.y + 8,
        vx: dir * w.projectileSpeed,
        vy: -20,
        life: 1400,
        damage: w.projectileDamage,
        radius: 6,
      })
      this.explode(p.x + p.w / 2 + dir * 14, p.y + 8, '#a78bfa', 6)
    }
  }

  private switchWeapon() {
    const p = this.state.player
    // If 1/2 already set weapon, only sfx; else cycle
    const idx = WEAPON_ORDER.indexOf(p.weapon)
    // When Q/Tab: cycle. When 1/2 already applied in keyDown.
    // Always play sfx if pending switch
    if (!this.state.keys.has('1') && !this.state.keys.has('2')) {
      p.weapon = WEAPON_ORDER[(idx + 1) % WEAPON_ORDER.length]
    }
    sfx.switchWeapon()
  }

  private damageEnemy(e: Enemy, amount: number, knockDir: number, score: number) {
    if (e.dead) return
    e.hp -= amount
    e.flash = 160
    e.vx = knockDir * 140
    if (e.hp <= 0) {
      e.dead = true
      this.state.score += score
      this.float(e.x + e.w / 2, e.y - 6, `+${score}`, '#a78bfa')
      this.explode(e.x + e.w / 2, e.y + e.h / 2, '#5c6b58', 14)
      sfx.kill()
    } else {
      sfx.hitEnemy()
    }
  }

  update(dt: number) {
    if (this.phase !== 'playing') return
    const s = this.state
    const p = s.player
    const { moveWithCollisions, rectHitsSolid } = this.physics
    const weapon = WEAPONS[p.weapon]

    if (this.pendingAttack) {
      this.pendingAttack = false
      this.tryAttack()
    }
    if (this.pendingSwitch) {
      this.pendingSwitch = false
      this.switchWeapon()
    }

    // timers
    if (p.inv > 0) p.inv -= dt
    if (p.coyote > 0) p.coyote -= dt
    if (p.jumpBuf > 0) p.jumpBuf -= dt
    if (p.attackCd > 0) p.attackCd -= dt
    if (p.attackT <= weapon.attackDur) p.attackT += dt
    p.animTime += dt

    // movement
    const k = s.keys
    let move = 0
    if (k.has('arrowleft') || k.has('a')) move -= 1
    if (k.has('arrowright') || k.has('d')) move += 1
    if (move !== 0) {
      p.facing = move
      p.vx = move * MOVE_SPEED
    } else {
      p.vx *= 0.6
      if (Math.abs(p.vx) < 5) p.vx = 0
    }

    // leg animation
    if (p.onGround && Math.abs(p.vx) > 10) {
      p.legTimer += dt
      if (p.legTimer > 90) {
        p.legTimer = 0
        p.legFrame = (p.legFrame + 1) % 4
      }
    } else {
      p.legFrame = 0
      p.legTimer = 0
    }

    if (p.jumpBuf > 0 && (p.onGround || p.coyote > 0)) {
      p.vy = -JUMP_V
      p.onGround = false
      p.coyote = 0
      p.jumpBuf = 0
      sfx.jump()
    }

    p.vy = Math.min(MAX_FALL, p.vy + (GRAVITY * dt) / 1000)
    const wasGrounded = p.onGround
    const grounded = moveWithCollisions(p, dt)
    p.onGround = grounded
    if (grounded) {
      p.coyote = 90
      if (p.inv <= 0) {
        const nearSpike = this.map.spikes.some(
          (sp) =>
            p.x + p.w > sp.x * TILE &&
            p.x < sp.x * TILE + TILE &&
            Math.abs(p.y + p.h - (sp.y + 1) * TILE) < 4,
        )
        if (!nearSpike) s.checkpoint = { x: p.x, y: p.y }
      }
    } else if (wasGrounded) {
      p.coyote = 90
    }

    // melee hit window
    if (p.attackT >= weapon.activeStart && p.attackT <= weapon.activeEnd && !weapon.projectile) {
      const ax = p.facing > 0 ? p.x + p.w : p.x - weapon.reach
      const ay = p.y + weapon.hitYOffset
      for (const e of s.enemies) {
        if (e.dead || p.hitSet.has(e)) continue
        if (
          e.x < ax + weapon.reach &&
          e.x + e.w > ax &&
          e.y < ay + weapon.hitHeight &&
          e.y + e.h > ay
        ) {
          p.hitSet.add(e)
          this.damageEnemy(e, weapon.damage, p.facing, weapon.scorePerKill)
        }
      }
    }

    // projectiles (staff orbs)
    s.projectiles = s.projectiles.filter((proj) => {
      proj.x += (proj.vx * dt) / 1000
      proj.y += (proj.vy * dt) / 1000
      proj.life -= dt
      if (proj.life <= 0) return false
      if (rectHitsSolid(proj.x - proj.radius, proj.y - proj.radius, proj.radius * 2, proj.radius * 2)) {
        this.explode(proj.x, proj.y, '#c4b5fd', 8)
        return false
      }
      for (const e of s.enemies) {
        if (e.dead) continue
        const cx = e.x + e.w / 2
        const cy = e.y + e.h / 2
        if (Math.hypot(cx - proj.x, cy - proj.y) < e.w / 2 + proj.radius) {
          this.damageEnemy(e, proj.damage, Math.sign(proj.vx) || p.facing, WEAPONS.staff.scorePerKill)
          this.explode(proj.x, proj.y, '#a78bfa', 10)
          return false
        }
      }
      return true
    })

    // enemies
    for (const e of s.enemies) {
      if (e.dead) continue
      if (e.flash > 0) e.flash -= dt
      e.vx = e.dir * e.speed
      e.vy = Math.min(MAX_FALL, e.vy + (GRAVITY * dt) / 1000)
      const before = e.vx
      moveWithCollisions(e, dt)
      if (before !== 0 && e.vx === 0) e.dir *= -1
      const aheadX = e.dir > 0 ? e.x + e.w + 3 : e.x - 3
      if (!rectHitsSolid(aheadX, e.y + e.h + 2, 1, 4)) e.dir *= -1

      if (
        p.inv <= 0 &&
        p.x < e.x + e.w &&
        p.x + p.w > e.x &&
        p.y < e.y + e.h &&
        p.y + p.h > e.y
      ) {
        this.hurtPlayer(p.x + p.w / 2 < e.x + e.w / 2 ? -1 : 1)
        if (this.phase !== 'playing') return
      }
    }

    // spikes
    if (p.inv <= 0) {
      for (const sp of this.map.spikes) {
        const sx = sp.x * TILE + 4
        const sy = sp.y * TILE + 12
        if (p.x < sx + 16 && p.x + p.w > sx && p.y < sy + 12 && p.y + p.h > sy) {
          this.hurtPlayer(p.facing * -1)
          if (this.phase !== 'playing') return
          break
        }
      }
    }

    // pit
    if (p.y > this.worldH + 40) {
      s.lives -= 1
      sfx.hurt()
      if (s.lives <= 0) {
        this.endGame(false)
        return
      }
      p.x = s.checkpoint.x
      p.y = s.checkpoint.y - 4
      p.vx = 0
      p.vy = 0
      p.inv = 1500
      s.camX = Math.max(0, Math.min(this.worldW - VIEW_W, p.x - VIEW_W * 0.42))
    }

    // shrine
    if (
      p.x < this.shrine.x + this.shrine.w &&
      p.x + p.w > this.shrine.x &&
      p.y < this.shrine.y + this.shrine.h &&
      p.y + p.h > this.shrine.y
    ) {
      this.endGame(true)
      return
    }

    // particles / texts
    s.particles = s.particles.filter((pt: Particle) => {
      pt.x += (pt.vx * dt) / 1000
      pt.y += (pt.vy * dt) / 1000
      pt.vy += (500 * dt) / 1000
      pt.life -= dt
      return pt.life > 0
    })
    s.texts = s.texts.filter((t: FloatText) => {
      t.y -= (30 * dt) / 1000
      t.life -= dt
      return t.life > 0
    })

    // camera
    const target = Math.max(0, Math.min(this.worldW - VIEW_W, p.x + p.w / 2 - VIEW_W * 0.42))
    s.camX += (target - s.camX) * Math.min(1, dt / 90)
  }

  getWeapon(): WeaponId {
    return this.state.player.weapon
  }

  getWorldBounds() {
    return { w: this.worldW, h: this.worldH }
  }

  getShrine() {
    return this.shrine
  }
}
