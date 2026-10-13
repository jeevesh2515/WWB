// V3 character pipeline (source assets live outside the repo, in /home/ubuntu/v3src).
// node scripts/build-v3-chars.mjs <name> <rigDir> <tripoGlb> <out.glb> clip=file.glb [clip=file.glb ...]
//  - base = first clip file (Meshy auto-rig: 22-bone humanoid, base colour only)
//  - copies every other clip's channels onto the base skeleton by node name, renames clips
//  - restores Tripo's colour / normal / ORM maps (the rig keeps Tripo's UV layout)
// Then run `gltf-transform optimize` (meshopt + webp) on the output.
import { NodeIO } from '../node_modules/.pnpm/@gltf-transform+core@4.5.1/node_modules/@gltf-transform/core/dist/index.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const [name, rigDir, tripoGlb, out, ...clipArgs] = process.argv.slice(2)
const clips = clipArgs.map(a => a.split('='))
const io = new NodeIO()
const base = await io.read(join(rigDir, clips[0][1]))
const root = base.getRoot()
const nodes = new Map(root.listNodes().map(n => [n.getName(), n]))
const buffer = root.listBuffers()[0]

// Rename the base clip, then graft the others.
root.listAnimations()[0].setName(clips[0][0])
for (const [clipName, file] of clips.slice(1)) {
  const src = await io.read(join(rigDir, file))
  for (const anim of src.getRoot().listAnimations()) {
    const dst = base.createAnimation(clipName)
    for (const ch of anim.listChannels()) {
      const target = nodes.get(ch.getTargetNode()?.getName())
      if (!target) continue
      const s = ch.getSampler()
      const copy = acc => base.createAccessor().setType(acc.getType()).setArray(acc.getArray().slice()).setBuffer(buffer)
      const sampler = base.createAnimationSampler().setInput(copy(s.getInput())).setOutput(copy(s.getOutput())).setInterpolation(s.getInterpolation())
      dst.addSampler(sampler).addChannel(base.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler))
    }
  }
}

// Restore the Tripo PBR set.
const tripo = await io.read(tripoGlb)
const tm = tripo.getRoot().listMaterials()[0]
const img = t => ({ image: t.getImage(), mime: t.getMimeType() })
const color = img(tm.getBaseColorTexture())
const orm = img(tm.getMetallicRoughnessTexture())
const normal = img(tm.getNormalTexture())
for (const m of root.listMaterials()) {
  const old = m.getBaseColorTexture()
  const mk = (t, n) => base.createTexture(`${name}_${n}`).setImage(t.image).setMimeType(t.mime)
  m.setBaseColorTexture(mk(color, 'color'))
  m.setMetallicRoughnessTexture(mk(orm, 'orm'))
  m.setOcclusionTexture(m.getMetallicRoughnessTexture())
  m.setNormalTexture(mk(normal, 'normal'))
  m.setMetallicFactor(1).setRoughnessFactor(1).setBaseColorFactor([1, 1, 1, 1])
  // Meshy bakes the colour map into emissive (factor 1): clear it or the body renders flat white.
  m.setEmissiveTexture(null).setEmissiveFactor([0, 0, 0])
  old?.dispose()
  m.setName(name)
}
for (const t of root.listTextures()) if (!t.listParents().some(p => p !== root)) t.dispose()

// Repair auto-rig weights: below the crotch, a vertex may only follow its own leg chain
// (the A-pose scans have legs close together, so the auto-rigger blends both legs and the
// inner thighs stretch into a "skirt" whenever the legs part).
const skin = root.listSkins()[0]
const joints = skin.listJoints().map(j => j.getName())
const ibm = skin.getInverseBindMatrices()
const jointPos = joints.map((_, i) => {
  const m = ibm.getElement(i, new Array(16))
  const inv = invert4(m)
  return [inv[12], inv[13], inv[14]]
})
const J = n => joints.indexOf(n)
const chainL = ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase'].map(J).filter(i => i >= 0)
const chainR = ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'].map(J).filter(i => i >= 0)
const pL = jointPos[chainL[0]]
const pR = jointPos[chainR[0]]
const mid = pL.map((v, k) => (v + pR[k]) / 2)
const nrm = [pL[0] - pR[0], 0, pL[2] - pR[2]]
const nl = Math.hypot(...nrm)
nrm[0] /= nl
nrm[2] /= nl
let topY = -Infinity
for (const p of jointPos) topY = Math.max(topY, p[1])
const crotchY = Math.min(pL[1], pR[1]) - 0.05 * topY
const segDist = (v, a, b) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const t = Math.max(0, Math.min(1, ((v[0] - a[0]) * ab[0] + (v[1] - a[1]) * ab[1] + (v[2] - a[2]) * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1)))
  return Math.hypot(v[0] - a[0] - ab[0] * t, v[1] - a[1] - ab[1] * t, v[2] - a[2] - ab[2] * t)
}
let fixed = 0
for (const mesh of root.listMeshes())
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION')
    const JN = prim.getAttribute('JOINTS_0')
    const WT = prim.getAttribute('WEIGHTS_0')
    const v = [0, 0, 0]
    const j4 = [0, 0, 0, 0]
    const w4 = [0, 0, 0, 0]
    for (let i = 0; i < P.getCount(); i += 1) {
      P.getElement(i, v)
      if (v[1] > crotchY) continue
      const s = (v[0] - mid[0]) * nrm[0] + (v[2] - mid[2]) * nrm[2]
      const own = s >= 0 ? chainL : chainR
      const opp = s >= 0 ? chainR : chainL
      JN.getElement(i, j4)
      WT.getElement(i, w4)
      if (!j4.some((j, k) => w4[k] > 0 && opp.includes(j))) continue
      for (let k = 0; k < 4; k += 1) if (opp.includes(j4[k])) w4[k] = 0
      let sum = w4.reduce((a, b) => a + b, 0)
      if (sum < 1e-3) {
        let best = own[0]
        let bd = Infinity
        for (let c = 0; c < own.length; c += 1) {
          const a = jointPos[own[c]]
          const b = jointPos[own[Math.min(c + 1, own.length - 1)]]
          const d = segDist(v, a, b)
          if (d < bd) {
            bd = d
            best = own[c]
          }
        }
        j4.fill(0)
        w4.fill(0)
        j4[0] = best
        w4[0] = 1
        sum = 1
      }
      for (let k = 0; k < 4; k += 1) w4[k] /= sum
      JN.setElement(i, j4)
      WT.setElement(i, w4)
      fixed += 1
    }
  }
console.log(name, 'reweighted', fixed, 'leg vertices; crotchY', crotchY.toFixed(1))

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
await io.write(out, base)
console.log(name, 'clips', root.listAnimations().map(a => `${a.getName()}(${a.listChannels().length})`).join(' '), 'textures', root.listTextures().length)
void readFileSync
