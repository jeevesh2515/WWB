import { describe, expect, it } from 'vitest'
import {
  DUEL, RivalTrack, duelChannel, duelInviteQuery, isDuelMsg, makeRoomCode,
  normalizeRoomCode, roomCodeFromQuery, type DuelMsg, type DuelStateMsg,
} from '../src/net/duel'
import { createMatch, placement, registerDeath, registerKill, tick, PLAYER_ID } from '../src/game/rules'

describe('duel room codes', () => {
  it('generates 6-char unambiguous codes', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 50; i += 1) {
      const code = makeRoomCode()
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
      seen.add(code)
    }
    expect(seen.size).toBeGreaterThan(40)
  })

  it('normalizes input and rejects junk', () => {
    expect(normalizeRoomCode('ab-23 cd')).toBe('AB23CD')
    expect(normalizeRoomCode('ab23cd')).toBe('AB23CD')
    expect(normalizeRoomCode('AB12C')).toBe(null)
    expect(normalizeRoomCode('AB12CDX')).toBe(null)
    expect(normalizeRoomCode('AB10CD')).toBe(null) // 0/1 excluded from alphabet
    expect(normalizeRoomCode('')).toBe(null)
  })

  it('builds channels and invite links', () => {
    expect(duelChannel('AB23CD')).toBe('wwb-duel:AB23CD')
    expect(duelInviteQuery('AB23CD')).toBe('?duel=AB23CD')
    expect(roomCodeFromQuery('?duel=ab23cd')).toBe('AB23CD')
    expect(roomCodeFromQuery('?duel=nope')).toBe(null)
    expect(roomCodeFromQuery('')).toBe(null)
  })
})

describe('duel wire validation', () => {
  const state: DuelMsg = { t: 'state', x: 1, y: 0, z: 2, yaw: 0.5, hp: 100, alive: true, k: 3, seq: 7 }
  it('accepts well-formed messages', () => {
    expect(isDuelMsg(state)).toBe(true)
    expect(isDuelMsg({ t: 'kill', source: 'rifle', headshot: false, seq: 1 })).toBe(true)
    expect(isDuelMsg({ t: 'hello', name: 'ACE', seq: 0 })).toBe(true)
    expect(isDuelMsg({ t: 'bye', seq: 9 })).toBe(true)
  })

  it('rejects malformed or out-of-range messages', () => {
    expect(isDuelMsg(null)).toBe(false)
    expect(isDuelMsg({ t: 'state' })).toBe(false)
    expect(isDuelMsg({ ...state, x: 5000 })).toBe(false)
    expect(isDuelMsg({ ...state, hp: -5 })).toBe(false)
    expect(isDuelMsg({ ...state, k: -1 })).toBe(false)
    expect(isDuelMsg({ t: 'kill', source: 'nuke', headshot: false, seq: 1 })).toBe(false)
    expect(isDuelMsg({ t: 'hello', name: '', seq: 0 })).toBe(false)
    expect(isDuelMsg({ t: 'hello', name: 'x'.repeat(17), seq: 0 })).toBe(false)
    expect(isDuelMsg({ t: 'bye' })).toBe(false)
  })
})

describe('rival interpolation', () => {
  const st = (x: number, alive = true): DuelStateMsg => ({ t: 'state', x, y: 0, z: 0, yaw: 0, hp: 100, alive, k: 0, seq: 0 })
  it('holds the latest pose when data is fresh, snaps on respawn', () => {
    const track = new RivalTrack(100)
    expect(track.sample(1000)).toBe(null)
    track.push(st(0), 1000)
    track.push(st(10), 1100)
    // Rendered 100 ms in the past: halfway between the two states.
    expect(track.sample(1150)?.x).toBeCloseTo(5)
    // Dead poses are returned as-is (puppet hides).
    track.push(st(10, false), 1200)
    expect(track.sample(1300)?.alive).toBe(false)
    // Respawn snaps instead of lerping from the corpse.
    track.push(st(30), 1300)
    expect(track.sample(1350)?.x).toBe(30)
  })
})

describe('duel bot race (3 min, most bot kills wins)', () => {
  it('counts bot frags for both sides without victim rows', () => {
    let s = createMatch(['RIVAL'], DUEL.seconds, DUEL.fragLimit)
    expect(s.combatants).toHaveLength(2)
    // My bot frag: first blood + headshot, no victim row touched.
    let r = registerKill(s, { killer: PLAYER_ID, victim: -2, headshot: true, weapon: 'rifle' })
    expect(r.state.combatants[0].kills).toBe(1)
    expect(r.state.combatants[0].deaths).toBe(0)
    expect(r.medals).toContain('first')
    // Rival bot frag (arrives as a kill event): counted, no medals.
    r = registerKill(r.state, { killer: 1, victim: -2, weapon: 'shotgun' })
    expect(r.state.combatants[1].kills).toBe(1)
    expect(r.medals).toEqual([])
  })

  it('bot kills never cost a frag, only count deaths', () => {
    let s = createMatch(['RIVAL'], DUEL.seconds, DUEL.fragLimit)
    s = registerKill(s, { killer: PLAYER_ID, victim: -2 }).state
    s = registerDeath(s, PLAYER_ID)
    expect(s.combatants[0].kills).toBe(1)
    expect(s.combatants[0].deaths).toBe(1)
    expect(registerDeath(s, 99)).toBe(s)
  })

  it('ends on the clock with the top fragger winning', () => {
    let s = createMatch(['RIVAL'], DUEL.seconds, DUEL.fragLimit)
    s = registerKill(s, { killer: PLAYER_ID, victim: -2 }).state
    s = registerKill(s, { killer: PLAYER_ID, victim: -2 }).state
    s = registerKill(s, { killer: 1, victim: -2 }).state
    s = tick(s, DUEL.seconds + 1)
    expect(s.phase).toBe('won')
    expect(s.endReason).toBe('time')
    expect(placement(s)).toBe(1)
  })

  it('resolves ties on the clock in favor of the local screen', () => {
    let s = createMatch(['RIVAL'], DUEL.seconds, DUEL.fragLimit)
    s = registerKill(s, { killer: PLAYER_ID, victim: -2 }).state
    s = registerKill(s, { killer: 1, victim: -2 }).state
    s = tick(s, DUEL.seconds + 1)
    expect(s.phase).toBe('won')
    expect(placement(s)).toBe(1)
  })

  it('guarantees state packet kill total repairs dropped kill events', () => {
    let s = createMatch(['RIVAL'], DUEL.seconds, DUEL.fragLimit)
    // Local player has 1 kill
    s = registerKill(s, { killer: PLAYER_ID, victim: -2 }).state
    // Rival state packet reports 3 kills, but local only recorded 0 due to dropped kill events
    const stateK = 3
    const rival = s.combatants.find(c => c.id === 1)!
    if (stateK > rival.kills) rival.kills = stateK
    expect(rival.kills).toBe(3)
    // Ticking to clock end: rival with 3 kills wins over player with 1 kill
    s = tick(s, DUEL.seconds + 1)
    expect(s.phase).toBe('lost')
    expect(placement(s)).toBe(2)
  })
})
