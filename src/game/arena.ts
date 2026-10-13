import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RAPIER, type Physics } from '../engine/physics'
import { CONT_H, CONT_L, CONT_W, CONTAINER_COLORS, DECAL_CELLS, containerDecalAtlas, containerParts, type ContSize } from './containers'
import { applyGrime, noiseTexture, pbr, worldBox, type Library, type ModelId } from './library'
import { BLOCKED, NavGrid } from './nav'

/**
 * V5 "Kestrel Terminal": an 80 × 80 m container yard on a wet evening, ringed by three-high walls
 * of weathered ISO containers, with a rubber-tyred gantry (RTG) crane straddling the central deck,
 * reach stackers as heavy cover, and an open north quay (fence, apron, ship-to-shore cranes, a
 * container ship) as the skyline. Static meshes are merged per material, every solid has a matching
 * Rapier collider, and the navigation grid is baked from those colliders with down-rays.
 *
 * Boot cost: containers, markings, ship and water are procedural; the RTG and reach-stacker scans
 * load with the library (stage 1), the STS cranes stream in with stage 2 (`attachSts`). Their
 * collision volumes are measured slices of the scans, so physics/nav never wait for a mesh.
 */
export type Surface = 'concrete' | 'metal' | 'wood'
export type ColliderTag =
  | { kind: 'world'; surface: Surface }
  | { kind: 'bot'; id: number }
  | { kind: 'drone'; id: number }
  | { kind: 'player' }
  | { kind: 'prop'; index: number }

export const HALF = 40

export type PropSpot = { pos: THREE.Vector3; model: 'barrel' | 'propane'; rot: number }
export type PickupSpot = { pos: THREE.Vector3; kind: 'health' | 'armor' | 'ammo' | 'rocket' }

const tmpQ = new THREE.Quaternion()
const UP = new THREE.Vector3(0, 1, 0)

/** Interior container cover: [x, z, rotDeg, stack, size]. Point-symmetric for fair spawns. */
const COVER_CONTAINERS: [number, number, number, number, ContSize][] = [
  [-20, -22, 0, 2, 40], [-13.2, -28, 90, 1, 20], [20, 22, 180, 2, 40], [13.2, 28, 270, 1, 20],
  [25, -16, 90, 1, 20], [27.7, -16.6, 90, 1, 20], [-25, 16, 270, 1, 20], [-27.7, 16.6, 270, 2, 20],
  [0, -30, 0, 1, 40], [0, 30, 180, 1, 40], [-34, -4, 90, 1, 20], [34, 4, 270, 1, 20],
]
const YARD_WET = 0.85

export class Arena {
  readonly group = new THREE.Group()
  readonly tags = new Map<number, ColliderTag>()
  readonly nav: NavGrid
  sun!: THREE.DirectionalLight
  readonly spawns: THREE.Vector3[] = []
  readonly props: PropSpot[] = []
  readonly pickups: PickupSpot[] = []
  // Decorative fires glow onto the ground with an unlit additive decal instead of a PointLight.
  readonly fires: { pos: THREE.Vector3; glow: THREE.MeshBasicMaterial }[] = []
  readonly lamps: THREE.PointLight[] = []
  private readonly mats: Record<string, THREE.Material> = {}
  private readonly pending = new Map<string, THREE.BufferGeometry[]>()
  private readonly noShadow = new Set<string>()
  private readonly timeUniform = { value: 0 }
  private readonly water: { mat?: THREE.MeshStandardMaterial } = {}
  private rain?: { mesh: THREE.LineSegments; mat: THREE.ShaderMaterial; max: number }
  private camera?: THREE.Camera
  private stsAttached = false
  private seed = 1337

