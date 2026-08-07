import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const demoRoot = fileURLToPath(new URL('.', import.meta.url))
const repositoryRoot = path.resolve(demoRoot, '..')

export default defineConfig({
  root: demoRoot,
  plugins: [react()],
  publicDir: path.resolve(repositoryRoot, 'dist'),
  server: {
    fs: {
      allow: [repositoryRoot],
    },
  },
  build: {
    outDir: path.resolve(demoRoot, 'dist'),
    emptyOutDir: true,
  },
})
