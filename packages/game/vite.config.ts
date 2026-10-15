import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

/**
 * Dev only: `__game.shot(name)` posts the 3D canvas as a PNG here and it lands in docs/concept/shots/<name>.png at full
 * resolution — for comparing the look with the reference scenes frame by frame.
 */
function shots(): Plugin {
  const dir = fileURLToPath(new URL('../../docs/concept/shots/', import.meta.url))
  const icons = fileURLToPath(new URL('./public/icons/', import.meta.url))
  return {
    name: 'shots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        const name = (new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'shot').replace(/[^\w-]/g, '')
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const b64 = Buffer.concat(chunks).toString().replace(/^data:image\/png;base64,/, '')
          mkdirSync(dir, { recursive: true })
          writeFileSync(dir + name + '.png', Buffer.from(b64, 'base64'))
          res.end('ok')
        })
      })
      // `__game.icons()` posts each icon drawn from its model here; they are kept with the game, in public/icons
      server.middlewares.use('/__icon', (req, res) => {
        const name = (new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'icon').replace(/[^\w-]/g, '')
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const b64 = Buffer.concat(chunks).toString().replace(/^data:image\/png;base64,/, '')
          mkdirSync(icons, { recursive: true })
          writeFileSync(icons + name + '.png', Buffer.from(b64, 'base64'))
          res.end('ok')
        })
      })
    },
  }
}

/**
 * The built game is relocatable: `base: './'` makes index.html reference its own bundle relatively, so the same build
 * runs at a domain root and inside itch.io's subdirectory. The dev server keeps the plain root.
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react(), shots()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
}))
