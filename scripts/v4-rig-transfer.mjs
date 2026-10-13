// V4 character pipeline: put a new (unrigged) Tripo mesh onto an existing rigged proxy.
// node scripts/v4-rig-transfer.mjs <tripo.glb> <proxy.glb> <out.glb> [targetVerts=26000] [texSize=1024]
//  1. weld + meshopt-simplify the Tripo scan to ~targetVerts
//  2. fit it to the proxy's bind-pose bounds (uniform scale by height, feet on the proxy's floor, centred XZ)
//  3. skin weights = inverse-distance blend of the 6 nearest proxy vertices (top-4 joints kept)
//  4. leg-chain repair below the crotch (a vertex may only follow its own leg)
//  5. proxy skeleton, skin and animation clips are kept untouched; Tripo PBR maps replace the proxy's
// Then: gltf-transform resize/webp/meshopt (done at the end of this script via the CLI).
import { NodeIO } from '../node_modules/.pnpm/@gltf-transform+core@4.5.1/node_modules/@gltf-transform/core/dist/index.js'
import { ALL_EXTENSIONS } from '../node_modules/.pnpm/@gltf-transform+extensions@4.5.1/node_modules/@gltf-transform/extensions/dist/index.js'
import { weld, simplify, dequantize, prune } from '../node_modules/.pnpm/@gltf-transform+functions@4.5.1_@types+node@26.6.3/node_modules/@gltf-transform/functions/dist/index.js'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from '../node_modules/.pnpm/meshoptimizer@1.2.0/node_modules/meshoptimizer/index.js'
import { execFileSync } from 'node:child_process'

const [tripoPath, proxyPath, outPath, tv = '26000', ts = '1024'] = process.argv.slice(2)
const targetVerts = Number(tv)
await MeshoptDecoder.ready
await MeshoptEncoder.ready
await MeshoptSimplifier.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

// ── 1. Tripo source ───────────────────────────────────────────────────────
const tdoc = await io.read(tripoPath)
await tdoc.transform(weld())
const tprim0 = tdoc.getRoot().listMeshes()[0].listPrimitives()[0]
const srcCount = tprim0.getAttribute('POSITION').getCount()
await tdoc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, targetVerts / srcCount), error: 0.004, lockBorder: false }))
const tprim = tdoc.getRoot().listMeshes()[0].listPrimitives()[0]
const TP = tprim.getAttribute('POSITION').getArray()
const TN = tprim.getAttribute('NORMAL').getArray()
const TUV = tprim.getAttribute('TEXCOORD_0').getArray()
const TI = tprim.getIndices().getArray()
const nV = TP.length / 3
console.log('tripo', srcCount, '->', nV, 'verts', TI.length / 3, 'tris')

// ── proxy ─────────────────────────────────────────────────────────────────
const pdoc = await io.read(proxyPath)
await pdoc.transform(dequantize())
const proot = pdoc.getRoot()
const pmesh = proot.listMeshes()[0]
const pprim = pmesh.listPrimitives()[0]
const PP = pprim.getAttribute('POSITION').getArray()
const STATIC = !pprim.getAttribute('JOINTS_0')
const PJ = STATIC ? null : pprim.getAttribute('JOINTS_0').getArray()
const PW = STATIC ? null : pprim.getAttribute('WEIGHTS_0').getArray()
const nP = PP.length / 3
const bounds = (A) => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < A.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], A[i + k]); mx[k] = Math.max(mx[k], A[i + k]) }
  return { mn, mx }
}
const pb = bounds(PP)
// Tripo scans may face any horizontal axis: pick the yaw (0/90/180/270) with the lowest chamfer distance.
const yawed = (A, q) => { const O = new Float32Array(A.length); const c = [1, 0, -1, 0][q], sn = [0, 1, 0, -1][q]
  for (let i = 0; i < A.length; i += 3) { O[i] = A[i] * c + A[i + 2] * sn; O[i + 1] = A[i + 1]; O[i + 2] = -A[i] * sn + A[i + 2] * c } return O }
const fitTo = (A) => { const b = bounds(A); const sc = (pb.mx[1] - pb.mn[1]) / (b.mx[1] - b.mn[1])
  const o = [(pb.mn[0] + pb.mx[0]) / 2 - sc * (b.mn[0] + b.mx[0]) / 2, pb.mn[1] - sc * b.mn[1], (pb.mn[2] + pb.mx[2]) / 2 - sc * (b.mn[2] + b.mx[2]) / 2]
  const O = new Float32Array(A.length); for (let i = 0; i < A.length; i += 3) for (let k = 0; k < 3; k++) O[i + k] = A[i + k] * sc + o[k]; return O }
