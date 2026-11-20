import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addSSS } from '../engine/render';

/**
 * The supplied `taixe.glb` is a static, un-rigged 1M-poly scan (decimated to 30k tris at build time).
 * We procedurally build an 11-bone skeleton and smooth skin weights so the driver can sit, steer, check mirrors, pull the door lever.
 * Model space: facing +Z, Y up, H = 1.1625 (scaled x1.47 to a 1.71 m man).
 */
const H = 1.1625;
const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const JOINTS: { name: string; parent: number; pos: [number, number, number] }[] = [
  { name: 'pelvis', parent: -1, pos: [0, 0.6, 0.0] },
  { name: 'spine', parent: 0, pos: [0, 0.66, 0.0] },
  { name: 'head', parent: 1, pos: [0, 0.99, 0.0] },
  { name: 'thighL', parent: 0, pos: [0.07, 0.58, 0.0] }, { name: 'calfL', parent: 3, pos: [0.075, 0.33, 0.01] },
  { name: 'thighR', parent: 0, pos: [-0.07, 0.58, 0.0] }, { name: 'calfR', parent: 5, pos: [-0.075, 0.33, 0.01] },
  { name: 'uarmL', parent: 1, pos: [0.115, 0.95, 0.0] }, { name: 'farmL', parent: 7, pos: [0.16, 0.73, 0.0] },
  { name: 'uarmR', parent: 1, pos: [-0.115, 0.95, 0.0] }, { name: 'farmR', parent: 9, pos: [-0.16, 0.73, 0.0] },
];

export interface DriverRig { root: THREE.Group; bones: Record<string, THREE.Bone>; mesh: THREE.SkinnedMesh; scale: number }

export async function loadDriver(url: string): Promise<DriverRig | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    let src: THREE.Mesh | null = null; gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && !src) src = o as THREE.Mesh; });
    if (!src) return null;
    const s = src as THREE.Mesh; s.updateWorldMatrix(true, false);
    const geo = s.geometry.clone(); geo.applyMatrix4(s.matrixWorld);
    const pos = geo.attributes.position; const n = pos.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i) / H, ax = Math.abs(x), left = x > 0;
      const head = ss(0.855, 0.905, y);
      const a = ss(0.1, 0.135, ax) * ss(0.42, 0.5, y) * (1 - ss(0.84, 0.89, y)) * (1 - head);
      const t = ss(0.58, 0.68, y); const upper = a * t, fore = a * (1 - t);
      const nb = (1 - a) * (1 - head);
      const leg = nb * (1 - ss(0.5, 0.57, y)); const tc = ss(0.24, 0.32, y); const thigh = leg * tc, calf = leg * (1 - tc);
      const tor = nb * ss(0.5, 0.57, y); const spineF = ss(0.57, 0.68, y); const spine = tor * spineF, pelvis = tor * (1 - spineF);
      const sL = ss(-0.012, 0.012, x);
      const w = [
        [0, pelvis], [1, spine], [2, head],
        [3, thigh * sL], [5, thigh * (1 - sL)], [4, calf * sL], [6, calf * (1 - sL)],
        [left ? 7 : 9, upper], [left ? 8 : 10, fore],
      ].filter((e) => e[1] > 1e-4).sort((p, q) => q[1] - p[1]).slice(0, 4);
      let sum = w.reduce((p, q) => p + q[1], 0); if (sum < 1e-6) { w.push([0, 1]); sum = 1; }
      for (let k = 0; k < 4; k++) { si[i * 4 + k] = w[k] ? w[k][0] : 0; sw[i * 4 + k] = w[k] ? w[k][1] / sum : 0; }
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const mat = (Array.isArray(s.material) ? s.material[0] : s.material) as THREE.MeshStandardMaterial;
    const m2 = mat.clone(); m2.metalness = 0.0; m2.roughness = 0.62; m2.envMapIntensity = 0.9; m2.normalScale.set(0.9, 0.9);
    if (m2.metalnessMap) { m2.metalnessMap = null; m2.roughnessMap = null; } // MR map from the scan is unreliable
    addSSS(m2, '#e0653c', 0.5, 1.4);
    const mesh = new THREE.SkinnedMesh(geo, m2); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    const bones: THREE.Bone[] = JOINTS.map((j) => { const b = new THREE.Bone(); b.name = j.name; return b; });
    JOINTS.forEach((j, i) => { if (j.parent >= 0) { bones[j.parent].add(bones[i]); const pp = JOINTS[j.parent].pos; bones[i].position.set(j.pos[0] - pp[0], j.pos[1] - pp[1], j.pos[2] - pp[2]); } else bones[i].position.set(...j.pos); });
    mesh.add(bones[0]); mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    const root = new THREE.Group(); root.add(mesh); const scale = 1.71 / H; root.scale.setScalar(scale);
    const map: Record<string, THREE.Bone> = {}; bones.forEach((b) => (map[b.name] = b));
    return { root, bones: map, mesh, scale };
  } catch (e) { console.warn('driver load failed', e); return null; }
}

/** Pose the seated driver. All rotations are local Euler X (pitch forward negative). */
export function poseDriver(d: DriverRig, p: { steer: number; head: number; headPitch: number; lever: number; breathe: number }) {
  const b = d.bones; const q = (bone: THREE.Bone, x: number, y = 0, z = 0) => bone.rotation.set(x, y, z);
  q(b.pelvis, -0.02 + p.breathe * 0.004); q(b.spine, -0.06 + p.breathe * 0.01, p.steer * 0.05);
  q(b.head, p.headPitch + 0.05, p.head, 0);
  q(b.thighL, -1.5, 0.05, 0); q(b.calfL, 1.52, 0, 0); q(b.thighR, -1.46, -0.05, 0); q(b.calfR, 1.45, 0, 0);
  const sw = p.steer;
  // arms to the wheel (left hand on wheel top-left, right hand top-right), steering shifts them
  q(b.uarmL, -1.05 + sw * 0.18, 0, -0.1 + sw * 0.1); q(b.farmL, -0.55 + sw * 0.1, 0.1, 0);
  const lv = p.lever; // right arm reaches to the door-lever on the right of the cab
  q(b.uarmR, -1.0 - lv * 0.45 - sw * 0.18, -lv * 0.45, 0.1 - lv * 0.4); q(b.farmR, -0.55 - lv * 0.25, 0, 0);
}
