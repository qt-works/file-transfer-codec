import * as esbuild from 'esbuild'
import copyPlugin from 'esbuild-plugin-copy'

esbuild.build({
  entryPoints: [
    {
      in: './src/lib/index.ts',
      out: 'index',
    },
    {
      in: './src/lib/worker/worker.js',
      out: 'worker',
    },
  ],
  bundle: true,
  minify: true,
  platform: 'neutral',
  target: ['chrome57'],
  outdir: './dist',
  alias: {
    '@lib': './src/lib',
  },
  plugins: [
    copyPlugin({
      assets: {
        from: ['./src/lib/wasm/cimbar_js.wasm'],
        to: ['./index.wasm'],
      },
    }),
  ],
})
