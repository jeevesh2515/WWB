// End-to-end smoke test: build must already exist in dist/ (`pnpm build`).
// Serves dist/, boots the game in headless Chromium (software GL, low quality) and, for Bugfront
// and then Deathmatch, starts a run, walks forward and fires, verifies the clock runs, the player
// moves and shots are counted, then forces the run to end and checks the results screen.
// Fails on any console error.
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
const guard = setTimeout(() => fail('timed out'), 400_000)

function cleanup() {
  clearTimeout(guard)
  try { server.kill('SIGTERM') } catch {}
}
async function fail(msg) {
  console.error(`smoke: FAIL — ${msg}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('preview server did not start')
}

const state = page => page.evaluate(() => {
  const { game } = window.__game
  const p = game.player.position
  const onslaught = game.gameMode === 'onslaught'
  return {
    mode: game.mode,
    clock: onslaught ? game.runTime : -game.match.timeLeft,
    shots: game.shots + game.match.stats.shots,
    pos: { x: p.x, z: p.z },
  }
})

async function run(context, button, label, n) {
  const page = await context.newPage()
  page.setDefaultTimeout(120_000)
  const errors = []
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', e => errors.push(String(e)))
  page.on('response', r => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`))
  await page.goto(url)
  await page.waitForFunction(() => document.body.dataset.screen === 'title', null, { timeout: 120_000 })
  if (n === 0) await page.screenshot({ path: `${out}/smoke-01-title.png` })
  await page.click(button)
  await page.evaluate(() => (window.__game.input.debugLock = true))
  await page.waitForFunction(() => window.__game.game.mode === 'playing', null, { timeout: 90_000 })
  const before = await state(page)
  await page.keyboard.down('KeyW')
  await page.evaluate(() => window.__game.input.debugHeld.add('fire'))
  await page.waitForTimeout(3000)
  await page.evaluate(() => window.__game.input.debugHeld.delete('fire'))
  await page.keyboard.up('KeyW')
  await page.screenshot({ path: `${out}/smoke-0${2 + n * 2}-${label}-play.png` })
  const after = await state(page)
  const moved = Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z)
  if (after.mode !== 'playing') throw new Error(`${label}: expected playing, got ${after.mode}`)
  if (!(after.clock > before.clock)) throw new Error(`${label}: clock did not run`)
  if (after.shots <= before.shots) throw new Error(`${label}: no shots registered`)
  if (moved < 1) throw new Error(`${label}: player barely moved (${moved.toFixed(2)} m)`)
  await page.evaluate(() => {
    const g = window.__game.game
    if (g.gameMode === 'onslaught') g.endMatch(false)
    else g.match = { ...g.match, timeLeft: 0.5 }
  })
  await page.waitForFunction(() => document.body.dataset.screen === 'results', null, { timeout: 60_000 })
  await page.screenshot({ path: `${out}/smoke-0${3 + n * 2}-${label}-results.png` })
  if (errors.length) throw new Error(`${label}: console errors:\n${errors.join('\n')}`)
  await page.close()
  return `${label} moved ${moved.toFixed(1)} m, ${after.shots} shots, results shown`
}

try {
  await waitForServer()
  const args = ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args })
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } })
  await context.addInitScript(() => localStorage.setItem('worldwarb.save', JSON.stringify({ version: 1, quality: 'low' })))
  const a = await run(context, '.screen-title .btn.primary', 'onslaught', 0)
  const b = await run(context, '.screen-title .btn:not(.primary)', 'deathmatch', 1)
  console.log(`smoke: OK — ${a}; ${b}`)
  await browser.close()
  cleanup()
  process.exit(0)
} catch (err) {
  await fail(err?.message ?? String(err))
}
