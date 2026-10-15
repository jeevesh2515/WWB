/**
 * Supabase Realtime transport for 1v1 duels (lazy-loaded: `realtime-js` ships in
 * its own chunk, never in the boot bundle). No database tables: rooms and the
 * quick-match lobby are broadcast + presence channels only.
 */
import type { RealtimeChannel, RealtimeClient } from '@supabase/realtime-js'
import { supabaseEnv } from '../backend/supabase'
import { DUEL, DUEL_LOBBY, duelChannel, isDuelMsg, makeRoomCode, type DuelMsg } from './duel'

export type DuelLinkEvents = {
  onMsg(m: DuelMsg): void
  /** True once a second client is present in the room. */
  onPeer(present: boolean): void
}

const SUB_TIMEOUT_MS = 8000

function clientId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`
}

async function connect(): Promise<RealtimeClient> {
  const env = supabaseEnv()
  if (!env) throw new Error('Supabase is not configured')
  const { RealtimeClient } = await import('@supabase/realtime-js')
  const client = new RealtimeClient(`${env.url}/realtime/v1`, { params: { apikey: env.key } })
  client.connect()
  return client
}

function subscribe(channel: RealtimeChannel): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Realtime subscribe timed out')), SUB_TIMEOUT_MS)
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        window.clearTimeout(timer)
        resolve()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        window.clearTimeout(timer)
        reject(new Error(`Realtime subscribe failed: ${status}`))
      }
    })
  })
}

  /** Live link to one duel room. shortcut: rooms assume exactly 2 peers — a third joiner would interleave poses. */
export class DuelLink {
  private constructor(
    private readonly client: RealtimeClient,
    private readonly channel: RealtimeChannel,
    readonly code: string,
  ) {}

  static async open(code: string, name: string, events: DuelLinkEvents): Promise<DuelLink> {
    const client = await connect()
    const id = clientId()
    const channel = client.channel(duelChannel(code), { config: { broadcast: { self: false }, presence: { key: id } } })
    channel.on('broadcast', { event: 'duel' }, ({ payload }: { payload: unknown }) => {
      if (isDuelMsg(payload)) events.onMsg(payload)
    })
    channel.on('presence', { event: 'sync' }, () => {
      events.onPeer(Object.keys(channel.presenceState()).length > 1)
    })
    try {
      await subscribe(channel)
    } catch (error) {
      client.removeChannel(channel)
      client.disconnect()
      throw error
    }
    await channel.track({ id, name, at: Date.now() }).catch(() => {})
    events.onPeer(Object.keys(channel.presenceState()).length > 1)
    return new DuelLink(client, channel, code)
  }

  send(m: DuelMsg): void {
    this.channel.send({ type: 'broadcast', event: 'duel', payload: m }).catch(() => {})
  }

  /** Announce departure so the rival's CPU-takeover fires instantly (presence sync is the fallback). */
  async close(byeSeq: number): Promise<void> {
    try {
      await this.channel.send({ type: 'broadcast', event: 'duel', payload: { t: 'bye', seq: byeSeq } })
    } catch {
      // Leaving anyway.
    }
    await this.client.removeChannel(this.channel).catch(() => {})
    this.client.disconnect()
  }
}

export type QuickMatch = { role: 'host' | 'join'; code: string }

type LobbyWaiter = { id: string; room: string; at: number; name: string }

/** Oldest lobby waiter that is not us (null when nobody else is waiting). */
function oldestWaiter(channel: RealtimeChannel, selfId: string): LobbyWaiter | null {
  const state = channel.presenceState() as unknown as Record<string, LobbyWaiter[]>
  let best: LobbyWaiter | null = null
  for (const key of Object.keys(state)) {
    const list = state[key]
    if (!Array.isArray(list)) continue
    for (const w of list) {
      if (!w || w.id === selfId || !w.room) continue
      if (!best || w.at < best.at) best = w
    }
  }
  return best
}

/**
 * Presence-based random matchmaking: wait in the lobby briefly; join the oldest
 * waiting rival if one exists, else host our own room and let the caller wait
 * for a guest (CPU fallback after DUEL.waitForPeerMs).
 */
export async function quickMatch(name: string, onStatus: (s: string) => void): Promise<QuickMatch | null> {
  let client: RealtimeClient
  try {
    client = await connect()
  } catch {
    return null
  }
  const id = clientId()
  const room = makeRoomCode()
  const me: LobbyWaiter = { id, room, at: Date.now(), name }
  const channel = client.channel(DUEL_LOBBY, { config: { broadcast: { self: false }, presence: { key: id } } })
  let joinCode: string | null = null
  channel.on('presence', { event: 'sync' }, () => {
    joinCode = oldestWaiter(channel, id)?.room ?? null
  })
  try {
    await subscribe(channel)
    await channel.track(me).catch(() => {})
  } catch {
    await client.removeChannel(channel).catch(() => {})
    client.disconnect()
    return null
  }
  onStatus('SCANNING FOR RIVALS…')
  await new Promise(resolve => window.setTimeout(resolve, DUEL.lobbySettleMs))
  await client.removeChannel(channel).catch(() => {})
  client.disconnect()
  if (joinCode) return { role: 'join', code: joinCode }
  return { role: 'host', code: room }
}
