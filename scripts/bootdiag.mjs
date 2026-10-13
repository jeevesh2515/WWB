// Boot diagnostic: node scripts/bootdiag.mjs [url]
import { chromium } from 'playwright'
const url = process.argv[2] ?? 'http://localhost:3000/'
const args = ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
const browser = await chromium.launch({ args })
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } })
await ctx.addInitScript(() => {
  if (!localStorage.getItem('ironrift.save')) localStorage.setItem('ironrift.save', JSON.stringify({ version: 1, quality: 'low' }))
})
const page = await ctx.newPage()
const t0 = Date.now()
page.on('console', m => (m.type() === 'error' || m.type() === 'warning') && console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s ${m.type()}] ${m.text().slice(0, 400)}`))
page.on('pageerror', e => console.log(`[pageerror] ${(e.stack ?? String(e)).slice(0, 800)}`))
page.on('requestfailed', r => console.log(`[reqfail] ${r.url()} ${r.failure()?.errorText}`))
page.on('response', r => r.status() >= 400 && console.log(`[http ${r.status()}] ${r.url()}`))
await page.goto(url)
for (let i = 0; i < 24; i += 1) {
  await page.waitForTimeout(5000)
  const s = await page.evaluate(() => ({
    screen: document.body.dataset.screen,
    label: document.querySelector('.boot-label')?.textContent,
    pct: document.querySelector('.boot-pct')?.textContent,
    fatal: document.querySelector('.fatal')?.textContent,
  }))
  console.log(`${(Date.now() - t0) / 1000}s`, JSON.stringify(s))
  if (s.screen === 'title' || s.fatal) break
}
await browser.close()
