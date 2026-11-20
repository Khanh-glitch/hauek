import {limitTextureSize} from './textures';
import * as THREE from 'three';
import { Atmosphere, Post, PlanarReflection, type TimePreset, PRESETS } from './render';
import { Street } from '../world/street';
import { Bus, Smoke, DOOR_Z } from '../world/bus';
import { PeopleLib, Crowd } from '../world/people';
import { Traffic } from '../world/traffic';

export type CamMode = 'cinematic' | 'walk' | 'free' | 'passenger' | 'driver';
export interface Hud { fps: number; mode: CamMode; time: TimePreset; busState: string; busSpeed: number; shot: string; tris: number; calls: number; loaded: number; label: string; grade: string; people: number; ready: boolean }

const STOP_Z = 4.3, STOP_X = 4.62;
type BusState = 'away' | 'approach' | 'dock' | 'dwell' | 'closing' | 'depart' | 'leave';
const STATE_TEXT: Record<BusState, string> = { away: 'Xe đang trên đường tới…', approach: 'Xe buýt 06 vào bến · xi-nhan phải', dock: 'Tấp sát vạch · mở cửa', dwell: 'Hành khách lên/xuống xe', closing: 'Đóng cửa · xi-nhan trái', depart: 'Rời bến', leave: 'Xe rời khỏi khu vực' };

export class Game {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(60, 1, 0.1, 3200);
  atm: Atmosphere; post: Post; refl: PlanarReflection; street!: Street; bus!: Bus; smoke!: Smoke; crowd!: Crowd; traffic!: Traffic; lib = new PeopleLib();
  mode: CamMode = 'cinematic'; clock = new THREE.Clock(); raf = 0; time = 0; disposed = false; hud: Hud; onHud?: (h: Hud) => void; hudT = 0; fpsAcc = 0; fpsN = 0; fps = 60;
  keys = new Set<string>(); yaw = Math.PI; pitch = 0; pos = new THREE.Vector3(8.6, 1.7, 9); locked = false; mouseDX = 0; mouseDY = 0;
  busState: BusState = 'away'; busT = 6; accel = 0; prevSpeed = 0; doorSound = false; lookT = 0; smokeRate = 0;
  shotIdx = 0; shotT = 0; shotName = ''; camP = new THREE.Vector3(30, 30, 70); camL = new THREE.Vector3(6, 2, 0); focus = new THREE.Vector3(6, 0, 0); passenger: any = null; fovT = 60;
  audio?: AudioCtx; reflOn = true; autoDof = true; loaded = 0; ready = false; shaftsOn = true; refView = 0;
  tmpV = new THREE.Vector3(); tmpV2 = new THREE.Vector3();

  lowPower = false;
  private gpuFence:WebGLSync|null = null;
  constructor(public mount: HTMLElement) {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    const gl = r.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    this.lowPower = !!debug && /swiftshader|llvmpipe|software/i.test(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
    limitTextureSize(this.lowPower?384:Infinity);
    r.info.autoReset = false;
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.lowPower ? 0.6 : 1.5)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.toneMapping = THREE.NoToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(r.domElement); r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    this.atm = new Atmosphere(this.scene, r); this.refl = new PlanarReflection(this.lowPower ? 0.25 : 0.5);
    if (this.lowPower) this.atm.sun.shadow.mapSize.set(512,512);
    this.post = new Post(r, this.scene, this.camera);
    this.hud = { fps: 0, mode: 'cinematic', time: 'noon', busState: '', busSpeed: 0, shot: '', tris: 0, calls: 0, loaded: 0, label: PRESETS.noon.label, grade: PRESETS.noon.grade, people: 0, ready: false };
    this.resize(); window.addEventListener('resize', this.resize); this.bindInput();
  }

