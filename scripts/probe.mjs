// Dev probe: node scripts/probe.mjs [url] — screenshots title + gameplay, prints console errors & state.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:3000/'
const out = process.env.SHOTS_DIR ?? 'shots'
const waitMs = Number(process.env.PLAY_MS ?? 4000)
mkdirSync(out, { recursive: true })
const args = ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
const browser = await chromium.launch({ args }).catch(() => chromium.launch({ args, channel: 'chrome' }))
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await ctx.newPage()
const errors = []
page.on('console', m => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`)
})
page.on('pageerror', e => errors.push(`[pageerror] ${e.stack ?? e}`))
page.on('response', r => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`))
const t0 = Date.now()
await page.goto(url)
await page.waitForFunction(() => document.body.dataset.screen === 'title', null, { timeout: 90_000 }).catch(() => {})
console.log('title after', Date.now() - t0, 'ms; screen =', await page.evaluate(() => document.body.dataset.screen))
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/01-title.png` })
const fps = async () => page.evaluate(() => new Promise(res => {
  let n = 0
  const s = performance.now()
  const f = () => (++n < 30 ? requestAnimationFrame(f) : res(Math.round((n * 1000) / (performance.now() - s))))
  requestAnimationFrame(f)
}))
console.log('title fps', await fps())
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.screen-title .btn')][0]
  b.click()
})
await page.waitForTimeout(3800)
// Move forward and fire.
await page.keyboard.down('KeyW')
await page.mouse.move(640, 360)
await page.mouse.down()
await page.waitForTimeout(700)
await page.screenshot({ path: `${out}/02-firing.png` })
await page.mouse.up()
await page.keyboard.up('KeyW')
await page.waitForTimeout(waitMs)
await page.screenshot({ path: `${out}/03-play.png` })
const state = await page.evaluate(() => {
  const { game } = window.__game
  const p = game.player.position
  return { mode: game.mode, time: game.match.timeLeft, kills: game.match.combatants.map(c => `${c.name}:${c.kills}/${c.deaths}`).join(' '), pos: [p.x, p.y, p.z].map(v => v.toFixed(2)), hp: game.player.health, bots: game.bots.filter(b => b.alive).length, draw: game.renderer.gl.info.render.calls, tris: game.renderer.gl.info.render.triangles }
})
console.log(JSON.stringify(state))
console.log('play fps', await fps())
console.log(errors.slice(0, 30).join('\n') || 'no errors')
await browser.close()
