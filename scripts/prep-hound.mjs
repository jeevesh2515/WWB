// Prepare the Tripo HOUND scan for the procedural rig (source asset lives outside the repo).
// node scripts/prep-hound.mjs in.glb out.glb [heightMeters=0.85]
//  - bakes node transforms into the vertices
//  - finds the body's long axis (PCA in XZ) and its front (the turret barrel reaches furthest)
//  - rotates so the hound faces -Z (game forward), centres it on XZ, feet on y=0, scales to height
import { NodeIO } from '../node_modules/.pnpm/@gltf-transform+core@4.5.1/node_modules/@gltf-transform/core/dist/index.js'
const [src, out, hArg] = process.argv.slice(2)
const H = Number(hArg || 0.85)
const io = new NodeIO()
const doc = await io.read(src)
const root = doc.getRoot()
const prims = []
for (const node of root.listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const m = node.getWorldMatrix()
  for (const prim of mesh.listPrimitives()) prims.push({ prim, m })
  node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1])
}
const tf = (m, e, w) => [m[0] * e[0] + m[4] * e[1] + m[8] * e[2] + w * m[12], m[1] * e[0] + m[5] * e[1] + m[9] * e[2] + w * m[13], m[2] * e[0] + m[6] * e[1] + m[10] * e[2] + w * m[14]]
const done = new Set()
const pts = []
for (const { prim, m } of prims)
  for (const sem of ['POSITION', 'NORMAL']) {
    const a = prim.getAttribute(sem)
    if (!a || done.has(a)) continue
    done.add(a)
    const e = []
    for (let i = 0; i < a.getCount(); i += 1) {
      a.getElement(i, e)
      let v = tf(m, e, sem === 'POSITION' ? 1 : 0)
      if (sem === 'NORMAL') {
        const l = Math.hypot(...v) || 1
        v = v.map(x => x / l)
      } else pts.push(v)
      a.setElement(i, v)
    }
  }
// PCA on XZ.
let mx = 0, mz = 0
for (const p of pts) { mx += p[0]; mz += p[2] }
mx /= pts.length; mz /= pts.length
let sxx = 0, szz = 0, sxz = 0
let minY = Infinity, maxY = -Infinity
for (const p of pts) {
  const x = p[0] - mx, z = p[2] - mz
  sxx += x * x; szz += z * z; sxz += x * z
  minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1])
}
const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz)
let ax = [Math.cos(ang), Math.sin(ang)] // main axis in (x, z)
// Front = direction in which the barrel band (upper body) reaches furthest.
const band = [minY + (maxY - minY) * 0.62, minY + (maxY - minY) * 0.8]
let pos = -Infinity, neg = -Infinity
for (const p of pts) {
  if (p[1] < band[0] || p[1] > band[1]) continue
  const d = (p[0] - mx) * ax[0] + (p[2] - mz) * ax[1]
  pos = Math.max(pos, d); neg = Math.max(neg, -d)
}
if (neg > pos) ax = [-ax[0], -ax[1]]
// Rotation taking the forward axis f=(fx,fz) to (0,-1): x' = -fz*x + fx*z ; z' = -(fx*x + fz*z)
const [fx, fz] = ax
const rot = v => [-fz * v[0] + fx * v[2], v[1], -(fx * v[0] + fz * v[2])]
let b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }
for (const p of pts) {
  const r = rot([p[0] - mx, p[1], p[2] - mz])
  b.x0 = Math.min(b.x0, r[0]); b.x1 = Math.max(b.x1, r[0]); b.z0 = Math.min(b.z0, r[2]); b.z1 = Math.max(b.z1, r[2])
}
const s = H / (maxY - minY)
const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2
done.clear()
for (const { prim } of prims)
  for (const sem of ['POSITION', 'NORMAL', 'TANGENT']) {
    const a = prim.getAttribute(sem)
    if (!a || done.has(a)) continue
    done.add(a)
    const e = []
    for (let i = 0; i < a.getCount(); i += 1) {
      a.getElement(i, e)
      if (sem === 'POSITION') {
        const r = rot([e[0] - mx, e[1], e[2] - mz])
        a.setElement(i, [(r[0] - cx) * s, (r[1] - minY) * s, (r[2] - cz) * s])
      } else {
        const r = rot(e)
        a.setElement(i, sem === 'TANGENT' ? [r[0], r[1], r[2], e[3]] : r)
      }
    }
  }
console.log(`hound: axis ${(ang * 180 / Math.PI).toFixed(1)}deg front ${pos >= neg ? '+' : '-'} size ${((b.x1 - b.x0) * s).toFixed(2)} x ${H} x ${((b.z1 - b.z0) * s).toFixed(2)} m`)
await io.write(out, doc)
