/** Most texels the ink reads round a pixel: four rings of eight. */
export const MAX_INK_TAPS = 32

/**
 * The texels the ink reads round a pixel (OutlinePass), as whole-texel offsets, x and y in turn, into `out`; returns how
 * many. The rings are the ink's own: eight directions, the outer ring at `offset` pixels and the rest evenly inside
 * it, two for lines under 6 pixels and one more for every further 3, up to four.
 *
 * A pixel's centre always sits at .5, so a sample lands on the same texel offset round every pixel, and nearest
 * filtering takes the floor of it (on the GPU's 1/256 grid of a texel, which is why the sum is snapped to it here).
 * Working the list out once leaves the shader without a sine and a cosine per sample, and without the samples that
 * fall on the pixel itself or on a texel another ring already reads: at the usual one-pixel line that is 6 to 8 of
 * the 16.
 */
export function inkTaps(offset: number, out: Float32Array): number {
  const rings = Math.min(4, Math.max(2, Math.ceil(offset / 3)))
  let n = 0
  for (let ring = 0; ring < rings; ring++) {
    const r = (offset * (rings - ring)) / rings
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4
      const x = texel(Math.cos(a) * r)
      const y = texel(Math.sin(a) * r)
      if (x === 0 && y === 0) continue
      let seen = false
      for (let j = 0; j < n && !seen; j++) seen = out[j * 2] === x && out[j * 2 + 1] === y
      if (seen) continue
      out[n * 2] = x
      out[n * 2 + 1] = y
      n++
    }
  }
  return n
}

/** Texel offset of a sample `d` texels from a pixel's centre. */
function texel(d: number): number {
  return Math.floor(Math.round((0.5 + d) * 256) / 256)
}
