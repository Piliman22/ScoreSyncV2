import { build } from 'esbuild'
await build({ entryPoints: ['vendor/pjsekai/convert.ts'], outfile: 'vendor/pjsekai/convert.cjs', platform: 'node', format: 'cjs', target: 'node22' })
await build({ entryPoints: ['src/index.ts'], outfile: 'dist/index.cjs', bundle: true, platform: 'node', target: 'node22', format: 'cjs', sourcemap: true })
