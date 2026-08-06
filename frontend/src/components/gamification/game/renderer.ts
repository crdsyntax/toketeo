import { SCALE, TILE, VIEW_H, VIEW_W } from './constants'
import type { GameEngine } from './engine'
import {
  BODY_ATTACK,
  BODY_IDLE,
  BODY_JUMP,
  BODY_PALETTE,
  CRAWLER,
  CRAWLER_PALETTE,
  LEG_PALETTE,
  LEGS_IDLE,
  LEGS_JUMP,
  LEGS_WALK,
  STAFF_PIXELS,
  SWORD_PIXELS,
} from './sprites'
import { WEAPONS } from './weapons'
import type { MapDefinition, Phase } from './types'

const ASH = Array.from({ length: 40 }, (_, i) => ({
  x: (i * 197.3) % VIEW_W,
  y: (i * 89.7) % VIEW_H,
  s: 6 + (i % 5) * 4,
}))

function drawPixels(
  ctx: CanvasRenderingContext2D,
  sprite: string[],
  palette: Record<string, string>,
  x: number,
  y: number,
  scale: number,
  flip: boolean,
  flash = false,
) {
  ctx.save()
  if (flip) {
    ctx.translate(Math.round(x) * 2 + sprite[0].length * scale, 0)
    ctx.scale(-1, 1)
  }
  for (let r = 0; r < sprite.length; r++) {
    for (let c = 0; c < sprite[r].length; c++) {
      const ch = sprite[r][c]
      if (ch === '.') continue
      ctx.fillStyle = flash ? '#e5e7eb' : (palette[ch] ?? '#fff')
      ctx.fillRect(Math.round(x) + c * scale, Math.round(y) + r * scale, scale, scale)
    }
  }
  ctx.restore()
}

function drawWeaponPixels(
  ctx: CanvasRenderingContext2D,
  pixels: [number, number, string][],
  ox: number,
  oy: number,
  facing: number,
  angleRad: number,
  scale: number,
) {
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  for (const [px, py, color] of pixels) {
    // facing-right local coords; flip x when facing left
    const lx = px * facing
    const ly = py
    const rx = lx * cos - ly * sin
    const ry = lx * sin + ly * cos
    ctx.fillStyle = color
    ctx.fillRect(
      Math.round(ox + rx * scale),
      Math.round(oy + ry * scale),
      scale,
      scale,
    )
  }
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  phase: Phase,
  now: number,
) {
  const s = engine.state
  const map = engine.map
  const p = s.player
  const camX = s.camX
  const shrine = engine.getShrine()
  const weapon = WEAPONS[p.weapon]
  const attacking = p.attackT <= weapon.attackDur

  // ---- background
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H)
  grad.addColorStop(0, '#0b0812')
  grad.addColorStop(0.6, '#1a1226')
  grad.addColorStop(1, '#241433')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)

  const moonX = 620 - camX * 0.05
  ctx.save()
  ctx.shadowColor = 'rgba(220, 200, 255, 0.5)'
  ctx.shadowBlur = 40
  ctx.fillStyle = '#d8cfe8'
  ctx.beginPath()
  ctx.arc(moonX, 70, 26, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = 'rgba(11, 8, 18, 0.25)'
  ctx.beginPath()
  ctx.arc(moonX - 10, 62, 22, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#120d1c'
  for (let i = 0; i < 14; i++) {
    const bx = i * 260 - (camX * 0.25) % 260 - 60
    const bw = 60 + (i * 37) % 50
    const bh = 150 + (i * 53) % 120
    ctx.fillRect(bx, VIEW_H - bh, bw, bh)
    ctx.beginPath()
    ctx.moveTo(bx + bw / 2 - 12, VIEW_H - bh)
    ctx.lineTo(bx + bw / 2, VIEW_H - bh - 34)
    ctx.lineTo(bx + bw / 2 + 12, VIEW_H - bh)
    ctx.fill()
  }

  ctx.fillStyle = '#1d1529'
  for (let i = 0; i < 18; i++) {
    const bx = i * 200 - (camX * 0.5) % 200 - 40
    const bh = 90 + (i * 41) % 90
    ctx.fillRect(bx, VIEW_H - bh, 22, bh)
    ctx.fillRect(bx - 4, VIEW_H - bh - 6, 30, 6)
  }

  ctx.fillStyle = 'rgba(200, 180, 230, 0.25)'
  for (const a of ASH) {
    const ax = ((a.x - camX * 0.15) % VIEW_W + VIEW_W) % VIEW_W
    const ay = (a.y + (now / 1000) * a.s) % VIEW_H
    ctx.fillRect(ax, ay, 2, 2)
  }

  // ---- world
  ctx.save()
  ctx.translate(-Math.round(camX), 0)

  drawTiles(ctx, engine, map, camX)
  drawSpikes(ctx, map)
  drawShrine(ctx, shrine, now)
  drawEnemies(ctx, engine, now)
  if (phase !== 'menu') drawPlayer(ctx, engine, now, attacking)
  drawProjectiles(ctx, engine, now)
  drawParticlesTexts(ctx, engine)

  ctx.restore()

  // fog
  const fog = ctx.createLinearGradient(0, VIEW_H - 110, 0, VIEW_H)
  fog.addColorStop(0, 'rgba(60, 40, 90, 0)')
  fog.addColorStop(1, 'rgba(60, 40, 90, 0.22)')
  ctx.fillStyle = fog
  ctx.fillRect(0, VIEW_H - 110, VIEW_W, 110)

  if (phase === 'playing') drawHUD(ctx, engine, shrine)
}

function drawTiles(ctx: CanvasRenderingContext2D, engine: GameEngine, map: MapDefinition, camX: number) {
  const { solidAt } = engine.physics
  const tx0 = Math.max(0, Math.floor(camX / TILE))
  const tx1 = Math.min(map.cols - 1, Math.ceil((camX + VIEW_W) / TILE))
  for (let ty = 0; ty < map.rows; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!solidAt(tx, ty)) continue
      const px = tx * TILE
      const py = ty * TILE
      ctx.fillStyle = '#221a30'
      ctx.fillRect(px, py, TILE, TILE)
      if (!solidAt(tx, ty - 1)) {
        ctx.fillStyle = '#4a3a66'
        ctx.fillRect(px, py, TILE, 4)
        ctx.fillStyle = '#6b5590'
        ctx.fillRect(px, py, TILE, 1)
      }
      if ((tx * 7 + ty * 13) % 5 === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.fillRect(px + 6, py + 10, 5, 3)
      }
    }
  }
}

