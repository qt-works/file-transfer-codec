import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['./demo/main.ts'],
  outfile: './demo/main.js',
  bundle: false,
  format: 'esm',
  minify: true,
  platform: 'browser',
  target: ['chrome57'],
})
