// Rotate a Tripo GLB −90° about Y (baked into vertices) so a +X-facing scan faces glTF +Z,
// which is the forward axis auto-riggers expect. node scripts/face-z.mjs in.glb out.glb
import { NodeIO } from '../node_modules/.pnpm/@gltf-transform+core@4.5.1/node_modules/@gltf-transform/core/dist/index.js'
const [src, out] = process.argv.slice(2)
const io = new NodeIO()
const doc = await io.read(src)
const done = new Set()
for (const mesh of doc.getRoot().listMeshes())
  for (const prim of mesh.listPrimitives())
    for (const sem of ['POSITION', 'NORMAL', 'TANGENT']) {
      const a = prim.getAttribute(sem)
      if (!a || done.has(a)) continue
      done.add(a)
      const e = []
      for (let i = 0; i < a.getCount(); i += 1) {
        a.getElement(i, e)
        const x = e[0]
        e[0] = -e[2]
        e[2] = x
        a.setElement(i, e)
      }
    }
for (const n of doc.getRoot().listNodes()) if (n.getMesh()) n.setRotation([0, 0, 0, 1])
await io.write(out, doc)