function drawSpikes(ctx: CanvasRenderingContext2D, map: MapDefinition) {
  for (const sp of map.spikes) {
    const px = sp.x * TILE
    const py = (sp.y + 1) * TILE
    ctx.fillStyle = '#2a2433'
    ctx.fillRect(px, py - 3, TILE, 3)
    ctx.fillStyle = '#8a8f98'
    for (let i = 0; i < 3; i++) {
      const bx = px + i * 8
      ctx.beginPath()
      ctx.moveTo(bx, py - 2)
      ctx.lineTo(bx + 4, py - 14)
      ctx.lineTo(bx + 8, py - 2)
      ctx.fill()
    }
  }
}

function drawShrine(
  ctx: CanvasRenderingContext2D,
  shrine: { x: number; y: number; w: number; h: number },
  now: number,
) {
  const sx = shrine.x + TILE
  const base = shrine.y + 2 * TILE
  ctx.fillStyle = '#3a2f52'
  ctx.fillRect(sx - 8, base - 34, 64, 34)
  ctx.fillStyle = '#4a3a66'
  ctx.fillRect(sx - 12, base - 40, 72, 8)
  ctx.fillStyle = '#a78bfa'
  ctx.fillRect(sx + 22, base - 66, 4, 26)
  ctx.fillRect(sx + 14, base - 58, 20, 4)
  for (const cxOff of [-4, 44]) {
    ctx.fillStyle = '#e8e0d0'
    ctx.fillRect(sx + cxOff, base - 48, 5, 8)
    const flick = Math.sin(now / 90 + cxOff) * 1.5
    ctx.save()
    ctx.shadowColor = '#fb923c'
    ctx.shadowBlur = 12
    ctx.fillStyle = '#fdba74'
    ctx.beginPath()
    ctx.arc(sx + cxOff + 2.5, base - 52 + flick, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.fillStyle = `rgba(167, 139, 250, ${0.05 + Math.sin(now / 400) * 0.03})`
  ctx.fillRect(shrine.x, shrine.y, shrine.w, shrine.h)
}

function drawEnemies(ctx: CanvasRenderingContext2D, engine: GameEngine, now: number) {
  for (const e of engine.state.enemies) {
    if (e.dead) continue
    const bob = Math.sin(now / 120 + e.x) * 1
    drawPixels(
      ctx,
      CRAWLER,
      CRAWLER_PALETTE,
      e.x + e.w / 2 - 10,
      e.y + e.h - 16 + bob,
      2,
      e.dir < 0,
      e.flash > 0,
    )
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  now: number,
  attacking: boolean,
) {
  const p = engine.state.player
  if (p.inv > 0 && Math.floor(now / 100) % 2 === 0) return

  const weapon = WEAPONS[p.weapon]
  let body = BODY_IDLE
  if (attacking) body = BODY_ATTACK
  else if (!p.onGround) body = BODY_JUMP

  let legs = LEGS_IDLE
  if (!p.onGround) legs = LEGS_JUMP
  else if (Math.abs(p.vx) > 10) legs = LEGS_WALK[p.legFrame % LEGS_WALK.length]

  const bodyH = body.length * SCALE
  const legsH = legs.length * SCALE
  const totalH = bodyH + legsH
  const bodyW = body[0].length * SCALE

  const drawX = p.x + p.w / 2 - bodyW / 2
  const drawY = p.y + p.h - totalH

  // body
  drawPixels(ctx, body, BODY_PALETTE, drawX, drawY, SCALE, p.facing < 0)
  // legs (separate so they walk)
  drawPixels(ctx, legs, LEG_PALETTE, drawX, drawY + bodyH, SCALE, p.facing < 0)

  // weapon pivot at hand
  const handX = p.x + p.w / 2 + p.facing * 10
  const handY = p.y + 10

  const angle = attacking
    ? p.weapon === 'sword'
      ? (-110 + 160 * Math.min(1, p.attackT / weapon.attackDur)) * (Math.PI / 180) * p.facing
      : (-40 + 50 * Math.min(1, p.attackT / weapon.attackDur)) * (Math.PI / 180) * p.facing
    : p.weapon === 'sword'
      ? (-20 * Math.PI / 180) * p.facing
      : (-70 * Math.PI / 180) * p.facing

  const pixels = p.weapon === 'sword' ? SWORD_PIXELS : STAFF_PIXELS
  drawWeaponPixels(ctx, pixels, handX, handY, p.facing, angle, SCALE)

  // slash trail for sword
  if (attacking && p.weapon === 'sword') {
    const progress = Math.min(1, p.attackT / weapon.attackDur)
    const cx = p.x + p.w / 2 + p.facing * 18
    const cy = p.y + 4
    ctx.save()
    ctx.shadowColor = '#e5e7eb'
    ctx.shadowBlur = 6
    for (let i = 0; i < 8; i++) {
      const t = i / 7
      const ang = (-100 + 150 * t * progress) * (Math.PI / 180)
      const px = cx + Math.cos(ang) * 22 * p.facing
      const py = cy + Math.sin(ang) * 20
      ctx.fillStyle = i % 2 === 0 ? '#f9fafb' : '#c4b5fd'
      ctx.fillRect(px - 2, py - 2, 4, 4)
    }
    ctx.restore()
  }

  // staff cast glow
  if (attacking && p.weapon === 'staff') {
    const t = Math.min(1, p.attackT / weapon.attackDur)
    ctx.save()
    ctx.shadowColor = '#a78bfa'
    ctx.shadowBlur = 14
    ctx.fillStyle = `rgba(196, 181, 253, ${0.4 + t * 0.4})`
    ctx.beginPath()
    ctx.arc(handX + p.facing * 4, handY - 14, 5 + t * 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

function drawProjectiles(ctx: CanvasRenderingContext2D, engine: GameEngine, now: number) {
  for (const proj of engine.state.projectiles) {
    ctx.save()
    ctx.shadowColor = '#c4b5fd'
    ctx.shadowBlur = 12
    const pulse = 1 + Math.sin(now / 80) * 0.15
    ctx.fillStyle = '#a78bfa'
    ctx.beginPath()
    ctx.arc(proj.x, proj.y, proj.radius * pulse, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ede9fe'
    ctx.beginPath()
    ctx.arc(proj.x, proj.y, proj.radius * 0.45, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

function drawParticlesTexts(ctx: CanvasRenderingContext2D, engine: GameEngine) {
  const s = engine.state
  for (const pt of s.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife)
    ctx.fillStyle = pt.color
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size)
  }
  ctx.globalAlpha = 1
  ctx.font = 'bold 12px monospace'
  ctx.textAlign = 'center'
  for (const t of s.texts) {
    ctx.globalAlpha = Math.max(0, t.life / 800)
    ctx.fillStyle = t.color
    ctx.fillText(t.text, t.x, t.y)
  }
  ctx.globalAlpha = 1
  ctx.textAlign = 'left'
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  shrine: { x: number },
) {
  const s = engine.state
  const maxLives = engine.map.lives

  for (let i = 0; i < maxLives; i++) {
    const hx = 14 + i * 20
    const hy = 12
    ctx.fillStyle = i < s.lives ? '#ef4444' : 'rgba(239,68,68,0.2)'
    ctx.fillRect(hx + 1, hy, 4, 2)
    ctx.fillRect(hx + 7, hy, 4, 2)
    ctx.fillRect(hx, hy + 2, 12, 4)
    ctx.fillRect(hx + 2, hy + 6, 8, 2)
    ctx.fillRect(hx + 4, hy + 8, 4, 2)
  }

  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'right'
  ctx.fillStyle = '#e4e4e7'
  ctx.fillText(`SCORE ${s.score}`, VIEW_W - 14, 22)

  // weapon badge
  ctx.textAlign = 'left'
  ctx.font = 'bold 11px monospace'
  ctx.fillStyle = s.player.weapon === 'sword' ? '#e5e7eb' : '#c4b5fd'
  ctx.fillText(
    s.player.weapon === 'sword' ? '⚔ BLADE' : '✦ STAFF',
    14,
    VIEW_H - 14,
  )
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '10px monospace'
  ctx.fillText('Q switch · 1/2', 100, VIEW_H - 14)

  const barW = 200
  const bx = VIEW_W / 2 - barW / 2
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(bx, 14, barW, 5)
  ctx.fillStyle = '#a78bfa'
  const prog = Math.max(0, Math.min(1, s.player.x / shrine.x))
  ctx.fillRect(bx, 14, barW * prog, 5)
  ctx.fillStyle = '#c4b5fd'
  ctx.fillRect(bx + barW - 3, 11, 3, 11)
}
