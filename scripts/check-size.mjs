// Fails the build when the shipped bundle grows past the budget, so starter projects stay fast
// to load on mobile networks. JS/CSS are measured gzipped (what the CDN sends); fonts are already
// compressed woff2 and budgeted separately because CJK coverage is large.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const MB = 1024 * 1024
// Iron Rift streams its content in stages (see src/game/stages.ts). Two budgets:
// - boot: everything except the streamed music tracks; the title only waits for its first stage,
//   and later stages load in the background, so this is a ceiling rather than the actual boot wait.
// - total: every shipped file, including all music.
// V3 raised boot/total for the Tripo PBR viewmodels and characters; stage 1 (title + first wave) still
// loads only the rifle/shotgun/arms, the rest streams in by stage while play is calm.
// V3 roster (4 rigged characters + Hound) and Tripo cover props stream by stage but count in this ceiling.
// V4: six textured Tripo characters (Wolf, Boar, Sentinel, Exo, Warden, Hound) plus Kai's shadow body.
// Stage 1 itself is ~3 MB of characters; the rest streams by stage.
// V5 Kestrel Terminal: +RTG crane and reach stacker scans (stage 1, the arena itself, ~2.2 MB), +STS crane
// (streamed with stage 2, ~0.9 MB) and the wet-yard concrete set (~0.6 MB, replaces two removed sets).
// Containers, ship, water, markings and rain are procedural (0 bytes).
const BUDGET = { js: 2.0 * MB, fonts: 2.2 * MB, boot: 22.5 * MB, total: 28.5 * MB }
const walk = dir => readdirSync(dir).flatMap(name => {
  const p = join(dir, name)
  return statSync(p).isDirectory() ? walk(p) : [p]
})
const files = walk('dist').map(path => {
  const raw = readFileSync(path)
  const text = /\.(js|css|html|json|svg)$/.test(path)
  return { path, size: raw.length, wire: text ? gzipSync(raw).length : raw.length }
})
const sum = pred => files.filter(pred).reduce((n, f) => n + f.wire, 0)
const js = sum(f => f.path.endsWith('.js'))
const fonts = sum(f => f.path.endsWith('.woff2'))
const total = sum(f => !f.path.endsWith('.txt'))
const boot = sum(f => !f.path.endsWith('.txt') && !f.path.includes('/music/'))
const mb = n => `${(n / MB).toFixed(2)} MB`
console.log(`bundle (gzip): js ${mb(js)} / fonts ${mb(fonts)} / boot ${mb(boot)} / total ${mb(total)}`)
const over = Object.entries({ js, fonts, boot, total }).filter(([k, v]) => v > BUDGET[k])
if (over.length) {
  for (const [k, v] of over) console.error(`over budget: ${k} ${mb(v)} > ${mb(BUDGET[k])}`)
  process.exit(1)
}
