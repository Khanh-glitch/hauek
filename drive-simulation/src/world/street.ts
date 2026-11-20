import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as T from '../engine/textures';
import { addSSS, patchWetSurface, type PlanarReflection } from '../engine/render';

export interface Circle { x: number; z: number; r: number }
export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }
export interface StreetCtx { scene: THREE.Scene; refl: PlanarReflection; wetU: any; }
export const BASE = import.meta.env.BASE_URL;
export const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

const rep = (t: THREE.Texture, rx: number, ry: number) => { const c = t.clone(); c.repeat.set(rx, ry); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.needsUpdate = true; return c; };
const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, cast = true, recv = true) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = recv; return o; };

export class Street {
  root = new THREE.Group(); roadGroup = new THREE.Group();
  circles: Circle[] = []; rects: Rect[] = []; anchors: THREE.Vector3[] = [];
  benchSeats: { pos: THREE.Vector3; yaw: number; taken: boolean }[] = [];
  stoolSeats: { pos: THREE.Vector3; yaw: number; taken: boolean }[] = [];
  parkedBikes: THREE.Object3D[] = []; ready: Promise<void>;
  timeU = { value: 0 }; night = 0;
  fans: { pos: THREE.Vector3; ph: number }[] = []; fanMesh!: THREE.InstancedMesh; awnings: THREE.Mesh[] = [];
  lampMat!: THREE.MeshStandardMaterial; glowSprites: THREE.Sprite[] = []; pools: THREE.Mesh[] = []; lampLights: THREE.PointLight[] = [];
  facadeMats: THREE.MeshStandardMaterial[] = []; signMats: THREE.MeshStandardMaterial[] = []; lightboxMats: THREE.MeshStandardMaterial[] = [];
  sidewalkMats: THREE.MeshStandardMaterial[] = []; neon: THREE.MeshStandardMaterial[] = []; shelterLight = new THREE.PointLight('#fff1d6', 0, 9, 1.8);
  signal = { east: 'green' as 'green' | 'yellow' | 'red', t: 0 }; signalLamps: { r: THREE.MeshStandardMaterial; y: THREE.MeshStandardMaterial; g: THREE.MeshStandardMaterial }[] = [];
  wires: THREE.Mesh | null = null; leafMat!: THREE.MeshStandardMaterial;

  constructor(public ctx: StreetCtx) {
    const r = T.rng(2025); const root = this.root; root.add(this.roadGroup);
    this.buildGround(); this.buildMedian(); this.buildTrees(r); this.buildLamps(); this.buildPoles(r); this.buildBuildings(r); this.buildShelter(); this.buildProps(r);
    this.ready = this.loadBikes(r);
  }

