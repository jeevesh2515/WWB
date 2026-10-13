import * as THREE from 'three'
import type { Assets } from '../engine/assets'
import { SAMPLE_STAGES, type Audio } from '../engine/audio'
import type { FxTextures } from './fx'
import type { Library } from './library'
import { inPlaceClips, type RobotAsset, type RobotLook } from './robot'
import type { VmAssets } from './tripoguns'

/**
 * Staged streaming.
 *
 * Stage 1 (boot, behind the loading screen): arena textures/HDRI/props (loadLibrary), rifle +
 * shotgun, the robot rig, VFX atlases and core SFX — everything the title screen and Wave 1 need.
 * Stage 2 (Hounds, grenades), Stage 2 also brings Sentinel robots; Stage 3 (Exo heavy, rocket launcher), Stage 4 (Warden boss, boss
 * music) then stream in the background, one file at a time, pausing whenever the game reports it
 * is busy (many enemies/particles on screen or frame time rising). Before a wave that needs a stage
 * the game calls ensure(stage), which jumps that stage to the front of the queue.
 */
export type StageId = 1 | 2 | 3 | 4
export type Staged = {
  /** V3 characters by look (stage 1: operator, breacher; 3: sentinel; 4: warden). */
  chars: Partial<Record<RobotLook, RobotAsset>>
  /** V4: Kai, the player's full body (stage 1, shadow-only). */
  player?: RobotAsset
  /** Hound quadruped scan (stage 2). */
  hound?: THREE.Object3D
  /** V5: ship-to-shore crane scan for the quay skyline (stage 2). */
  sts?: THREE.Object3D
  /** Scanned first-person weapons and arms (stage 1: rifle, shotgun, arms; stage 3: launcher, rocket). */
  vm: VmAssets
  fx?: FxTextures
  ui: Record<string, string>
}
type Job = () => Promise<void>

export class StageLoader {
  readonly staged: Staged = { vm: {}, chars: {}, ui: {} }
  private readonly done = new Set<StageId>()
  private readonly pending = new Map<StageId, Promise<void>>()
  private queue: StageId[] = [2, 3, 4]
  private readonly urgent = new Set<StageId>()
  private running = false
  /** Returns true while gameplay is heavy; background loading waits. */
  isBusy: () => boolean = () => false
  onStageReady?: (s: StageId) => void
  paused = false

  constructor(
    private readonly assets: Assets,
    private readonly audio: Audio,
    readonly anisotropy: number,
  ) {}

  isReady(s: StageId): boolean {
    return this.done.has(s)
  }

  private jobs(s: StageId): Job[] {
    const A = this.assets
    const char = (look: RobotLook): Job => async () => {
      const g = await A.gltf(`assets/v4chars/${look}.glb`)
      this.staged.chars[look] = { scene: g.scene, clips: inPlaceClips(g.animations) }
    }
    const vm = (k: keyof VmAssets, file: string): Job => async () => {
      this.staged.vm[k] = (await A.gltf(`assets/vm/${file}.glb`)).scene
    }
    const sfx = (names: readonly Parameters<Audio['loadSamples']>[1][number][]): Job[] =>
      names.map(n => () => this.audio.loadSamples('assets/sfx/', [n]))
    switch (s) {
      case 1:
        return [
          vm('rifle', 'rifle'),
          vm('shotgun', 'shotgun'),
          vm('armR', 'arm_r'),
          vm('armL', 'arm_l'),
          char('operator'),
          async () => {
            const g = await A.gltf('assets/v4chars/player.glb')
            this.staged.player = { scene: g.scene, clips: inPlaceClips(g.animations) }
          },
          char('breacher'),
          async () => {
            const [additive, smoke, decals] = await Promise.all([
              A.texture('assets/fx/additive.webp', { color: true }),
              A.texture('assets/fx/smoke.webp', { color: true }),
              A.texture('assets/fx/decals.webp', { color: true }),
            ])
            for (const t of [additive, smoke, decals]) {
              t.anisotropy = 4
              t.generateMipmaps = true
              t.minFilter = THREE.LinearMipmapLinearFilter
            }
            this.staged.fx = { additive, smoke, decals }
          },
          () => this.audio.loadSamples('assets/sfx/', SAMPLE_STAGES.core),
        ]
      case 2:
        return [char('sentinel'), async () => { this.staged.hound = (await A.gltf('assets/v4chars/hound.glb')).scene }, async () => { this.staged.sts = (await A.gltf('assets/models/sts_crane.glb')).scene }, ...sfx(SAMPLE_STAGES.drones)]
      case 3:
        return [char('exo'), vm('launcher', 'launcher'), vm('rocket', 'rocket'), ...sfx(SAMPLE_STAGES.heavy)]
      case 4:
        return [char('warden'), ...sfx(SAMPLE_STAGES.boss), async () => this.audio.prefetchMusic('boss')]
    }
  }

  /** Load stage 1 at full speed with progress (boot). */
  async boot(onProgress: (p: number) => void): Promise<void> {
    const jobs = this.jobs(1)
    let n = 0
    await Promise.all(
      jobs.map(j =>
        j().then(() => {
          n += 1
          onProgress(n / jobs.length)
        }),
      ),
    )
    this.done.add(1)
  }

  /** Make sure a stage is loaded now (bumps it to the front and ignores busy state). */
  ensure(s: StageId): Promise<void> {
    if (this.done.has(s)) return Promise.resolve()
    const need: StageId[] = []
    for (let k = 2; k <= s; k += 1) if (!this.done.has(k as StageId)) need.push(k as StageId)
    for (const k of need) this.urgent.add(k)
    return Promise.all(need.map(k => this.load(k, true))).then(() => undefined)
  }

  private load(s: StageId, urgent: boolean): Promise<void> {
    let p = this.pending.get(s)
    if (!p) {
      p = (async () => {
        for (const job of this.jobs(s)) {
          while (!urgent && !this.urgent.has(s) && (this.paused || this.isBusy())) await wait(400)
          try {
            await job()
          } catch (err) {
            console.warn('stage job failed', s, err)
          }
          if (!urgent && !this.urgent.has(s)) await wait(30)
        }
        this.done.add(s)
        this.queue = this.queue.filter(q => q !== s)
        this.onStageReady?.(s)
      })()
      this.pending.set(s, p)
    }
    return p
  }

  /** Start the background prefetch chain (stages 2 → 4). */
  startBackground(): void {
    if (this.running) return
    this.running = true
    void (async () => {
      while (this.queue.length) {
        const s = this.queue[0]
        await this.load(s, false)
      }
    })()
  }
}

const wait = (ms: number) => new Promise<void>(r => window.setTimeout(r, ms))

export type { Library }
