import { describe, expect, it } from 'vitest'
import { GEO } from './kit'

describe('belt chevron', () => {
  it('points along +X: its tip is the point furthest along X, on the centre line', () => {
    const pos = GEO.chevron().getAttribute('position')
    let tipX = -1e9,
      tipZ = 0,
      minX = 1e9
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      minX = Math.min(minX, x)
      if (x > tipX + 1e-6) {
        tipX = x
        tipZ = Math.abs(pos.getZ(i))
      }
    }
    // the tip is near the centre line, the open ends are wide apart at the back
    expect(tipZ).toBeLessThan(0.06)
    expect(tipX).toBeGreaterThan(Math.abs(minX) - 0.05)
  })
})
