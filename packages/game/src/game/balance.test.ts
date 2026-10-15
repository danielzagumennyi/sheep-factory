import { describe, expect, it } from 'vitest'
import { MISSIONS } from './balance'

describe('missions (GDD 8)', () => {
  it('every dock but the market has an order, and every order has its dock', () => {
    for (const m of MISSIONS) {
      const docks = m.docks.map(([c]) => c)
      for (const c of docks) if (c !== 'market') expect(m.orders.some((o) => o.dock === c), m.id + ' dock ' + c).toBe(true)
      for (const o of m.orders) expect(docks, m.id + ' order ' + o.id).toContain(o.dock)
    }
  })
  it('the market stands apart from the truck docks', () => {
    for (const m of MISSIONS) {
      const market = m.docks.find(([c]) => c === 'market')
      if (!market) continue
      const trucks = m.docks.filter(([c]) => c !== 'market').map(([, x]) => x)
      expect(Math.min(...trucks) - market[1], m.id).toBeGreaterThan(3)
    }
  })
})