  async init(progress: (p: number, t: string) => void) {
    progress(0.05, 'Dựng mặt đường, vỉa hè, nhà ống, dây điện…');
    await new Promise((r) => setTimeout(r, 30));
    this.street = new Street({ scene: this.scene, refl: this.refl, wetU: this.atm.wetU }); this.scene.add(this.street.root); this.refl.hide = [this.street.roadGroup];
    this.atm.addShafts(this.street.anchors); this.atm.setPreset(this.atm.key, true);
    progress(0.3, 'Xe buýt TP.HCM & tài xế (taixe.glb)…');
    this.bus = new Bus(); this.scene.add(this.bus.group); this.bus.group.position.set(3.5, 0, 130); this.smoke = new Smoke(this.scene);
    progress(0.45, 'Tải nhân vật từ kho scam-maze & retarget hoạt ảnh…');
    try { await this.lib.load(); } catch (e) { console.error('character library failed', e); } try { await this.street.ready; } catch (e) { console.error('bikes failed', e); }
    progress(0.75, 'Dựng đám đông & giao thông…');
    this.crowd = new Crowd(this.lib, this.street, this.bus, this.scene); try { this.crowd.spawn(); } catch (e) { console.error('crowd spawn failed', e); }
    this.traffic = new Traffic(this.scene, this.street, this.lib); try { await this.traffic.build(); } catch (e) { console.error('traffic build failed', e); }
    this.atm.nightListeners.push((n) => { this.street.setNight(n); this.bus.setNight(n); this.traffic.setNight(n); }); this.atm.setPreset(this.atm.key, true);
    progress(0.95, 'Hoàn tất…');
    this.ready = true; progress(1, 'Sẵn sàng'); this.clock.start(); this.loop();
  }

  resize = () => {
    const w = this.mount.clientWidth || window.innerWidth, h = this.mount.clientHeight || window.innerHeight; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.post.setSize(w, h); this.refl.setSize(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
  };

  /* ---------------- input ---------------- */
  bindInput() {
    const c = this.renderer.domElement;
    window.addEventListener('keydown', this.kd); window.addEventListener('keyup', this.ku);
    c.addEventListener('click', () => { if ((this.mode === 'walk' || this.mode === 'free' || this.mode === 'driver' || this.mode === 'passenger') && !this.locked) c.requestPointerLock?.(); this.audio?.resume(); });
    document.addEventListener('pointerlockchange', () => (this.locked = document.pointerLockElement === c));
    document.addEventListener('mousemove', (e) => { if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; } });
  }
  kd = (e: KeyboardEvent) => { if (e.target instanceof HTMLInputElement) return; this.keys.add(e.code); if (e.code === 'Digit1') this.setMode('cinematic'); if (e.code === 'Digit2') this.setMode('walk'); if (e.code === 'Digit3') this.setMode('free'); if (e.code === 'Digit4') this.setMode('passenger'); if (e.code === 'Digit5') this.setMode('driver'); if (e.code === 'KeyT') this.cycleTime(); if (e.code === 'KeyN') this.nextShot(); if (e.code === 'KeyH') this.honk(); };
  ku = (e: KeyboardEvent) => this.keys.delete(e.code);

