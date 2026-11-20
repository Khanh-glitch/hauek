import * as THREE from 'three';
import * as SU from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Retargeter, boneOnlyClone, type PoseOverride } from './retarget';
import { loader, BASE, type Street } from './street';
import { addSSS } from '../engine/render';
import { rng } from '../engine/textures';
import { Bus, BUS_LEN as _BL, DOOR_Z, FLOOR_Y } from './bus';
void _BL;

export const UE_NPCS = ['alice', 'alan', 'archetype', 'arthur', 'blackguy', 'freya', 'linmei', 'napole', 'nguoigia', 'sofia', 'yoshida'];
const NATIVES: { id: string; file: string; idle: string; walk: string; extra?: string }[] = [
  { id: 'manvn', file: 'manvn', idle: 'Idle', walk: 'Walk', extra: 'Wave' }, { id: 'rowan', file: 'rowan', idle: 'idle', walk: 'walk', extra: 'wave' }, { id: 'juno3', file: 'juno3', idle: 'idle', walk: 'walk', extra: 'wave' },
];

export type Mode = 'stand' | 'phone' | 'sit' | 'walk' | 'board' | 'inbus' | 'alight' | 'chat' | 'rider' | 'vendor' | 'cafe' | 'wait';
interface WP { p: THREE.Vector3; space: 'world' | 'bus'; wait?: number; sit?: boolean }

const ARMS_DOWN: PoseOverride = { upperarm_l: [0, 0, -1.0], upperarm_r: [0, 0, 1.0] };