  /* ---------------- ground ---------------- */
  buildGround() {
    const { refl, wetU } = this.ctx; const a = T.makeAsphalt(); const L = 300;
    const road = new THREE.MeshStandardMaterial({ map: rep(a.map, 1, L / 12.8), roughnessMap: rep(a.rough, 1, L / 12.8), normalMap: rep(a.normal, 1, L / 12.8), roughness: 1, metalness: 0, envMapIntensity: 0.7 });
    road.normalScale.set(1.4, 1.4);
    patchWetSurface(road, refl, T.makePuddleMask(), wetU);
    const rd = new THREE.Mesh(new THREE.PlaneGeometry(12.8, L), road); rd.rotation.x = -Math.PI / 2; rd.receiveShadow = true; this.roadGroup.add(rd);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), std({ color: '#3d3e40', roughness: 0.95 })); far.rotation.x = -Math.PI / 2; far.position.y = -0.03; far.receiveShadow = true; this.root.add(far);
    const mk = new THREE.MeshStandardMaterial({ map: rep(T.makeMarkings(), 1, L / 12.8), transparent: true, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mp = new THREE.Mesh(new THREE.PlaneGeometry(12.8, L), mk); mp.rotation.x = -Math.PI / 2; mp.position.y = 0.003; mp.receiveShadow = true; this.roadGroup.add(mp);
    const decal = (tex: THREE.Texture, w: number, h: number, x: number, z: number, rotZ = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); m.rotation.x = -Math.PI / 2; m.rotation.z = rotZ; m.position.set(x, 0.005, z); m.receiveShadow = true; this.roadGroup.add(m); };
    decal(T.makeBusBay(), 3.0, 24, 4.85, 3.8); decal(T.makeZebra(), 11.4, 3.6, 0, -36); decal(T.makeZebra(), 11.4, 3.6, 0, 36);
    // stop lines
    for (const [x0, z] of [[3.0, -31.2], [-3.0, 31.2]] as [number, number][]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.4), new THREE.MeshStandardMaterial({ color: '#efefe8', roughness: 0.6, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); m.rotation.x = -Math.PI / 2; m.position.set(x0, 0.005, z); this.roadGroup.add(m); }
    // sidewalks
    const worm = T.makeTiles('worm'), sq = T.makeTiles('square'), gr = T.makeTiles('granite'), conc = T.makeConcrete('#8f8e8a', 4);
    const sideM = std({ map: rep(conc.map, 40, 1), normalMap: rep(conc.normal, 40, 1), roughness: 0.9 });
    for (const s of [1, -1]) {
      const topM = std({ map: rep(worm.map, 3, L / 2), normalMap: rep(worm.normal, 3, L / 2), roughness: 0.82, envMapIntensity: 0.7 });
      const top2 = std({ map: rep(gr.map, 1, L / 2), normalMap: rep(gr.normal, 1, L / 2), roughness: 0.7 });
      this.sidewalkMats.push(topM, top2); topM.normalScale.set(1.6, 1.6);
      patchWetSurface(topM, this.ctx.refl, T.makePuddleMask(), { ...this.ctx.wetU, puddle: { value: 0.0 } }, 99);
      const sw = box(4.9, 0.16, L, [sideM, sideM, topM, sideM, sideM, sideM], s * 9.35, 0.08, 0, false); sw.receiveShadow = true; this.root.add(sw);
      const sq2 = box(0.7, 0.01, L, top2, s * 11.95, 0.165, 0, false); this.root.add(sq2);
      const strip = box(0.5, 0.01, L, top2, s * 6.65, 0.165, 0, false); this.root.add(strip); void sq;
      // curb
      const cm = std({ map: rep(conc.map, 1, L / 2), normalMap: rep(conc.normal, 1, L / 2), roughness: 0.85, color: '#c4c2bc' });
      const c = box(0.22, 0.2, L, cm, s * 6.32, 0.1, 0, false); this.root.add(c);
      // painted curb stripes (white/dark) and the bus-stop yellow zone
      const pm = std({ color: '#d9d9d2', roughness: 0.7 }); const pm2 = std({ color: '#1d1d1d', roughness: 0.7 });
      for (let z = -L / 2; z < L / 2; z += 1.6) if (Math.abs(z - 4) > 14 || s < 0) { const seg = box(0.225, 0.2, 0.8, (Math.floor(z / 1.6) % 2) ? pm : pm2, s * 6.32, 0.1, z + 0.4, false); seg.scale.x = 1.005; this.root.add(seg); }
      if (s > 0) this.root.add(box(0.23, 0.205, 24, std({ color: '#f2c200', roughness: 0.6 }), 6.32, 0.1, 3.8, false));
      // gutter drain grates + manholes
      for (let z = -130; z <= 130; z += 26) { const gt = box(0.55, 0.03, 1.1, std({ color: '#222', roughness: 0.45, metalness: 0.7 }), s * 6.0, 0.012, z + s * 8, false); this.root.add(gt); for (let k = 0; k < 6; k++) this.root.add(box(0.5, 0.012, 0.04, std({ color: '#555', metalness: 0.8, roughness: 0.4 }), s * 6.0, 0.03, z + s * 8 - 0.44 + k * 0.176, false)); }
    }
    for (const [x, z] of [[2.0, -10], [-2.2, 14], [4.5, 30], [-4.4, -22], [1.8, 50], [-1.7, -60]]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.02, 24), std({ color: '#3e3f42', roughness: 0.45, metalness: 0.75 })); m.position.set(x, 0.01, z); m.receiveShadow = true; this.roadGroup.add(m); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.015, 6, 24), std({ color: '#2a2a2a' })); ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.012, z); this.roadGroup.add(ring); }
    // litter & fallen leaves near the curb
    const lit = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshStandardMaterial({ map: T.makeLitter(), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 120);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < 120; i++) { const s = r2() < 0.5 ? 1 : -1; const onRoad = r2() < 0.6; const x = onRoad ? s * (5.7 + r2() * 0.55) : s * (6.6 + r2() * 5); e.set(-Math.PI / 2, 0, r2() * 6.28); q.setFromEuler(e); m4.compose(new THREE.Vector3(x, onRoad ? 0.007 : 0.17, (r2() - 0.5) * 120), q, new THREE.Vector3(1 + r2(), 1 + r2(), 1)); lit.setMatrixAt(i, m4); }
    lit.receiveShadow = true; this.root.add(lit);
  }

  buildMedian() {
    const L = 300; const conc = T.makeConcrete('#8d8c88', 6);
    this.root.add(box(0.5, 0.3, L, std({ map: rep(conc.map, 1, L / 2), normalMap: rep(conc.normal, 1, L / 2), roughness: 0.9 }), 0, 0.15, 0, false));
    const black = std({ color: '#1a1b1d', roughness: 0.45, metalness: 0.75, envMapIntensity: 1.2 }); const gold = std({ color: '#d6a512', roughness: 0.5, metalness: 0.5 });
    for (const y of [0.42, 0.78, 1.18]) this.root.add(box(0.045, 0.045, L, black, 0, y, 0, true, false));
    const n = Math.floor(L / 0.12); const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.84, 0.02), black, n); const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { m4.makeTranslation(0, 0.78, -L / 2 + i * 0.12); bars.setMatrixAt(i, m4); } bars.castShadow = true; this.root.add(bars);
    const np = Math.floor(L / 2.4); const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), black, np), caps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.095, 0.16, 0.095), gold, np), bands = new THREE.InstancedMesh(new THREE.BoxGeometry(0.095, 0.09, 0.095), gold, np);
    for (let i = 0; i < np; i++) { const z = -L / 2 + i * 2.4; m4.makeTranslation(0, 0.8, z); posts.setMatrixAt(i, m4); m4.makeTranslation(0, 1.28, z); caps.setMatrixAt(i, m4); m4.makeTranslation(0, 0.55, z); bands.setMatrixAt(i, m4); }
    for (const m of [posts, caps, bands]) { m.castShadow = true; this.root.add(m); }
    this.rects.push({ minX: -0.2, maxX: 0.2, minZ: -999, maxZ: 999 });
  }

  /* ---------------- trees ---------------- */
  buildTrees(r: () => number) {
    const eastZ = [-62, -50, -38, -26, -14.5, 9, 20, 31, 42, 54, 66], westZ = [-58, -46, -34, -22, -10, 1, 12, 23, 34, 46, 58, 70];
    const pts: { x: number; z: number; s: number }[] = [];
    eastZ.forEach((z) => pts.push({ x: 7.25, z: z + (r() - 0.5) * 1.2, s: 0.9 + r() * 0.35 })); westZ.forEach((z) => pts.push({ x: -7.25, z: z + (r() - 0.5) * 1.2, s: 0.9 + r() * 0.35 }));
    const bark = T.makeBark(); const barkM = std({ map: rep(bark.map, 1, 3), normalMap: rep(bark.normal, 1, 3), roughness: 0.95 });
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.34, 5.6, 10, 3), barkM, pts.length); const branchG = new THREE.CylinderGeometry(0.07, 0.14, 3.2, 6).translate(0, 1.6, 0);
    const branches = new THREE.InstancedMesh(branchG, barkM, pts.length * 4); const roots = new THREE.InstancedMesh(new THREE.ConeGeometry(0.14, 1.1, 5).translate(0, 0.55, 0), barkM, pts.length * 5); const pits = new THREE.InstancedMesh(new THREE.CircleGeometry(0.62, 16), std({ color: '#3a2f25', roughness: 1 }), pts.length);
    const NC = 78; const cards = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.9, 1.9), this.leafMat = std({ map: T.makeLeaves(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.62, metalness: 0, color: '#ffffff' }), pts.length * NC);
    addSSS(this.leafMat, '#9bd13a', 1.35, 0.8);
    const tn = new Float32Array(pts.length * NC * 3); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    const timeU = this.timeU;
    this.leafMat.onBeforeCompile = ((prev) => (sh: any, rr: any) => {
      sh.uniforms.uTime = timeU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aTN; uniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x*0.37 + instanceMatrix[3].z*0.61;
          float gust = sin(uTime*0.9 + ph) + 0.5*sin(uTime*2.3 + ph*2.1);
          transformed.x += (sin(uTime*2.6 + ph + position.y*2.0) * 0.07 + gust*0.05) * (0.4+uv.y);
          transformed.y += cos(uTime*3.1 + ph*1.3) * 0.04 * (0.4+uv.y);
          #endif`)
        .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\ntransformedNormal = normalize(normalMatrix * aTN);');
      (prev as any)?.(sh, rr);
    })(this.leafMat.onBeforeCompile);
    pts.forEach((p, i) => {
      const s = p.s; m4.compose(new THREE.Vector3(p.x, 0.16 + 2.8 * s, p.z), q.identity(), new THREE.Vector3(s, s, s)); trunks.setMatrixAt(i, m4);
      m4.makeRotationX(-Math.PI / 2).setPosition(p.x, 0.168, p.z); pits.setMatrixAt(i, m4);
      const toRoad = p.x > 0 ? -1 : 1; const cc: THREE.Vector3[] = [];
      for (let b = 0; b < 4; b++) { const ang = (b / 4) * 6.28 + r(); const tilt = 0.55 + r() * 0.4; e.set(Math.sin(ang) * tilt, 0, Math.cos(ang) * tilt + toRoad * 0.25); const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.cos(ang) * tilt, 0, -Math.sin(ang) * tilt + toRoad * 0.35)); m4.compose(new THREE.Vector3(p.x, 0.16 + 4.2 * s, p.z), rot, new THREE.Vector3(s, s * (0.9 + r() * 0.5), s)); branches.setMatrixAt(i * 4 + b, m4); }
      for (let k = 0; k < 5; k++) { const a = k * 1.256 + r(); m4.compose(new THREE.Vector3(p.x + Math.cos(a) * 0.28 * s, 0.16, p.z + Math.sin(a) * 0.28 * s), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25)), new THREE.Vector3(1, 0.7 + r() * 0.6, 1)); roots.setMatrixAt(i * 5 + k, m4); }
      for (let b = 0; b < 4; b++) { const a = b * 1.57 + 0.4; cc.push(new THREE.Vector3(p.x + toRoad * 0.9 + Math.cos(a) * 2.0 * s, 0.16 + (6.6 + (b % 2) * 1.2 + r()) * s, p.z + Math.sin(a) * 2.2 * s)); }
      cc.push(new THREE.Vector3(p.x + toRoad * 1.6, 0.16 + 8.0 * s, p.z)); this.anchors.push(new THREE.Vector3(p.x + toRoad * 1.2, 0.16 + 8.2 * s, p.z));
      for (let k = 0; k < NC; k++) {
        const c = cc[k % cc.length]; const rad = 2.0 * s; const d = new THREE.Vector3(r() - 0.5, (r() - 0.5) * 0.8, r() - 0.5).normalize().multiplyScalar(rad * Math.cbrt(r()) * (1 + (k % 5) * 0.05));
        const pos = c.clone().add(d); e.set(r() * 3.14, r() * 6.28, r() * 3.14); q.setFromEuler(e); const sc = (0.8 + r() * 0.8) * s; m4.compose(pos, q, new THREE.Vector3(sc, sc, sc)); cards.setMatrixAt(i * NC + k, m4);
        const n = d.clone().normalize(); n.y = n.y * 0.6 + 0.55; n.normalize(); tn.set([n.x, n.y, n.z], (i * NC + k) * 3);
        col.setHSL(0.24 + r() * 0.06, 0.48 + r() * 0.2, 0.2 + r() * 0.12); cards.setColorAt(i * NC + k, col);
      }
      this.circles.push({ x: p.x, z: p.z, r: 0.4 });
    });
    cards.geometry.setAttribute('aTN', new THREE.InstancedBufferAttribute(tn, 3));
    cards.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.leafMat.map, alphaTest: 0.5 });
    cards.castShadow = true; cards.receiveShadow = true; cards.frustumCulled = false; for (const m of [trunks, branches, roots]) { m.castShadow = true; m.receiveShadow = true; }
    this.root.add(trunks, branches, roots, pits, cards);
  }

  /* ---------------- street lamps ---------------- */
  buildLamps() {
    const pole = new THREE.CylinderGeometry(0.055, 0.1, 8.8, 10).translate(0, 4.4, 0);
    const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(0, 8.7, 0), new THREE.Vector3(0, 9.9, 0), new THREE.Vector3(-1.2, 10.0, 0), new THREE.Vector3(-3.1, 9.4, 0));
    const arm = new THREE.TubeGeometry(curve, 16, 0.045, 7);
    const head = new THREE.BoxGeometry(1.0, 0.1, 0.38).translate(-3.35, 9.38, 0); const hood = new THREE.BoxGeometry(1.06, 0.12, 0.42).translate(-3.35, 9.46, 0); const base = new THREE.CylinderGeometry(0.16, 0.2, 0.7, 10).translate(0, 0.35, 0);
    const steel = mergeGeometries([pole, arm, hood, base]); const lampG = head;
    const sm = std({ color: '#5a6168', roughness: 0.5, metalness: 0.8, envMapIntensity: 1.1 }); this.lampMat = std({ color: '#fff', emissive: '#ffe6b0', emissiveIntensity: 0.15, roughness: 0.3 });
    const list: [number, number][] = []; [-66, -44, -22, -6, 15, 37, 59, 81].forEach((z) => list.push([7.05, z])); [-72, -50, -28, -16, 6, 28, 50, 72].forEach((z) => list.push([-7.05, z]));
    const im = new THREE.InstancedMesh(steel, sm, list.length), il = new THREE.InstancedMesh(lampG, this.lampMat, list.length); const m4 = new THREE.Matrix4(); const poolTex = T.makeGlow('rgba(255,215,150,0.9)', 'rgba(255,215,150,0)', 128); const gtex = T.makeGlow('rgba(255,225,170,1)', 'rgba(255,225,170,0)', 64);
    list.forEach(([x, z], i) => {
      m4.makeRotationY(x > 0 ? 0 : Math.PI).setPosition(x, 0.16, z); im.setMatrixAt(i, m4); il.setMatrixAt(i, m4);
      const hx = x + (x > 0 ? -3.35 : 3.35), hz = z;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); sp.scale.setScalar(3.2); sp.position.set(hx, 9.2, hz); this.root.add(sp); this.glowSprites.push(sp);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 })); pool.rotation.x = -Math.PI / 2; pool.position.set(hx, 0.008, hz); this.root.add(pool); this.pools.push(pool);
      this.circles.push({ x, z, r: 0.18 });
      if ((x > 0 && (z === -6 || z === 15)) || (x < 0 && (z === 6 || z === -16))) { const pl = new THREE.PointLight('#ffd9a0', 0, 22, 2); pl.position.set(hx, 9.0, hz); this.root.add(pl); this.lampLights.push(pl); }
    });
    im.castShadow = true; this.root.add(im, il);
    // traffic signals
    for (const [x, z, dir] of [[6.9, -32.5, 1], [-6.9, 32.5, -1]] as [number, number, number][]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.8, 10), sm); p.position.set(x, 3.05, z); p.castShadow = true; this.root.add(p);
      const armG = box(4.4, 0.1, 0.1, sm, x - dir * 2.2, 5.6, z); this.root.add(armG);
      const lamps = { r: std({ color: '#300', emissive: '#ff1a1a', emissiveIntensity: 0 }), y: std({ color: '#320', emissive: '#ffb000', emissiveIntensity: 0 }), g: std({ color: '#031', emissive: '#10ff60', emissiveIntensity: 0 }) };
      this.signalLamps.push(lamps);
      for (const hx of [x - dir * 1.4, x - dir * 3.6]) { this.root.add(box(0.36, 1.05, 0.3, std({ color: '#151515', roughness: 0.5 }), hx, 5.0, z)); [['r', 5.3], ['y', 5.0], ['g', 4.7]].forEach(([k, y]) => { const l = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), (lamps as any)[k as string]); l.position.set(hx, y as number, z + (dir > 0 ? 0.16 : -0.16) * 1); l.rotation.y = dir > 0 ? 0 : Math.PI; this.root.add(l); }); }
      this.circles.push({ x, z, r: 0.12 });
    }
  }

  /* ---------------- utility poles & cables ---------------- */
  buildPoles(r: () => number) {
    const conc = T.makeConcrete('#a5a39c', 9); const pm = std({ map: rep(conc.map, 1, 6), normalMap: rep(conc.normal, 1, 6), roughness: 0.9 });
    const dark = std({ color: '#222', roughness: 0.6, metalness: 0.5 }); const steel = std({ color: '#4d5257', roughness: 0.6, metalness: 0.8 }); const ins = std({ color: '#7a5a3a', roughness: 0.3 });
    const flyers = (() => { const [c, x] = T.canvas(128, 128); x.fillStyle = '#e9e5d0'; x.fillRect(0, 0, 128, 128); [['#e11d48', 6, 6], ['#2563eb', 66, 8], ['#f59e0b', 10, 70], ['#16a34a', 70, 66]].forEach(([col, px, py]) => { x.fillStyle = col as string; x.fillRect(px as number, py as number, 52, 52); x.fillStyle = '#fff'; x.fillRect((px as number) + 6, (py as number) + 12, 40, 5); x.fillRect((px as number) + 6, (py as number) + 24, 30, 4); }); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const spans: [number, number][] = []; const zs = [-84, -60, -36, -12, 12, 36, 60, 84];
    const curves: { c: THREE.QuadraticBezierCurve3; rad: number }[] = []; const swayAttr: number[] = [];
    for (const s of [1, -1]) {
      const x = s * 11.7; const toRoad = -s;
      zs.forEach((z0, i) => {
        const z = z0 + s * 3 + (s < 0 ? 6 : 0);
        const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 9.6, 8), pm); pl.position.set(x, 4.8 + 0.16, z); pl.castShadow = true; this.root.add(pl);
        for (const [y, w] of [[8.9, 1.9], [8.2, 1.5]]) { const a = box(0.07, 0.08, w, steel, x, y, z); a.rotation.y = Math.PI / 2; this.root.add(a); for (const k of [-0.7, -0.25, 0.25, 0.7]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.14, 6), ins); c.position.set(x + k * toRoad, (y as number) + 0.1, z); this.root.add(c); } }
        const meter = box(0.34, 0.46, 0.16, std({ color: '#d7d6d0', roughness: 0.5 }), x + toRoad * 0.22, 2.0, z); this.root.add(meter); this.root.add(box(0.2, 0.12, 0.02, dark, x + toRoad * 0.31, 2.1, z));
        for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), std({ map: flyers, roughness: 0.8 })); f.position.set(x + toRoad * 0.215, 1.2 + k * 0.33 + (r() - 0.5) * 0.1, z + (r() - 0.5) * 0.12); f.rotation.y = toRoad > 0 ? Math.PI / 2 : -Math.PI / 2; f.rotation.z = (r() - 0.5) * 0.3; this.root.add(f); }
        if (i % 2 === 0) { for (const dz of [-0.45, 0.45]) { const tf = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.85, 12), std({ color: '#6c7176', roughness: 0.45, metalness: 0.7 })); tf.position.set(x + toRoad * 0.5, 7.3, z + dz); tf.castShadow = true; this.root.add(tf); } }
        // telecom cable coils
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 20), dark); coil.position.set(x + toRoad * 0.35, 6.4, z + 0.5); coil.rotation.y = Math.PI / 2; coil.castShadow = true; this.root.add(coil);
        this.circles.push({ x, z, r: 0.25 });
        if (i < zs.length - 1) spans.push([s, z]);
      });
    }
    // along-street cables
    const addCable = (a: THREE.Vector3, b: THREE.Vector3, sag: number, rad: number) => { const mid = a.clone().lerp(b, 0.5); mid.y -= sag; curves.push({ c: new THREE.QuadraticBezierCurve3(a, mid, b), rad }); };
    for (const s of [1, -1]) {
      const zlist = zs.map((z0) => z0 + s * 3 + (s < 0 ? 6 : 0)); const x = s * 11.7; const toRoad = -s;
      for (let i = 0; i < zlist.length - 1; i++) {
        for (const k of [-0.7, -0.25, 0.25, 0.7]) for (const y of [9.0, 8.3]) addCable(new THREE.Vector3(x + k * toRoad, y + 0.1, zlist[i]), new THREE.Vector3(x + k * toRoad, y + 0.1, zlist[i + 1]), 0.5 + r() * 0.35, 0.011);
        for (let k = 0; k < 3; k++) addCable(new THREE.Vector3(x + toRoad * (0.2 + k * 0.1), 6.5 - k * 0.15, zlist[i]), new THREE.Vector3(x + toRoad * (0.2 + k * 0.1), 6.5 - k * 0.15, zlist[i + 1]), 0.9 + r() * 0.4, 0.03);
      }
    }
    // cross-street cables (from pole to pole on the opposite side)
    for (const z of [-36, 12, 60]) for (let k = 0; k < 6; k++) { const ze = z + 3, zw = z + 3 + 6 - 0; addCable(new THREE.Vector3(11.3, 9.0 - k * 0.12, ze), new THREE.Vector3(-11.3, 9.0 - k * 0.12, zw), 0.9 + r() * 0.4, 0.012); }
    // build merged tube geometry with sway weight
    const geos: THREE.BufferGeometry[] = [];
    for (const { c, rad } of curves) { const g = new THREE.TubeGeometry(c, 18, rad, 4); const n = g.attributes.position.count; const sw = new Float32Array(n); const ring = 5; for (let i = 0; i < n; i++) { const seg = Math.floor(i / ring); const t = seg / 18; sw[i] = 4 * t * (1 - t); } g.setAttribute('aSw', new THREE.BufferAttribute(sw, 1)); g.deleteAttribute('uv'); geos.push(g); }
    const merged = mergeGeometries(geos)!; const wm = std({ color: '#0d0d0e', roughness: 0.55, metalness: 0.2 }); const tu = this.timeU;
    wm.onBeforeCompile = (sh) => { sh.uniforms.uTime = tu; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSw; uniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(uTime*1.4 + position.z*0.35)*0.05*aSw; transformed.y += sin(uTime*1.9 + position.z*0.2 + position.x)*0.025*aSw;'); };
    const wires = new THREE.Mesh(merged, wm); wires.castShadow = true; wires.frustumCulled = false; this.root.add(wires); this.wires = wires; void spans; void swayAttr;
  }

  /* ---------------- shophouses ---------------- */
  buildBuildings(r: () => number) {
    const walls = ['#e2c76e', '#ebe7da', '#d7cfb6', '#b0cba8', '#dcaa9f', '#a8bfcc', '#c98b66', '#dbb04e', '#f0ece2'];
    const sets: { floors: number; m: THREE.MeshStandardMaterial }[] = [];
    const FM = (floors: number, wall: string, style: number, seed: number) => { const f = T.makeFacade(floors, wall, style, seed); const m = std({ map: f.map, normalMap: f.normal, roughnessMap: f.rough, roughness: 1, emissiveMap: f.emissive, emissive: '#ffffff', emissiveIntensity: 0.1, envMapIntensity: 0.9 }); m.normalScale.set(1.2, 1.2); this.facadeMats.push(m); sets.push({ floors, m }); };
    let sd = 1; for (const fl of [3, 4, 5]) for (let k = 0; k < 4; k++) FM(fl, walls[(sd * 3) % walls.length], sd++, 100 + sd * 17);
    const side = walls.map((c, i) => { const p = T.makePlaster(c, 40 + i); const m = std({ map: rep(p.map, 3, 2), normalMap: rep(p.normal, 3, 2), roughness: 0.92 }); return m; });
    const cap = std({ color: '#7d7a73', roughness: 0.95 }); const tinM = (() => { const c = T.makeCorrugated(); return std({ map: rep(c.map, 4, 2), normalMap: rep(c.normal, 4, 2), roughness: 0.55, metalness: 0.6, color: '#b8bcc0' }); })();
    const signTex = T.SIGN_NAMES.map(([t, bg, fg]) => T.makeSign(t, bg, fg)); const vsign = T.SIGN_NAMES.slice(0, 6).map(([t, bg, fg]) => T.makeSign(t.replace('\n', ' '), bg, fg, 512, 128, true));
    const awnTex = (() => { const [c, x] = T.canvas(256, 64); const cols = [['#1d7a3a', '#f4f4ee'], ['#c62828', '#f4f4ee'], ['#1e5aa8', '#f4f4ee']]; x.fillStyle = '#f4f4ee'; x.fillRect(0, 0, 256, 64); for (let i = 0; i < 16; i += 2) { x.fillStyle = cols[0][0]; x.fillRect(i * 16, 0, 16, 64); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return [t, (() => { const [c2, x2] = T.canvas(256, 64); x2.fillStyle = '#f4f4ee'; x2.fillRect(0, 0, 256, 64); for (let i = 0; i < 16; i += 2) { x2.fillStyle = '#c62828'; x2.fillRect(i * 16, 0, 16, 64); } const t2 = new THREE.CanvasTexture(c2); t2.colorSpace = THREE.SRGBColorSpace; return t2; })(), (() => { const [c3, x3] = T.canvas(256, 64); x3.fillStyle = '#f4f4ee'; x3.fillRect(0, 0, 256, 64); for (let i = 0; i < 12; i += 2) { x3.fillStyle = ['#1e5aa8', '#c62828', '#1d7a3a'][(i / 2) % 3]; x3.fillRect(i * 21.3, 0, 21.3, 64); } const t3 = new THREE.CanvasTexture(c3); t3.colorSpace = THREE.SRGBColorSpace; return t3; })()]; })();
    const acG = new THREE.BoxGeometry(0.28, 0.5, 0.8), acM = std({ color: '#e6e8ea', roughness: 0.55 }); const maxAC = 120; const ac = new THREE.InstancedMesh(acG, acM, maxAC);
    const fanG = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 3).rotateZ(Math.PI / 2); this.fanMesh = new THREE.InstancedMesh(fanG, std({ color: '#222', roughness: 0.5 }), maxAC); let nAC = 0;
    const tankG = new THREE.CylinderGeometry(0.55, 0.55, 1.4, 14), tankM = std({ color: '#2a63b8', roughness: 0.45 }); const tanks = new THREE.InstancedMesh(tankG, tankM, 60); let nT = 0;
    const potG = new THREE.CylinderGeometry(0.16, 0.12, 0.22, 8), plantG = new THREE.IcosahedronGeometry(0.22, 1); const pots = new THREE.InstancedMesh(potG, std({ color: '#a8532f', roughness: 0.8 }), 120), plants = new THREE.InstancedMesh(plantG, std({ color: '#2f6b2a', roughness: 0.7 }), 120); let nP = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    const frontX = 12.55; const bg = std({ color: '#cfc9bb', roughness: 0.95 });
    for (const s of [1, -1]) {
      let z = -150; let idx = 0;
      while (z < 150) {
        const w = 4.4 + r() * 2.4; const zc = z + w / 2; z += w + (r() < 0.2 ? 0 : 0);
        const near = Math.abs(zc) < 64; const si = Math.floor(r() * sets.length); const set = sets[si]; const f = set.floors; const Hb = 4.3 + 3.3 * f + 0.6 + (r() < 0.3 ? 1 : 0);
        const wallM = side[Math.floor(r() * side.length)]; const mats = s > 0 ? [wallM, set.m, cap, wallM, wallM, wallM] : [set.m, wallM, cap, wallM, wallM, wallM];
        const depth = 14 + r() * 4; const body = box(depth, Hb, w - 0.04, mats as any, s * (frontX + depth / 2), Hb / 2, zc, true, true); this.root.add(body); idx++;
        // stand-in collider
        this.rects.push({ minX: s > 0 ? frontX - 0.05 : -999, maxX: s > 0 ? 999 : -frontX + 0.05, minZ: zc - w / 2, maxZ: zc + w / 2 });
        // roof clutter
        if (r() < 0.6 && nT < 60) { m4.compose(new THREE.Vector3(s * (frontX + 6 + r() * 4), Hb + 0.7, zc + (r() - 0.5) * 2), q.identity(), one); tanks.setMatrixAt(nT++, m4); }
        const roofShed = box(5 + r() * 3, 0.06, w - 0.8, tinM, s * (frontX + 5), Hb + 1.3, zc, true, false); roofShed.rotation.z = (r() - 0.5) * 0.2; if (r() < 0.45) this.root.add(roofShed);
        if (!near) continue;
        const sgn = -s; // outward direction toward road
        const fx = s * frontX;
        // shop sign board
        const k = Math.floor(r() * signTex.length); const sm = std({ map: signTex[k], emissiveMap: signTex[k], emissive: '#ffffff', emissiveIntensity: 0.15, roughness: 0.5 }); this.signMats.push(sm);
        const sw = w - 0.7; const sb = new THREE.Mesh(new THREE.PlaneGeometry(sw, 0.95), sm); sb.position.set(fx + sgn * 0.3, 4.65, zc); sb.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; this.root.add(sb);
        this.root.add(box(0.14, 1.02, sw + 0.06, std({ color: '#222', roughness: 0.6, metalness: 0.4 }), fx + sgn * 0.2, 4.65, zc, false));
        // blade sign
        if (r() < 0.5) { const vm = std({ map: vsign[Math.floor(r() * vsign.length)], emissive: '#fff', emissiveIntensity: 0.1, roughness: 0.5 }); vm.emissiveMap = vm.map; this.signMats.push(vm); const bl = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.2), vm); bl.position.set(fx + sgn * 0.9, 6.2, zc + (r() < 0.5 ? 1 : -1) * (w / 2 - 0.5)); bl.rotation.y = 0; this.root.add(bl); const bl2 = bl.clone(); bl2.rotation.y = Math.PI; bl2.position.x += 0.01; this.root.add(bl2); }
        // awning (striped bạt) with sway
        if (r() < 0.55) { const am = std({ map: awnTex[Math.floor(r() * 3)], roughness: 0.85, side: THREE.DoubleSide }); const aw = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.5, 1.5, 1, 1), am); aw.position.set(fx + sgn * 0.8, 3.15, zc); aw.rotation.set(0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0); aw.rotateX(-0.55 * (s > 0 ? 1 : -1) * -1); aw.userData.base = aw.rotation.x; aw.castShadow = true; aw.receiveShadow = true; this.root.add(aw); this.awnings.push(aw); }
        // balcony slabs, AC units, plants
        for (let fl = 1; fl <= f; fl++) {
          const y = 4.3 + (fl - 1) * 3.3; if (r() < 0.6) { this.root.add(box(0.9, 0.12, w - 0.5, cap, fx + sgn * 0.45, y + 0.05, zc, true, true)); }
          if (r() < 0.55 && nAC < maxAC) { const pos = new THREE.Vector3(fx + sgn * 0.22, y + 1.0 + r() * 0.3, zc + (r() - 0.5) * (w - 1.5)); m4.compose(pos, q.identity(), one); ac.setMatrixAt(nAC, m4); this.fans.push({ pos: pos.clone().add(new THREE.Vector3(sgn * 0.14, 0, 0)), ph: r() * 6 }); nAC++; }
          if (r() < 0.5 && nP < 118) { for (let k = 0; k < 3; k++) { const pz = zc + (k - 1) * 0.8; m4.compose(new THREE.Vector3(fx + sgn * 0.7, y + 0.25, pz), q.identity(), one); pots.setMatrixAt(nP, m4); m4.compose(new THREE.Vector3(fx + sgn * 0.7, y + 0.5, pz), q.identity(), new THREE.Vector3(1, 1.1, 1)); plants.setMatrixAt(nP++, m4); } }
        }
        void bg;
      }
    }
    ac.count = nAC; this.fanMesh.count = nAC; tanks.count = nT; pots.count = nP; plants.count = nP; ac.castShadow = true; tanks.castShadow = true; plants.castShadow = true;
    this.root.add(ac, this.fanMesh, tanks, pots, plants);
    // background towers for skyline depth
    const tw = std({ map: this.facadeMats[8].map!, normalMap: this.facadeMats[8].normalMap!, emissiveMap: this.facadeMats[8].emissiveMap!, emissive: '#fff', emissiveIntensity: 0.1, roughness: 0.8 }); this.facadeMats.push(tw);
    for (const s of [1, -1]) for (let i = 0; i < 12; i++) { const h = 22 + r() * 40; const w = 10 + r() * 8; const t = box(14, h, w, [wallSide(side, r), wallSide(side, r), cap, cap, wallSide(side, r), wallSide(side, r)] as any, s * (40 + r() * 8), h / 2, -150 + i * 26 + r() * 6); (t.material as THREE.Material[])[s > 0 ? 1 : 0] = tw; this.root.add(t); }
    // end walls to close the street canyon
    for (const z of [-165, 165]) this.root.add(box(80, 36, 10, [side[0], side[0], cap, cap, side[3], side[3]] as any, 0, 18, z));
  }

  /* ---------------- bus shelter ---------------- */
  buildShelter() {
    const g = new THREE.Group(); this.root.add(g); const cx = 8.8;
    const steel = std({ color: '#2a3945', roughness: 0.42, metalness: 0.7, envMapIntensity: 1.1 }); const inox = std({ color: '#d4d8dc', roughness: 0.25, metalness: 1, envMapIntensity: 1.5 });
    const rust = std({ color: '#8a4b25', roughness: 0.9, metalness: 0.4 }); const poly = new THREE.MeshPhysicalMaterial({ color: '#9fc8d6', roughness: 0.22, metalness: 0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, clearcoat: 0.6, envMapIntensity: 1.4, depthWrite: false });
    // curved roof (arch across X, extruded along Z)
    const R = 2.6, th0 = Math.PI / 2 - 0.62, thL = 1.24; const roofG = new THREE.CylinderGeometry(R, R, 6.6, 28, 1, true, th0, thL); roofG.rotateX(Math.PI / 2); roofG.rotateZ(0); const roof = new THREE.Mesh(roofG, poly); roof.rotation.y = 0; roof.position.set(cx + 0.0, 2.62 - R * Math.cos(0.62), 0);
    // cylinder around Z after rotateX: arc spans around Z axis, theta measured from +Z... re-orient so arc crests upward
    roof.rotation.z = Math.PI / 2 * 0; g.add(roof); roof.userData.roof = true; roof.renderOrder = 3;
    const ribs: THREE.Mesh[] = [];
    for (const z of [-3.3, -1.65, 0, 1.65, 3.3]) { const pts: THREE.Vector3[] = []; for (let i = 0; i <= 16; i++) { const a = th0 + (i / 16) * thL; pts.push(new THREE.Vector3(Math.cos(a) * R, 0, 0)); void a; } void pts; const arcCurve = new THREE.CatmullRomCurve3(Array.from({ length: 17 }, (_, i) => { const a = -0.62 + (i / 16) * 1.24; return new THREE.Vector3(cx + Math.sin(a) * R, 2.62 - R * Math.cos(0.62) + R * Math.cos(a), z); })); const rib = new THREE.Mesh(new THREE.TubeGeometry(arcCurve, 24, 0.035, 6), steel); rib.castShadow = true; g.add(rib); ribs.push(rib); }
    // fix roof orientation: build roof directly from arc curve surface instead of cylinder
    g.remove(roof); const rs = new THREE.BufferGeometry(); const seg = 24, zs = 2; const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= zs; j++) for (let i = 0; i <= seg; i++) { const a = -0.62 + (i / seg) * 1.24; pos.push(cx + Math.sin(a) * R, 2.62 - R * Math.cos(0.62) + R * Math.cos(a), -3.45 + j * 6.9 / zs); uv.push(i / seg, j / zs); }
    for (let j = 0; j < zs; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    rs.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rs.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rs.setIndex(idx); rs.computeVertexNormals();
    const roofM = new THREE.Mesh(rs, poly); roofM.castShadow = true; roofM.receiveShadow = true; roofM.renderOrder = 3; g.add(roofM);
    // posts, base plates with rust + bolts
    for (const [px, pz, h] of [[cx - 1.45, -3.3, 2.38], [cx - 1.45, 0, 2.38], [cx - 1.45, 3.3, 2.38], [cx + 1.5, -3.3, 2.38], [cx + 1.5, 0, 2.38], [cx + 1.5, 3.3, 2.38]]) {
      g.add(box(0.1, h, 0.1, steel, px, 0.16 + h / 2, pz)); const bp = box(0.26, 0.025, 0.26, rust, px, 0.17, pz); g.add(bp); for (const [bx, bz] of [[-0.09, -0.09], [0.09, -0.09], [-0.09, 0.09], [0.09, 0.09]]) { const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 6), rust); bolt.position.set(px + bx, 0.19, pz + bz); g.add(bolt); }
      const stain = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.7), new THREE.MeshBasicMaterial({ color: '#7a3d1a', transparent: true, opacity: 0.35, depthWrite: false })); stain.position.set(px - 0.051, 0.55, pz); stain.rotation.y = -Math.PI / 2; g.add(stain);
    }
    // back lightboxes (ad, route map, ad) + end panel
    const lb = (tex: THREE.Texture, w: number, z: number, x: number, ry: number, id: number) => { const m = std({ map: tex, emissiveMap: tex, emissive: '#fff', emissiveIntensity: 0.5, roughness: 0.4 }); this.lightboxMats.push(m); const frame = box(0.16, 1.95, w, steel, x, 1.28, z); g.add(frame); const face = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, 1.82), m); face.position.set(x - 0.085, 1.28, z); face.rotation.y = -Math.PI / 2; g.add(face); const face2 = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, 1.82), std({ color: '#cfd6da', roughness: 0.4, emissive: '#e8f0ff', emissiveIntensity: 0.3 })); face2.position.set(x + 0.085, 1.28, z); face2.rotation.y = Math.PI / 2; g.add(face2); const gl = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, 1.82), new THREE.MeshPhysicalMaterial({ color: '#fff', roughness: 0.03, transparent: true, opacity: 0.12, clearcoat: 1, depthWrite: false, envMapIntensity: 2 })); gl.position.set(x - 0.095, 1.28, z); gl.rotation.y = -Math.PI / 2; g.add(gl); void ry; void id; };
    lb(T.makeAdPanel(0), 1.9, -2.2, cx + 1.45, 0, 0); lb(T.makeBusRoutePanel(), 1.4, -0.0, cx + 1.45, 0, 1); lb(T.makeAdPanel(1), 1.9, 2.2, cx + 1.45, 0, 2);
    // end panel facing +Z at z=3.3 (route info board)
    { const m = std({ map: T.makeAdPanel(2), emissiveMap: T.makeAdPanel(2), emissive: '#fff', emissiveIntensity: 0.5 }); this.lightboxMats.push(m); const f = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.82), m); f.position.set(cx + 0.35, 1.28, 3.37); g.add(f); g.add(box(1.5, 1.95, 0.08, steel, cx + 0.35, 1.28, 3.42)); }
    // stainless bench
    for (let i = 0; i < 6; i++) g.add(box(0.07, 0.03, 2.9, inox, cx + 0.88 + i * 0.075 - 0.2, 0.55, -0.35));
    for (let i = 0; i < 4; i++) { const b2 = box(0.03, 0.07, 2.9, inox, cx + 1.3, 0.8 + i * 0.12, -0.35); g.add(b2); }
    for (const z of [-1.6, 0.9]) { g.add(box(0.05, 0.4, 0.05, inox, cx + 0.8, 0.36, z)); g.add(box(0.05, 0.4, 0.05, inox, cx + 1.1, 0.36, z)); g.add(box(0.05, 0.9, 0.05, inox, cx + 1.3, 0.62, z)); }
    for (const z of [-1.1, -0.35, 0.4]) this.benchSeats.push({ pos: new THREE.Vector3(cx + 0.95, 0.5, z), yaw: -Math.PI / 2, taken: false });
    // grab bar / lean rail
    g.add(box(0.05, 1.0, 0.05, inox, cx - 1.1, 0.7, 1.9)); const lean = box(0.05, 0.05, 1.4, inox, cx - 1.1, 1.05, 2.3); g.add(lean);
    // bus stop sign pole (blue/white with bus icon + route numbers)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 3.4, 10), steel); pole.position.set(6.85, 1.86, -2.8); pole.castShadow = true; g.add(pole);
    const stex = T.makeBusStopSign(); for (const ry of [0, Math.PI]) { const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.93), std({ map: stex, roughness: 0.4, metalness: 0.2 })); sg.position.set(6.85, 2.9, -2.8 + (ry ? -0.03 : 0.03)); sg.rotation.y = ry; sg.rotation.y += Math.PI / 2 * 0; g.add(sg); }
    // trash bin
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.8, 14), std({ color: '#1c8c46', roughness: 0.6 })); bin.position.set(cx - 0.4, 0.56, 3.9); bin.castShadow = true; g.add(bin); const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14), std({ color: '#146b34', roughness: 0.5 })); lid.position.set(cx - 0.4, 0.99, 3.9); g.add(lid); this.circles.push({ x: cx - 0.4, z: 3.9, r: 0.35 });
    this.shelterLight.position.set(cx + 0.2, 2.3, 0); g.add(this.shelterLight);
    const strip = box(0.06, 0.03, 5.2, std({ color: '#fff', emissive: '#fff6e0', emissiveIntensity: 0.6 }), cx + 0.8, 2.52, 0, false); g.add(strip); this.lightboxMats.push(strip.material as THREE.MeshStandardMaterial);
    this.rects.push({ minX: cx - 1.55, maxX: cx + 1.6, minZ: -3.45, maxZ: 3.5 });
    this.anchors.push(new THREE.Vector3(cx + 0.5, 2.7, 0.3));
    this.circles.push({ x: 6.85, z: -2.8, r: 0.12 });
  }

  /* ---------------- street life props ---------------- */
  buildProps(r: () => number) {
    // plastic café set (red/blue low tables + stools) in front of a shop at z=-19
    const cols = ['#d62828', '#1e63c4', '#2e9b44', '#d62828']; const stoolTop = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 14), std({ color: '#fff', roughness: 0.5 }), 24); const stoolLeg = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.18, 0.28, 12, 1, true), std({ color: '#fff', roughness: 0.5, side: THREE.DoubleSide }), 24);
    const tabTop = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 18), std({ color: '#fff', roughness: 0.45 }), 8), tabLeg = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.2, 0.44, 12), std({ color: '#fff', roughness: 0.5 }), 8);
    const m4 = new THREE.Matrix4(); let ns = 0, nt = 0; const col = new THREE.Color();
    const cafe = (cx: number, cz: number, n: number) => {
      m4.makeTranslation(cx, 0.165 + 0.43, cz); tabTop.setMatrixAt(nt, m4); tabTop.setColorAt(nt, col.set(cols[nt % 4])); m4.makeTranslation(cx, 0.165 + 0.22, cz); tabLeg.setMatrixAt(nt, m4); tabLeg.setColorAt(nt, col.set(cols[nt % 4])); nt++;
      for (let i = 0; i < n; i++) { const a = (i / n) * 6.28 + 0.5; const sx = cx + Math.cos(a) * 0.62, sz = cz + Math.sin(a) * 0.62; m4.makeTranslation(sx, 0.165 + 0.3, sz); stoolTop.setMatrixAt(ns, m4); stoolTop.setColorAt(ns, col.set(cols[(i + nt) % 4])); m4.makeTranslation(sx, 0.165 + 0.14, sz); stoolLeg.setMatrixAt(ns, m4); stoolLeg.setColorAt(ns, col.set(cols[(i + nt) % 4])); ns++; this.stoolSeats.push({ pos: new THREE.Vector3(sx, 0.165 + 0.3, sz), yaw: Math.atan2(cx - sx, cz - sz), taken: false }); }
      this.circles.push({ x: cx, z: cz, r: 0.95 });
    };
    cafe(10.6, -19.5, 4); cafe(11.2, -22.6, 3); cafe(10.4, -16.0, 3);
    for (const m of [stoolTop, stoolLeg, tabTop, tabLeg]) { m.count = m === stoolTop || m === stoolLeg ? ns : nt; m.castShadow = true; m.receiveShadow = true; this.root.add(m); }
    // banh mi cart with glass cabinet & umbrella at z=16
    const cart = new THREE.Group(); cart.position.set(10.9, 0.165, 16); this.root.add(cart);
    const wood = std({ color: '#9a6a3a', roughness: 0.7 }); const gl = new THREE.MeshPhysicalMaterial({ color: '#cfe8f0', roughness: 0.05, transparent: true, opacity: 0.2, depthWrite: false, clearcoat: 1 });
    cart.add(box(1.5, 0.9, 0.8, wood, 0, 0.55, 0)); cart.add(box(1.5, 0.7, 0.8, gl, 0, 1.35, 0, false)); for (const [x, z] of [[-0.74, -0.39], [0.74, -0.39], [-0.74, 0.39], [0.74, 0.39]]) cart.add(box(0.03, 0.7, 0.03, std({ color: '#b8bcc0', metalness: 1, roughness: 0.3 }), x, 1.35, z));
    for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.22, 4, 8), std({ color: '#d9a85c', roughness: 0.8 })); b.rotation.z = Math.PI / 2; b.position.set(-0.55 + (i % 6) * 0.22, 1.1 + Math.floor(i / 6) * 0.3, 0); cart.add(b); }
    const sgn = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.4), std({ map: T.makeSign('BÁNH MÌ NÓNG GIÒN', '#facc15', '#b91c1c', 512, 150), roughness: 0.5 })); sgn.position.set(0, 1.85, -0.41); sgn.rotation.y = Math.PI; cart.add(sgn);
    const um = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.55, 12, 1, true), std({ color: '#d62828', roughness: 0.8, side: THREE.DoubleSide })); um.position.set(0, 2.55, 0.2); um.castShadow = true; cart.add(um); const up = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.3, 6), std({ color: '#333' })); up.position.set(0, 1.4, 0.5); cart.add(up);
    for (const x of [-0.6, 0.6]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14), std({ color: '#111' })); wh.rotation.z = Math.PI / 2; wh.position.set(x, 0.2, 0.3); cart.add(wh); }
    this.rects.push({ minX: 10.1, maxX: 11.7, minZ: 15.55, maxZ: 16.5 });
    // street bins along curbs
    for (const [x, z] of [[6.85, 24], [-6.85, -8], [6.85, -30], [-6.85, 40]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.85, 14), std({ color: '#1c8c46', roughness: 0.6 })); b.position.set(x, 0.59, z); b.castShadow = true; this.root.add(b); this.circles.push({ x, z, r: 0.35 }); }
    // volumetric-ish steam from drain / fry cart? (skip) — fire hydrant
    const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 10), std({ color: '#c0392b', roughness: 0.5, metalness: 0.4 })); hyd.position.set(6.85, 0.52, 12); this.root.add(hyd);
    void r;
  }

  async loadBikes(r: () => number) {
    const files = ['bike-pcx', 'bike-supercub', 'bike-cg125', 'bike-fatboy', 'bike-bobber']; const gs = await Promise.all(files.map((f) => loader.loadAsync(`${BASE}models/props/${f}.optimized.glb`).catch(() => null)));
    const ok = gs.filter(Boolean) as any[]; if (!ok.length) return;
    const spots: [number, number][] = [[11.3, -26], [11.7, -24.8], [11.2, -12], [11.6, -10.9], [11.3, -7.5], [11.8, 8], [11.4, 10.4], [11.7, 22], [11.3, 24.2], [11.5, 28], [-11.4, -30], [-11.6, -5], [-11.3, 3], [-11.5, 18], [-11.4, 20.2], [-11.5, 35]];
    spots.forEach(([x, z], i) => {
      const g = ok[i % ok.length]; const o = g.scene.clone(true); o.position.set(x, 0.165, z); o.rotation.y = (x > 0 ? 0 : Math.PI) + (r() < 0.5 ? 0 : Math.PI) * 0 + (r() - 0.5) * 0.5; o.traverse((c: any) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; if (c.material) { c.material = c.material.clone(); c.material.envMapIntensity = 1.2; } } });
      o.rotation.y += Math.PI / 2 * 0; this.root.add(o); this.parkedBikes.push(o); this.circles.push({ x: x + (x > 0 ? -0.3 : 0.3), z, r: 0.4 });
      // helmet hanging on the mirror/handlebar (dome + visor)
      if (i % 2 === 0) { const hm = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, 6.3, 0, 1.9), std({ color: ['#e11d48', '#111', '#f5f5f5', '#2563eb'][i % 4], roughness: 0.25, metalness: 0.2 })); hm.scale.set(1.15, 0.9, 1); hm.position.set(x, 1.12, z + 0.1); hm.castShadow = true; this.root.add(hm); }
    });
  }

  /* ---------------- per-frame ---------------- */
  update(dt: number, time: number, wet: number) {
    this.timeU.value = time;
    // fans
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    this.fans.forEach((f, i) => { e.set(time * 14 + f.ph, 0, 0); q.setFromEuler(e); m4.compose(f.pos, q, one); this.fanMesh.setMatrixAt(i, m4); }); this.fanMesh.instanceMatrix.needsUpdate = true;
    this.awnings.forEach((a, i) => { a.rotation.x = a.userData.base + Math.sin(time * 1.6 + i) * 0.012; });
    // signals
    this.signal.t += dt; const cyc = this.signal.t % 40; this.signal.east = cyc < 18 ? 'green' : cyc < 21 ? 'yellow' : 'red';
    this.signalLamps.forEach((l, i) => { const st = i === 0 ? this.signal.east : (this.signal.east === 'red' ? 'green' : this.signal.east === 'green' ? 'red' : 'yellow'); const west = i === 0 ? st : (cyc < 18 ? 'green' : cyc < 21 ? 'yellow' : 'red'); l.r.emissiveIntensity = west === 'red' ? 5 : 0.05; l.y.emissiveIntensity = west === 'yellow' ? 5 : 0.05; l.g.emissiveIntensity = west === 'green' ? 5 : 0.05; });
    this.sidewalkMats.forEach((m) => { m.roughness = 0.82 - wet * 0.4; });
  }

  setNight(n: number) {
    this.night = n; this.lampMat.emissiveIntensity = 0.15 + n * 5; this.glowSprites.forEach((s) => ((s.material as THREE.SpriteMaterial).opacity = n * 0.85)); this.pools.forEach((p) => ((p.material as THREE.MeshBasicMaterial).opacity = n * 0.55));
    this.lampLights.forEach((l) => (l.intensity = n * 1800)); this.shelterLight.intensity = n * 14;
    this.facadeMats.forEach((m) => (m.emissiveIntensity = 0.12 + n * 2.0)); this.signMats.forEach((m) => (m.emissiveIntensity = 0.12 + n * 1.4)); this.lightboxMats.forEach((m) => (m.emissiveIntensity = 0.45 + n * 1.9));
  }

  /** push a point out of colliders; returns corrected [x,z] */
  collide(x: number, z: number, rad: number): [number, number] {
    for (const c of this.circles) { const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + rad; if (d < m && d > 1e-4) { x = c.x + (dx / d) * m; z = c.z + (dz / d) * m; } }
    for (const rc of this.rects) {
      if (x > rc.minX - rad && x < rc.maxX + rad && z > rc.minZ - rad && z < rc.maxZ + rad) {
        const l = x - (rc.minX - rad), rr = rc.maxX + rad - x, t = z - (rc.minZ - rad), b = rc.maxZ + rad - z; const mn = Math.min(l, rr, t, b);
        if (mn === l) x = rc.minX - rad; else if (mn === rr) x = rc.maxX + rad; else if (mn === t) z = rc.minZ - rad; else z = rc.maxZ + rad;
      }
    }
    return [x, z];
  }
}

function wallSide(side: THREE.MeshStandardMaterial[], r: () => number) { return side[Math.floor(r() * side.length)]; }
const r2 = T.rng(777);