  setMode(m: CamMode) {
    this.mode = m; if (document.pointerLockElement) document.exitPointerLock();
    if (m === 'walk') { if (this.pos.y > 2.5 || this.pos.x < -12 || this.pos.x > 12.2) this.pos.set(8.6, 1.7, 9); this.pos.y = 1.7; this.yaw = Math.PI * 0.5 + 0.2; this.pitch = 0; this.fovT = 66; }
    if (m === 'free') { this.pos.copy(this.camera.position); const d = this.camera.getWorldDirection(new THREE.Vector3()); this.yaw = Math.atan2(-d.x, -d.z); this.pitch = Math.asin(d.y); this.fovT = 60; }
    if (m === 'passenger') { this.passenger = this.crowd?.waiters.find((p) => p.mode === 'stand' && p.rt) ?? this.crowd?.all.find((p) => p.rt); this.yaw = 0; this.pitch = 0; this.fovT = 58; }
    if (m === 'driver') { this.yaw = 0; this.pitch = -0.03; this.fovT = 66; }
    if (m === 'cinematic') { this.shotT = 99; this.fovT = 45; }
    if (this.bus?.driver) this.bus.driver.root.visible = m !== 'driver';
    this.post.settings.dof = m === 'cinematic' && this.autoDof; this.post.apply();
  }
  setRefView(n: number) { this.refView = n; if (!n) return; this.mode = 'free'; this.pos.set(n === 1 ? 1.8 : 2.4, n === 1 ? 2.2 : 2.5, -52); this.yaw = Math.PI; this.pitch = -0.02; this.fovT = 64; this.post.settings.dof = false; this.post.apply(); }
  cycleTime() { const o: TimePreset[] = ['noon', 'sunset', 'night']; this.setTime(o[(o.indexOf(this.atm.key) + 1) % 3]); }
  setTime(t: TimePreset) { this.atm.setPreset(t); this.audio?.setNight(t === 'night'); }
  nextShot() { this.shotT = 99; }
  honk() { this.audio?.honk(); }
  setQuality(k: string, v: boolean | number) {
    const s = this.post.settings as any;
    if (k in s) { s[k] = v; if (k === 'dof') this.autoDof = !!v; this.post.apply(); }
    if (k === 'reflections') { this.reflOn = !!v; this.refl.enabled = !!v; this.atm.wetU.useRefl.value = v ? 1 : 0; }
    if (k === 'shafts') { this.shaftsOn = !!v; this.atm.shafts.visible = !!v; }
    if (k === 'shadowRes') { const n = v as number; this.atm.sun.shadow.mapSize.set(n, n); this.atm.sun.shadow.map?.dispose(); (this.atm.sun.shadow as any).map = null; }
    if (k === 'exposure') this.post.exposure.exposure = v as number;
  }
  enableAudio() { if (!this.audio) { this.audio = new AudioCtx(); this.audio.setNight(this.atm.key === 'night'); } this.audio.resume(); }

