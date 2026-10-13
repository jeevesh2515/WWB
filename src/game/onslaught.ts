/**
 * Bugfront rules (pure, unit-tested): style meter, wave plans and upgrade cards.
 */
export const RANKS = ['D', 'C', 'B', 'A', 'S', 'SS', 'FRONTBREAKER'] as const
export type Rank = (typeof RANKS)[number]
export const RANK_MULT = [1, 1.25, 1.5, 2, 2.5, 3, 4]
export const RANK_COLOR = ['#9aa3ad', '#6fd0ff', '#6dff9a', '#ffe14d', '#ff9a2e', '#ff4a3a', '#ff3df0']

export type StyleEvent = 'kill' | 'headshot' | 'multi' | 'airborne' | 'slide' | 'explosive' | 'arsenal' | 'overkill' | 'longshot' | 'weakpoint' | 'grenade' | 'overdrive' | 'boss' | 'wave'
export const STYLE_POINTS: Record<StyleEvent, number> = {
  kill: 100, headshot: 60, multi: 80, airborne: 70, slide: 70, explosive: 60, arsenal: 50, overkill: 50, longshot: 60, weakpoint: 45, grenade: 60, overdrive: 40, boss: 2500, wave: 300,
}
export const STYLE_LABEL: Record<StyleEvent, string> = {
  kill: 'KILL', headshot: 'HEADSHOT', multi: 'MULTI-KILL', airborne: 'AIRBORNE', slide: 'SLIDE KILL', explosive: 'DEMOLITION', arsenal: 'ARSENAL', overkill: 'OVERKILL', longshot: 'LONG SHOT', weakpoint: 'CORE BREACH', grenade: 'FRAG OUT', overdrive: 'OVERDRIVE', boss: 'WARDEN DOWN', wave: 'WAVE CLEAR',
}

export type StyleState = {
  rank: number
  fill: number
  score: number
  overdrive: number
  grace: number
  best: number
}
export const newStyle = (): StyleState => ({ rank: 0, fill: 0, score: 0, overdrive: 0, grace: 0, best: 0 })

export type StyleGain = { state: StyleState; points: number; rankedUp: boolean; label: string }

/** Award style points: fills the meter (harder at higher ranks), charges Overdrive, scores × rank. */
export function awardStyle(s: StyleState, ev: StyleEvent, overclock = 1, scale = 1): StyleGain {
  const pts = Math.round(STYLE_POINTS[ev] * scale)
  let { rank, fill, overdrive } = s
  fill += (pts * 0.34) / (1 + rank * 0.32)
  let rankedUp = false
  while (fill >= 100 && rank < RANKS.length - 1) {
    fill -= 100
    rank += 1
    rankedUp = true
  }
  if (rank === RANKS.length - 1) fill = Math.min(fill, 100)
  overdrive = Math.min(1, overdrive + (pts / 1100) * overclock)
  const score = s.score + Math.round(pts * RANK_MULT[s.rank])
  return { state: { ...s, rank, fill, overdrive, score, grace: 1.6, best: Math.max(s.best, rank) }, points: pts, rankedUp, label: STYLE_LABEL[ev] }
}

/** Meter decays after a short grace; emptying drops a rank (to half fill). */
export function decayStyle(s: StyleState, dt: number): StyleState {
  if (s.grace > 0) return { ...s, grace: Math.max(0, s.grace - dt) }
  let fill = s.fill - dt * (5 + s.rank * 3.2)
  let rank = s.rank
  if (fill < 0) {
    if (rank > 0) {
      rank -= 1
      fill += 60
    } else fill = 0
  }
  return { ...s, fill, rank }
}

/** Taking a real hit costs a rank. */
export function hurtStyle(s: StyleState): StyleState {
  if (s.rank === 0) return { ...s, fill: Math.max(0, s.fill - 35) }
  return { ...s, rank: s.rank - 1, fill: 45, grace: 0.6 }
}

// ─── waves ────────────────────────────────────────────────────────────────
export type EnemyKind = 'scrapper' | 'hornet' | 'juggernaut' | 'titan'
export type WavePlan = { counts: Partial<Record<EnemyKind, number>>; stage: number; title: string; subtitle: string; boss?: boolean }
export const WAVES: WavePlan[] = [
  { counts: { scrapper: 5 }, stage: 1, title: 'WAVE 1', subtitle: 'WOLF PACK PATROL' },
  { counts: { scrapper: 7, hornet: 2 }, stage: 2, title: 'WAVE 2', subtitle: 'HOUNDS + SENTINELS INBOUND · FRAGS ONLINE' },
  { counts: { scrapper: 6, hornet: 5 }, stage: 2, title: 'WAVE 3', subtitle: 'THE PACK' },
  { counts: { scrapper: 6, hornet: 3, juggernaut: 1 }, stage: 3, title: 'WAVE 4', subtitle: 'EXO HEAVY DETECTED · RPG-X SUPPLY DROP' },
  { counts: { scrapper: 8, hornet: 4, juggernaut: 1 }, stage: 3, title: 'WAVE 5', subtitle: 'HEAVY METAL' },
  { counts: { scrapper: 8, hornet: 6, juggernaut: 2 }, stage: 3, title: 'WAVE 6', subtitle: 'IRON TIDE' },
  { counts: { scrapper: 10, hornet: 6, juggernaut: 2 }, stage: 3, title: 'WAVE 7', subtitle: 'STORMFRONT' },
  { counts: { titan: 1, scrapper: 4, hornet: 2 }, stage: 4, title: 'FINAL WAVE', subtitle: 'THE WARDEN AWAKENS', boss: true },
]
export const MAX_ALIVE = 10

