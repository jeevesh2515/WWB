// Debug probe: start a match, freeze bots, inspect viewmodel, capture screenshots with toggles.
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:3000/'
const out = 'shots'
mkdirSync(out, { recursive: true })
const args = ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
const browser = await chromium.launch({ args })
const W = Number(process.env.W ?? 960), H = Number(process.env.H ?? 540)
const ctx = await browser.newContext({ viewport: { width: W, height: H } })
await ctx.addInitScript(q => {
  if (!localStorage.getItem('ironrift.save')) localStorage.setItem('ironrift.save', JSON.stringify({ version: 1, quality: q }))
}, process.env.Q ?? 'low')
const page = await ctx.newPage()
page.setDefaultTimeout(240_000)
const errors = []
page.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errors.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', e => errors.push(`[pageerror] ${e.stack ?? e}`))
await page.goto(url)
await page.waitForFunction(() => document.body.dataset.screen === 'title', null, { timeout: 120_000 })
await page.evaluate(() => [...document.querySelectorAll('.screen-title .btn')][0].click())
await page.waitForTimeout(500)
import { readFileSync } from 'node:fs'
const steps = process.env.STEPS_FILE
  ? readFileSync(process.env.STEPS_FILE, 'utf8').split(/\n---\n/).map(x => x.trim()).filter(Boolean)
  : (process.env.STEPS ?? '').split(';').filter(Boolean)
for (const [i, js] of steps.entries()) {
  const r = await page.evaluate(`(async () => { const G = window.__game.game; ${js} })()`).catch(e => `STEP ERROR: ${e.message.split('\n')[0]}`)
  if (r !== undefined) console.log(`step ${i}:`, typeof r === 'string' ? r : JSON.stringify(r))
  await page.waitForTimeout(Number(process.env.GAP ?? 1200))
  if (process.env.SHOTS !== '0') await page.screenshot({ path: `${out}/dbg-${i}.png` })
}
console.log(errors.slice(0, 20).join('\n') || 'no errors')
await browser.close()
