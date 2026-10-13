import type { SaveData } from '../engine/save'
import type { GameMode, RunSummary } from '../game/game'
import { SupabaseHttp, supabaseConfigured, type SupabaseUser } from './supabase'

export type CloudStatus = { configured: boolean; user: SupabaseUser | null; message: string }
export type AiDebrief = { title: string; summary: string; drills: string[] }

export class CloudServices {
  private readonly api = new SupabaseHttp()
  private readonly onStatus: (status: CloudStatus) => void

  constructor(onStatus: (status: CloudStatus) => void) {
    this.onStatus = onStatus
    this.publish(supabaseConfigured ? (this.api.user ? 'ONLINE PROFILE READY' : 'SIGN IN TO SYNC PROGRESS') : 'OFFLINE MODE · ADD SUPABASE ENV VARS TO ENABLE ACCOUNTS')
  }

  get user(): SupabaseUser | null { return this.api.user }
  get configured(): boolean { return supabaseConfigured }

  private publish(message: string): void {
    this.onStatus({ configured: supabaseConfigured, user: this.api.user, message })
  }

  async signIn(email: string, password: string): Promise<void> {
    try {
      await this.api.signIn(email, password)
      this.publish('PROFILE SYNCED ACROSS DEVICES')
    } catch (error) {
      this.publish(error instanceof Error ? error.message.toUpperCase() : 'SIGN IN FAILED')
      throw error
    }
  }

  async signUp(email: string, password: string): Promise<void> {
    try {
      const result = await this.api.signUp(email, password)
      this.publish(result.needsEmailConfirmation ? 'CHECK YOUR EMAIL TO CONFIRM ACCOUNT' : 'ACCOUNT CREATED · PROFILE READY')
    } catch (error) {
      this.publish(error instanceof Error ? error.message.toUpperCase() : 'ACCOUNT CREATION FAILED')
      throw error
    }
  }

  async signOut(): Promise<void> {
    await this.api.signOut()
    this.publish(supabaseConfigured ? 'SIGNED OUT · LOCAL SAVE STILL AVAILABLE' : 'OFFLINE MODE')
  }

  async pullProgress(): Promise<SaveData | null> {
    if (!this.api.user) return null
    const rows = await this.api.select<{ save_data: SaveData }>('player_progress', `player_id=eq.${encodeURIComponent(this.api.user.id)}&select=save_data&limit=1`)
    return rows[0]?.save_data ?? null
  }

  async pushProgress(save: SaveData): Promise<void> {
    if (!this.api.user) return
    await this.api.upsert('player_progress', { player_id: this.api.user.id, save_data: save }, 'player_id')
  }

  async recordMatch(summary: RunSummary | null, mode: GameMode, score: number, elapsedSeconds: number): Promise<void> {
    if (!this.api.user) return
    await this.api.insert('match_records', {
      player_id: this.api.user.id,
      mode,
      score: Math.max(0, Math.floor(score)),
      elapsed_seconds: Math.max(0, Math.round(elapsedSeconds)),
      summary: summary ?? {},
    })
  }

  async debrief(payload: Record<string, unknown>): Promise<AiDebrief> {
    if (!this.api.user) throw new Error('Sign in to request an AI debrief')
    return this.api.invoke<AiDebrief>('after-action', payload)
  }
}
