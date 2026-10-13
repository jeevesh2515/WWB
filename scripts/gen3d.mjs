// Batch image -> 3D model via Manus Data API (Tripo3D).
// Usage: manus-node scripts/gen3d.mjs name1 name2 ...   (reads .asset-src/gen/ref_<name>.png, writes .asset-src/gen/<name>.glb)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const { ApiClient } = await import(pathToFileURL('/home/ubuntu/skills/data-api/lib/data-api.mjs').href)
const client = new ApiClient()
const DIR = new URL('../.asset-src/gen/', import.meta.url).pathname
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function one(name) {
  const out = `${DIR}${name}.glb`
  if (existsSync(out)) { console.log(name, 'exists'); return }
  const file = readFileSync(`${DIR}ref_${name}.png`).toString('base64')
  const up = await client.callApi('Tripo3D/upload_image', { multipartFormData: { file } })
  const token = up?.data?.image_token
  if (!token) throw new Error(`${name} upload failed ${JSON.stringify(up).slice(0, 300)}`)
  const task = await client.callApi('Tripo3D/image_to_model', { body: { type: 'image_to_model', file: { type: 'png', file_token: token } } })
  const id = task?.data?.task_id
  if (!id) throw new Error(`${name} task failed ${JSON.stringify(task).slice(0, 300)}`)
  console.log(name, 'task', id)
  const t0 = Date.now()
  while (Date.now() - t0 < 15 * 60e3) {
    await sleep(10e3)
    const st = await client.callApi('Tripo3D/get_task', { pathParams: { task_id: id } })
    const d = st?.data ?? {}
    if (d.status === 'success') {
      const url = d.output?.pbr_model || d.output?.model || d.result?.pbr_model?.url || d.result?.model?.url || d.outputs?.model?.url
      if (!url) throw new Error(`${name} no url ${JSON.stringify(d).slice(0, 600)}`)
      const res = await fetch(url)
      writeFileSync(out, Buffer.from(await res.arrayBuffer()))
      const prev = d.output?.rendered_image
      if (prev) writeFileSync(`${DIR}${name}_preview.webp`, Buffer.from(await (await fetch(prev)).arrayBuffer()))
      console.log(name, 'done', Math.round((Date.now() - t0) / 1000), 's')
      return
    }
    if (d.status === 'failed' || d.status === 'cancelled' || d.status === 'banned') throw new Error(`${name} ${d.status} ${JSON.stringify(d).slice(0, 300)}`)
    console.log(name, d.status, d.progress ?? '')
  }
  throw new Error(`${name} timeout`)
}

const names = process.argv.slice(2)
const results = await Promise.allSettled(names.map(one))
results.forEach((r, i) => { if (r.status === 'rejected') console.log('FAIL', names[i], String(r.reason).slice(0, 400)) })
console.log('ALLDONE')
