import { CanvasTexture, MeshBasicMaterial, SpriteMaterial, SRGBColorSpace } from 'three'
import { LOOK } from '@/game/balance'
import { iconUrl, isRendered } from '@/ui/iconKinds'

const SIZE = 128
const cache = new Map<string, SpriteMaterial>()
const bubbles = new Map<string, MeshBasicMaterial>()

/**
 * An icon on a disc ringed in `ring`, drawn once its picture has loaded: the disc's colour, the ring's width and how
 * much of the disc the picture takes, in the texture's pixels and share.
 */
function discTexture(kind: string, ring: string, fill: string, line: number, icon: number) {
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const g = c.getContext('2d')!
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const disc = () => {
    g.clearRect(0, 0, SIZE, SIZE)
    g.beginPath()
    g.arc(SIZE / 2, SIZE / 2, SIZE / 2 - line * 0.7, 0, Math.PI * 2)
    g.fillStyle = fill
    g.fill()
    g.lineWidth = line
    g.strokeStyle = ring
    g.stroke()
  }
  disc()
  if (isRendered(kind)) {
    const img = new Image()
    img.onload = () => {
      disc()
      const s = SIZE * icon
      g.drawImage(img, (SIZE - s) / 2, (SIZE - s) / 2, s, s)
      tex.needsUpdate = true
    }
    img.src = iconUrl(kind)
  }
  return tex
}

/**
 * An icon as a round badge for the field (sprites face the camera, so it reads from any side): the picture drawn from
 * the model (public/icons) on a cream disc, ringed in `ring`. One material per icon and ring; drawn over everything,
 * like the arrows it goes with.
 */
export function badgeMaterial(kind: string, ring: string): SpriteMaterial {
  const k = kind + ring
  const hit = cache.get(k)
  if (hit) return hit
  const m = new SpriteMaterial({ map: discTexture(kind, ring, '#fffaf0', 10, 0.66), depthTest: false, depthWrite: false, transparent: true, fog: false })
  cache.set(k, m)
  return m
}

/**
 * The bubble over a sheep (SheepView.tsx), like the page's `.bubble`: the icon on a white disc with a thin ring. It is
 * for cards facing the camera, one instanced mesh for the whole flock — a page element over each sheep cost a frame
 * of its own once the flock was big. Drawn over everything, as the page's bubbles were.
 */
export function bubbleMaterial(kind: string, ring: string): MeshBasicMaterial {
  const k = kind + ring
  const hit = bubbles.get(k)
  if (hit) return hit
  const m = new MeshBasicMaterial({ map: discTexture(kind, ring, '#ffffff', 7, 0.62), depthTest: false, depthWrite: false, transparent: true, fog: false })
  bubbles.set(k, m)
  return m
}

/** The ring of a way in's badge and of a way out's: the colours of their arrows, a shade deeper. */
export const RING_IN = LOOK.arrowInRing
export const RING_OUT = LOOK.arrowOutRing