  /* ---------------- bus scenario ---------------- */
  updateBus(dt: number) {
    const b = this.bus, g = b.group; this.busT -= dt; const s = this.busState; let target = b.speed;
    const d = g.position.z - STOP_Z;
    switch (s) {
      case 'away': b.speed = 0; b.indicator = 'none'; if (this.busT <= 0) { this.busState = 'approach'; g.position.set(3.4, 0, 120); b.speed = 11; this.audio?.honk(0.2); } break;
      case 'approach': {
        b.indicator = d < 55 ? 'right' : 'none'; const vDes = Math.min(11, Math.sqrt(2 * 1.7 * Math.max(0, d)) + 0.5); target = vDes; b.speed += THREE.MathUtils.clamp(target - b.speed, -2.4 * dt, 1.5 * dt); if (d < 0.3) b.speed = Math.min(b.speed, 0.3);
        const t = THREE.MathUtils.smoothstep(d, 4, 38); const nx = THREE.MathUtils.lerp(STOP_X, 3.35, t); const hx = (nx - g.position.x) / Math.max(1e-3, b.speed * dt || 1e-3); g.position.x += (nx - g.position.x) * Math.min(1, dt * 3.2); g.position.z -= b.speed * dt;
        const yawT = Math.atan2(-THREE.MathUtils.clamp(hx * 0.12, -0.12, 0.12), -1); g.rotation.y += (yawT + Math.PI - Math.PI - g.rotation.y) * Math.min(1, dt * 2.5); b.steer = THREE.MathUtils.clamp(-(nx - g.position.x) * 1.2 - 0.0, -1, 1) * -1;
        b.lookYaw += ((d < 25 ? -0.55 : 0.1) - b.lookYaw) * dt * 2; b.lever = 0;
        if (b.speed < 0.35 && d < 0.8) { this.busState = 'dock'; this.busT = 1.0; b.speed = 0; g.position.set(STOP_X, 0, STOP_Z); g.rotation.y = 0; b.steer = 0; this.audio?.brakeHiss(); }
        break;
      }
      case 'dock': b.speed = 0; b.steer = 0; b.lookYaw += (-0.7 - b.lookYaw) * dt * 3; if (this.busT < 0.5) b.lever = Math.min(1, b.lever + dt * 3); if (this.busT <= 0) { b.doorTarget = 1; this.audio?.doorHiss(); this.crowd.onDoorOpen(); this.busState = 'dwell'; this.busT = 9; this.smokeRate = 0; } break;
      case 'dwell': b.lever = Math.max(0, b.lever - dt * 2); b.lookYaw += ((Math.sin(this.time * 0.7) > 0.3 ? -0.6 : 0.35) - b.lookYaw) * dt * 1.5; if (this.busT <= 0 && !this.crowd.busy || this.busT < -22) { b.doorTarget = 0; this.crowd.onDoorClose(); this.audio?.doorHiss(); this.busState = 'closing'; this.busT = 2.4; b.lever = 1; } break;
      case 'closing': b.lever = Math.max(0, b.lever - dt * 0.6); b.indicator = 'left'; b.lookYaw += (-0.6 - b.lookYaw) * dt * 2; if (this.busT <= 0) { this.busState = 'depart'; this.busT = 0; b.speed = 0.01; } break;
      case 'depart': {
        b.indicator = 'left'; b.lookYaw += (0.45 - b.lookYaw) * dt * 2; b.speed += 1.8 * dt * (b.speed > 9 ? 0.2 : 1); const tx = THREE.MathUtils.lerp(STOP_X, 3.3, THREE.MathUtils.smoothstep(STOP_Z - g.position.z, 3, 22)); g.position.x += (tx - g.position.x) * Math.min(1, dt * 2.5); g.position.z -= b.speed * dt;
        g.rotation.y += (THREE.MathUtils.clamp((tx - g.position.x) * 0.2, -0.1, 0.1) - g.rotation.y) * dt * 2; b.steer = THREE.MathUtils.clamp((g.position.x - tx) * 0.8 - 0.2, -1, 1); this.smokeRate = Math.max(0, 16 - b.speed * 1.3);
        if (g.position.z < STOP_Z - 28) { b.indicator = 'none'; this.busState = 'leave'; } break;
      }
      case 'leave': b.steer *= 0.9; b.speed += 1.0 * dt * (b.speed > 11 ? 0 : 1); g.position.z -= b.speed * dt; g.rotation.y *= 0.97; this.smokeRate = Math.max(0, 6 - b.speed * 0.4); if (g.position.z < -150) { this.busState = 'away'; this.busT = 10; b.speed = 0; this.smokeRate = 0; g.position.z = 130; } break;
    }
    this.accel = (b.speed - this.prevSpeed) / Math.max(dt, 1e-4); this.prevSpeed = b.speed; this.accel = THREE.MathUtils.clamp(this.accel, -6, 4);
    b.brake = this.accel < -0.5 || (s === 'dock' || s === 'dwell') ? 1 : 0; b.update(dt, this.accel);
    const ex = new THREE.Vector3(); b.exhaust.getWorldPosition(ex); this.smoke.update(dt, ex, this.smokeRate + (b.speed < 0.5 && s !== 'away' ? 1.2 : 0), 0.4);
    this.audio?.engine(b.speed, g.position.distanceTo(this.camera.position), this.accel, b.indicator !== 'none');
  }

