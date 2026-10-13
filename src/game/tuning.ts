import { CONFIG, DEFAULT_CONFIG } from './config'

type Mode = 'LIVE' | 'NEXT_ACTION' | 'NEXT_RUN'
type Boundary = 'jump' | 'run'
type Control = { id: string; type: 'number'; category: string; label: string; description: string; unit: string;
  default: number; min: number; max: number; step: number; applyMode: Mode; integrity: 'COSMETIC' | 'GAMEPLAY' }
type Binding = { control: Control; boundary?: Boundary; read(): number; write(value: number): void }

const CATEGORY: Record<string, string> = { player: 'Movement', camera: 'Camera', bots: 'Bots', match: 'Match' }
const bindings: Binding[] = []

function number<S extends keyof typeof CONFIG>(section: S, key: keyof typeof CONFIG[S] & string,
  label: string, min: number, max: number, step: number, unit: string, boundary?: Boundary): void {
  const values = CONFIG[section] as Record<string, number>
  const defaults = DEFAULT_CONFIG[section] as Record<string, number>
  bindings.push({ control: Object.freeze({ id: `${section}.${key}`, type: 'number', category: CATEGORY[section] ?? 'Game',
    label, description: boundary === 'jump' ? 'Applies when the next jump starts.' : boundary === 'run' ? 'Applies when a new match starts.' : 'Updates this preview immediately.',
    unit, default: defaults[key], min, max, step,
    applyMode: boundary === 'run' ? 'NEXT_RUN' : boundary ? 'NEXT_ACTION' : 'LIVE',
    integrity: section === 'camera' ? 'COSMETIC' : 'GAMEPLAY' }), boundary,
    read: () => values[key], write: value => { values[key] = value } })
}

number('player', 'walkSpeed', 'Run speed', 3, 12, 0.1, 'm/s')
number('player', 'sprintSpeed', 'Sprint speed', 4, 16, 0.1, 'm/s')
number('player', 'acceleration', 'Ground acceleration', 20, 140, 1, 'm/s²')
number('player', 'airControl', 'Air control', 0, 1, 0.05, '')
number('player', 'jumpSpeed', 'Jump strength', 4, 12, 0.1, 'm/s', 'jump')
number('camera', 'bob', 'View bob', 0, 2, 0.05, '×')
number('camera', 'shake', 'Screen shake', 0, 2, 0.05, '×')
number('bots', 'aimError', 'Bot aim error', 0.01, 0.15, 0.002, 'rad')
number('bots', 'reaction', 'Bot reaction time', 0.1, 1.2, 0.02, 's')
number('bots', 'damage', 'Bot damage per shot', 2, 20, 0.5, 'HP')
number('bots', 'speed', 'Bot move speed', 2, 9, 0.1, 'm/s')
number('bots', 'count', 'Bot count', 1, 7, 1, '', 'run')
number('match', 'seconds', 'Match length', 60, 900, 30, 's', 'run')
number('match', 'fragLimit', 'Frag limit', 5, 50, 1, '', 'run')

const byId = new Map(bindings.map(binding => [binding.control.id, binding]))
let requested = Object.fromEntries(bindings.map(({ control }) => [control.id, control.default]))
const valid = (values: Record<string, number>) => values['player.walkSpeed'] <= values['player.sprintSpeed']
let unranked = false
const gameplayModified = () => bindings.some(binding => binding.control.integrity === 'GAMEPLAY' && binding.read() !== binding.control.default)

export const tuning = {
  get unranked(): boolean { return unranked },
  controls: Object.freeze(bindings.map(binding => binding.control)),
  read() {
    return { requested: { ...requested }, active: Object.fromEntries(bindings.map(binding => [binding.control.id, binding.read()])) }
  },
  apply(patch: unknown): void {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid patch')
    const entries = Object.entries(patch)
    if (entries.length > bindings.length) throw new Error('Invalid patch')
    for (const [id, value] of entries) {
      const control = byId.get(id)?.control
      if (!control || typeof value !== 'number' || !Number.isFinite(value) || value < control.min || value > control.max) throw new Error('Invalid value')
      const steps = (value - control.min) / control.step
      if (value !== control.default && Math.abs(steps - Math.round(steps)) > 1e-7) throw new Error('Invalid increment')
    }
    const candidate = { ...requested, ...patch } as Record<string, number>
    const nextActive = this.read().active
    for (const [id, value] of entries) if (byId.get(id)!.control.applyMode === 'LIVE') nextActive[id] = value
    if (!valid(candidate) || !valid(nextActive)) throw new Error('Run speed must not exceed sprint speed')
    // All writes are simple assignments, synchronously committed before the next
    // physics/render callback. No engine callbacks run during this transaction.
    requested = candidate
    for (const [id, value] of entries) {
      const binding = byId.get(id)!
      if (binding.control.applyMode === 'LIVE') binding.write(value)
    }
    unranked ||= gameplayModified()
  },
  activate(boundary: Boundary): void {
    for (const binding of bindings) if (binding.boundary === boundary) binding.write(requested[binding.control.id])
    // Reset only at a new run; resetting values mid-run cannot restore eligibility.
    unranked = boundary === 'run' ? gameplayModified() : unranked || gameplayModified()
  },
}