export class Person {
  group = new THREE.Group(); model!: THREE.Object3D; rt?: Retargeter; mixer?: THREE.AnimationMixer; nativeActs: Record<string, THREE.AnimationAction> = {};
  mode: Mode = 'stand'; yaw = 0; speed = 0; scale = 1; pelvisY = 1.0; time = Math.random() * 20; lookTimer = Math.random() * 4; lookYaw = 0; lookTarget = 0;
  path: WP[] = []; space: 'world' | 'bus' = 'world'; laneX = 9.8; dir = -1; seat: { pos: THREE.Vector3; yaw: number; taken: boolean } | null = null; seatY = 0;
  anim = ''; phone?: THREE.Mesh; sitKind: 'bench' | 'stool' | 'bus' | 'bike' = 'bench'; hasPhone = false; busSeat: any = null; partner?: Person; dwell = 0; joinStop = false; meshes: THREE.Mesh[] = []; small: THREE.Mesh[] = []; far = false; id: string; kind: 'ue' | 'native';
  gait = 1.3; helmet?: THREE.Mesh; skip = 0; headBone?: THREE.Object3D;
  constructor(id: string, kind: 'ue' | 'native') { this.id = id; this.kind = kind; }
  get pos() { return this.group.position; }
  setAnim(name: string, speed = 1, fade = 0.35) {
    if (this.anim === name) { if (this.rt?.current) this.rt.current.timeScale = speed; else if (this.nativeActs[name]) this.nativeActs[name].timeScale = speed; return; }
    this.anim = name;
    if (this.rt) this.rt.play(name, fade, Math.random() * 3, speed);
    else if (this.mixer) { const a = this.nativeActs[name]; if (!a) return; const prev = Object.values(this.nativeActs).find((x) => x.isRunning() && x !== a); a.reset().setEffectiveTimeScale(speed).play(); a.time = Math.random() * a.getClip().duration; if (prev) prev.crossFadeTo(a, fade, false); }
  }
  /** pose overrides for state (UE rigs only) */
  pose(kind: 'stand' | 'phone' | 'sit' | 'stool' | 'rider' | 'bus' | 'walk' | 'chat') {
    if (!this.rt) return; const o: PoseOverride = { ...ARMS_DOWN };
    if (kind === 'phone' || kind === 'sit' && this.hasPhone) { o.upperarm_r = [-0.55, 0, 0.95]; o.lowerarm_r = [-1.55, 0, 0]; o.head = [0.35, 0, 0]; o.spine_01 = [kind === 'sit' ? 0.14 : 0.06, 0, 0]; }
    if (kind === 'sit') { o.thigh_l = [-1.5, 0.05, 0]; o.thigh_r = [-1.5, -0.05, 0]; o.calf_l = [1.45, 0, 0]; o.calf_r = [1.45, 0, 0]; o.spine_01 = [0.1, 0, 0]; if (!this.hasPhone) { o.upperarm_l = [-0.35, 0, -0.9]; o.upperarm_r = [-0.35, 0, 0.9]; o.lowerarm_l = [-0.7, 0, 0]; o.lowerarm_r = [-0.7, 0, 0]; } }
    if (kind === 'stool') { o.thigh_l = [-1.9, 0.12, 0]; o.thigh_r = [-1.9, -0.12, 0]; o.calf_l = [1.9, 0, 0]; o.calf_r = [1.9, 0, 0]; o.spine_01 = [0.2, 0, 0]; o.upperarm_l = [-0.5, 0, -0.9]; o.lowerarm_l = [-0.9, 0, 0]; o.upperarm_r = [-0.5, 0, 0.9]; o.lowerarm_r = [-1.0, 0, 0]; }
    if (kind === 'bus') { o.thigh_l = [-1.5, 0.05, 0]; o.thigh_r = [-1.5, -0.05, 0]; o.calf_l = [1.45, 0, 0]; o.calf_r = [1.45, 0, 0]; o.spine_01 = [0.04, 0, 0]; }
    if (kind === 'rider') { o.thigh_l = [-1.15, 0.28, 0]; o.thigh_r = [-1.15, -0.28, 0]; o.calf_l = [0.85, 0, 0]; o.calf_r = [0.85, 0, 0]; o.upperarm_l = [-0.95, 0, -0.45]; o.upperarm_r = [-0.95, 0, 0.45]; o.lowerarm_l = [-0.5, 0, 0]; o.lowerarm_r = [-0.5, 0, 0]; o.spine_01 = [0.18, 0, 0]; }
    if (kind === 'chat') { o.lowerarm_r = [-0.9, 0, 0]; o.upperarm_r = [-0.4, 0, 0.9]; }
    this.rt.overrides = o; this.baseOv = { ...o };
  }
  baseOv: PoseOverride = {};
  /** extra head look (yaw/pitch) merges into overrides */
  applyLook(dt: number) {
    if (!this.rt) return;
    this.lookTimer -= dt; if (this.lookTimer < 0) { this.lookTimer = 1.5 + Math.random() * 3.5; this.lookTarget = (Math.random() - 0.5) * 1.2; }
    this.lookYaw += (this.lookTarget - this.lookYaw) * Math.min(1, dt * 3);
    const h = this.baseOv.head ?? [0, 0, 0]; this.rt.overrides.head = [h[0], h[1] + this.lookYaw, h[2]];
    if (this.mode === 'chat') { const lr = this.baseOv.lowerarm_r ?? [0, 0, 0]; this.rt.overrides.lowerarm_r = [lr[0] - 0.3 - Math.sin(this.time * 2.3 + this.lookYaw) * 0.35, lr[1], lr[2]]; }
  }
}

