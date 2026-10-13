const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

type Stats = { mode?: string; score?: number; kills?: number; headshots?: number; accuracy?: number; bestRank?: string; time?: number; won?: boolean; wave?: number; waves?: number }

function fallback(s: Stats) {
  const accuracy = Math.round((Number(s.accuracy) || 0) * 100)
  const drills = accuracy < 35 ? ['Run a five-minute burst-control drill: fire short bursts and reacquire the head line.', 'Use the range-side cover lanes before challenging Exo targets.'] : s.headshots && s.kills && s.headshots / s.kills > 0.35 ? ['Keep the head-line discipline, then add slide exits after each kill.', 'Use Overdrive only when two or more targets are committed.'] : ['Practice one movement layer per run: sprint, slide, then jump peeks.', 'Collect Frontline Shards aggressively after close-range kills.']
  return { title: s.won ? 'FRONTLINE VERIFIED' : 'TACTICAL RESET', summary: `${s.mode === 'onslaught' ? `You reached wave ${s.wave ?? 1} of ${s.waves ?? 8}` : `You finished with ${s.kills ?? 0} eliminations`} at ${accuracy}% accuracy. Your ${s.bestRank ?? 'current'} rank shows where the next run can improve.`, drills }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors })
  const auth = request.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!auth || !supabaseUrl || !anonKey) return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: cors })
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: auth } })
  if (!userResponse.ok) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: cors })
  const stats = await request.json() as Stats
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return new Response(JSON.stringify(fallback(stats)), { headers: cors })
  const prompt = `You are the concise tactical coach for a browser FPS called World War B. Analyze this run and return JSON with exactly title (string), summary (string, max 240 chars), and drills (array of exactly 2 strings, each max 120 chars). Be constructive and specific. Run: ${JSON.stringify(stats)}`
  const ai = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini', temperature: 0.4, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Return only valid JSON.' }, { role: 'user', content: prompt }] }) })
  if (!ai.ok) return new Response(JSON.stringify(fallback(stats)), { headers: cors })
  const body = await ai.json() as { choices?: [{ message?: { content?: string } }] }
  try { return new Response(JSON.stringify(JSON.parse(body.choices?.[0]?.message?.content ?? '')), { headers: cors }) } catch { return new Response(JSON.stringify(fallback(stats)), { headers: cors }) }
})

export {}