/** Spawn order: heavies late in the first half, boss first, the rest interleaved. */
export function spawnOrder(plan: WavePlan, rnd: () => number = Math.random): EnemyKind[] {
  const out: EnemyKind[] = []
  if (plan.counts.titan) for (let i = 0; i < plan.counts.titan; i += 1) out.push('titan')
  const pool: EnemyKind[] = []
  for (let i = 0; i < (plan.counts.scrapper ?? 0); i += 1) pool.push('scrapper')
  for (let i = 0; i < (plan.counts.hornet ?? 0); i += 1) pool.push('hornet')
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  // Keep the opener readable: first two spawns are Wolves when available.
  for (let slot = 0; slot < Math.min(2, pool.length); slot += 1) {
    if (pool[slot] === 'scrapper') continue
    const k = pool.indexOf('scrapper', slot + 1)
    if (k > 0) [pool[slot], pool[k]] = [pool[k], pool[slot]]
  }
  const jugs = plan.counts.juggernaut ?? 0
  for (let i = 0; i < jugs; i += 1) pool.splice(Math.min(pool.length, Math.floor(pool.length * (0.25 + i * 0.35))), 0, 'juggernaut')
  return [...out, ...pool]
}

export function waveSize(plan: WavePlan): number {
  return Object.values(plan.counts).reduce((a, b) => a + (b ?? 0), 0)
}

// ─── upgrade cards ────────────────────────────────────────────────────────
export type PerkId = 'hollow' | 'quick' | 'plated' | 'scavenger' | 'overclock' | 'demolitions' | 'vampire' | 'choke'
export type Perk = { id: PerkId; name: string; desc: string; max: number }
export const PERKS: Perk[] = [
  { id: 'hollow', name: 'HOLLOW POINTS', desc: '+20% rifle damage', max: 3 },
  { id: 'quick', name: 'QUICK HANDS', desc: '+30% reload speed', max: 2 },
  { id: 'plated', name: 'PLATED', desc: '+50 max armor, armor refilled', max: 2 },
  { id: 'scavenger', name: 'SCAVENGER', desc: '+50% shard magnet radius, +25% shard value', max: 2 },
  { id: 'overclock', name: 'OVERCLOCK', desc: '+35% Overdrive charge rate', max: 2 },
  { id: 'demolitions', name: 'DEMOLITIONS', desc: '+1 grenade, +25% blast radius', max: 2 },
  { id: 'vampire', name: 'VAMPIRE CORE', desc: 'Every kill restores 5 health', max: 3 },
  { id: 'choke', name: 'CHOKE', desc: '-30% shotgun spread, +15% damage', max: 2 },
]
export type PerkLevels = Partial<Record<PerkId, number>>

/** Offer three distinct cards that are not maxed out. */
export function offerPerks(levels: PerkLevels, rnd: () => number = Math.random): Perk[] {
  const open = PERKS.filter(p => (levels[p.id] ?? 0) < p.max)
  for (let i = open.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1))
    ;[open[i], open[j]] = [open[j], open[i]]
  }
  return open.slice(0, 3)
}

export type PerkEffects = { rifleDamage: number; reloadSpeed: number; maxArmor: number; magnet: number; shardValue: number; overclock: number; grenades: number; blast: number; vampire: number; shotgunSpread: number; shotgunDamage: number }
export function perkEffects(l: PerkLevels): PerkEffects {
  const n = (id: PerkId) => l[id] ?? 0
  return {
    rifleDamage: 1 + 0.2 * n('hollow'),
    reloadSpeed: 1 + 0.3 * n('quick'),
    maxArmor: 150 + 50 * n('plated'),
    magnet: 1 + 0.5 * n('scavenger'),
    shardValue: 1 + 0.25 * n('scavenger'),
    overclock: 1 + 0.35 * n('overclock'),
    grenades: 2 + n('demolitions'),
    blast: 1 + 0.25 * n('demolitions'),
    vampire: 5 * n('vampire'),
    shotgunSpread: Math.pow(0.7, n('choke')),
    shotgunDamage: 1 + 0.15 * n('choke'),
  }
}
