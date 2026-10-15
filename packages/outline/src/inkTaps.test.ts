import { describe, expect, it } from 'vitest'
import { MAX_INK_TAPS, inkTaps } from './inkTaps'

/**
 * The texels the ink loop used to read, sample by sample as the shader walked it: angle `i * 0.785398`, the ring's
 * radius, the sum snapped to the GPU's 1/256 texel grid and floored.
 */
function shaderTexels(offset: number): Set<string> {
  const rings = Math.min(4, Math.max(2, Math.ceil(offset / 3)))
  const fr = Math.fround
  const out = new Set<string>()
  for (let i = 0; i < 32; i++) {
    const ring = Math.floor(i / 8)
    if (ring >= rings) break
    const a = fr(i * fr(0.785398))
    const r = fr((offset * (rings - ring)) / rings)
    const at = (d: number) => Math.floor(Math.round(fr(0.5 + fr(d * r)) * 256) / 256)
    const x = at(fr(Math.cos(a)))
    const y = at(fr(Math.sin(a)))
    if (x !== 0 || y !== 0) out.add(`${x},${y}`)
  }
  return out
}

function taps(offset: number): string[] {
  const out = new Float32Array(MAX_INK_TAPS * 2)
  const n = inkTaps(offset, out)
  return Array.from({ length: n }, (_, j) => `${out[j * 2]},${out[j * 2 + 1]}`)
}

describe('inkTaps', () => {
  it('reads exactly the texels the ring loop read, each once', () => {
    for (const offset of [1, 1.2, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 4.5, 6, 7.5, 9, 12]) {
      const list = taps(offset)
      expect(new Set(list).size, `offset ${offset}`).toBe(list.length)
      expect(new Set(list), `offset ${offset}`).toEqual(shaderTexels(offset))
    }
  })

  it('drops the repeats of the usual one-pixel line', () => {
    expect(taps(1)).toHaveLength(8)
    expect(taps(1.5)).toHaveLength(10)
  })
})