  /* ---------------- cameras ---------------- */
  updateCamera(dt: number) {
    const cam = this.camera; const k = (a: string) => this.keys.has(a);
    const look = () => { this.yaw -= this.mouseDX * 0.0022; this.pitch = THREE.MathUtils.clamp(this.pitch - this.mouseDY * 0.0022, -1.45, 1.45); this.mouseDX = this.mouseDY = 0; if (k('ArrowLeft')) this.yaw += dt * 1.6; if (k('ArrowRight')) this.yaw -= dt * 1.6; if (k('ArrowUp')) this.pitch = Math.min(1.4, this.pitch + dt * 1.2); if (k('ArrowDown')) this.pitch = Math.max(-1.4, this.pitch - dt * 1.2); };
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(-1).multiplyScalar(-1);
    right.set(Math.cos(this.yaw) * -1, 0, Math.sin(this.yaw)).multiplyScalar(-1);
    const sp = (k('ShiftLeft') ? 6.5 : 3.2) * dt;
    if (this.mode === 'walk' || this.mode === 'free') {
      look(); if (this.mode === 'free') this.refView = this.refView && (this.mouseDX || k('KeyW') || k('KeyS')) ? 0 : this.refView;
      const mv = new THREE.Vector3(); if (k('KeyW')) mv.add(fwd); if (k('KeyS')) mv.sub(fwd); if (k('KeyD')) mv.add(right); if (k('KeyA')) mv.sub(right);
      if (this.mode === 'free') { const f3 = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); mv.set(0, 0, 0); if (k('KeyW')) mv.add(f3); if (k('KeyS')) mv.sub(f3); if (k('KeyD')) mv.add(right); if (k('KeyA')) mv.sub(right); if (k('KeyE') || k('Space')) mv.y += 1; if (k('KeyQ') || k('KeyC')) mv.y -= 1; this.pos.addScaledVector(mv.normalize().multiplyScalar(k('ShiftLeft') ? 18 : 6), dt * (mv.lengthSq() ? 1 : 0)); this.pos.y = Math.max(0.3, this.pos.y); }
      else { if (mv.lengthSq()) { mv.normalize(); const np = this.pos.clone().addScaledVector(mv, sp * 1.0 * (1 / dt) * dt); let [x, z] = this.street.collide(np.x, np.z, 0.3); x = THREE.MathUtils.clamp(x, -12.2, 12.2); this.pos.x = x; this.pos.z = z; } this.pos.y = 1.7 + Math.sin(this.time * 9) * (mv.lengthSq() ? 0.025 : 0); this.collideBus(); }
      cam.position.copy(this.pos); cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); this.focus.set(this.pos.x, 0, this.pos.z); this.post.focus(Math.max(3, 12), 10);
    } else if (this.mode === 'driver') {
      look(); this.bus.driverEye.getWorldPosition(cam.position); this.tmpV.set(0, -0.06, -0.14).applyQuaternion(this.bus.group.quaternion); cam.position.add(this.tmpV); cam.position.y += this.bus.body.position.y;
      const yaw = this.bus.group.rotation.y + Math.PI + this.yaw - Math.PI; cam.rotation.set(this.pitch - 0.02 + this.bus.body.rotation.x, yaw + Math.PI * 0 + 0, this.bus.body.rotation.z, 'YXZ'); cam.rotation.y = this.bus.group.rotation.y + this.yaw; this.focus.copy(this.bus.group.position);
    } else if (this.mode === 'passenger') {
      look(); const p = this.passenger; if (p) { const hb = p.headBone as THREE.Object3D | undefined; if (hb) hb.getWorldPosition(cam.position); else cam.position.copy(p.group.getWorldPosition(this.tmpV)).setY(1.55); const py = p.group.getWorldQuaternion(new THREE.Quaternion()); const e = new THREE.Euler().setFromQuaternion(py, 'YXZ'); cam.position.y += 0.04; cam.rotation.set(this.pitch, e.y + this.yaw - Math.PI + (p.lookYaw || 0) * 0.5, 0, 'YXZ'); cam.position.addScaledVector(new THREE.Vector3(Math.sin(e.y), 0, Math.cos(e.y)), 0.12); this.focus.copy(p.group.getWorldPosition(new THREE.Vector3())); }
    } else this.updateCinematic(dt);
    cam.fov += (this.fovT - cam.fov) * Math.min(1, dt * 3); cam.updateProjectionMatrix();
  }

  collideBus() {
    const g = this.bus.group.position; if (this.bus.group.position.z > 100 || g.z < -100) return; const x0 = g.x - 1.35, x1 = g.x + 1.35, z0 = g.z - 5.7, z1 = g.z + 5.7; const doorOpen = this.bus.door > 0.8; const p = this.pos;
    if (p.x > x0 - 0.3 && p.x < x1 + 0.3 && p.z > z0 - 0.3 && p.z < z1 + 0.3) { const dz = g.z + DOOR_Z; if (doorOpen && Math.abs(p.z - dz) < 0.5 && p.x > x1 - 0.4) return; if (p.x > g.x) p.x = x1 + 0.3; else p.x = x0 - 0.3; }
  }

  shots(): { name: string; dur: number; fn: (t: number, u: number) => [THREE.Vector3, THREE.Vector3, number, number] }[] {
    const bp = this.bus.group.position; const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z); const L = THREE.MathUtils.lerp;
    const doorW = () => this.bus.group.localToWorld(V(1.3, 1.5, DOOR_Z));
    const drv = () => this.bus.group.localToWorld(V(-0.62, 1.95, -4.4));
    const A = { name: 'Toàn cảnh trên cao', dur: 10, fn: (_t: number, u: number) => [V(L(34, 20, u), L(34, 15, u), L(78, 40, u)), V(6, 2.5, L(-4, 4, u)), 38, 40] as [THREE.Vector3, THREE.Vector3, number, number] };
    const B = { name: 'Hạ xuống qua tán cây & dây điện', dur: 9, fn: (_t: number, u: number) => [V(L(14, 11.5, u), L(10, 3.6, u), L(46, 17, u)), V(8, L(3.5, 1.7, u), 0), 42, 22] as [THREE.Vector3, THREE.Vector3, number, number] };
    const C = { name: 'Dolly ngang đám đông chờ xe', dur: 9, fn: (_t: number, u: number) => [V(6.85, 1.45, L(8, -4.5, u)), V(8.2, 1.35, L(4, -8, u)), 44, 7.5] as [THREE.Vector3, THREE.Vector3, number, number] };
    const D = { name: 'Cận bánh xe cán vũng nước', dur: 8, fn: (_t: number, _u: number) => [V(2.7, 0.42, bp.z + 13), V(4.3, 0.45, bp.z + 1.5), 52, 9] as [THREE.Vector3, THREE.Vector3, number, number] };
    const E = { name: 'Lấy nét tài xế · mở cửa đón khách', dur: 9, fn: (_t: number, u: number) => { const d = drv(); const p = this.bus.group.localToWorld(V(L(2.6, 2.2, u), L(1.75, 1.95, u), L(-2.9, -3.3, u))); return [p, d, 46, p.distanceTo(d)] as [THREE.Vector3, THREE.Vector3, number, number]; } };
    const F = { name: 'Hành khách bước lên xe', dur: 8, fn: (_t: number, u: number) => { const d = doorW(); return [V(L(8.4, 7.4, u), 1.2, d.z + L(3.4, 2.2, u)), V(d.x, 1.0, d.z), 38, 7] as [THREE.Vector3, THREE.Vector3, number, number]; } };
    const G = { name: 'Xe rời bến · khói pô', dur: 8, fn: (_t: number, _u: number) => [V(11.3, 2.3, STOP_Z + 5), bp.clone().add(V(0, 1.4, 0)), 36, bp.distanceTo(V(11.3, 2.3, STOP_Z + 5))] as [THREE.Vector3, THREE.Vector3, number, number] };
    const H = { name: 'Xe tấp vào bến', dur: 9, fn: (_t: number, u: number) => [V(L(2.0, 1.2, u), 1.6, bp.z + L(18, 14, u)), bp.clone().add(V(0, 1.6, -2)), 40, bp.distanceTo(V(2, 1.6, bp.z + 16))] as [THREE.Vector3, THREE.Vector3, number, number] };
    switch (this.busState) { case 'approach': return this.shotCount % 2 ? [D, H, A, B] : [A, H, D, B]; case 'dock': case 'dwell': return this.shotCount % 2 ? [E, F, C] : [C, E, F]; case 'closing': case 'depart': return [G, B, A]; default: return [A, B, C]; }
  }
  shotCount = 0;
  updateCinematic(dt: number) {
    this.shotT += dt; const list = this.shots(); let shot = list[this.shotIdx % list.length]; if (this.shotT > shot.dur) { this.shotT = 0; this.shotIdx++; this.shotCount++; shot = list[this.shotIdx % list.length]; }
    const u = THREE.MathUtils.clamp(this.shotT / shot.dur, 0, 1); const e = u * u * (3 - 2 * u) * 0.6 + u * 0.4; const [p, l, fov, focus] = shot.fn(this.shotT, e); this.shotName = shot.name;
    const k = this.shotT < 0.05 ? 1 : Math.min(1, dt * 3.5); this.camP.lerp(p, k); this.camL.lerp(l, k); this.camera.position.copy(this.camP); this.camera.lookAt(this.camL);
    this.camera.position.x += Math.sin(this.time * 0.7) * 0.02; this.camera.position.y += Math.sin(this.time * 1.1) * 0.015; this.fovT = fov; this.focus.set(this.camera.position.x * 0.5 + l.x * 0.5, 0, this.camera.position.z * 0.5 + l.z * 0.5);
    this.post.focus(focus, Math.max(3, focus * 0.9)); this.post.dof.bokehScale = 3.4;
  }

  /* ---------------- main loop ---------------- */
  qLevel = 0; qT = 0;
  adapt(dt: number) {
    this.qT += dt; if (this.qT < 5) return; this.qT = 0; if (this.fps >= 30 || this.qLevel >= 3) return; this.qLevel++;
    if (this.qLevel === 1) { this.setQuality('motion', false); this.setQuality('chroma', false); this.setQuality('dof', false); }
    if (this.qLevel === 2) { this.setQuality('shadowRes', Math.min(this.atm.sun.shadow.mapSize.x, 2048)); this.refl.scale = 0.35; this.resize(); }
    if (this.qLevel === 3) { this.setQuality('ao', false); this.setQuality('reflections', false); this.renderer.setPixelRatio(Math.min(this.renderer.getPixelRatio(), 1)); this.resize(); }
  }
  loop = () => {
    if (this.disposed) return; this.raf = requestAnimationFrame(this.loop);
    const elapsed = this.clock.getDelta(); const dt = Math.min(0.05, elapsed); this.time += dt; this.fpsAcc += elapsed; this.fpsN++; if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    this.updateBus(dt); this.crowd.updateWaiters(dt); this.crowd.update(dt, this.camera.position); this.traffic.update(dt, this.camera.position); this.updateCamera(dt);
    this.street.update(dt, this.time, this.atm.cur.wet);
    this.atm.update(dt, this.camera.position, this.focus, this.time);
    this.post.motion.strength = this.mode === 'cinematic' || this.mode === 'driver' ? 0.55 : 0.35;
    const gl=this.renderer.getContext() as WebGL2RenderingContext;
    if(this.gpuFence){if(gl.clientWaitSync(this.gpuFence,0,0)===gl.TIMEOUT_EXPIRED)return;gl.deleteSync(this.gpuFence);this.gpuFence=null;}
    this.renderer.info.reset();
    if (this.atm.cur.wet > 0.001) this.refl.render(this.renderer, this.scene, this.camera);
    this.post.render(dt); if (this.time > 8) this.adapt(dt);
    if(this.lowPower){this.gpuFence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();}
    this.audio?.update(this.atm.cur.rain, this.camera.position);
    this.hudT += dt; if (this.hudT > 0.25) { this.hudT = 0; const i = this.renderer.info.render; this.hud = { fps: this.fps, mode: this.mode, time: this.atm.key, busState: STATE_TEXT[this.busState], busSpeed: this.bus.speed * 3.6, shot: this.mode === 'cinematic' ? this.shotName : '', tris: i.triangles, calls: i.calls, loaded: 1, label: this.atm.cur.label, grade: this.atm.cur.grade, people: this.crowd.all.length + this.traffic.vs.filter((v) => v.rider).length, ready: true }; this.onHud?.(this.hud); }
  };

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf); window.removeEventListener('resize', this.resize); window.removeEventListener('keydown', this.kd); window.removeEventListener('keyup', this.ku);
    this.audio?.close(); this.post.composer.dispose(); this.scene.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => { Object.values(m).forEach((v: any) => v?.isTexture && v.dispose()); m.dispose(); }); });
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}

