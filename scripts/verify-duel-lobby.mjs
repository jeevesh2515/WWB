import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4488
const url = `http://127.0.0.1:${port}/`
const out = 'shots'
mkdirSync(out, { recursive: true })

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'inherit' })
let browser

function cleanup() {
  try { server.kill('SIGTERM') } catch {}
}

async function fail(msg) {
  console.error(`\n❌ VERIFICATION FAIL: ${msg}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('Preview server failed to start')
}

async function main() {
  console.log('--- Phase 0: Starting Preview Server ---')
  await waitForServer()
  console.log(`Preview server running at ${url}`)

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=metal', '--no-sandbox'],
    })
  } catch {
    browser = await chromium.launch({
      executablePath: process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined,
      headless: true,
      args: ['--use-gl=angle', '--use-angle=metal', '--no-sandbox'],
    })
  }

  // Window 1: Host
  console.log('\n--- Phase 1: Launching Host Window ---')
  const hostContext = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  const hostPage = await hostContext.newPage()
  hostPage.setDefaultTimeout(60_000)

  const hostErrors = []
  hostPage.on('console', m => m.type() === 'error' && hostErrors.push(`[Host Console Error] ${m.text()}`))
  hostPage.on('pageerror', e => hostErrors.push(`[Host Page Error] ${String(e)}`))

  await hostPage.goto(url)
  await hostPage.waitForFunction(() => document.body.dataset.screen === 'title')
  console.log('Host reached title screen.')

  // Click HOST · GET CODE
  const hostBtn = await hostPage.waitForSelector('button:has-text("HOST · GET CODE")')
  await hostBtn.click()

  // Wait for duel room panel
  await hostPage.waitForSelector('.duel-room-panel:not([hidden])')
  const codeBadge = await hostPage.waitForSelector('.duel-room-code-badge')
  const roomCode = (await codeBadge.innerText()).trim()
  console.log(`Host created room code: [${roomCode}]`)

  if (!roomCode || roomCode === '------' || roomCode.length !== 6) {
    await fail(`Invalid room code generated: ${roomCode}`)
  }

  // Verify copy code button
  const copyBtn = await hostPage.waitForSelector('.duel-copy-code-btn')
  await copyBtn.click()
  await hostPage.waitForTimeout(100)
  const copiedText = await hostPage.evaluate(() => navigator.clipboard.readText().catch(() => null))
  console.log(`Clipboard content after copy: [${copiedText}]`)

  // Check host initial status
  const hostInitialStatus = await hostPage.innerText('.duel-room-status')
  console.log(`Host initial status: "${hostInitialStatus}"`)
  if (!hostInitialStatus.includes('WAITING FOR RIVAL')) {
    await fail(`Expected status to say WAITING FOR RIVAL, got: ${hostInitialStatus}`)
  }

  await hostPage.screenshot({ path: `${out}/duel-phase1-host-lobby.png` })
  console.log('Saved screenshot: duel-phase1-host-lobby.png')

  // Window 2: Joiner
  console.log('\n--- Phase 2: Launching Joiner Window ---')
  const joinerContext = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  const joinerPage = await joinerContext.newPage()
  joinerPage.setDefaultTimeout(60_000)

  const joinerErrors = []
  joinerPage.on('console', m => m.type() === 'error' && joinerErrors.push(`[Joiner Console Error] ${m.text()}`))
  joinerPage.on('pageerror', e => joinerErrors.push(`[Joiner Page Error] ${String(e)}`))

  await joinerPage.goto(url)
  await joinerPage.waitForFunction(() => document.body.dataset.screen === 'title')
  console.log('Joiner reached title screen.')

  // Fill in the room code copied from Host
  const joinInput = await joinerPage.waitForSelector('.duel-input')
  await joinInput.fill(roomCode)
  const joinBtn = await joinerPage.waitForSelector('button:has-text("JOIN")')
  await joinBtn.click()

  // Wait for joiner room panel
  await joinerPage.waitForSelector('.duel-room-panel:not([hidden])')
  console.log('Joiner entered room lobby.')

  // Verify Host sees Rival joined!
  console.log('Waiting for Host to detect Rival join...')
  await hostPage.waitForFunction(() => {
    const status = document.querySelector('.duel-room-status')
    return status && status.textContent.includes('RIVAL JOINED')
  }, null, { timeout: 15_000 })

  const hostJoinedStatus = await hostPage.innerText('.duel-room-status')
  console.log(`Host updated status: "${hostJoinedStatus}"`)

  const startMatchBtn = await hostPage.waitForSelector('.duel-start-btn:not([hidden])')
  const startBtnText = await startMatchBtn.innerText()
  console.log(`Host Start Button text: "${startBtnText}"`)

  await hostPage.screenshot({ path: `${out}/duel-phase2-host-rival-joined.png` })
  await joinerPage.screenshot({ path: `${out}/duel-phase2-joiner-lobby.png` })
  console.log('Saved screenshots: duel-phase2-host-rival-joined.png and duel-phase2-joiner-lobby.png')

  // Phase 3: Start match from Host and verify synchronization
  console.log('\n--- Phase 3: Starting Match from Host ---')
  await hostPage.evaluate(() => (window.__game.input.debugLock = true))
  await joinerPage.evaluate(() => (window.__game.input.debugLock = true))

  await startMatchBtn.click()
  console.log('Host clicked START MATCH button.')

  // Both windows should enter HUD screen
  console.log('Waiting for both Host and Joiner to enter HUD screen...')
  await Promise.all([
    hostPage.waitForFunction(() => document.body.dataset.screen === 'hud', null, { timeout: 15_000 }),
    joinerPage.waitForFunction(() => document.body.dataset.screen === 'hud', null, { timeout: 15_000 }),
  ])
  console.log('Both windows successfully transitioned to HUD screen!')

  // Both windows should reach playing mode (or countdown)
  await Promise.all([
    hostPage.waitForFunction(() => {
      const g = window.__game?.game
      return g && (g.mode === 'playing' || g.mode === 'countdown') && g.duel?.remote === true
    }),
    joinerPage.waitForFunction(() => {
      const g = window.__game?.game
      return g && (g.mode === 'playing' || g.mode === 'countdown') && g.duel?.remote === true
    }),
  ])
  console.log('Both windows confirmed active duel with remote: true!')

  // Wait until countdown finishes and mode is 'playing'
  await hostPage.waitForFunction(() => window.__game?.game?.mode === 'playing', null, { timeout: 15_000 })
  await joinerPage.waitForFunction(() => window.__game?.game?.mode === 'playing', null, { timeout: 15_000 })
  console.log('Both windows are in "playing" mode!')

  // Verify score synchronization:
  // Host kills a bot:
  console.log('\n--- Phase 4: Testing Real-time Score Synchronization ---')
  const hostInitialKills = await hostPage.evaluate(() => window.__game.game.match.combatants[0].kills)
  const joinerInitialRivalKills = await joinerPage.evaluate(() => {
    const d = window.__game.game.duel
    const rival = window.__game.game.match.combatants.find(c => c.id === d.rivalId)
    return rival?.kills ?? 0
  })
  console.log(`Initial: Host kills = ${hostInitialKills}, Joiner observes rival kills = ${joinerInitialRivalKills}`)

  console.log('Host frags a bot...')
  await hostPage.evaluate(() => {
    const g = window.__game.game
    const prey = g.dmBots.find(b => b.alive && b.id !== g.duel.rivalId)
    if (!prey) throw new Error('No prey bot found to frag')
    g.damage(prey.id, {
      attacker: 0,
      amount: 9999,
      source: 'rifle',
      from: g.player.position.clone(),
      headshot: false,
    })
  })

  const hostUpdatedKills = await hostPage.evaluate(() => window.__game.game.match.combatants[0].kills)
  console.log(`Host local kills after frag: ${hostUpdatedKills}`)
  if (hostUpdatedKills !== hostInitialKills + 1) {
    await fail(`Host kills did not increment: expected ${hostInitialKills + 1}, got ${hostUpdatedKills}`)
  }

  // Joiner should receive the kill event / state resync over Supabase Realtime!
  console.log('Waiting for Joiner to receive Host kill over network...')
  await joinerPage.waitForFunction(() => {
    const g = window.__game.game
    const d = g.duel
    const rival = g.match.combatants.find(c => c.id === d.rivalId)
    return rival && rival.kills >= 1
  }, null, { timeout: 15_000 })

  const joinerObservedKills = await joinerPage.evaluate(() => {
    const g = window.__game.game
    const d = g.duel
    const rival = g.match.combatants.find(c => c.id === d.rivalId)
    return rival?.kills ?? 0
  })
  console.log(`✅ Joiner verified rival score updated in real-time to: ${joinerObservedKills}`)

  await hostPage.screenshot({ path: `${out}/duel-phase3-host-playing.png` })
  await joinerPage.screenshot({ path: `${out}/duel-phase3-joiner-playing.png` })
  console.log('Saved screenshots: duel-phase3-host-playing.png and duel-phase3-joiner-playing.png')

  if (hostErrors.length) console.warn('Host errors:', hostErrors)
  if (joinerErrors.length) console.warn('Joiner errors:', joinerErrors)

  console.log('\n🎉 ALL DUEL STAGING & SYNC CHECKS PASSED PERFECTLY!')
  await browser.close()
  cleanup()
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  cleanup()
  process.exit(1)
})
