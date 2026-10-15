import './styles/fonts.css'
import './styles/main.css'
import { Audio } from './engine/audio'
import { I18n } from './engine/i18n'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { SAVE_KEY, SaveStore, type SaveData } from './engine/save'
import type { Game, GameMode } from './game/game'
import { Ui } from './ui/ui'
import { CloudServices } from './backend/cloud'
import { DUEL, duelInviteQuery, makeRoomCode, normalizeRoomCode, roomCodeFromQuery } from './net/duel'
import { DuelLink, quickMatch } from './net/lobby'

/**
 * Boot flow (staged streaming):
 *  1. The loading screen (with its painted backdrop) shows immediately.
 *  2. Code, Rapier WASM, the arena library and Stage 1 (rifle, shotgun, robot rig, VFX atlases,
 *     core SFX) load in parallel — exactly what the title screen and Wave 1 need.
 *  3. Title screen appears. Stages 2–4 (drones, heavies, boss) stream in the background one file at
 *     a time, pausing whenever combat heats up (many enemies/particles or rising frame time).
 *     Before a wave needs a stage, the game calls ensure(), which jumps it to the front.
 */
async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const firstRun = safeGet(SAVE_KEY) === null
  const save = new SaveStore()
  const i18n = new I18n()
  const input = new Input(canvas)
  const audio = new Audio()
  let game: Game | undefined
  let cloud: CloudServices | undefined
  let lastDebriefPayload: Record<string, unknown> = {}
  let lockLostAt = 0
  const applySettings = (d: SaveData) => {
    input.sensitivity = d.sensitivity
    input.invertY = d.invertY
    audio.setVolumes(d.musicVolume, d.sfxVolume, d.muted)
    if (game) {
      game.reducedMotion = d.reducedMotion
      game.fovSetting = d.fov
    }
  }
  const startMatch = (mode?: GameMode) => {
    if (!game) return
    audio.unlock()
    audio.retryMusic()
    ui.resetHud()
    game.start(mode ?? game.gameMode)
    ui.show('hud')
    loop.resetAccumulator()
    input.lockPointer()
  }
  const pause = () => {
    if (game?.mode !== 'playing' && game?.mode !== 'countdown') return
    if (game.choosingPerk) return
    game.pause()
    ui.show('pause')
    input.unlockPointer()
  }
  const resume = () => {
    if (game?.mode !== 'paused') return
    game.resume()
    ui.show('hud')
    loop.resetAccumulator()
    if (!game.choosingPerk) input.lockPointer()
  }
  const pickPerk = (i: number) => {
    if (!game?.choosingPerk) return
    game.choosePerk(i)
    if (game.mode === 'playing') input.lockPointer()
  }
  // ─── 1v1 duel lobby ────────────────────────────────────────────────
  let duelLink: DuelLink | null = null
  let duelBusy = false
  let duelPeerSeen = false
  let duelGen = 0
  const pilotName = () => ((cloud?.user?.email?.split('@')[0] ?? 'PILOT').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'PILOT')
  const closeDuelLink = () => {
    const link = duelLink
    duelLink = null
    if (link) void link.close(0)
  }
  const beginDuel = (rivalName: string, remote: boolean) => {
    if (!game) return
    audio.unlock()
    audio.retryMusic()
    ui.resetHud()
    ui.setDuelStatus(null)
    game.startDuel(rivalName, remote)
    ui.show('hud')
    loop.resetAccumulator()
    input.lockPointer()
  }
  const openDuelRoom = async (code: string, token: number) => {
    closeDuelLink()
    duelPeerSeen = false
    ui.setRoomCode(code, `${location.origin}${location.pathname}${duelInviteQuery(code)}`)
    ui.setDuelStatus(`ROOM ${code} · WAITING FOR RIVAL… CPU FILLS IN`)
    let link: DuelLink | null = null
    let helloReplied = false
    try {
      link = await DuelLink.open(code, pilotName(), {
        onMsg: m => {
          game?.duelApply(m)
          // Answer one hello so the late joiner learns our name too (replied-once: no ping-pong).
          if (m.t === 'hello' && !helloReplied) {
            helloReplied = true
            duelLink?.send({ t: 'hello', name: pilotName(), seq: 0 })
          }
        },
        onPeer: present => {
          if (token !== duelGen || !game?.duel?.remote) return
          if (present) {
            duelPeerSeen = true
            ui.setDuelStatus(null)
            ui.setRoomCode(null)
          } else if (duelPeerSeen) {
            duelPeerSeen = false
            game.duelTakeover()
            ui.setRoomCode(null)
          }
        },
      })
    } catch {
      if (token !== duelGen) return
      ui.setDuelStatus('NETWORK DOWN · CPU RIVAL DEPLOYED')
      beginDuel('', false)
      return
    }
    if (token !== duelGen || !game) {
      if (link) void link.close(0)
      return
    }
    duelLink = link
    beginDuel('RIVAL', true)
    link.send({ t: 'hello', name: pilotName(), seq: 0 })
    window.setTimeout(() => {
      if (token !== duelGen || !game?.duel?.remote || duelPeerSeen) return
      game.duelTakeover()
      ui.setRoomCode(null)
    }, DUEL.waitForPeerMs)
  }
  const duelGuard = (): number | null => {
    if (!game || duelBusy) return null
    duelBusy = true
    const token = ++duelGen
    ui.setRoomCode(null)
    return token
  }
  const duelQuick = () => {
    const token = duelGuard()
    if (token === null) return
    ui.setDuelStatus('CONNECTING…')
    void (async () => {
      const found = await quickMatch(pilotName(), s => {
        if (token === duelGen) ui.setDuelStatus(s)
      }).catch(() => null)
      if (token !== duelGen) return
      if (!found) {
        ui.setDuelStatus('OFFLINE · CPU RIVAL DEPLOYED')
        beginDuel('', false)
      } else {
        if (found.role === 'join') ui.setDuelStatus(`RIVAL FOUND · JOINING ${found.code}…`)
        await openDuelRoom(found.code, token)
      }
      duelBusy = false
    })().catch(() => {
      duelBusy = false
    })
  }
  const duelHost = () => {
    const token = duelGuard()
    if (token === null) return
    void openDuelRoom(makeRoomCode(), token).finally(() => {
      duelBusy = false
    })
  }
  const duelJoin = (raw: string) => {
    const token = duelGuard()
    if (token === null) return
    const code = normalizeRoomCode(raw)
    if (!code) {
      ui.setDuelStatus('BAD CODE · 6 CHARS A-Z 2-9')
      duelBusy = false
      return
    }
    void openDuelRoom(code, token).finally(() => {
      duelBusy = false
    })
  }
  const duelCancel = () => {
    duelGen += 1
    duelBusy = false
    closeDuelLink()
    ui.setDuelStatus(null)
    ui.setRoomCode(null)
  }
  const ui = new Ui(i18n, save, audio, {
    play: mode => startMatch(mode),
    restart: () => {
      // CPU-duel rematch stays a duel; anything else restarts normally.
      if (game?.duel && !game.duel.remote) beginDuel('', false)
      else {
        closeDuelLink()
        startMatch()
      }
    },
    resume,
    quit: () => {
      closeDuelLink()
      duelGen += 1
      ui.setDuelStatus(null)
      ui.setRoomCode(null)
      game?.toTitle()
      ui.resetHud()
      ui.show('title')
      input.unlockPointer()
    },
    settings: patch => {
      const qualityChanged = patch.quality !== undefined && patch.quality !== save.data.quality
      save.update(patch)
      applySettings(save.data)
      if (qualityChanged && game) {
        game.renderer.applyQuality(save.data.quality)
        game.setQuality()
      }
      void cloud?.pushProgress(save.data)
    },
    pickPerk,
    accountSignIn: (email, password) => {
      void (async () => {
        if (!cloud) return
        await cloud.signIn(email, password)
        const remote = await cloud.pullProgress()
        if (remote) {
          save.replace(remote)
          applySettings(save.data)
          ui.refreshSettings()
        }
      })().catch(() => {})
    },
    accountSignUp: (email, password) => {
      void cloud?.signUp(email, password).catch(() => {})
    },
    accountSignOut: () => { void cloud?.signOut() },
    requestDebrief: () => {
      void (async () => {
        if (!cloud) return
        const report = await cloud.debrief(lastDebriefPayload)
        ui.showAiDebrief(report)
      })().catch(error => ui.events.message(error instanceof Error ? error.message : 'AI DEBRIEF UNAVAILABLE', 'warn'))
    },
    duelQuick,
    duelHost,
    duelJoin,
    duelCancel,
  })
  cloud = new CloudServices(status => ui.setCloudStatus(status))
  ui.show('boot')
  if (cloud.user) {
    const remote = await cloud.pullProgress().catch(() => null)
    if (remote) save.replace(remote)
  }
  applySettings(save.data)
  // Keep the spark layer and loading tips alive while the heavy modules download.
  let bootRaf = 0
  let bootLast = performance.now()
  const bootTick = (now: number) => {
    ui.tick(Math.min(0.05, (now - bootLast) / 1000))
    bootLast = now
    bootRaf = requestAnimationFrame(bootTick)
  }
  bootRaf = requestAnimationFrame(bootTick)

  const parts = { code: 0, library: 0, stage: 0 }
  const progress = (label?: string) => ui.setBootProgress(0.04 + parts.code * 0.16 + parts.library * 0.5 + parts.stage * 0.3, label)
  progress('ARMING BUGFRONT')
  const [{ Game }, { Renderer, suggestQuality }, physics, { Assets }, { loadLibrary }, { StageLoader }] = await Promise.all([
    import('./game/game'),
    import('./engine/renderer'),
    import('./engine/physics'),
    import('./engine/assets'),
    import('./game/library'),
    import('./game/stages'),
    document.fonts.ready,
  ])
  await physics.initPhysics()
  parts.code = 1
  progress('BUILDING ARENA')
  if (firstRun) {
    save.update({ quality: suggestQuality() })
    ui.refreshSettings()
  }
  const renderer = new Renderer(canvas, save.data.quality)
  const assets = new Assets()
  const aniso = renderer.gl.capabilities.getMaxAnisotropy()
  const loader = new StageLoader(assets, audio, aniso)
  const [lib] = await Promise.all([
    loadLibrary(assets, aniso, p => {
      parts.library = p
      progress()
    }),
    loader.boot(p => {
      parts.stage = p
      progress(p < 1 ? 'ARMING WAVE 1' : undefined)
    }),
  ])
  progress('CALIBRATING OPTICS')
  game = new Game(renderer, input, audio, lib, loader.staged, loader, {
    ...ui.events,
    perks: offer => {
      ui.events.perks(offer)
      // Free the cursor so the perk cards can be clicked; re-lock after the pick.
      if (offer) input.unlockPointer()
    },
    perkChosen: i => ui.perkChosen(i),
    ended: (match, summary) => {
      input.unlockPointer()
      lastDebriefPayload = summary
        ? { ...summary, score: summary.score, elapsedSeconds: summary.time }
        : { mode: game!.gameMode, score: match.score, kills: match.combatants[0]?.kills ?? 0, accuracy: match.stats.shots ? match.stats.hits / match.stats.shots : 0, headshots: match.stats.headshots, elapsedSeconds: match.elapsed, won: match.phase === 'won' }
      void cloud?.recordMatch(summary ?? null, summary?.mode ?? game!.gameMode, summary?.score ?? match.score, summary?.time ?? match.elapsed)
      void cloud?.pushProgress(save.data)
      ui.showResults(match, game!.standings(), summary)
    },
  })
  applySettings(save.data)
  const g = game
  if (import.meta.env.DEV) {
    const [{ registerGameTuning }, { tuning }] = await Promise.all([import('../scripts/manus-tuning/adapter.js'), import('./game/tuning')])
    await registerGameTuning(tuning)
  }
  // Warm up shaders for every material present so the first explosion does not hitch.
  renderer.gl.compile(g.scene, g.camera)

  // Background streaming waits while the fight is heavy (enemy/VFX counts or slow frames).
  let frameAvg = 16
  loader.isBusy = () => g.isBusy() || frameAvg > 21 || document.hidden
  const loop = new GameLoop({
    step: dt => g.step(dt),
    render: (alpha, frameSeconds) => {
      frameAvg += (Math.min(0.1, frameSeconds) * 1000 - frameAvg) * 0.05
      // Real frame time drives the VFX budget (bulk emitters shed particles when frames run long).
      g.fx.frameTime(frameSeconds * 1000)
      input.update()
      if (input.consume('pause') && performance.now() - lockLostAt > 300) {
        if (g.mode === 'playing' || g.mode === 'countdown') pause()
        else if (g.mode === 'paused' && ui.screen === 'pause') resume()
      }
      // Keyboard perk selection (1–3) while the perk cards are up.
      if (g.choosingPerk) {
        if (input.consume('slot1')) pickPerk(0)
        else if (input.consume('slot2')) pickPerk(1)
        else if (input.consume('slot3')) pickPerk(2)
      }
      g.render(alpha, frameSeconds)
      ui.tick(frameSeconds)
      if (g.mode === 'playing' || g.mode === 'countdown' || g.mode === 'ended' || g.mode === 'paused') {
        const pxPerRad = window.innerHeight / 2 / Math.tan((g.camera.fov * Math.PI) / 360)
        ui.updateHud(g.hud(), g.standings(), input.held('scoreboard'), pxPerRad, frameSeconds)
      }
      // Duel net pump: validated outbound messages go out, the link is dropped with the duel.
      if (duelLink && g.duel?.remote) {
        for (const m of g.duelDrain()) duelLink.send(m)
      } else g.duelDrain()
    },
  })
  cancelAnimationFrame(bootRaf)
  ui.setBootProgress(1, 'READY')
  loop.start()
  document.addEventListener('pointerlockchange', () => {
    // Browsers release pointer lock on Escape without delivering the key: treat that as pause.
    if (!document.pointerLockElement && (g.mode === 'playing' || g.mode === 'countdown') && input.method === 'keyboard' && !g.choosingPerk) {
      lockLostAt = performance.now()
      pause()
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause()
  })
  window.addEventListener('game:pause', pause)
  canvas.addEventListener('click', () => {
    if ((g.mode === 'playing' || g.mode === 'countdown') && !g.choosingPerk) input.lockPointer()
  })
  // First gesture unlocks audio and (re)starts music blocked by the autoplay policy.
  const gesture = () => {
    audio.unlock()
    audio.retryMusic()
  }
  window.addEventListener('pointerdown', gesture)
  window.addEventListener('keydown', gesture)
  window.setTimeout(() => {
    ui.show('title')
    document.getElementById('boot-ph')?.remove()
    audio.playMusic('title', 1.5)
    // Invite links land here: prefill the join box so one tap deploys.
    const invite = roomCodeFromQuery(location.search)
    if (invite) {
      ui.setJoinCode(invite)
      ui.setDuelStatus(`INVITE ${invite} · TAP JOIN TO DEPLOY`)
    }
    // Background streaming starts once the title is up.
    window.setTimeout(() => loader.startBackground(), 600)
  }, 250)
  // Debug/test hook (read-only use): smoke tests inspect match state through it.
  ;(window as unknown as { __game: unknown }).__game = { game: g, ui, input, save, loader, audio }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

boot().catch(err => {
  console.error(err)
  const el = document.getElementById('ui')
  if (el) el.innerHTML = `<div class="fatal">Failed to start: ${String((err as Error)?.message ?? err).replace(/[<>&]/g, '')}</div>`
})