const sample = (A, n) => { const out = []; const step = Math.max(1, Math.floor(A.length / 3 / n)); for (let i = 0; i < A.length / 3; i += step) out.push([A[i * 3], A[i * 3 + 1], A[i * 3 + 2]]); return out }
const nn = (pts, B) => { let t = 0; for (const p of pts) { let m = Infinity; for (const q of B) { const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d < m) m = d } t += Math.sqrt(m) } return t / pts.length }
const ps = sample(PP, 1500)
let bestQ = 0, bestD = Infinity
for (let q = 0; q < 4; q++) { const ts = sample(fitTo(yawed(TP, q)), 1500); const d = nn(ts, ps) + nn(ps, ts); console.log('yaw', q * 90, 'chamfer', d.toFixed(4)); if (d < bestD) { bestD = d; bestQ = q } }
const YP = yawed(TP, bestQ), YN = yawed(TN, bestQ)
const tb = bounds(YP)
// Up axis = the proxy's longest extent (Y for these rigs).
const s = (pb.mx[1] - pb.mn[1]) / (tb.mx[1] - tb.mn[1])
const off = [
  (pb.mn[0] + pb.mx[0]) / 2 - s * (tb.mn[0] + tb.mx[0]) / 2,
  pb.mn[1] - s * tb.mn[1],
  (pb.mn[2] + pb.mx[2]) / 2 - s * (tb.mn[2] + tb.mx[2]) / 2,
]
const NP = new Float32Array(TP.length)
for (let i = 0; i < TP.length; i += 3) for (let k = 0; k < 3; k++) NP[i + k] = YP[i + k] * s + off[k]
console.log('fit scale', s.toFixed(3), 'proxy height', (pb.mx[1] - pb.mn[1]).toFixed(3), 'width tripo/proxy', ((tb.mx[0] - tb.mn[0]) * s).toFixed(3), (pb.mx[0] - pb.mn[0]).toFixed(3))