  constructor(readonly scene: THREE.Scene, private readonly physics: Physics, private readonly lib: Library) {
    const S = lib.sets
    const std = (key: string, m: THREE.MeshStandardMaterial) => (this.mats[key] = m)
    // Wet yard concrete: CC0 concrete_floor_03 + painted markings, slab joints, puddles and ripples.
    const floor = std('floor', pbr(S.concrete_floor_03, { color: '#a49c94', normalScale: 0.9 }))
    applyGrime(floor, { amount: 0.75, wet: 0, foot: 0 })
    this.wetYard(floor, yardMarksTexture(), new THREE.Vector4(-HALF, -HALF, HALF * 2, YARD_WET), 'yard')
    const apron = std('apron', pbr(S.concrete_floor_worn_001, { color: '#8d857d' }))
    applyGrime(apron, { amount: 0.8, wet: 0, foot: 0 })
    this.wetYard(apron, undefined, new THREE.Vector4(0, 0, 1, YARD_WET * 0.8), 'apron')
    std('wall', pbr(S.concrete_wall_008, { color: '#b9b0a6' }))
    std('rust', pbr(S.rusty_metal_02, { color: '#ffffff' }))
    std('plate', pbr(S.metal_plate, { color: '#a9a39c' }))
    std('darkMetal', pbr(S.metal_plate, { color: '#3a3836', normalScale: 0.6 }))
    std('steel', pbr(S.metal_plate, { color: '#55524e', normalScale: 0.4, envMapIntensity: 0.35 }))
    std('hull', pbr(S.metal_plate, { color: '#232c38', normalScale: 0.5, envMapIntensity: 0.3 }))
    std('house', pbr(S.concrete_wall_008, { color: '#d6d1c6', normalScale: 0.3 }))
    std('hazard', new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.7, metalness: 0.2 }))
    applyGrime(this.mats.wall as THREE.MeshStandardMaterial, { amount: 1 })
    applyGrime(this.mats.plate as THREE.MeshStandardMaterial, { amount: 0.7, scale: 2 })
    applyGrime(this.mats.rust as THREE.MeshStandardMaterial, { amount: 0.5, scale: 2, foot: 0.5 })
    applyGrime(this.mats.steel as THREE.MeshStandardMaterial, { amount: 0.6, scale: 2, foot: 0.4 })
    // Container paint: low-metal satin paint with grime (no corrugated texture: the geometry has real ribs).
    const paintRough = noiseTexture(256, 11, 6, 1.4)
    paintRough.repeat.set(1, 1)
    CONTAINER_COLORS.forEach((c, i) => {
      const m = std(`cont${i}`, new THREE.MeshStandardMaterial({ color: c, roughness: 0.78, metalness: 0.28, roughnessMap: paintRough, envMapIntensity: 0.35 }))
      applyGrime(m, { amount: 1, scale: 1.4, foot: 0.8 })
    })
    this.mats.decal = new THREE.MeshStandardMaterial({ map: containerDecalAtlas(), transparent: true, depthWrite: false, roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    this.mats.fence = new THREE.MeshStandardMaterial({ map: chainLinkTexture(), alphaTest: 0.4, side: THREE.DoubleSide, color: '#a7a7a0', roughness: 0.55, metalness: 0.6, envMapIntensity: 0.3 })
    this.noShadow.add('decal')
    this.noShadow.add('hull')
    this.noShadow.add('house')
    this.buildLighting()
    this.buildGround()
    this.buildPerimeter()
    this.buildPlatform()
    this.buildCover()
    this.buildQuay()
    this.flush()
    this.placeModels()
    this.buildBackdropStacks()
    this.physics.world.step()
    this.nav = this.bakeNav()
    this.defineSpots()
    this.scene.add(this.group)
  }

  // ─── building helpers ──────────────────────────────────────────────────
  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647
    return this.seed / 2147483647
  }

  private queue(key: string, geo: THREE.BufferGeometry, matrix: THREE.Matrix4): void {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix)
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
    const list = this.pending.get(key) ?? []
    list.push(g)
    this.pending.set(key, list)
  }

  private flush(): void {
    for (const [key, list] of this.pending) {
      const merged = mergeGeometries(list, false)
      if (!merged) continue
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, this.mats[key])
      mesh.castShadow = !this.noShadow.has(key)
      mesh.receiveShadow = key !== 'decal'
      mesh.matrixAutoUpdate = false
      if (key === 'decal') mesh.renderOrder = 2
      this.group.add(mesh)
    }
    this.pending.clear()
  }

  /** Solid box with collider. rotY in radians. */
  private box(mat: string, cx: number, cy: number, cz: number, w: number, h: number, d: number, opts: { rotY?: number; tile?: number; collide?: boolean; surface?: Surface; rotX?: number } = {}): void {
    const geo = worldBox(w, h, d, opts.tile ?? 4)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rotX ?? 0, opts.rotY ?? 0, 0, 'YXZ'))
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), q, new THREE.Vector3(1, 1, 1))
    this.queue(mat, geo, m)
    if (opts.collide !== false) {
      const c = this.physics.addStaticBox(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(w, h, d), q)
      this.tags.set(c.handle, { kind: 'world', surface: opts.surface ?? (mat === 'wall' || mat === 'floor' ? 'concrete' : 'metal') })
    }
  }

  private collider(cx: number, cy: number, cz: number, w: number, h: number, d: number, rotY: number, surface: Surface): void {
    tmpQ.setFromAxisAngle(UP, rotY)
    const c = this.physics.addStaticBox(new THREE.Vector3(cx, cy, cz), new THREE.Vector3(w, h, d), tmpQ.clone())
    this.tags.set(c.handle, { kind: 'world', surface })
  }

  /** Collider from a normalized local AABB of a scan placed at `pos`/`rotY`/`scale`. */
  private scanCollider(pos: THREE.Vector3, rotY: number, scale: number, groundY: number, min: [number, number, number], max: [number, number, number], surface: Surface): void {
    const c = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2).multiplyScalar(scale).applyAxisAngle(UP, rotY)
    this.collider(pos.x + c.x, groundY + c.y, pos.z + c.z, (max[0] - min[0]) * scale, (max[1] - min[1]) * scale, (max[2] - min[2]) * scale, rotY, surface)
  }

  /**
   * Stamp one procedural ISO container (floor at y). Length runs along local X, doors at +X.
   * Collider is optional so stacked walls can share one big box.
   */
  private container(x: number, y: number, z: number, rot: number, size: ContSize, color: number, collide = true): void {
    const parts = containerParts(size)
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, rot), new THREE.Vector3(1, 1, 1))
    this.queue(`cont${color % CONTAINER_COLORS.length}`, parts.paint, m)
    this.queue('steel', parts.steel, m)
    this.queue('decal', parts.decal(Math.floor(this.rand() * DECAL_CELLS)), m)
    if (collide) this.collider(x, y + CONT_H / 2, z, CONT_L[size], CONT_H, CONT_W, rot, 'metal')
  }

  /**
   * Wet-yard shading on top of applyGrime (which must run first: it owns vGrimeW and the noise
   * helpers). Adds painted markings (R = yellow, G = white, B = joints/cracks/oil) with wear,
   * restrained puddles (darker, smoother, flattened normals) and rain ripples inside them.
   */
  private wetYard(m: THREE.MeshStandardMaterial, marks: THREE.Texture | undefined, yard: THREE.Vector4, key: string): void {
    const prev = m.onBeforeCompile
    const time = this.timeUniform
    m.onBeforeCompile = (shader, r) => {
      prev.call(m, shader, r)
      shader.uniforms.uMarks = { value: marks ?? blackTexture() }
      shader.uniforms.uYard = { value: yard }
      shader.uniforms.uWetTime = time
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <map_pars_fragment>',
          `#include <map_pars_fragment>
          uniform sampler2D uMarks; uniform vec4 uYard; uniform float uWetTime;
          float wyPuddle(vec2 p) {
            float n = gFbm(vec3(p.x * 0.075, 3.1, p.y * 0.075)) + gNoise(vec3(p * 0.7, 1.7)) * 0.08;
            return smoothstep(0.6, 0.7, n) * uYard.w;
          }
          vec2 wyRipple(vec2 p, float t) {
            vec2 acc = vec2(0.0);
            for (int k = 0; k < 2; k++) {
              vec2 q = p * 2.6 + float(k) * 17.3;
              vec2 cell = floor(q);
              vec2 f = fract(q) - 0.5;
              float h = gHash(vec3(cell, float(k) + 0.5));
              vec2 o = vec2(gHash(vec3(cell, 3.0 + float(k))), gHash(vec3(cell, 7.0 + float(k)))) - 0.5;
              vec2 d = f - o * 0.5;
              float rr = length(d);
              float ph = fract(t * 0.75 + h);
              float R = ph * 0.42;
              float w = exp(-pow((rr - R) * 34.0, 2.0)) * (1.0 - ph) * step(0.45, h);
              acc += d / (rr + 1e-3) * w * sin((rr - R) * 90.0);
            }
            return acc;
          }
          vec4 wyMarks() {
            vec2 uv = (vGrimeW.xz - uYard.xy) / uYard.z;
            if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
            return vec4(texture2D(uMarks, uv).rgb, 1.0);
          }`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          float wyP = wyPuddle(vGrimeW.xz);
          vec2 wyR = wyRipple(vGrimeW.xz, uWetTime) * wyP;
          #ifndef FLAT_SHADED
            normal = normalize(mix(normal, normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0), wyP * 0.85));
          #endif
          normal = normalize(normal + (viewMatrix * vec4(wyR.x, 0.0, wyR.y, 0.0)).xyz * 0.16);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          vec4 wyM = wyMarks();
          float wyWear = smoothstep(0.32, 0.62, gFbm(vec3(vGrimeW.xz * 1.9, 5.0))) * (0.75 + 0.25 * gNoise(vec3(vGrimeW.xz * 9.0, 2.0)));
          float wyY = wyM.r * wyWear;
          float wyW = wyM.g * wyWear;
          float wyJ = wyM.b;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.58, 0.44, 0.1), wyY * 0.8);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.69, 0.65), wyW * 0.72);
          diffuseColor.rgb *= 1.0 - wyJ * 0.55;
          float wyBase = uYard.w * 0.55;
          diffuseColor.rgb *= (1.0 - 0.16 * wyBase) * (1.0 - wyP * 0.38);
          roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.78, wyBase);
          roughnessFactor = mix(roughnessFactor, 0.55, max(wyY, wyW) * 0.6);
          roughnessFactor = mix(roughnessFactor, 0.42, wyJ * 0.5);
          roughnessFactor = mix(roughnessFactor, 0.14, wyP);`,
        )
    }
    const prevKey = m.customProgramCacheKey.bind(m)
    m.customProgramCacheKey = () => `${prevKey()}-wet-${key}`
    m.needsUpdate = true
  }

  // ─── lighting ──────────────────────────────────────────────────────────
  private buildLighting(): void {
    const scene = this.scene
    scene.background = this.lib.sky
    scene.backgroundIntensity = 0.85
    scene.environmentIntensity = 0.32
    // Drizzle haze: cooler and a touch denser than the Foundry, so cranes/ship read as silhouettes.
    scene.fog = new THREE.FogExp2('#7a6c66', 0.0088)
    // Sun breaking under the storm front, low over the quay.
    const sunDir = new THREE.Vector3(0.49, 0.62, 0.86).normalize()
    const sun = new THREE.DirectionalLight('#ffb98a', 3.5)
    sun.position.copy(sunDir).multiplyScalar(90)
    sun.target.position.set(0, 0, 0)
    sun.castShadow = true
    const cam = sun.shadow.camera
    cam.left = cam.bottom = -58
    cam.right = cam.top = 58
    cam.near = 10
    cam.far = 200
    sun.shadow.bias = -0.00035
    sun.shadow.normalBias = 0.04
    sun.shadow.mapSize.set(2048, 2048)
    this.sun = sun
    scene.add(sun, sun.target)
    const hemi = new THREE.HemisphereLight('#8f9fbf', '#3a2a20', 0.4)
    scene.add(hemi)
  }

  // ─── ground: yard slab, apron, outer terminal ──────────────────────────
  private buildGround(): void {
    const plane = (key: string, w: number, d: number, x: number, y: number, z: number, tile: number) => {
      const g = new THREE.PlaneGeometry(w, d)
      g.rotateX(-Math.PI / 2)
      const uv = g.getAttribute('uv') as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile)
      this.queue(key, g, new THREE.Matrix4().makeTranslation(x, y, z))
    }
    plane('floor', HALF * 2, HALF * 2, 0, 0, 0, 4)
    // Apron north of the fence up to the quay edge (z = 86), and the rest of the terminal around us.
    plane('apron', 340, 46, 0, -0.02, 63, 5)
    plane('apron', 340, 294, 0, -0.05, -107, 6)
    plane('apron', 130, 80, -105, -0.04, 0, 6)
    plane('apron', 130, 80, 105, -0.04, 0, 6)
    const c = this.physics.addStaticBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(HALF * 2 + 6, 1, HALF * 2 + 6))
    this.tags.set(c.handle, { kind: 'world', surface: 'concrete' })
  }

  // ─── perimeter: three-high container walls (W, S, E) ───────────────────
  private buildPerimeter(): void {
    const off = HALF + CONT_W / 2
    const L = CONT_L[40]
    const wall = (along: 'x' | 'z', fixed: number, start: number, n: number, doorsOut: number) => {
      for (let i = 0; i < n; i += 1) {
        const t = start + L / 2 + i * L
        const tiers = 3 + (this.rand() < 0.35 ? 1 : 0)
        for (let s = 0; s < tiers; s += 1) {
          const jitter = (this.rand() - 0.5) * 0.12
          const x = along === 'x' ? t + jitter : fixed
          const z = along === 'x' ? fixed : t + jitter
          const rot = (along === 'x' ? 0 : Math.PI / 2) + (this.rand() < 0.5 ? Math.PI : 0) + (this.rand() - 0.5) * 0.008
          this.container(x, s * CONT_H, z, rot, 40, Math.floor(this.rand() * 64), false)
        }
      }
      void doorsOut
    }
    wall('x', -off, -L * 3.5, 7, 0)
    wall('z', -off, -HALF, 7, 0)
    wall('z', off, -HALF, 7, 0)
    // One solid collider per wall (players cannot climb 7.8 m; stops rockets cleanly).
    this.collider(0, 4.5, -off, L * 7 + CONT_W * 2, 9, CONT_W, 0, 'metal')
    for (const s of [-1, 1]) this.collider(s * off, 4.5, -HALF + (L * 7) / 2, CONT_W, 9, L * 7, 0, 'metal')
  }

  // ─── central deck (kept from the Foundry: proven sightlines) ───────────
  private buildPlatform(): void {
    const top = 1.6
    const half = 7
    this.box('wall', 0, top / 2 - 0.02, 0, half * 2, top - 0.04, half * 2, { surface: 'concrete' })
    this.box('plate', 0, top - 0.02, 0, half * 2 + 0.1, 0.04, half * 2 + 0.1, { tile: 2, collide: false })
    for (const s of [-1, 1]) {
      this.box('hazard', 0, top - 0.16, s * (half + 0.03), half * 2 + 0.1, 0.24, 0.04, { collide: false, tile: 1 })
      this.box('hazard', s * (half + 0.03), top - 0.16, 0, 0.04, 0.24, half * 2 + 0.1, { collide: false, tile: 1 })
    }
    this.collider(0, top - 0.02, 0, half * 2, 0.04, half * 2, 0, 'metal')
    for (const s of [-1, 1]) this.ramp(0, s * half, 0, s * (half + 6.2), 5, top)
    const railY = top
    const rail = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0)
      const cx = (x0 + x1) / 2
      const cz = (z0 + z1) / 2
      const rot = Math.atan2(-(z1 - z0), x1 - x0)
      for (const hgt of [0.55, 1.05]) this.pipe(cx, railY + hgt, cz, len, rot)
      const posts = Math.max(2, Math.round(len / 1.8) + 1)
      for (let i = 0; i < posts; i += 1) {
        const t = i / (posts - 1)
        const post = new THREE.CylinderGeometry(0.035, 0.035, 1.08, 8)
        this.queue('rust', post, new THREE.Matrix4().makeTranslation(x0 + (x1 - x0) * t, railY + 0.54, z0 + (z1 - z0) * t))
      }
      this.collider(cx, railY + 0.55, cz, len, 1.1, 0.08, rot, 'metal')
    }
    rail(-half, -half, -2.6, -half)
    rail(2.6, -half, half, -half)
    rail(-half, half, -2.6, half)
    rail(2.6, half, half, half)
    rail(-half, -half, -half, half)
    rail(half, -half, half, half)
  }

  private pipe(cx: number, cy: number, cz: number, len: number, rotY: number, mat = 'rust', r = 0.03): void {
    const g = new THREE.CylinderGeometry(r, r, len, 8)
    g.rotateZ(Math.PI / 2)
    this.queue(mat, g, new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromAxisAngle(UP, rotY), new THREE.Vector3(1, 1, 1)))
  }

  /** Straight ramp from high edge (xh,zh) at `height` down to (xl,zl) at ground level. */
  private ramp(xh: number, zh: number, xl: number, zl: number, width: number, height: number): void {
    const run = Math.hypot(xl - xh, zl - zh)
    const len = Math.hypot(run, height)
    const pitch = Math.atan2(height, run)
    const t = 0.3
    const dirX = (xh - xl) / run
    const dirZ = (zh - zl) / run
    const rotY = Math.atan2(dirX, dirZ)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, rotY, 0, 'YXZ'))
    const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
    const mid = new THREE.Vector3((xh + xl) / 2, height / 2, (zh + zl) / 2).addScaledVector(normal, -t / 2)
    this.queue('plate', worldBox(width, t, len, 2), new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)))
    const c = this.physics.addStaticBox(mid, new THREE.Vector3(width, t, len), q)
    this.tags.set(c.handle, { kind: 'world', surface: 'metal' })
    for (const s of [-1, 1]) {
      const shape = new THREE.Shape()
      shape.moveTo(0, 0)
      shape.lineTo(run, 0)
      shape.lineTo(run, height)
      shape.closePath()
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false })
      const uvs = g.getAttribute('uv') as THREE.BufferAttribute
      for (let i = 0; i < uvs.count; i += 1) uvs.setXY(i, uvs.getX(i) / 4, uvs.getY(i) / 4)
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(xl + -dirZ * ((s * width) / 2), 0, zl + dirX * ((s * width) / 2)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-dirZ, dirX), 0)),
        new THREE.Vector3(1, 1, 1),
      )
      m.multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.1))
      this.queue('wall', g, m)
    }
  }

  // ─── cover: containers, jersey barriers, blast walls, light poles ──────
  private barrier(x: number, z: number, rotDeg: number): void {
    const shape = new THREE.Shape()
    const pts: [number, number][] = [[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.15, 0.3], [0.1, 0.81], [-0.1, 0.81], [-0.15, 0.3], [-0.3, 0.08]]
    shape.moveTo(pts[0][0], pts[0][1])
    for (const p of pts.slice(1)) shape.lineTo(p[0], p[1])
    shape.closePath()
    const len = 3
    const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 })
    g.translate(0, 0, -len / 2)
    const uvs = g.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uvs.count; i += 1) uvs.setXY(i, uvs.getX(i) / 2.5, uvs.getY(i) / 2.5)
    const rot = (rotDeg * Math.PI) / 180
    this.queue('wall', g, new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(UP, rot), new THREE.Vector3(1, 1, 1)))
    this.collider(x, 0.405, z, 0.5, 0.81, len, rot, 'concrete')
  }

  private buildCover(): void {
    COVER_CONTAINERS.forEach(([x, z, r, stack, size], i) => {
      for (let s = 0; s < stack; s += 1) this.container(x + (s ? 0.06 : 0), s * CONT_H, z, (r * Math.PI) / 180 + (s ? 0.015 : 0), size, i * 3 + s * 5)
    })
    const barriers: [number, number, number][] = [
      [-10.5, -11, 45], [10.5, 11, 45], [11, -10.5, -45], [-11, 10.5, -45],
      [-30, 30, 90], [30, -30, 90], [-7, 20.5, 0], [7, -20.5, 0],
      [18.5, 1, 90], [-18.5, -1, 90], [-22, -9, 0], [22, 9, 0], [-4, -36, 0], [4, 36, 0],
    ]
    for (const b of barriers) this.barrier(...b)
    // Concrete blast walls (reefer-plug bays) in two corners, low walls in the other two.
    this.box('wall', -30, 1.6, -27, 9, 3.2, 0.5)
    this.box('wall', -25.75, 1.6, -31.5, 0.5, 3.2, 4.5)
    this.box('wall', 30, 1.6, 27, 9, 3.2, 0.5)
    this.box('wall', 25.75, 1.6, 31.5, 0.5, 3.2, 4.5)
    this.box('wall', 31, 0.55, -30.5, 7, 1.1, 0.5)
    this.box('wall', -31, 0.55, 30.5, 7, 1.1, 0.5)
    this.box('wall', 34, 0.55, -24, 0.5, 1.1, 5)
    this.box('wall', -34, 0.55, 24, 0.5, 1.1, 5)
    for (const [x, z] of [[-30, -27], [30, 27]]) this.box('rust', x, 3.25, z, 9.2, 0.1, 0.7, { collide: false, tile: 2 })
    // Sodium yard lights on short poles at the ramp feet (the only real point lights in the yard).
    for (const [x, z] of [[-7, -14.5], [7, 14.5]] as const) {
      this.box('steel', x, 3.4, z, 0.22, 6.8, 0.22, { surface: 'metal' })
      this.box('steel', x + Math.sign(-x) * 0.8, 6.75, z, 1.7, 0.12, 0.14, { collide: false, tile: 1 })
      this.box('darkMetal', x + Math.sign(-x) * 1.55, 6.62, z, 0.7, 0.2, 0.36, { collide: false, tile: 1 })
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.28), new THREE.MeshBasicMaterial({ color: '#ffc27a' }))
      lens.rotation.x = Math.PI / 2
      lens.position.set(x + Math.sign(-x) * 1.55, 6.51, z)
      this.group.add(lens)
      const light = new THREE.PointLight('#ffb766', 30, 26, 1.6)
      light.position.set(x + Math.sign(-x) * 1.55, 6.2, z)
      this.group.add(light)
      this.lamps.push(light)
    }
  }

  // ─── north quay: fence, apron, rails, quay wall, water, ship ───────────
  private buildQuay(): void {
    // Security fence along the open north side (z = 40): galvanised posts, rails, chain link.
    const fz = HALF + 0.15
    const fh = 3.6
    for (let x = -HALF; x <= HALF; x += 2.5) this.box('steel', x, fh / 2, fz, 0.09, fh, 0.09, { collide: false, tile: 1 })
    for (const y of [0.12, fh - 0.05]) this.pipe(0, y, fz, HALF * 2, 0, 'steel', 0.035)
    const link = new THREE.PlaneGeometry(HALF * 2, fh - 0.15)
    const uv = link.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * HALF * 2 * 7, uv.getY(i) * (fh - 0.15) * 7)
    this.queue('fence', link, new THREE.Matrix4().makeTranslation(0, fh / 2 + 0.05, fz))
    // Barbed outrigger.
    for (let x = -HALF; x <= HALF; x += 2.5) this.box('steel', x, fh + 0.22, fz + 0.18, 0.05, 0.5, 0.05, { collide: false, tile: 1, rotX: 0.6 })
    for (const dz of [0.12, 0.3]) this.pipe(0, fh + 0.2 + dz, fz + dz * 0.9, HALF * 2, 0, 'steel', 0.012)
    this.collider(0, 4, fz, HALF * 2 + 2, 8, 0.3, 0, 'metal')
    // Jersey barriers along the fence line outside (sightline texture).
    for (let x = -36; x <= 36; x += 6) this.barrier(x, fz + 1.4, 90)
    // STS crane rails (two pairs) and painted apron lanes.
    for (const rz of [50.2, 78.2]) for (const d of [-0.4, 0.4]) this.box('steel', 0, 0.04, rz + d, 340, 0.08, 0.12, { collide: false, tile: 2 })
    // Quay wall, coping, fenders, bollards.
    const qz = 86
    this.box('wall', 0, -2, qz + 0.6, 340, 4.2, 1.2, { collide: false, tile: 4 })
    this.box('wall', 0, 0.12, qz + 0.4, 340, 0.24, 1.0, { collide: false, tile: 2 })
    for (let x = -165; x <= 165; x += 11) {
      this.box('darkMetal', x, -1.1, qz + 1.35, 1.3, 2.2, 0.4, { collide: false, tile: 1 })
      const b = new THREE.CylinderGeometry(0.22, 0.28, 0.6, 12)
      this.queue('darkMetal', b, new THREE.Matrix4().makeTranslation(x + 5.5, 0.3, qz - 0.2))
    }
    // Harbour water: dark, low-glare, animated normals.
    const waterGeo = new THREE.PlaneGeometry(700, 500)
    waterGeo.rotateX(-Math.PI / 2)
    const wn = waterNormalTexture()
    wn.repeat.set(70, 50)
    const water = new THREE.MeshStandardMaterial({ color: '#141d21', roughness: 0.2, metalness: 0, normalMap: wn, envMapIntensity: 0.55 })
    water.normalScale.set(0.55, 0.55)
    this.water.mat = water
    const wmesh = new THREE.Mesh(waterGeo, water)
    wmesh.position.set(0, -2.4, qz + 250)
    wmesh.receiveShadow = false
    this.group.add(wmesh)
    this.buildShip(108)
  }

  private buildShip(cz: number): void {
    const shape = new THREE.Shape()
    const pts: [number, number][] = [[-104, -10], [-100, -16], [78, -16], [96, -10], [106, 0], [96, 10], [78, 16], [-100, 16], [-104, 10]]
    shape.moveTo(pts[0][0], pts[0][1])
    for (const p of pts.slice(1)) shape.lineTo(p[0], p[1])
    shape.closePath()
    const hullH = 15
    const hull = new THREE.ExtrudeGeometry(shape, { depth: hullH, bevelEnabled: false })
    const uvs = hull.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uvs.count; i += 1) uvs.setXY(i, uvs.getX(i) / 6, uvs.getY(i) / 6)
    hull.rotateX(-Math.PI / 2)
    this.queue('hull', hull, new THREE.Matrix4().makeTranslation(0, -9, cz))
    // Accommodation block and funnel at the stern.
    this.box('house', -84, 6 + 13, cz, 14, 26, 26, { collide: false, tile: 3 })
    this.box('house', -84, 6 + 26.6, cz, 16, 1.2, 34, { collide: false, tile: 3 })
    this.box('hull', -95, 6 + 16, cz, 6, 20, 8, { collide: false, tile: 3 })
    // Bridge windows: a faint warm strip (low emission, no bloom glare).
    const win = new THREE.Mesh(new THREE.PlaneGeometry(25, 1.1), new THREE.MeshBasicMaterial({ color: '#6f5c40', fog: true }))
    win.rotation.y = -Math.PI / 2
    win.position.set(-91.05, 6 + 24, cz)
    this.group.add(win)
    // Deck cargo: instanced 40 ft boxes, bays forward of the house.
    const mats: THREE.Matrix4[] = []
    const colors: THREE.Color[] = []
    for (let bx = -66; bx <= 84; bx += 12.7) {
      const rows = bx > 70 ? 8 : 12
      for (let r = 0; r < rows; r += 1) {
        const z = cz - ((rows - 1) * 2.5) / 2 + r * 2.5
        const tiers = 2 + Math.floor(this.rand() * 5)
        for (let t = 0; t < tiers; t += 1) {
          mats.push(new THREE.Matrix4().makeTranslation(bx, 6 + CONT_H / 2 + t * CONT_H, z))
          colors.push(new THREE.Color(CONTAINER_COLORS[Math.floor(this.rand() * CONTAINER_COLORS.length)]))
        }
      }
    }
    this.instancedBoxes(mats, colors, false)
  }

  /** Low-detail instanced 40 ft containers for the skyline (no colliders, no shadows). */
  private instancedBoxes(mats: THREE.Matrix4[], colors: THREE.Color[], alongZ: boolean): void {
    if (!this.mats.farCont) {
      const m = pbr(this.lib.sets.corrugated_iron_02, { color: '#ffffff', metalness: 0.3, normalScale: 0.8, envMapIntensity: 0.3 })
      applyGrime(m, { amount: 0.9, foot: 0.6 })
      this.mats.farCont = m
    }
    const g = alongZ ? worldBox(CONT_W, CONT_H, CONT_L[40], 2.6) : worldBox(CONT_L[40], CONT_H, CONT_W, 2.6)
    const mesh = new THREE.InstancedMesh(g, this.mats.farCont, mats.length)
    mats.forEach((m, i) => {
      mesh.setMatrixAt(i, m)
      mesh.setColorAt(i, colors[i])
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.castShadow = false
    mesh.receiveShadow = true
    this.group.add(mesh)
  }

  /** Container stacks beyond the walls on the land sides, with idle RTGs straddling two blocks. */
  private buildBackdropStacks(): void {
    const mats: THREE.Matrix4[] = []
    const colors: THREE.Color[] = []
    const matsZ: THREE.Matrix4[] = []
    const colorsZ: THREE.Matrix4[] | THREE.Color[] = []
    const block = (bx: number, bz: number, bays: number, rows: number, alongZ: boolean) => {
      for (let b = 0; b < bays; b += 1) {
        for (let r = 0; r < rows; r += 1) {
          const tiers = 1 + Math.floor(this.rand() * 5)
          for (let t = 0; t < tiers; t += 1) {
            const a = b * 12.6
            const c = r * 2.55
            const x = alongZ ? bx + c : bx + a
            const z = alongZ ? bz + a : bz + c
            const m = new THREE.Matrix4().makeTranslation(x, CONT_H / 2 + t * CONT_H, z)
            const col = new THREE.Color(CONTAINER_COLORS[Math.floor(this.rand() * CONTAINER_COLORS.length)])
            if (alongZ) {
              matsZ.push(m)
              ;(colorsZ as THREE.Color[]).push(col)
            } else {
              mats.push(m)
              colors.push(col)
            }
          }
        }
      }
    }
    for (const bz of [-58, -84, -110]) for (const bx of [-140, -50, 40]) block(bx, bz, 7, 6, false)
    for (const bx of [52, 78, 104]) for (const bz of [-36, 6]) block(bx, bz, 3, 6, true)
    for (const bx of [-67, -93, -119]) for (const bz of [-36, 6]) block(bx, bz, 3, 6, true)
    this.instancedBoxes(mats, colors, false)
    this.instancedBoxes(matsZ, colorsZ as THREE.Color[], true)
    // Idle RTGs over the southern blocks (visual only).
    for (const [x, z] of [[-7, -51.6], [62, -77.6]] as const) this.rtg(new THREE.Vector3(x, 0, z), 0, false)
  }

  // ─── props from models ─────────────────────────────────────────────────
  private model(id: ModelId, pos: THREE.Vector3, rotY: number, scale: number, collide: boolean, surface: Surface, shadow = true): THREE.Object3D {
    const src = this.lib.models[id].scene
    const obj = src.clone(true)
    obj.scale.setScalar(scale)
    obj.position.copy(pos)
    obj.rotation.y = rotY
    obj.traverse(o => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = shadow
        m.receiveShadow = true
      }
    })
    this.group.add(obj)
    if (collide) {
      obj.updateMatrixWorld(true)
      const local = new THREE.Box3().setFromObject(src)
      const size = local.getSize(new THREE.Vector3()).multiplyScalar(scale)
      const center = local.getCenter(new THREE.Vector3()).multiplyScalar(scale).applyAxisAngle(UP, rotY).add(pos)
      this.collider(center.x, center.y, center.z, size.x, size.y, size.z, rotY, surface)
    }
    return obj
  }

  /** Grounded scan placement: returns the y offset applied so colliders can use the same frame. */
  private grounded(id: ModelId, pos: THREE.Vector3, rotY: number, scale: number, shadow = true): number {
    const min = new THREE.Box3().setFromObject(this.lib.models[id].scene).min.y
    const y = pos.y - min * scale
    this.model(id, new THREE.Vector3(pos.x, y, pos.z), rotY, scale, false, 'metal', shadow)
    return y
  }

  /**
   * RTG crane (Tripo scan, s = 26 → 25 m tall, 26 m span). Span runs along local Z. Colliders are
   * the measured end frames (two legs each) and the wheel bogies, so the gantry stays walk-through.
   */
  private rtg(pos: THREE.Vector3, rotY: number, collide: boolean): void {
    const s = 26
    const y = this.grounded('rtg_crane', pos, rotY, s, collide)
    if (!collide) return
    const base = new THREE.Vector3(pos.x, 0, pos.z)
    for (const sz of [-1, 1]) {
      const z0 = sz > 0 ? 0.38 : -0.5
      const z1 = sz > 0 ? 0.5 : -0.38
      this.scanCollider(base, rotY, s, y, [-0.238, -0.485, sz > 0 ? 0.379 : -0.454], [0.238, -0.388, sz > 0 ? 0.453 : -0.38], 'metal')
      for (const sx of [-1, 1]) this.scanCollider(base, rotY, s, y, sx > 0 ? [0.075, -0.39, z0] : [-0.215, -0.39, z0], sx > 0 ? [0.215, 0.242, z1] : [-0.075, 0.242, z1], 'metal')
    }
  }

  private placeModels(): void {
    // Central landmark: RTG straddling the deck, span along world X (end frames at x ≈ ±10..13).
    this.rtg(new THREE.Vector3(0, 0, 0), Math.PI / 2, true)
    // Reach stackers as heavy cover (point-symmetric), chassis collider from the measured scan.
    for (const s of [1, -1]) {
      const pos = new THREE.Vector3(-27.5 * s, 0, 4.5 * s)
      const rot = s > 0 ? Math.PI / 2 : (3 * Math.PI) / 2
      const y = this.grounded('reach_stacker', pos, rot, 12)
      this.scanCollider(new THREE.Vector3(pos.x, 0, pos.z), rot, 12, y, [-0.45, -0.311, -0.183], [0.36, -0.02, 0.183], 'metal')
    }
    const crate = (x: number, y: number, z: number, rot: number, stack = 2) => {
      for (let s = 0; s < stack; s += 1) this.model('wooden_military_crate', new THREE.Vector3(x, y + s * 0.63, z), rot + (s ? 0.06 : 0), 1.35, true, 'wood')
    }
    crate(16.5, 0, -3, Math.PI / 2)
    crate(-16.5, 0, 3, Math.PI / 2)
    crate(-3.6, 1.6, -3.4, 0.2, 1)
    crate(3.6, 1.6, 3.4, 0.2, 1)
    crate(-26, 0, -10.5, 0)
    crate(26, 0, 10.5, 0)
    crate(-8, 0, -35.5, 0.1)
    crate(8, 0, 35.5, -0.1)
    crate(35.5, 0, 34, Math.PI / 2, 1)
    crate(-35.5, 0, -34, Math.PI / 2, 1)
    crate(-17, 0, 24.5, 0.4, 1)
    crate(17, 0, -24.5, 0.4, 1)
    const cover = (id: 'jersey_barrier' | 'sandbags', x: number, z: number, rot: number, scale: number) => {
      const min = new THREE.Box3().setFromObject(this.lib.models[id].scene).min.y
      this.model(id, new THREE.Vector3(x, -min * scale, z), rot, scale, true, 'concrete')
    }
    for (const s of [1, -1]) {
      cover('jersey_barrier', -19.5 * s, -27.5 * s, 0, 2.7)
      cover('sandbags', 0.5 * s, -20.5 * s, Math.PI / 2, 3.2)
      cover('sandbags', -24.5 * s, 33.5 * s, 0.35, 3.2)
    }
    // Reefer/electrical cabinets against the container walls.
    for (const [x, z, r] of [[-12, -39.3, 0], [22, -39.3, 0], [-39.3, -18, Math.PI / 2], [39.3, 18, -Math.PI / 2], [-39.3, 26, Math.PI / 2], [39.3, -26, -Math.PI / 2]] as const) {
      this.model('utility_box_02', new THREE.Vector3(x, 0, z), r, 1.3, true, 'metal')
    }
    // Container-mounted security lights (visual).
    for (const [x, z, r] of [[-18, -39.5, 0], [18, -39.5, 0], [-39.5, 12, Math.PI / 2], [39.5, -12, -Math.PI / 2]] as const) {
      this.model('security_light', new THREE.Vector3(x, 5.5, z), r, 2, false, 'metal')
    }
    // Workers' burn barrels (non-explosive decor) with flickering ground glow.
    for (const [x, z] of [[-36.5, 21], [36.5, -21]] as const) {
      this.model('barrel_03', new THREE.Vector3(x, 0, z), 0, 1, true, 'metal')
      const glow = new THREE.MeshBasicMaterial({ map: fireGlowTexture(), color: '#ff7a2a', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), glow)
      pool.rotation.x = -Math.PI / 2
      pool.position.set(x, 0.03, z)
      pool.renderOrder = 3
      this.group.add(pool)
      this.fires.push({ pos: new THREE.Vector3(x, 0.95, z), glow })
    }
    // High-mast floodlights at the yard corners (housings + soft panels; no real lights).
    const glowMat = new THREE.MeshBasicMaterial({ color: '#d9c7a4', fog: true })
    for (const [x, z] of [[-47, -47], [47, -47], [-47, 47], [47, 47]] as const) {
      this.queue('steel', worldBox(0.9, 34, 0.9, 2), new THREE.Matrix4().makeTranslation(x, 17, z))
      this.queue('steel', new THREE.TorusGeometry(2.2, 0.12, 6, 20).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(x, 34, z))
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2
        const head = new THREE.Mesh(worldBox(0.9, 0.5, 0.3, 1), this.mats.darkMetal)
        head.position.set(x + Math.cos(a) * 2.2, 33.6, z + Math.sin(a) * 2.2)
        head.lookAt(0, 0, 0)
        const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), glowMat)
        lens.position.copy(head.position)
        lens.quaternion.copy(head.quaternion)
        lens.translateZ(0.16)
        this.group.add(head, lens)
      }
    }
    this.flush()
  }

  /** Stage 2: ship-to-shore cranes along the quay (backdrop, no colliders). */
  attachSts(scene: THREE.Object3D): void {
    if (this.stsAttached) return
    this.stsAttached = true
    const s = 80
    const min = new THREE.Box3().setFromObject(scene).min.y
    for (const [x, shadow] of [[-58, false], [0, true], [58, false]] as const) {
      const obj = scene.clone(true)
      obj.scale.setScalar(s)
      obj.position.set(x, -min * s, 74)
      obj.rotation.y = Math.PI
      obj.traverse(o => {
        const m = o as THREE.Mesh
        if (m.isMesh) {
          m.castShadow = shadow
          m.receiveShadow = true
          m.matrixAutoUpdate = false
        }
      })
      obj.updateMatrixWorld(true)
      this.group.add(obj)
    }
  }

  /** Drizzle streaks that follow the camera. density 0 disables (low quality). */
  attachCamera(camera: THREE.Camera, density: number): void {
    this.camera = camera
    this.setRainDensity(density)
  }

  setRainDensity(density: number): void {
    const max = 3200
    if (!this.rain) {
      const seeds = new Float32Array(max * 2 * 4)
      for (let i = 0; i < max; i += 1) {
        const x = Math.random()
        const y = Math.random()
        const z = Math.random()
        seeds.set([x, y, z, 0, x, y, z, 1], i * 8)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 2 * 3), 3))
      g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
      const mat = new THREE.ShaderMaterial({
        uniforms: { uCam: { value: new THREE.Vector3() }, uTime: this.timeUniform },
        vertexShader: `
          attribute vec4 aSeed; uniform vec3 uCam; uniform float uTime; varying float vA;
          void main() {
            vec3 box = vec3(34.0, 20.0, 34.0);
            vec3 vel = vec3(1.1, -11.0, 0.6);
            vec3 p = aSeed.xyz * box + vel * uTime * (0.85 + aSeed.x * 0.3);
            p = mod(p - uCam + vec3(box.x * 0.5, 4.0, box.z * 0.5), box) - vec3(box.x * 0.5, 4.0, box.z * 0.5) + uCam;
            p -= normalize(vel) * aSeed.w * (0.35 + aSeed.z * 0.25);
            vA = (1.0 - aSeed.w * 0.9) * smoothstep(0.0, 3.0, length(p - uCam));
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `varying float vA; void main() { gl_FragColor = vec4(0.72, 0.76, 0.8, 0.2 * vA); }`,
        transparent: true,
        depthWrite: false,
      })
      const mesh = new THREE.LineSegments(g, mat)
      mesh.frustumCulled = false
      mesh.renderOrder = 4
      this.rain = { mesh, mat, max }
      this.scene.add(mesh)
    }
    const n = Math.round(this.rain.max * Math.max(0, Math.min(1, (density - 0.5) / 0.5 + 0.0001)))
    this.rain.mesh.visible = n > 0
    this.rain.mesh.geometry.setDrawRange(0, n * 2)
  }

  // ─── navigation ────────────────────────────────────────────────────────
  private bakeNav(): NavGrid {
    const nav = new NavGrid(80, 80, 1, -HALF, -HALF)
    const world = this.physics.world
    const ray = new RAPIER.Ray({ x: 0, y: 4.5, z: 0 }, { x: 0, y: -1, z: 0 })
    const sample = (x: number, z: number): { h: number; ny: number } => {
      ray.origin = { x, y: 4.5, z }
      const hit = world.castRayAndGetNormal(ray, 6, true)
      if (!hit) return { h: BLOCKED, ny: 0 }
      return { h: 4.5 - hit.timeOfImpact, ny: hit.normal.y }
    }
    const r = 0.5
    for (let cz = 0; cz < nav.rows; cz += 1) {
      for (let cx = 0; cx < nav.cols; cx += 1) {
        const x = -HALF + cx + 0.5
        const z = -HALF + cz + 0.5
        const c = sample(x, z)
        let ok = c.h !== BLOCKED && c.h < 3 && c.ny > 0.8 && Math.abs(x) < HALF - 1 && Math.abs(z) < HALF - 1
        if (ok) {
          for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]]) {
            const s = sample(x + dx, z + dz)
            if (Math.abs(s.h - c.h) > 0.3) {
              ok = false
              break
            }
          }
        }
        nav.heights[nav.index(cx, cz)] = ok ? c.h : BLOCKED
      }
    }
    nav.computeEdges()
    return nav
  }

  private defineSpots(): void {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
    const spawnXZ: [number, number][] = [
      [-36, -16], [36, 16], [-18, -36], [18, 36], [-36, 8], [36, -8], [10, -36], [-10, 36], [-22, 27], [22, -27], [-30, -33], [30, 33],
    ]
    for (const [x, z] of spawnXZ) {
      const i = this.nav.nearest(x, z, 6)
      const c = i >= 0 ? this.nav.center(i) : { x, z }
      this.spawns.push(v(c.x, i >= 0 ? this.nav.heights[i] : 0, c.z))
    }
    const barrels: [number, number, PropSpot['model']][] = [
      [-12, -18.5, 'barrel'], [-11.2, -19.3, 'barrel'], [12, 18.5, 'barrel'], [11.2, 19.3, 'barrel'],
      [-31, -13, 'barrel'], [-31.8, -13.8, 'propane'], [31, 13, 'barrel'], [31.8, 13.8, 'propane'],
      [16, -31.5, 'barrel'], [-16, 31.5, 'barrel'], [-3, -15.6, 'propane'], [3, 15.6, 'propane'],
      [-24.2, -32, 'barrel'], [24.2, 32, 'barrel'], [5.5, -8.4, 'barrel'], [-5.5, 8.4, 'barrel'],
    ]
    for (const [x, z, model] of barrels) this.props.push({ pos: v(x, 0, z), model, rot: Math.random() * Math.PI * 2 })
    const pick: [number, number, number, PickupSpot['kind']][] = [
      [-31, 0, -1, 'health'], [31, 0, 1, 'health'], [0, 0, -36, 'health'], [0, 0, 36, 'health'],
      [-30, 0, -31, 'armor'], [30, 0, 31, 'armor'],
      [-20, 0, 8, 'ammo'], [20, 0, -8, 'ammo'], [-9, 0, 26, 'ammo'], [9, 0, -26, 'ammo'],
      [0, 1.6, 0, 'rocket'],
    ]
    for (const [x, y, z, kind] of pick) this.pickups.push({ pos: v(x, y, z), kind })
  }

  /** Ground height below a point (used by FX pieces). */
  groundAt(x: number, z: number, fromY: number): number {
    const hit = this.physics.world.castRay(new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }), 12, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, c => this.tags.get(c.handle)?.kind === 'world')
    return hit ? fromY - hit.timeOfImpact : 0
  }

  update(time: number): void {
    this.timeUniform.value = time
    for (const f of this.fires) f.glow.opacity = 0.62 + Math.sin(time * 17) * 0.08 + Math.sin(time * 7.3) * 0.1 + Math.random() * 0.08
    if (this.water.mat?.normalMap) this.water.mat.normalMap.offset.set(time * 0.004, time * 0.0065)
    if (this.rain && this.camera) this.camera.getWorldPosition((this.rain.mat.uniforms.uCam.value as THREE.Vector3))
  }
}

