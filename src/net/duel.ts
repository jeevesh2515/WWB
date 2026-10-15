/**
 * 1v1 duel netcode (pure, dependency-free).
 *
 * The transport (Supabase Realtime broadcast) lives in lobby.ts and is lazy-loaded,
 * so this module stays in the boot bundle. It owns room codes, the message envelope
 * with strict validation (never trust the wire), and rival-position interpolation.
 */

export const DUEL = {
  /** Safety cap; the race is decided by the clock. */
  fragLimit: 99,
  /** Race clock: 3 minutes, most bot kills wins. */
  seconds: 180,
  /** Local state broadcasts per second. */
  stateHz: 15,
  /** How long the host waits for a rival before deploying a CPU fallback. */
  waitForPeerMs: 15000,
  /** Quick-match lobby settle time before deciding to host. */
  lobbySettleMs: 2500,
  /** Resync the rival kill counter when event stream and totals drift this far. */
  resyncDrift: 2,
} as const

/** Fixed channel for quick-match presence (no database table needed). */
export const DUEL_LOBBY = 'wwb-duel-lobby'

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const DUEL_CODE_LEN = 6

export function makeRoomCode(rng: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < DUEL_CODE_LEN; i += 1) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]
  return code
}

/** Uppercase, strip spaces/dashes, accept only exact-length alphabet codes. */
export function normalizeRoomCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, '')
  if (code.length !== DUEL_CODE_LEN) return null
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null
  return code
}

export function duelChannel(code: string): string {
  return `wwb-duel:${code}`
}

/** Invite path suffix, e.g. `?duel=AB12CD` (host origin + pathname added by the caller). */
export function duelInviteQuery(code: string): string {
  return `?duel=${code}`
}

export function roomCodeFromQuery(search: string): string | null {
  const m = /(?:\?|&)duel=([^&]*)/.exec(search)
  return m ? normalizeRoomCode(decodeURIComponent(m[1])) : null
}

// ─── messages ─────────────────────────────────────────────────────────────

export type DuelWeapon = 'rifle' | 'shotgun' | 'rocket' | 'grenade' | 'barrel' | 'fall'

export type DuelStateMsg = {
  t: 'state'
  x: number; y: number; z: number; yaw: number
  hp: number; alive: boolean
  /** Sender's total bot kills (resyncs the counter if kill events were lost). */
  k: number
  seq: number
}
/** One bot frag by the sender. Each side is authoritative for its own kills. */
export type DuelKillMsg = { t: 'kill'; source: DuelWeapon; headshot: boolean; seq: number }
export type DuelHelloMsg = { t: 'hello'; name: string; seq: number }
export type DuelByeMsg = { t: 'bye'; seq: number }
export type DuelMsg = DuelStateMsg | DuelKillMsg | DuelHelloMsg | DuelByeMsg

const SOURCES: DuelWeapon[] = ['rifle', 'shotgun', 'rocket', 'grenade', 'barrel', 'fall']

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const inRange = (v: number, lo: number, hi: number): boolean => v >= lo && v <= hi

/** Strict wire validation: malformed or out-of-range messages are dropped. */
export function isDuelMsg(v: unknown): v is DuelMsg {
  if (typeof v !== 'object' || v === null) return false
  const m = v as Record<string, unknown>
  if (!num(m.seq) || !Number.isInteger(m.seq) || !inRange(m.seq, 0, 0xffff)) return false
  switch (m.t) {
    case 'state':
      return num(m.x) && num(m.y) && num(m.z) && num(m.yaw) && num(m.hp) && num(m.k)
        && inRange(m.x, -80, 80) && inRange(m.y, -20, 60) && inRange(m.z, -80, 80)
        && inRange(m.yaw, -1e4, 1e4) && inRange(m.hp, 0, 500) && typeof m.alive === 'boolean'
        && Number.isInteger(m.k) && inRange(m.k, 0, 200)
    case 'kill':
      return typeof m.source === 'string' && (SOURCES as string[]).includes(m.source) && typeof m.headshot === 'boolean'
    case 'hello':
      return typeof m.name === 'string' && m.name.length >= 1 && m.name.length <= 16
    case 'bye':
      return true
    default:
      return false
  }
}

// ─── rival interpolation ──────────────────────────────────────────────────

export type RivalPose = { x: number; y: number; z: number; yaw: number; hp: number; alive: boolean }

/**
 * Renders the rival ~100 ms in the past and lerps between the two bracketing
 * states, so 15 Hz updates look smooth. Respawn (dead → alive) snaps.
 */
export class RivalTrack {
  private prev: (RivalPose & { at: number }) | null = null
  private cur: (RivalPose & { at: number }) | null = null
  private readonly delayMs: number

  constructor(delayMs = 100) {
    this.delayMs = delayMs
  }

  reset(): void {
    this.prev = this.cur = null
  }

  push(s: DuelStateMsg, nowMs = performance.now()): void {
    const pose = { x: s.x, y: s.y, z: s.z, yaw: s.yaw, hp: s.hp, alive: s.alive, at: nowMs }
    if (this.cur && nowMs < this.cur.at) return
    this.prev = this.cur
    this.cur = pose
  }

  sample(nowMs = performance.now()): RivalPose | null {
    const cur = this.cur
    if (!cur) return null
    if (!cur.alive || !this.prev || !this.prev.alive) return { ...cur }
    const target = nowMs - this.delayMs
    const a = this.prev
    const b = cur
    if (target <= a.at) return { ...a }
    if (target >= b.at) {
      // Extrapolate at most one interval, then hold.
      const dt = Math.min(b.at - a.at, 250)
      if (dt <= 0 || nowMs - b.at > 500) return { ...b }
      const k = (target - b.at) / dt
      return { x: b.x + (b.x - a.x) * k, y: b.y, z: b.z + (b.z - a.z) * k, yaw: b.yaw, hp: b.hp, alive: b.alive }
    }
    const k = (target - a.at) / (b.at - a.at)
    let dy = (b.yaw - a.yaw) % (Math.PI * 2)
    if (dy > Math.PI) dy -= Math.PI * 2
    if (dy < -Math.PI) dy += Math.PI * 2
    return {
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      z: a.z + (b.z - a.z) * k,
      yaw: a.yaw + dy * k,
      hp: b.hp,
      alive: b.alive,
    }
  }
}
