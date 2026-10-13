// Explosion-storm benchmark: node scripts/fxbench.mjs [url]   (env Q=low|medium|high, W, H, OUT=file.json)
// Starts a match in god-mode, then measures frame times for: a quiet baseline, a sustained explosion
// storm in front of the camera, and a first-time explosive-canister burn (light/shader hitch probe).
// Headless Chromium renders with SwiftShader (CPU), so absolute numbers are pessimistic; compare runs.
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
const url = process.argv[2] ?? 'http://127.0.0.1:3000/'
const args = ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
const browser = await chromium.launch({ args })
const W = Number(process.env.W ?? 960), H = Number(process.env.H ?? 540)
const ctx = await browser.newContext({ viewport: { width: W, height: H } })
await ctx.addInitScript(q => {
  localStorage.setItem('ironrift.save', JSON.stringify({ version: 1, quality: q }))
}, process.env.Q ?? 'medium')
const page = await ctx.newPage()
page.setDefaultTimeout(300_000)
const errors = []
page.on('pageerror', e => errors.push(String(e.stack ?? e).split('\n')[0]))
await page.goto(url)
await page.waitForFunction(() => document.body.dataset.screen === 'title', null, { timeout: 150_000 })
await page.evaluate(() => [...document.querySelectorAll('.screen-title .btn')][0].click())
await page.waitForTimeout(2500)
const result = await page.evaluate(async noAdapt => {
  const G = window.__game.game
  if (noAdapt && G.fx.frameTime) { G.fx.frameTime = () => {}; G.fx.pressure = 0 }
  const V3 = G.camera.position.constructor
  const THREE = { Vector3: V3 }
  setInterval(() => { G.player.health = 100; G.player.armor = 100 }, 30)
  const gl = G.renderer.gl
  const lights = () => { let n = 0; G.scene.traverse(o => { if (o.isLight && o.visible) n += 1 }); return n }
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  // Main-thread cost of one game step (simulation + VFX update + render submission).
  let cpu = []
  const step = G.step.bind(G)
  G.step = dt => { const t = performance.now(); step(dt); cpu.push(performance.now() - t) }
  const stats = a => {
    if (!a.length) return {}
    const s = [...a].sort((x, y) => x - y)
    return { mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p95: +s[Math.floor(0.95 * (s.length - 1))].toFixed(2), max: +s[s.length - 1].toFixed(2) }
  }
  // Blended particle pixels per frame, in full screens (sum of clipped quad areas). Mirrors the
  // shader: when the build has the maxScreen uniform, apply its size clamp and near-camera collapse.
  const coverage = () => {
    const cam = G.camera
    const v = cam.matrixWorldInverse.elements
    const p11 = cam.projectionMatrix.elements[5]
    const p00 = cam.projectionMatrix.elements[0]
    let total = 0
    for (const sys of [G.fx.add, G.fx.alpha]) {
      const n = sys.geo.instanceCount
      const P = sys.aPos.array
      const M = sys.aMisc.array
      const maxScreen = sys.mesh.material.uniforms.maxScreen?.value
      for (let i = 0; i < n; i += 1) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]
        const d = -(v[2] * x + v[6] * y + v[10] * z + v[14])
        if (d < 0.05) continue
        let size = M[i * 4]
        if (maxScreen) {
          const ndc = size * p11 / d
          if (ndc > maxScreen) size *= maxScreen / ndc
          if (Math.min(1, Math.max(0, (d - 0.25) / (0.35 + M[i * 4] * 0.45))) <= 0.01) continue
        }
        const vx = v[0] * x + v[4] * y + v[8] * z + v[12]
        const vy = v[1] * x + v[5] * y + v[9] * z + v[13]
        const cx = vx * p00 / d, cy = vy * p11 / d
        const hw = size * p00 / d / 2, hh = size * p11 / d / 2
        const ox = Math.max(0, Math.min(1, cx + hw) - Math.max(-1, cx - hw))
        const oy = Math.max(0, Math.min(1, cy + hh) - Math.max(-1, cy - hh))
        total += (ox * oy) / 4
      }
    }
    return total
  }
  const measure = async (ms, tick) => {
    cpu = []
    let covSum = 0
    let covPeak = 0
    const dts = []
    let peak = 0
    let last = performance.now()
    const t0 = last
    await new Promise(done => {
      const frame = now => {
        dts.push(now - last)
        last = now
        peak = Math.max(peak, G.fx.particleCount)
        const c = coverage()
        covSum += c
        covPeak = Math.max(covPeak, c)
        if (tick) tick(now - t0)
        if (now - t0 < ms) requestAnimationFrame(frame)
        else done()
      }
      requestAnimationFrame(frame)
    })
    dts.shift()
    if (!dts.length) return { frames: 0 }
    const s = [...dts].sort((a, b) => a - b)
    const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))]
    const mean = dts.reduce((a, b) => a + b, 0) / dts.length
    return { frames: dts.length, mean: +mean.toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1), over100: dts.filter(d => d > 100).length, peakParticles: peak, cpu: stats(cpu), overdrawMean: +(covSum / Math.max(1, dts.length + 1)).toFixed(2), overdrawPeak: +covPeak.toFixed(2) }
  }
  // Aim point in front of the camera at ground level.
  const ahead = (dist, spread) => {
    const cam = G.camera
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize()
    const r = new THREE.Vector3(f.z, 0, -f.x)
    const p = cam.position.clone().addScaledVector(f, dist).addScaledVector(r, (Math.random() - 0.5) * spread)
    p.y = 0.6
    return p
  }
  // Wait until 30 consecutive frames come in under 100 ms (post-start compiles / streaming done).
  await new Promise(done => {
    let ok = 0
    let last = performance.now()
    const t0 = last
    const f = now => {
      ok = now - last < 100 ? ok + 1 : 0
      last = now
      if (ok >= 30 || now - t0 > 60000) done()
      else requestAnimationFrame(f)
    }
    requestAnimationFrame(f)
  })
  const out = { lights0: lights(), programs0: gl.info.programs.length }
  out.baseline = await measure(3000)
  let next = 0
  out.storm = await measure(6000, t => {
    while (t >= next) {
      G.explode(ahead(7 + Math.random() * 6, 8), 6, 0, -1, 'barrel', new THREE.Vector3(0, 1, 0))
      next += 250
    }
  })
  out.programsAfterStorm = gl.info.programs.length
  out.recovery = await measure(3000)
  // First-time canister burn: the burning light used to be created lazily here.
  const i = G.props.list.findIndex(p => p.alive)
  const programsBeforeBurn = gl.info.programs.length
  if (i >= 0) G.props.list[i].burning = 1.2
  out.burn = await measure(2500)
  out.programsBurnDelta = gl.info.programs.length - programsBeforeBurn
  out.lights1 = lights()
  out.calls = gl.info.render.calls
  out.noAdapt = noAdapt
  return out
}, process.env.NOADAPT === '1')
result.errors = errors.slice(0, 5)
console.log(JSON.stringify(result, null, 1))
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(result, null, 1))
await browser.close()