export class PeopleLib {
  ue = new Map<string, THREE.Object3D>(); natives = new Map<string, { scene: THREE.Object3D; anims: THREE.AnimationClip[]; cfg: (typeof NATIVES)[0] }>(); vendor?: { scene: THREE.Object3D; anims: THREE.AnimationClip[] };
  srcRig!: THREE.Object3D; clips: THREE.AnimationClip[] = []; skinTex?: THREE.Texture;
  async load() {
    const L = (f: string) => loader.loadAsync(`${BASE}models/characters/${f}.optimized.glb`);
    const [ues, nats, ven] = await Promise.all([Promise.all(UE_NPCS.map((n) => L('npc-' + n).catch(() => null))), Promise.all(NATIVES.map((n) => L(n.file).catch(() => null))), L('banhmi-vendor').catch(() => null)]);
    ues.forEach((g, i) => { if (g) this.ue.set(UE_NPCS[i], g.scene); });
    nats.forEach((g, i) => { if (g) this.natives.set(NATIVES[i].id, { scene: g.scene, anims: g.animations, cfg: NATIVES[i] }); });
    const rowan = this.natives.get('rowan'); if (rowan) { this.srcRig = boneOnlyClone(rowan.scene); this.clips = rowan.anims; }
    if (ven) this.vendor = { scene: ven.scene, anims: ven.animations };
  }
  private prep(root: THREE.Object3D, p: Person, targetH: number, headName: RegExp) {
    root.updateMatrixWorld(true); let hy = 1.7; root.traverse((o) => { if ((o as THREE.Bone).isBone && headName.test(o.name)) { hy = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).y; p.headBone = o; } });
    p.scale = targetH / (hy * 1.04); root.scale.multiplyScalar(p.scale); root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; p.meshes.push(m);
      const nm = (m.name + ' ' + ((m.material as THREE.Material).name || '')).toLowerCase();
      if (/eye|brow|lash|teeth|tongue/.test(nm)) p.small.push(m);
      const mats = Array.isArray(m.material) ? m.material : [m.material]; mats.forEach((mt, i) => {
        const c = (mt as THREE.MeshStandardMaterial).clone(); (c as any).envMapIntensity = 0.9; if (/body|skin|head|face|arm|leg|hand/.test(nm) && !/hair|shoe|cloth/.test(nm)) addSSS(c, '#e0603a', 0.55, 1.4); if (/hair/.test(nm)) { c.roughness = 0.5; }
        if (Array.isArray(m.material)) m.material[i] = c; else m.material = c;
      });
    });
    const pel = root.getObjectByName('pelvis') || root.getObjectByName('Hips') || root.getObjectByName('mixamorigHips'); if (pel) p.pelvisY = new THREE.Vector3().setFromMatrixPosition(pel.matrixWorld).y;
  }
  create(id?: string, native = false): Person {
    const r = Math.random; const targetH = 1.56 + r() * 0.2;
    if (native || !this.ue.size) {
      const keys = [...this.natives.keys()]; const key = id ?? keys[Math.floor(r() * keys.length)]; const n = this.natives.get(key)!; const p = new Person(key, 'native');
      p.model = SU.clone(n.scene); p.group.add(p.model); this.prep(p.model, p, key === 'manvn' ? 1.64 : targetH, /(^|:)Head$|mixamorigHead$/i);
      p.mixer = new THREE.AnimationMixer(p.model); n.anims.forEach((c) => { p.nativeActs[c.name] = p.mixer!.clipAction(c); }); p.nativeActs.__idle = p.nativeActs[n.cfg.idle]; p.nativeActs.__walk = p.nativeActs[n.cfg.walk]; p.nativeActs.idle = p.nativeActs[n.cfg.idle]; p.nativeActs.walk = p.nativeActs[n.cfg.walk]; if (n.cfg.extra) p.nativeActs.wave = p.nativeActs[n.cfg.extra]; p.nativeActs.crouch_idle = p.nativeActs.idle;
      return p;
    }
    const keys = [...this.ue.keys()]; const key = id ?? keys[Math.floor(r() * keys.length)]; const p = new Person(key, 'ue'); p.model = SU.clone(this.ue.get(key)!); p.group.add(p.model); this.prep(p.model, p, targetH, /^head$/);
    p.rt = new Retargeter(p.model, boneOnlyClone(this.srcRig), this.clips); p.pose('stand'); p.rt.play('idle', 0, Math.random() * 2); p.anim = 'idle'; p.rt.update(0.01);
    return p;
  }
  createVendor(): Person | null {
    if (!this.vendor) return null; const p = new Person('vendor', 'native'); p.model = SU.clone(this.vendor.scene); p.group.add(p.model); this.prep(p.model, p, 1.64, /(^|:)Head$/i);
    p.mixer = new THREE.AnimationMixer(p.model); this.vendor.anims.forEach((c) => (p.nativeActs[c.name] = p.mixer!.clipAction(c))); p.mode = 'vendor'; return p;
  }
}

export class Crowd {
  all: Person[] = []; peds: Person[] = []; waiters: Person[] = []; inBus: Person[] = []; boardQueue: Person[] = []; vendor: Person | null = null; boardTimer = 0; boarding = false; alightPending: Person[] = []; r = rng(31);
  standSpots = [new THREE.Vector3(7.35, 0.165, -1.5), new THREE.Vector3(7.45, 0.165, -0.1), new THREE.Vector3(7.3, 0.165, 1.2), new THREE.Vector3(8.0, 0.165, 2.7), new THREE.Vector3(8.1, 0.165, -2.4), new THREE.Vector3(7.5, 0.165, 2.0)]; standTaken = new Set<number>();
  constructor(public lib: PeopleLib, public street: Street, public bus: Bus, public scene: THREE.Scene) {}