// ── 3. k-NN weight transfer ───────────────────────────────────────────────
const H = pb.mx[1] - pb.mn[1]
const cell = H / 70
const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`
const grid = new Map()
for (let i = 0; i < nP; i++) {
  const k = key(PP[i * 3], PP[i * 3 + 1], PP[i * 3 + 2])
  let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i)
}
const K = 6
const OJ = new Uint16Array(nV * 4), OW = new Float32Array(nV * 4)
const FAR = new Float32Array(nV)
// STRIP=<m>: drop triangles with a vertex farther than this from the proxy body (scanned props like held guns).
const STRIP = Number(process.env.STRIP ?? 0)
const acc = new Map()
for (let v = 0; v < (STATIC ? 0 : nV); v++) {
  const x = NP[v * 3], y = NP[v * 3 + 1], z = NP[v * 3 + 2]
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell)
  let best = []
  for (let r = 1; r < 40 && best.length < K; r++) {
    best = []
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
      const L = grid.get(`${cx + a},${cy + b},${cz + c}`); if (!L) continue
      for (const i of L) best.push([(PP[i * 3] - x) ** 2 + (PP[i * 3 + 1] - y) ** 2 + (PP[i * 3 + 2] - z) ** 2, i])
    }
    if (best.length >= K) break
  }
  best.sort((p, q) => p[0] - q[0]); best = best.slice(0, K)
  FAR[v] = best.length ? Math.sqrt(best[0][0]) : 1e9
  acc.clear()
  for (const [d2, i] of best) {
    const w = 1 / (d2 + (cell * 0.05) ** 2)
    for (let k = 0; k < 4; k++) { const wt = PW[i * 4 + k]; if (wt > 0) acc.set(PJ[i * 4 + k], (acc.get(PJ[i * 4 + k]) ?? 0) + wt * w) }
  }
  const top = [...acc.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4)
  const sum = top.reduce((a, t) => a + t[1], 0) || 1
  top.forEach(([j, w], k) => { OJ[v * 4 + k] = j; OW[v * 4 + k] = w / sum })
}

// ── 4. leg-chain repair (same rule as build-v3-chars.mjs) ─────────────────
const skin = proot.listSkins()[0]
const joints = skin ? skin.listJoints().map(j => j.getName()) : []
const ibm = skin?.getInverseBindMatrices()
const jointPos = !skin ? [] : joints.map((_, i) => { const inv = invert4(ibm.getElement(i, new Array(16))); return [inv[12], inv[13], inv[14]] })
const J = n => joints.indexOf(n)
const chainL = ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'].map(J).filter(i => i >= 0)
const chainR = ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'].map(J).filter(i => i >= 0)
let fixed = 0
if (chainL.length && chainR.length) {
  // Joint positions come from IBMs (armature space); vertices are in mesh space. Map by matching bounds of
  // the leg joints is fragile, so classify in vertex space using the proxy's own weights: the side whose
  // leg chain dominates the nearest proxy vertices wins. Already encoded in OJ/OW; just strip the minority.
  for (let v = 0; v < nV; v++) {
    let wl = 0, wr = 0
    for (let k = 0; k < 4; k++) { const j = OJ[v * 4 + k], w = OW[v * 4 + k]; if (chainL.includes(j)) wl += w; else if (chainR.includes(j)) wr += w }
    if (wl > 0 && wr > 0) {
      const opp = wl >= wr ? chainR : chainL
      let sum = 0
      for (let k = 0; k < 4; k++) { if (opp.includes(OJ[v * 4 + k])) OW[v * 4 + k] = 0; sum += OW[v * 4 + k] }
      for (let k = 0; k < 4; k++) OW[v * 4 + k] /= sum || 1
      fixed++
    }
  }
}
console.log('leg-repaired', fixed, 'verts; joints', joints.length)
void jointPos

// ── 5. assemble: replace proxy geometry + textures ────────────────────────
const buf = proot.listBuffers()[0]
const mk = (type, arr) => pdoc.createAccessor().setType(type).setArray(arr).setBuffer(buf)
for (const sem of pprim.listSemantics()) pprim.setAttribute(sem, null)
pprim.setAttribute('POSITION', mk('VEC3', NP))
pprim.setAttribute('NORMAL', mk('VEC3', YN))
pprim.setAttribute('TEXCOORD_0', mk('VEC2', new Float32Array(TUV)))
if (!STATIC) {
  pprim.setAttribute('JOINTS_0', mk('VEC4', OJ))
  pprim.setAttribute('WEIGHTS_0', mk('VEC4', OW))
}
let IDX = TI
if (STRIP > 0) {
  const keep = []
  for (let t = 0; t < TI.length; t += 3) if (FAR[TI[t]] < STRIP && FAR[TI[t + 1]] < STRIP && FAR[TI[t + 2]] < STRIP) keep.push(TI[t], TI[t + 1], TI[t + 2])
  console.log('strip', STRIP, 'kept', keep.length / 3, 'of', TI.length / 3, 'tris')
  IDX = keep
}
pprim.setIndices(mk('SCALAR', nV > 65535 ? new Uint32Array(IDX) : new Uint16Array(IDX)))
for (const t of pprim.listTargets()) pprim.removeTarget(t)
const tm = tdoc.getRoot().listMaterials()[0]
const copyTex = (t, n) => t ? pdoc.createTexture(n).setImage(t.getImage()).setMimeType(t.getMimeType()) : null
const m = pprim.getMaterial()
const color = copyTex(tm.getBaseColorTexture(), 'color'), orm = copyTex(tm.getMetallicRoughnessTexture(), 'orm'), normal = copyTex(tm.getNormalTexture(), 'normal')
m.setBaseColorTexture(color).setMetallicRoughnessTexture(orm).setOcclusionTexture(orm).setNormalTexture(normal)
m.setMetallicFactor(1).setRoughnessFactor(1).setBaseColorFactor([1, 1, 1, 1]).setEmissiveTexture(null).setEmissiveFactor([0, 0, 0])
await pdoc.transform(prune())
const tmp = outPath.replace(/\.glb$/, '.raw.glb')
await io.write(tmp, pdoc)
const GT = 'node_modules/.bin/gltf-transform'
execFileSync(GT, ['resize', tmp, tmp, '--width', ts, '--height', ts], { stdio: 'inherit' })
execFileSync(GT, ['webp', tmp, tmp, '--quality', '86'], { stdio: 'inherit' })
execFileSync(GT, ['meshopt', tmp, outPath, '--level', 'medium'], { stdio: 'inherit' })
execFileSync('rm', [tmp])
console.log('wrote', outPath)

function invert4(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32
  const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06)
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det, (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det, (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det, (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det, (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ]
}