/* ---------------- procedural audio (Web Audio) ---------------- */
class AudioCtx {
  ctx = new AudioContext(); master = this.ctx.createGain(); city!: GainNode; rain!: GainNode; eng!: GainNode; engOsc!: OscillatorNode; engF!: BiquadFilterNode; birds!: GainNode; lastTick = 0;
  constructor() {
    this.master.gain.value = 0.55; this.master.connect(this.ctx.destination);
    const noise = (type: 'brown' | 'white') => { const len = this.ctx.sampleRate * 3; const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = b.getChannelData(0); let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; } const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true; s.start(); return s; };
    const mk = (n: AudioBufferSourceNode, type: BiquadFilterType, f: number, g: number) => { const fl = this.ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; const gn = this.ctx.createGain(); gn.gain.value = g; n.connect(fl).connect(gn).connect(this.master); return gn; };
    this.city = mk(noise('brown'), 'lowpass', 600, 0.55); this.rain = mk(noise('white'), 'highpass', 2500, 0); this.birds = mk(noise('white'), 'bandpass', 5200, 0.012);
    this.engOsc = this.ctx.createOscillator(); this.engOsc.type = 'sawtooth'; this.engOsc.frequency.value = 40; this.engF = this.ctx.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 220; this.eng = this.ctx.createGain(); this.eng.gain.value = 0; this.engOsc.connect(this.engF).connect(this.eng).connect(this.master); this.engOsc.start();
    // cicada-like warble on noon
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 14; const lg = this.ctx.createGain(); lg.gain.value = 0.01; lfo.connect(lg).connect(this.birds.gain); lfo.start();
  }
  resume() { if (this.ctx.state !== 'running') this.ctx.resume(); }
  close() { this.ctx.close(); }
  setNight(n: boolean) { this.birds.gain.value = n ? 0 : 0.012; }
  update(rain: number, _p: THREE.Vector3) { this.rain.gain.value += (rain * 0.16 - this.rain.gain.value) * 0.02; }
  engine(speed: number, dist: number, accel: number, ind: boolean) {
    const vol = Math.max(0, 1 - dist / 90) * 0.5; this.eng.gain.value += ((0.05 + Math.min(1, speed / 12) * 0.28 + Math.max(0, accel) * 0.03) * vol - this.eng.gain.value) * 0.1; this.engOsc.frequency.value = 38 + speed * 4 + Math.max(0, accel) * 4; this.engF.frequency.value = 180 + speed * 22;
    if (ind && dist < 40) { const t = this.ctx.currentTime; if (t - this.lastTick > 0.385) { this.lastTick = t; this.click(); } }
  }
  click() { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.frequency.value = 1900; g.gain.setValueAtTime(0.06, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.03); o.connect(g).connect(this.master); o.start(); o.stop(this.ctx.currentTime + 0.04); }
  burst(dur: number, f: number, gain: number, q = 0.7) { const len = this.ctx.sampleRate * dur; const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6); const s = this.ctx.createBufferSource(); s.buffer = b; const fl = this.ctx.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = f; fl.Q.value = q; const g = this.ctx.createGain(); g.gain.value = gain; s.connect(fl).connect(g).connect(this.master); s.start(); }
  doorHiss() { this.burst(1.1, 2400, 0.55); }
  brakeHiss() { this.burst(1.6, 1800, 0.4); }
  horn() { this.honk(0.12); } honk(g = 0.2) { for (const f of [415, 520]) { const o = this.ctx.createOscillator(), gg = this.ctx.createGain(); o.type = 'square'; o.frequency.value = f; gg.gain.setValueAtTime(g * 0.4, this.ctx.currentTime); gg.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.5); const fl = this.ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1400; o.connect(fl).connect(gg).connect(this.master); o.start(); o.stop(this.ctx.currentTime + 0.55); } }
}