  add(p: Person) { this.all.push(p); this.scene.add(p.group); }

  spawn() {
    const L = this.lib; if (!L.srcRig && !L.natives.size) return;
    const mk = (id?: string, native = false) => { const p = L.create(id, native); this.add(p); return p; };
    // bus-stop waiters : bench sitters
    this.street.benchSeats.forEach((s, i) => { const p = mk(); p.mode = 'sit'; p.hasPhone = i !== 1; p.seat = s; s.taken = true; p.sitKind = 'bench'; p.pose('sit'); p.setAnim('idle'); this.placeSeat(p, s.pos, s.yaw, 0.46); this.waiters.push(p); });
    [0, 1, 2].forEach((i) => { const p = mk(i === 2 ? 'manvn' : undefined, i === 2); p.mode = 'stand'; p.hasPhone = i === 0; p.pose(p.hasPhone ? 'phone' : 'stand'); this.assignStand(p, i); this.waiters.push(p); });
    // alighting passengers already sitting inside the bus
    this.bus.seats.slice(0, 3).forEach((s) => { const p = mk(); p.mode = 'inbus'; p.space = 'bus'; p.busSeat = s; s.taken = true; p.pose('bus'); this.bus.body.add(p.group); this.placeSeatLocal(p, s.local, Math.PI, 0.0); this.inBus.push(p); });
    // pedestrians on sidewalks (east sidewalk lanes both ways + west)
    const lanes: [number, number][] = [[10.2, -1], [9.7, 1], [10.9, -1], [10.4, 1], [-9.8, 1], [-10.6, -1], [-9.5, -1]];
    lanes.forEach(([x, d], i) => { const p = mk(i === 3 ? 'manvn' : undefined, i === 3); p.mode = 'walk'; p.laneX = x; p.dir = d; p.pos.set(x, 0.165, (this.r() - 0.5) * 100); p.yaw = d < 0 ? Math.PI : 0; p.pose('walk'); p.gait = 1.15 + this.r() * 0.35; p.hasPhone = i % 4 === 2; if (p.hasPhone) p.pose('phone'); p.joinStop = x > 0 && d !== 0 && i % 2 === 0; this.peds.push(p); });
    // café customers on low stools
    this.street.stoolSeats.slice(0, 6).forEach((s, i) => { const p = mk(); p.mode = 'cafe'; p.seat = s; s.taken = true; p.sitKind = 'stool'; p.hasPhone = i % 3 === 0; p.pose('stool'); p.setAnim('idle'); this.placeSeat(p, s.pos, s.yaw, 0.0, true); });
    // chatting pair
    const a = mk(), b = mk(); a.mode = b.mode = 'chat'; a.pos.set(10.7, 0.165, 27); b.pos.set(11.5, 0.165, 27.8); a.partner = b; b.partner = a; a.yaw = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z); b.yaw = a.yaw + Math.PI; a.pose('chat'); b.pose('chat');
    // bánh mì vendor
    const v = L.createVendor(); if (v) { this.vendor = v; this.add(v); v.pos.set(11.6, 0.165, 16); v.yaw = -Math.PI / 2; this.vendorCycle(v); }
    // customer at the cart
    const cu = mk(); cu.mode = 'stand'; cu.pose('phone'); cu.pos.set(9.9, 0.165, 16.2); cu.yaw = Math.PI / 2; cu.hasPhone = false; cu.pose('stand');
    this.all.forEach((p) => this.attachPhone(p));
  }

  attachPhone(p: Person) {
    if (!p.rt || !p.hasPhone && p.mode !== 'wait' || p.phone) { if (!p.rt || p.phone) return; }
    if (!p.hasPhone) return; const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.008), new THREE.MeshStandardMaterial({ color: '#0b0b0d', emissive: '#7aa7ff', emissiveIntensity: 0.9, roughness: 0.2 })); p.phone = m; this.scene.add(m);
  }

  vendorCycle(v: Person) { const names = ['PrepareBread', 'ServeBread', 'ReceivePayment', 'ThankCustomer', 'LookForCustomer', 'Welcome', 'Invite']; const go = () => { v.setAnim(names[Math.floor(Math.random() * names.length)], 1, 0.4); setTimeout(go, 3500 + Math.random() * 4000); }; go(); }

  placeSeat(p: Person, pos: THREE.Vector3, yaw: number, _h: number, low = false) { p.yaw = yaw; p.group.position.set(pos.x, pos.y - p.pelvisY + (low ? 0.15 : 0.08), pos.z); p.group.rotation.y = yaw; p.seatY = p.group.position.y; if (!low) p.group.position.z += 0; }
  placeSeatLocal(p: Person, pos: THREE.Vector3, yaw: number, _h: number) { p.group.position.set(pos.x, pos.y - p.pelvisY + 0.09, pos.z + 0.04); p.group.rotation.y = yaw; p.yaw = yaw; }
  assignStand(p: Person, i: number) { const s = this.standSpots[i % this.standSpots.length]; this.standTaken.add(i); p.pos.copy(s); p.yaw = Math.PI / 2 + (Math.random() - 0.5) * 0.6; p.group.rotation.y = p.yaw; p.laneX = i; }

  /** called when the door starts opening */
  onDoorOpen() {
    this.boarding = true; this.boardTimer = 1.4;
    // alight
    this.inBus.slice().forEach((p, i) => { if (p.busSeat) p.busSeat.taken = false; p.path = [{ p: new THREE.Vector3(0.3, FLOOR_Y, p.group.position.z), space: 'bus' }, { p: new THREE.Vector3(0.62, FLOOR_Y, DOOR_Z), space: 'bus' }, { p: new THREE.Vector3(1.4, 0.42, DOOR_Z), space: 'bus' }, { p: new THREE.Vector3(6.5, 0.165, 0), space: 'world' }, { p: new THREE.Vector3(9.3 + i * 0.3, 0.165, -2 - i), space: 'world' }]; p.dwell = 0.8 + i * 1.0; p.mode = 'alight'; p.pose('walk'); p.busSeat = null; });
    this.inBus = [];
    this.boardQueue = this.waiters.slice().filter((w) => !(w as any).left); this.boardQueue.forEach((w, i) => { w.dwell = 3.2 + i * 1.5; });
  }
  onDoorClose() { this.boarding = false; }
  get busy() { return this.alightPending.length > 0 || this.all.some((p) => p.mode === 'board' || p.mode === 'alight') || this.boardQueue.some((p) => p.dwell > 0 && p.mode !== 'inbus'); }

  private startBoard(p: Person) {
    const free = this.bus.seats.find((s) => !s.taken) ?? null; const dz = this.bus.group.position.z + DOOR_Z; const bx = this.bus.group.position.x;
    if (p.seat) { p.seat.taken = false; p.seat = null; }
    const wz = dz + (Math.random() - 0.5) * 0.4;
    p.path = [{ p: new THREE.Vector3(6.55, 0.165, wz), space: 'world' }, { p: new THREE.Vector3(bx + 1.38, 0.42, dz), space: 'world' }, { p: new THREE.Vector3(0.7, FLOOR_Y, DOOR_Z), space: 'bus' }];
    if (free) { free.taken = true; p.busSeat = free; p.path.push({ p: new THREE.Vector3(0.3, FLOOR_Y, free.local.z), space: 'bus' }, { p: free.local.clone(), space: 'bus', sit: true }); }
    else p.path.push({ p: new THREE.Vector3(0.3, FLOOR_Y, -1.5), space: 'bus' });
    p.mode = 'board'; p.pose('walk'); p.setAnim('walk', 1);
    const idx = this.waiters.indexOf(p); if (idx >= 0) this.waiters.splice(idx, 1);
    if (p.hasPhone) { /* keep phone hidden while walking */ }
  }

  update(dt: number, camPos: THREE.Vector3) {
    this.bus.group.updateMatrixWorld(true);
    if (this.boarding) { this.boardQueue.forEach((p) => { if (p.dwell > 0) { p.dwell -= dt; if (p.dwell <= 0 && p.mode !== 'board' && p.mode !== 'inbus') this.startBoard(p); } }); }
    for (const p of this.all) {
      p.time += dt; const dist = p.group.position.distanceTo(camPos); const farNow = dist > 55; p.far = farNow;
      p.small.forEach((m) => (m.visible = dist < 32)); p.group.visible = dist < 140 || p.space === 'bus';
      switch (p.mode) {
        case 'walk': this.walk(p, dt); break;
        case 'board': case 'alight': this.follow(p, dt); break;
        case 'sit': case 'cafe': case 'inbus': p.speed = 0; p.setAnim('idle'); p.group.rotation.y = p.yaw; break;
        case 'chat': { p.setAnim('idle'); if (p.partner) { const dx = p.partner.pos.x - p.pos.x, dz = p.partner.pos.z - p.pos.z; p.yaw = Math.atan2(dx, dz); } p.group.rotation.y = p.yaw; break; }
        case 'vendor': p.group.rotation.y = p.yaw; break;
        case 'wait': break;
        default: p.setAnim('idle'); p.group.rotation.y = p.yaw;
      }
      if (p.mode === 'stand' || p.mode === 'phone') { p.setAnim('idle'); p.group.rotation.y = p.yaw; }
      // animation update (LOD: far characters update at half rate)
      if (dist < 90) {
        p.skip++; if (!(farNow && p.skip % 2)) {
          p.applyLook(dt); p.rt?.update(dt * (farNow ? 2 : 1)); p.mixer?.update(dt * (farNow ? 2 : 1));
        }
      }
      if (p.phone) { const showing = (p.mode === 'sit' || p.mode === 'cafe' || p.mode === 'stand' || p.mode === 'walk' || p.mode === 'wait') && p.hasPhone; p.phone.visible = showing && p.group.visible; if (showing) { const h = p.rt?.bones['hand_r']; if (h) { const v = new THREE.Vector3(); h.getWorldPosition(v); p.phone.position.copy(v); p.phone.position.y += 0.03; p.phone.lookAt(camPos.x, v.y + 0.3, camPos.z); } } }
    }
  }

  private moveTo(p: Person, tx: number, tz: number, speed: number, dt: number) {
    const dx = tx - p.pos.x, dz = tz - p.pos.z; const d = Math.hypot(dx, dz); if (d < 0.05) return true;
    const st = Math.min(d, speed * dt); p.pos.x += (dx / d) * st; p.pos.z += (dz / d) * st;
    const ty = Math.atan2(dx, dz); let dy = ty - p.yaw; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283; p.yaw += dy * Math.min(1, dt * 8); p.group.rotation.y = p.yaw; return d - st < 0.06;
  }

  private follow(p: Person, dt: number) {
    if (p.dwell > 0 && p.mode === 'alight') { p.dwell -= dt; p.setAnim('idle'); return; }
    const wp = p.path[0]; if (!wp) { p.mode = p.mode === 'alight' ? 'walk' : 'stand'; if (p.mode === 'walk') { p.laneX = 9.8 + (Math.random() - 0.5); p.dir = Math.random() < 0.5 ? -1 : 1; p.pose('walk'); this.peds.push(p); } return; }
    // convert coordinate space if waypoint differs from person's current parent space
    if (wp.space !== p.space) {
      if (wp.space === 'bus' && p.space === 'world') { const l = this.bus.group.worldToLocal(p.group.getWorldPosition(new THREE.Vector3())); this.bus.body.add(p.group); p.group.position.copy(l); p.group.position.y = Math.max(0.42, l.y); p.space = 'bus'; p.yaw -= 0; p.group.rotation.y = p.yaw; }
      else { const w = this.bus.group.localToWorld(p.group.position.clone()); this.scene.add(p.group); p.group.position.copy(w); p.space = 'world'; }
    }
    const sp = 1.05; p.setAnim('walk', sp / p.gait * 1.1);
    const done = this.moveTo(p, wp.p.x, wp.p.z, sp, dt); p.pos.y += (wp.p.y - p.pos.y + (wp.sit ? -p.pelvisY + 0.09 : 0) * 0) * Math.min(1, dt * 7);
    if (done) {
      p.path.shift();
      if (wp.sit && p.busSeat) { p.mode = 'inbus'; p.pose('bus'); p.yaw = Math.PI; this.placeSeatLocal(p, p.busSeat.local, Math.PI, 0); this.inBus.push(p); if (p.phone) p.hasPhone = false; this.respawnWaiter(); }
      else if (!p.path.length && p.mode === 'board') { p.mode = 'inbus'; p.pose('bus'); this.inBus.push(p); p.setAnim('idle'); p.pose('stand'); this.respawnWaiter(); }
    }
    if (p.space === 'bus' && p.path.length && p.path[0].p.y > 0.7) p.pos.y += (FLOOR_Y - p.pos.y) * Math.min(1, dt * 6);
  }

  respawnWaiter() { const cand = this.peds.find((q) => q.joinStop && q.mode === 'walk' && Math.abs(q.pos.z) > 12); if (cand) { cand.mode = 'wait'; cand.laneX = 0; cand.path = []; cand.dwell = 0; (cand as any).goal = this.freeStand(); } else { const spare = this.peds.find((q) => q.pos.x > 0 && q.mode === 'walk'); if (spare) { spare.mode = 'wait'; (spare as any).goal = this.freeStand(); } } }
  freeStand() { for (let i = 0; i < this.standSpots.length; i++) if (!this.standTaken.has(i)) { this.standTaken.add(i); return i; } return -1; }

  private walk(p: Person, dt: number) {
    // sidewalk follower with obstacle & neighbor avoidance
    const speed = p.gait; p.setAnim('walk', speed / 1.3);
    const g = (p as any).goal as number | undefined;
    if (g !== undefined && g >= 0 && p.mode === 'walk') { /* not used */ }
    let vx = (p.laneX - p.pos.x) * 1.4, vz = p.dir * speed;
    for (const o of this.all) { if (o === p || o.mode === 'inbus' || o.space === 'bus') continue; const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z; if (Math.abs(dz) < 1.8 && Math.abs(dx) < 0.9 && dz * p.dir > 0) { vx -= Math.sign(dx || 1) * (0.9 - Math.abs(dx)) * 2.2; if (Math.abs(dz) < 0.9) vz *= 0.6; } }
    for (const c of this.street.circles) { const dx = c.x - p.pos.x, dz = c.z - p.pos.z; if (Math.abs(dz) < 2.0 && Math.abs(dx) < c.r + 0.8 && dz * p.dir > 0) vx -= Math.sign(dx || 1) * (c.r + 0.8 - Math.abs(dx)) * 2.6; }
    for (const r of this.street.rects) { if (r.minZ < -900) continue; if (p.pos.z + p.dir * 2 > r.minZ && p.pos.z + p.dir * 2 < r.maxZ || Math.abs(p.pos.z - (r.minZ + r.maxZ) / 2) < 3) { if (r.maxX < 11 && r.minX > 7 && Math.abs(p.pos.x - (r.minX + r.maxX) / 2) < (r.maxX - r.minX) / 2 + 0.9) vx += 3.5; } }
    p.pos.x += THREE.MathUtils.clamp(vx, -1.1, 1.1) * dt; p.pos.z += vz * dt;
    const lim = p.pos.x > 0 ? [7.2, 12.0] : [-12.0, -7.2]; p.pos.x = THREE.MathUtils.clamp(p.pos.x, lim[0], lim[1]);
    const [cx, cz] = this.street.collide(p.pos.x, p.pos.z, 0.28); p.pos.x = cx; p.pos.z = cz; p.pos.y = 0.165;
    const ty = Math.atan2(vx * 0.6, vz); let dy = ty - p.yaw; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283; p.yaw += dy * Math.min(1, dt * 6); p.group.rotation.y = p.yaw;
    if (p.dir > 0 && p.pos.z > 85) p.pos.z = -85; if (p.dir < 0 && p.pos.z < -85) p.pos.z = 85;
  }

  /** waiting people who have just arrived walk to their stand spot */
  updateWaiters(dt: number) {
    for (const p of this.all) {
      if (p.mode !== 'wait') continue; const gi = (p as any).goal as number; if (gi === undefined || gi < 0) { p.mode = 'walk'; continue; }
      const s = this.standSpots[gi]; const dx = s.x - p.pos.x, dz = s.z - p.pos.z; const d = Math.hypot(dx, dz);
      if (d > 0.1) { this.moveTo(p, s.x, s.z, 1.2, dt); p.setAnim('walk', 1.0); p.pose('walk'); }
      else { p.mode = 'stand'; p.yaw = Math.PI / 2; p.group.rotation.y = p.yaw; p.hasPhone = Math.random() < 0.5; p.pose(p.hasPhone ? 'phone' : 'stand'); this.attachPhone(p); this.waiters.push(p); const idx = this.peds.indexOf(p); if (idx >= 0) this.peds.splice(idx, 1); }
    }
  }
}
