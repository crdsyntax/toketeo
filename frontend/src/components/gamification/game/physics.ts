import { TILE } from './constants'
import type { MapDefinition } from './types'

export function buildGrid(map: MapDefinition): Uint8Array {
  const g = new Uint8Array(map.cols * map.rows)
  const fill = (r: { x: number; y: number; w: number; h: number }) => {
    for (let ty = r.y; ty < r.y + r.h; ty++) {
      for (let tx = r.x; tx < r.x + r.w; tx++) {
        if (tx >= 0 && tx < map.cols && ty >= 0 && ty < map.rows) {
          g[ty * map.cols + tx] = 1
        }
      }
    }
  }
  map.ground.forEach(fill)
  map.platforms.forEach(fill)
  return g
}

export function createSolidCheck(map: MapDefinition, grid: Uint8Array) {
  const solidAt = (tx: number, ty: number) =>
    tx >= 0 && ty >= 0 && tx < map.cols && ty < map.rows && grid[ty * map.cols + tx] === 1

  const rectHitsSolid = (x: number, y: number, w: number, h: number) => {
    const x0 = Math.floor(x / TILE)
    const x1 = Math.floor((x + w - 0.01) / TILE)
    const y0 = Math.floor(y / TILE)
    const y1 = Math.floor((y + h - 0.01) / TILE)
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (solidAt(tx, ty)) return true
      }
    }
    return false
  }

  const moveWithCollisions = (
    e: { x: number; y: number; w: number; h: number; vx: number; vy: number },
    dt: number,
  ) => {
    e.x += (e.vx * dt) / 1000
    if (rectHitsSolid(e.x, e.y, e.w, e.h)) {
      if (e.vx > 0) e.x = Math.floor((e.x + e.w) / TILE) * TILE - e.w - 0.01
      else if (e.vx < 0) e.x = Math.floor(e.x / TILE + 1) * TILE + 0.01
      e.vx = 0
    }

    e.y += (e.vy * dt) / 1000
    let grounded = false
    if (rectHitsSolid(e.x, e.y, e.w, e.h)) {
      if (e.vy > 0) {
        e.y = Math.floor((e.y + e.h) / TILE) * TILE - e.h - 0.01
        grounded = true
      } else if (e.vy < 0) {
        e.y = Math.floor(e.y / TILE + 1) * TILE + 0.01
      }
      e.vy = 0
    }
    return grounded
  }

  return { solidAt, rectHitsSolid, moveWithCollisions }
}

export type Physics = ReturnType<typeof createSolidCheck>
