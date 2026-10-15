/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

/**
 * One runner for the whole workspace. The alias mirrors the game's vite config: `@` is the game's own root, which is
 * where every `@/` test import comes from. Tests cover the simulation only, so the environment is plain Node.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./packages/game/src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
  },
})
