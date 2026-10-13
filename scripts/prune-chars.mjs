// Prune the Mixamo Xbot to the clips the game uses, then weld + quantize for the web.
// node scripts/prune-chars.mjs
import { NodeIO } from '../node_modules/.pnpm/@gltf-transform+core@4.5.1/node_modules/@gltf-transform/core/dist/index.js'
import { ALL_EXTENSIONS } from '../node_modules/.pnpm/@gltf-transform+extensions@4.5.1/node_modules/@gltf-transform/extensions/dist/index.js'
import { prune, dedup, quantize, resample } from '../node_modules/.pnpm/@gltf-transform+functions@4.5.1_@types+node@26.6.3/node_modules/@gltf-transform/functions/dist/index.js'
import { statSync } from 'node:fs'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const KEEP = new Set(['idle', 'walk', 'run'])
const doc = await io.read('.asset-src/chars/Xbot.glb')
for (const anim of doc.getRoot().listAnimations()) {
  if (!KEEP.has(anim.getName())) anim.dispose()
}
await doc.transform(resample({ tolerance: 1e-4 }), prune(), dedup(), quantize({ quantizeNormal: 10, quantizePosition: 14 }))
await io.write('public/assets/chars/xbot.glb', doc)
console.log('xbot.glb', statSync('public/assets/chars/xbot.glb').size)
// Meshopt-compress geometry + animation (GLTFLoader decodes it via MeshoptDecoder in engine/assets.ts).
const { execFileSync } = await import('node:child_process')
execFileSync('node_modules/.bin/gltf-transform', ['meshopt', 'public/assets/chars/xbot.glb', 'public/assets/chars/xbot.glb', '--level', 'medium'], { stdio: 'inherit' })
console.log('xbot.glb (meshopt)', statSync('public/assets/chars/xbot.glb').size)