// ─── canvas textures ─────────────────────────────────────────────────────
let blackTex: THREE.DataTexture | undefined
function blackTexture(): THREE.DataTexture {
  if (!blackTex) {
    blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
    blackTex.needsUpdate = true
  }
  return blackTex
}

/**
 * Yard paint/joint mask over the 80 × 80 m slab, 25.6 px/m. Channels: R yellow paint, G white
 * paint, B slab joints/cracks/oil. flipY off so canvas (px, py) = ((x + 40) * 25.6, (z + 40) * 25.6).
 */
function yardMarksTexture(): THREE.CanvasTexture {
  const S = 2048
  const k = S / (HALF * 2)
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, S, S)
  g.globalCompositeOperation = 'lighter'
  const P = (x: number) => (x + HALF) * k
  let seed = 3
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const B = 'rgb(0,0,255)'
  const Y = 'rgb(255,0,0)'
  const W = 'rgb(0,255,0)'
  // Slab joints every 5 m (sawn), slightly irregular strength.
  g.lineWidth = 2
  for (let i = -HALF; i <= HALF; i += 5) {
    g.strokeStyle = `rgba(0,0,255,${0.55 + rnd() * 0.35})`
    g.beginPath()
    g.moveTo(P(i), 0)
    g.lineTo(P(i), S)
    g.stroke()
    g.beginPath()
    g.moveTo(0, P(i))
    g.lineTo(S, P(i))
    g.stroke()
  }
  // Cracks.
  for (let n = 0; n < 70; n += 1) {
    let x = rnd() * S
    let y = rnd() * S
    let a = rnd() * Math.PI * 2
    g.strokeStyle = `rgba(0,0,255,${0.35 + rnd() * 0.4})`
    g.lineWidth = 1 + rnd() * 1.5
    g.beginPath()
    g.moveTo(x, y)
    for (let s = 0; s < 8 + rnd() * 14; s += 1) {
      a += (rnd() - 0.5) * 1.1
      x += Math.cos(a) * (6 + rnd() * 14)
      y += Math.sin(a) * (6 + rnd() * 14)
      g.lineTo(x, y)
    }
    g.stroke()
  }
  // Oil stains (soft blotches into the joint/dark channel).
  for (let n = 0; n < 40; n += 1) {
    const x = rnd() * S
    const y = rnd() * S
    const r = 10 + rnd() * 45
    const grd = g.createRadialGradient(x, y, 0, x, y, r)
    grd.addColorStop(0, `rgba(0,0,255,${0.25 + rnd() * 0.25})`)
    grd.addColorStop(1, 'rgba(0,0,255,0)')
    g.fillStyle = grd
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // RTG tyre lane along X (z = ±6.4), solid yellow, plus dashed traffic lanes.
  const line = (col: string, x0: number, z0: number, x1: number, z1: number, w: number, dash: number[] = []) => {
    g.strokeStyle = col
    g.lineWidth = w * k
    g.setLineDash(dash.map(d => d * k))
    g.beginPath()
    g.moveTo(P(x0), P(z0))
    g.lineTo(P(x1), P(z1))
    g.stroke()
    g.setLineDash([])
  }
  for (const s of [-1, 1]) {
    line(Y, -HALF, s * 6.6, HALF, s * 6.6, 0.18)
    line(Y, -HALF, s * 7.0, HALF, s * 7.0, 0.1)
    line(W, s * 17, -HALF, s * 17, HALF, 0.14, [3, 2])
    line(W, -HALF, s * 17.5, HALF, s * 17.5, 0.14, [3, 2])
    line(Y, s * 37.6, -HALF, s * 37.6, HALF, 0.15)
    line(Y, -HALF, -37.6, HALF, -37.6, 0.15)
  }
  line(Y, -HALF, 37.4, HALF, 37.4, 0.15)
  // Hatched keep-clear zones at the ramp feet.
  g.save()
  for (const s of [-1, 1]) {
    const z0 = s > 0 ? 13.3 : -16.3
    g.save()
    g.beginPath()
    g.rect(P(-2.6), P(z0), 5.2 * k, 3 * k)
    g.clip()
    g.strokeStyle = Y
    g.lineWidth = 0.22 * k
    for (let x = -8; x <= 8; x += 0.8) {
      g.beginPath()
      g.moveTo(P(x), P(z0))
      g.lineTo(P(x + 3), P(z0 + 3))
      g.stroke()
    }
    g.restore()
    g.strokeStyle = Y
    g.lineWidth = 0.12 * k
    g.strokeRect(P(-2.6), P(z0), 5.2 * k, 3 * k)
  }
  g.restore()
  // Container slot outlines under each cover box.
  g.strokeStyle = W
  g.lineWidth = 0.1 * k
  for (const [x, z, r, , size] of COVER_CONTAINERS) {
    g.save()
    g.translate(P(x), P(z))
    g.rotate((-r * Math.PI) / 180)
    const l = (CONT_L[size] + 0.6) * k
    const w = (CONT_W + 0.6) * k
    g.strokeRect(-l / 2, -w / 2, l, w)
    g.restore()
  }
  // Bay / row stencils and lane arrows.
  g.fillStyle = W
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `bold ${Math.round(2.0 * k)}px "Arial Narrow", Arial, sans-serif`
  const label = (t: string, x: number, z: number, rot: number) => {
    g.save()
    g.translate(P(x), P(z))
    g.rotate(rot)
    g.fillText(t, 0, 0)
    g.restore()
  }
  label('BAY 07', -26, -36, 0)
  label('BAY 08', 26, 36, Math.PI)
  label('R14', -36.2, 0, Math.PI / 2)
  label('R15', 36.2, 0, -Math.PI / 2)
  label('K-2', -11, -27, 0)
  label('K-3', 11, 27, Math.PI)
  label('A', -24, -3, 0)
  label('B', 24, 3, Math.PI)
  g.font = `bold ${Math.round(1.1 * k)}px "Arial Narrow", Arial, sans-serif`
  label('RTG LANE — KEEP CLEAR', 0, -9.3, 0)
  label('RTG LANE — KEEP CLEAR', 0, 9.3, Math.PI)
  label('MAX 25 KM/H', -28, 22, 0)
  label('MAX 25 KM/H', 28, -22, Math.PI)
  const arrow = (x: number, z: number, rot: number) => {
    g.save()
    g.translate(P(x), P(z))
    g.rotate(rot)
    g.beginPath()
    g.moveTo(0, -1.6 * k)
    g.lineTo(0.7 * k, -0.4 * k)
    g.lineTo(0.22 * k, -0.4 * k)
    g.lineTo(0.22 * k, 1.4 * k)
    g.lineTo(-0.22 * k, 1.4 * k)
    g.lineTo(-0.22 * k, -0.4 * k)
    g.lineTo(-0.7 * k, -0.4 * k)
    g.closePath()
    g.fill()
    g.restore()
  }
  for (const z of [-28, -10, 10, 28]) {
    arrow(-15.5, z, 0)
    arrow(15.5, z, Math.PI)
  }
  for (const x of [-28, 28]) {
    arrow(x, -16, Math.PI / 2)
    arrow(x, 16, -Math.PI / 2)
  }
  void B
  const t = new THREE.CanvasTexture(c)
  t.flipY = false
  t.colorSpace = THREE.NoColorSpace
  t.anisotropy = 8
  t.generateMipmaps = true
  return t
}

function chainLinkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.clearRect(0, 0, 64, 64)
  g.strokeStyle = 'rgba(255,255,255,1)'
  g.lineWidth = 4
  g.beginPath()
  g.moveTo(0, 32)
  g.lineTo(32, 0)
  g.lineTo(64, 32)
  g.lineTo(32, 64)
  g.closePath()
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Tangent-space normal map from value noise (gentle chop). */
function waterNormalTexture(): THREE.CanvasTexture {
  const n = noiseTexture(256, 5, 8, 1.3)
  const src = n.image as HTMLCanvasElement
  const S = src.width
  const h = src.getContext('2d')!.getImageData(0, 0, S, S).data
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const img = g.createImageData(S, S)
  const at = (x: number, y: number) => h[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 3
      const dy = (at(x, y + 1) - at(x, y - 1)) * 3
      const l = Math.hypot(dx, dy, 1)
      const i = (y * S + x) * 4
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255
      img.data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255
      img.data[i + 2] = (1 / l) * 0.5 * 255 + 127
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  n.dispose()
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.NoColorSpace
  return t
}

let fireGlowTex: THREE.CanvasTexture | undefined
function fireGlowTexture(): THREE.CanvasTexture {
  if (fireGlowTex) return fireGlowTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,0.9)')
  r.addColorStop(0.35, 'rgba(255,255,255,0.35)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  fireGlowTex = new THREE.CanvasTexture(c)
  fireGlowTex.colorSpace = THREE.SRGBColorSpace
  return fireGlowTex
}

function hazardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#d9a514'
  ctx.fillRect(0, 0, 256, 64)
  ctx.fillStyle = '#16140f'
  for (let i = -2; i < 10; i += 1) {
    ctx.beginPath()
    ctx.moveTo(i * 32, 64)
    ctx.lineTo(i * 32 + 16, 64)
    ctx.lineTo(i * 32 + 48, 0)
    ctx.lineTo(i * 32 + 32, 0)
    ctx.fill()
  }
  for (let i = 0; i < 400; i += 1) {
    ctx.fillStyle = `rgba(40,30,20,${Math.random() * 0.25})`
    ctx.fillRect(Math.random() * 256, Math.random() * 64, 2 + Math.random() * 6, 1 + Math.random() * 3)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}
