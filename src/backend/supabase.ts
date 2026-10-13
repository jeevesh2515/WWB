export type SupabaseUser = { id: string; email?: string }
export type SupabaseSession = { access_token: string; refresh_token?: string; user: SupabaseUser }

type AuthResponse = { access_token?: string; refresh_token?: string; user?: SupabaseUser; error?: string; msg?: string }

const URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') ?? ''
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
const SESSION_KEY = 'worldwarb.supabase.session'

export const supabaseConfigured = Boolean(URL && ANON_KEY)

function loadSession(): SupabaseSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SupabaseSession
    return parsed?.access_token && parsed.user?.id ? parsed : null
  } catch {
    return null
  }
}

function storeSession(session: SupabaseSession | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // Private browsing should not prevent the offline game from running.
  }
}

async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!supabaseConfigured) throw new Error('Supabase is not configured')
  const response = await fetch(`${URL}${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!response.ok) {
    const message = typeof body === 'object' && body && 'msg' in body ? String(body.msg) : typeof body === 'object' && body && 'message' in body ? String(body.message) : `Supabase request failed (${response.status})`
    throw new Error(message)
  }
  return body as T
}

export class SupabaseHttp {
  session: SupabaseSession | null = loadSession()

  get user(): SupabaseUser | null { return this.session?.user ?? null }

  private authHeaders(): HeadersInit {
    return this.session ? { Authorization: `Bearer ${this.session.access_token}` } : {}
  }

  async signIn(email: string, password: string): Promise<SupabaseUser> {
    const result = await json<AuthResponse>('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) })
    if (!result.access_token || !result.user) throw new Error(result.error ?? result.msg ?? 'Unable to sign in')
    this.session = { access_token: result.access_token, refresh_token: result.refresh_token, user: result.user }
    storeSession(this.session)
    return result.user
  }

  async signUp(email: string, password: string): Promise<{ user: SupabaseUser | null; needsEmailConfirmation: boolean }> {
    const result = await json<AuthResponse>('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password }) })
    if (result.error || result.msg) throw new Error(result.error ?? result.msg)
    if (result.access_token && result.user) {
      this.session = { access_token: result.access_token, refresh_token: result.refresh_token, user: result.user }
      storeSession(this.session)
    }
    return { user: result.user ?? null, needsEmailConfirmation: !result.access_token }
  }

  async signOut(): Promise<void> {
    if (this.session) await json('/auth/v1/logout', { method: 'POST', headers: this.authHeaders() }).catch(() => {})
    this.session = null
    storeSession(null)
  }

  async select<T>(table: string, query: string): Promise<T[]> {
    return json<T[]>(`/rest/v1/${table}?${query}`, { headers: this.authHeaders() })
  }

  async upsert(table: string, value: unknown, onConflict: string): Promise<void> {
    await json(`/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: 'POST',
      headers: { ...this.authHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(value),
    })
  }

  async insert(table: string, value: unknown): Promise<void> {
    await json(`/rest/v1/${table}`, { method: 'POST', headers: { ...this.authHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(value) })
  }

  async invoke<T>(name: string, body: unknown): Promise<T> {
    return json<T>(`/functions/v1/${name}`, { method: 'POST', headers: this.authHeaders(), body: JSON.stringify(body) })
  }
}
