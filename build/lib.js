import * as esbuild from 'esbuild'
import copyPlugin from 'esbuild-plugin-copy'

const sharedOptions = {
  bundle: true,
  minify: true,
  platform: 'neutral',
  target: ['chrome57'],
  outdir: './dist',
  alias: {
    '@lib': './src/lib',
  },
}

await esbuild.build({
  ...sharedOptions,
  entryPoints: [{ in: './src/lib/index.ts', out: 'index' }],
  format: 'esm',
  plugins: [
    copyPlugin({
      assets: {
        from: ['./src/lib/wasm/cimbar_js.wasm'],
        to: ['./index.wasm'],
      },
    }),
  ],
})

await esbuild.build({
  ...sharedOptions,
  entryPoints: [{ in: './src/lib/worker/worker.js', out: 'worker' }],
  format: 'iife',
})
