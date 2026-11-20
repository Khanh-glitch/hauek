import * as THREE from 'three';
import { loader, BASE, type Street } from './street';
import type { PeopleLib, Person } from './people';
import { makeCorrugated, makeSign } from '../engine/textures';

/** Orientation constants (verified visually): which model axis is the front. */
export const CAR_FRONT_SIGN = -1; // car models: front towards -Z
export const BIKE_FRONT_SIGN = 1; // bike models: length along X, front towards +X

interface V { obj: THREE.Object3D; lane: number; dir: number; z: number; x: number; speed: number; vmax: number; len: number; type: 'car' | 'truck' | 'bike'; rider?: Person; helmet?: THREE.Mesh; lights: THREE.Mesh[]; tail: THREE.MeshStandardMaterial[]; head: THREE.MeshStandardMaterial[] }

export class Traffic {
  vs: V[] = []; scene: THREE.Scene; night = 0;
  constructor(scene: THREE.Scene, public street: Street, public lib: PeopleLib) { this.scene = scene; }

  async build() {
    const [cars, b1, b2] = await Promise.all([loader.loadAsync(`${BASE}models/vehicles/city-cars.optimized.glb`).catch(() => null), loader.loadAsync(`${BASE}models/props/bike-pcx.optimized.glb`).catch(() => null), loader.loadAsync(`${BASE}models/props/bike-supercub.optimized.glb`).catch(() => null)]);
    const laneDefs: { x: number; dir: number; kinds: ('car' | 'truck' | 'bike')[]; vmax: number[] }[] = [
      { x: 1.7, dir: -1, kinds: ['car', 'truck', 'car', 'car', 'car'], vmax: [9, 8, 10, 9, 8.5] }, { x: 2.85, dir: -1, kinds: ['bike', 'bike', 'bike', 'bike'], vmax: [8, 9.5, 7.5, 8.5] },
      { x: -1.7, dir: 1, kinds: ['car', 'car', 'car', 'truck'], vmax: [9.5, 8.5, 10, 8] }, { x: -3.0, dir: 1, kinds: ['bike', 'bike', 'bike'], vmax: [8, 9, 7.5] }, { x: -4.6, dir: 1, kinds: ['car', 'car', 'bike'], vmax: [8, 7.5, 8.5] },
    ];
    const carIdx = [0, 2, 7, 12, 18, 5, 9, 14, 3, 20]; let ci = 0;
    laneDefs.forEach((ld, li) => ld.kinds.forEach((kind, k) => {
      const z = -135 + (270 / ld.kinds.length) * k + Math.random() * 20; let obj: THREE.Object3D | null = null; let len = 4.2; const tail: THREE.MeshStandardMaterial[] = [], head: THREE.MeshStandardMaterial[] = []; let rider: Person | undefined; let helmet: THREE.Mesh | undefined;
      if (kind === 'car' && cars) {
        const src = cars.scene.getObjectByName('car_' + String(carIdx[ci++ % carIdx.length]).padStart(2, '0')); if (!src) return; obj = new THREE.Group(); const c = src.clone(true); c.position.set(0, 0, 0); c.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material = o.material.clone(); o.material.envMapIntensity = 1.3; o.material.roughness = Math.min(o.material.roughness, 0.5); } }); obj.add(c); len = 3.7;
        const bb = new THREE.Box3().setFromObject(c); const h = bb.max.y * 0.62; const zf = CAR_FRONT_SIGN * (bb.max.z - 0.05), zr = -zf;
        for (const sx of [-0.55 * (bb.max.x), 0.55 * bb.max.x]) { const hm = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff2cc', emissiveIntensity: 0.2 }); const tm = new THREE.MeshStandardMaterial({ color: '#600', emissive: '#ff1010', emissiveIntensity: 0.3 }); head.push(hm); tail.push(tm); const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.04), hm); hl.position.set(sx, h * 0.8, zf); const tl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.04), tm); tl.position.set(sx, h * 0.85, zr); obj.add(hl, tl); }
      } else if (kind === 'truck') {
        obj = new THREE.Group(); const cm = makeCorrugated(); cm.map.repeat.set(5, 2); cm.normal.repeat.set(5, 2); const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.15, 2.25, 4.4), new THREE.MeshStandardMaterial({ map: cm.map, normalMap: cm.normal, roughness: 0.45, metalness: 0.75, color: '#c9ccd0' })); cargo.position.set(0, 2.0, 1.2); const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.35, metalness: 0.2 })); cab.position.set(0, 1.55, -1.7); const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.7), new THREE.MeshStandardMaterial({ color: '#12181c', roughness: 0.05, metalness: 0.8 })); ws.position.set(0, 1.85, -2.51); ws.rotation.y = Math.PI; const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.35, 6.2), new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.7 })); chassis.position.set(0, 0.62, 0.3);
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshStandardMaterial({ map: makeSign('51C-553.36', '#1e4ea8', '#ffffff', 256, 128) })); plate.position.set(0, 0.8, 3.42); plate.rotation.y = Math.PI;
        obj.add(cargo, cab, ws, chassis, plate); [[-0.95, -1.6], [0.95, -1.6], [-0.95, 2.1], [0.95, 2.1], [-0.95, 3.0], [0.95, 3.0]].forEach(([x, z]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 18).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 })); w.position.set(x, 0.46, z); w.castShadow = true; obj!.add(w); });
        for (const o of [cargo, cab, chassis]) { o.castShadow = true; o.receiveShadow = true; } len = 6.4;
        for (const sx of [-0.8, 0.8]) { const tm = new THREE.MeshStandardMaterial({ color: '#600', emissive: '#ff1010', emissiveIntensity: 0.3 }); tail.push(tm); const tl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.05), tm); tl.position.set(sx, 0.85, 3.42); obj.add(tl); }
      } else if (kind === 'bike') {
        const g = (k % 2 ? b1 : b2) ?? b1 ?? b2; if (!g) return; obj = new THREE.Group(); const bk = g.scene.clone(true); bk.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material = o.material.clone(); o.material.envMapIntensity = 1.2; } }); bk.rotation.y = BIKE_FRONT_SIGN > 0 ? -Math.PI / 2 : Math.PI / 2; obj.add(bk); len = 2.0;
        // rider (retargeted character in motorbike pose) + helmet
        rider = this.lib.create(undefined, false); rider.mode = 'rider'; rider.hasPhone = false; rider.pose('rider'); rider.setAnim('idle'); rider.pos.set(0, 0.78 - rider.pelvisY + 0.07, -0.15 * 0); rider.group.rotation.y = Math.PI; obj.add(rider.group);
        helmet = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10, 0, 6.3, 0, 2.0), new THREE.MeshStandardMaterial({ color: ['#d62828', '#111', '#f1f1ee', '#1e63c4', '#f59e0b'][k % 5], roughness: 0.22, metalness: 0.3, clearcoat: 0.8 } as any)); helmet.scale.set(1.1, 1, 1.15); helmet.castShadow = true; this.scene.add(helmet);
        const tm = new THREE.MeshStandardMaterial({ color: '#600', emissive: '#ff1010', emissiveIntensity: 0.3 }); tail.push(tm); const tl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.16), tm); tl.position.set(0, 0.8, 0.92); obj.add(tl);
        const hm = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff2cc', emissiveIntensity: 0.2 }); head.push(hm); const hl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.14), hm); hl.position.set(0, 0.9, -0.95); obj.add(hl);
      }
      if (!obj) return; obj.position.set(ld.x, 0, z); obj.rotation.y = ld.dir < 0 ? 0 : Math.PI; this.scene.add(obj);
      // bikes: forward is local ±X rotated: rotate parent so its front aims at travel direction
      if (kind === 'bike') { obj.rotation.y = ld.dir < 0 ? 0 : Math.PI; (obj.children[0] as THREE.Object3D).rotation.y = (BIKE_FRONT_SIGN > 0 ? 1 : -1) * Math.PI / 2; }
      this.vs.push({ obj, lane: li, dir: ld.dir, z, x: ld.x, speed: ld.vmax[k] * 0.8, vmax: ld.vmax[k], len, type: kind, rider, helmet, lights: [], tail, head });
    }));
    // rider is added to scene via crowd? We update riders ourselves (they live inside obj).
  }

  setNight(n: number) { this.night = n; this.vs.forEach((v) => { v.head.forEach((m) => (m.emissiveIntensity = 0.2 + n * 4)); }); }

  update(dt: number, camPos: THREE.Vector3) {
    const sig = this.street.signal.east; const lane: Record<number, V[]> = {}; this.vs.forEach((v) => (lane[v.lane] ??= []).push(v));
    for (const v of this.vs) {
      let gap = 1e9; for (const o of lane[v.lane]) { if (o === v) continue; const d = (o.z - v.z) * v.dir; if (d > 0) gap = Math.min(gap, d - (o.len + v.len) / 2); }
      const stopZ = v.dir < 0 ? -31 : 31; const ahead = (stopZ - v.z) * v.dir; if (sig !== 'green' && ahead > 0.3 && ahead < 70) gap = Math.min(gap, ahead - v.len / 2 + 0.5);
      const vs = Math.sqrt(Math.max(0, 2 * 3.5 * (gap - 1.4))); const target = Math.min(v.vmax, vs); const prev = v.speed;
      v.speed += THREE.MathUtils.clamp(target - v.speed, -7 * dt, 2.0 * dt); v.z += v.dir * v.speed * dt;
      if (v.dir < 0 && v.z < -145) v.z = 145; if (v.dir > 0 && v.z > 145) v.z = -145;
      v.obj.position.set(v.x + (v.type === 'bike' ? Math.sin(v.z * 0.15 + v.lane) * 0.12 : 0), 0, v.z);
      const braking = v.speed < prev - 0.001; v.tail.forEach((m) => (m.emissiveIntensity = 0.3 + (braking ? 3 : 0) + this.night * 1.2));
      if (v.rider) { const far = v.obj.position.distanceTo(camPos); v.rider.group.visible = far < 130; if (far < 100) { v.rider.applyLook(dt * 0.2); v.rider.rt?.update(dt); } if (v.helmet && v.rider.headBone) { v.helmet.visible = v.rider.group.visible; const p = new THREE.Vector3(); v.rider.headBone.getWorldPosition(p); v.helmet.position.set(p.x, p.y + 0.08, p.z); v.helmet.rotation.y = v.dir < 0 ? 0 : Math.PI; } }
    }
  }
}
