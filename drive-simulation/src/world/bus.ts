import * as THREE from 'three';
import { makeBusLivery, makeLED, makeGlow, makeConcrete } from '../engine/textures';
import { loadDriver, poseDriver, type DriverRig } from './driver';

const BOX = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, cast = true) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; return o; };
const CYL = (r: number, h: number, m: THREE.Material, seg = 12) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m); o.castShadow = true; return o; };

export const BUS_LEN = 11.2, DOOR_Z = -4.1, FLOOR_Y = 0.78;

export interface Spot { local: THREE.Vector3; taken: boolean; yaw: number }

export class Bus {
  group = new THREE.Group(); body = new THREE.Group();
  wheels: THREE.Mesh[] = []; steerPivots: THREE.Group[] = [];
  leafA = new THREE.Group(); leafB = new THREE.Group(); door = 0; doorTarget = 0;
  indMats: { r: THREE.MeshStandardMaterial[]; l: THREE.MeshStandardMaterial[] } = { r: [], l: [] };
  brakeMat!: THREE.MeshStandardMaterial; headMat!: THREE.MeshStandardMaterial; ledMat!: THREE.MeshStandardMaterial; cabinMat!: THREE.MeshStandardMaterial;
  headSpots: THREE.SpotLight[] = []; beams: THREE.Mesh[] = []; cabin = new THREE.PointLight('#fff2d8', 0, 7, 1.6);
  driver: DriverRig | null = null; wheelSteer = new THREE.Group(); wheelSpin = new THREE.Group();
  seats: Spot[] = []; stand: THREE.Vector3[] = []; indicator: 'none' | 'right' | 'left' = 'none'; hazard = false;
  speed = 0; wheelAngle = 0; pitch = 0; pitchV = 0; roll = 0; rollV = 0; bounce = 0; bounceV = 0; lastSpeed = 0; steer = 0; steerVis = 0;
  lookYaw = 0; lever = 0; time = 0; brake = 0; night = 0;
  exhaust = new THREE.Object3D(); driverEye = new THREE.Object3D(); doorCam = new THREE.Object3D();

  constructor(public envMapIntensity = 1.2) {
    const g = this.group; g.add(this.body);
    const livery = makeBusLivery();
    const paintW = new THREE.MeshPhysicalMaterial({ color: '#eef0f2', roughness: 0.34, metalness: 0.12, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: this.envMapIntensity });
    const paintL = new THREE.MeshPhysicalMaterial({ map: livery, roughness: 0.34, metalness: 0.12, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: this.envMapIntensity });
    const paintLm = paintL.clone(); paintLm.map = livery.clone(); paintLm.map.wrapS = THREE.RepeatWrapping; paintLm.map.repeat.x = -1; paintLm.map.offset.x = 1; paintLm.map.needsUpdate = true;
    const dark = new THREE.MeshStandardMaterial({ color: '#17181a', roughness: 0.6, metalness: 0.2 });
    const rubber = new THREE.MeshStandardMaterial({ color: '#0e0e0f', roughness: 0.92 });
    const inox = new THREE.MeshStandardMaterial({ color: '#d4d8dc', roughness: 0.28, metalness: 1, envMapIntensity: 1.4 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#7f9aa4', roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.8, clearcoat: 1 });
    const floorM = new THREE.MeshStandardMaterial({ color: '#2d2f31', roughness: 0.85, map: makeConcrete('#444', 8).map }); floorM.map!.repeat.set(3, 12);
    const seatBlue = new THREE.MeshStandardMaterial({ color: '#1f5fa5', roughness: 0.75 }); const seatGrey = new THREE.MeshStandardMaterial({ color: '#8b9096', roughness: 0.6 });
    const b = this.body;
    // skirt (livery) segments: front, door gap, rear; left side full
    const skirtH = 0.9, skirtY = 0.35 + skirtH / 2;
    const seg = (len: number, z: number) => {
      const mats = [paintL, paintLm, paintW, dark, paintW, paintW]; const o = new THREE.Mesh(new THREE.BoxGeometry(2.5, skirtH, len), mats); o.position.set(0, skirtY, z); o.castShadow = true; o.receiveShadow = true; b.add(o);
      return o;
    };
    seg(0.9, -5.15); seg(9.1, 1.05);
    // left side of door gap segment (x<0 half) so the interior is closed on the driver's side
    b.add(BOX(0.12, skirtH, 1.2, paintLm.clone(), -1.19, skirtY, -4.1));
    // vestibule & step
    b.add(BOX(2.3, 0.1, 1.2, floorM, 0, FLOOR_Y - 0.05, -4.1, false)); b.add(BOX(0.5, 0.1, 1.2, new THREE.MeshStandardMaterial({ color: '#3a3b3d', roughness: 0.7 }), 1.36, 0.34, -4.1));
    const stripe = BOX(0.5, 0.012, 1.2, new THREE.MeshStandardMaterial({ color: '#f2c200', roughness: 0.6 }), 1.36, 0.395, -4.1, false); stripe.scale.set(1, 1, 1); b.add(stripe);
    b.add(BOX(0.04, 0.4, 1.2, dark, 1.14, 0.58, -4.1)); // riser inside
    // underbody
    b.add(BOX(2.3, 0.3, BUS_LEN - 0.4, dark, 0, 0.42, 0));
    // floor
    b.add(BOX(2.3, 0.08, 9.6, floorM, 0, FLOOR_Y - 0.04, 0.9, false));
    // roof (rounded profile extruded)
    const sh = new THREE.Shape(); sh.moveTo(-1.25, 0); sh.lineTo(1.25, 0); sh.lineTo(1.25, 0.24); sh.quadraticCurveTo(1.25, 0.52, 0.85, 0.54); sh.lineTo(-0.85, 0.54); sh.quadraticCurveTo(-1.25, 0.52, -1.25, 0.24); sh.closePath();
    const rg = new THREE.ExtrudeGeometry(sh, { depth: BUS_LEN - 0.1, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.06, bevelSegments: 3, curveSegments: 10 }); rg.translate(0, 0, -(BUS_LEN - 0.1) / 2);
    const roof = new THREE.Mesh(rg, paintW); roof.position.y = 2.55; roof.castShadow = true; roof.receiveShadow = true; b.add(roof);
    b.add(BOX(1.5, 0.22, 2.4, new THREE.MeshStandardMaterial({ color: '#cfd3d6', roughness: 0.5, metalness: 0.4 }), 0, 3.16, 2.5)); // AC unit
    // pillars + window glass on both sides
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 9; i++) { const z = -3.2 + i * 1.07; b.add(BOX(0.08, 1.35, 0.1, dark, sx * 1.24, 1.92, z)); }
      b.add(BOX(0.08, 1.35, 0.1, dark, sx * 1.24, 1.92, -5.45)); b.add(BOX(0.1, 0.07, BUS_LEN - 0.4, dark, sx * 1.24, 1.27, 0)); b.add(BOX(0.1, 0.07, BUS_LEN - 0.4, dark, sx * 1.24, 2.58, 0));
      if (sx === -1) { const gl = new THREE.Mesh(new THREE.PlaneGeometry(BUS_LEN - 0.6, 1.3), glass); gl.rotation.y = -Math.PI / 2; gl.position.set(-1.245, 1.92, 0); gl.renderOrder = 2; b.add(gl); }
      else { const gl = new THREE.Mesh(new THREE.PlaneGeometry(BUS_LEN - 2.4, 1.3), glass); gl.rotation.y = Math.PI / 2; gl.position.set(1.245, 1.92, 1.25); gl.renderOrder = 2; b.add(gl); const gl2 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.3), glass); gl2.rotation.y = Math.PI / 2; gl2.position.set(1.245, 1.92, -5.2); b.add(gl2); }
    }
    // door header & jambs
    b.add(BOX(0.12, 0.35, 1.3, paintW, 1.22, 2.4, -4.1)); b.add(BOX(0.08, 2.2, 0.06, inox, 1.24, 1.45, -4.74)); b.add(BOX(0.08, 2.2, 0.06, inox, 1.24, 1.45, -3.46));
    // door leaves (bi-fold swing)
    const leaf = (dir: number) => {
      const p = new THREE.Group(); const f = new THREE.Group();
      f.add(BOX(0.04, 2.0, 0.62, dark, 0, 0, dir * 0.31)); const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 1.85), glass); gl.rotation.y = Math.PI / 2; gl.position.set(0.021, 0.02, dir * 0.31); f.add(gl);
      f.add(BOX(0.05, 0.1, 0.6, inox, 0.02, -0.62, dir * 0.31)); p.add(f); f.position.y = 1.45; return p;
    };
    this.leafA = leaf(1); this.leafA.position.set(1.25, 0, -4.7); this.leafB = leaf(-1); this.leafB.position.set(1.25, 0, -3.5); b.add(this.leafA, this.leafB);
    // front fascia
    b.add(BOX(2.5, 0.9, 0.3, paintW, 0, skirtY, -5.45)); b.add(BOX(2.5, 0.22, 0.34, dark, 0, 0.5, -5.45)); // bumper
    const grille = BOX(1.3, 0.34, 0.04, new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.5, metalness: 0.5 }), 0, 0.98, -5.62); b.add(grille);
    for (let i = 0; i < 6; i++) b.add(BOX(1.28, 0.012, 0.05, inox, 0, 0.84 + i * 0.056, -5.64));
    this.headMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff4d0', emissiveIntensity: 0.4, roughness: 0.1, metalness: 0.3 });
    for (const sx of [-1, 1]) { const hl = BOX(0.52, 0.2, 0.06, this.headMat, sx * 0.9, 0.82, -5.62); b.add(hl); }
    const mkInd = (x: number, y: number, z: number, side: 'r' | 'l', s = [0.22, 0.1, 0.05]) => { const m = new THREE.MeshStandardMaterial({ color: '#f59e0b', emissive: '#ff9a00', emissiveIntensity: 0, roughness: 0.3 }); this.indMats[side].push(m); b.add(BOX(s[0], s[1], s[2], m, x, y, z, false)); };
    mkInd(1.12, 1.08, -5.63, 'r'); mkInd(-1.12, 1.08, -5.63, 'l'); mkInd(1.12, 1.0, 5.63, 'r'); mkInd(-1.12, 1.0, 5.63, 'l'); mkInd(1.262, 1.1, -4.9, 'r', [0.04, 0.1, 0.2]); mkInd(-1.262, 1.1, -4.9, 'l', [0.04, 0.1, 0.2]);
    // windshield (two panes) + wipers
    for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 1.32), glass); w.position.set(sx * 0.61, 1.92, -5.59); w.rotation.x = 0.07; w.renderOrder = 2; b.add(w); }
    b.add(BOX(0.06, 1.35, 0.08, dark, 0, 1.92, -5.6)); b.add(BOX(2.5, 0.06, 0.08, dark, 0, 1.25, -5.6)); b.add(BOX(0.06, 1.35, 0.08, dark, -1.25, 1.92, -5.6)); b.add(BOX(0.06, 1.35, 0.08, dark, 1.25, 1.92, -5.6));
    for (const sx of [-0.7, 0.3]) { const wp = BOX(0.8, 0.02, 0.03, dark, sx, 1.36, -5.55, false); wp.rotation.z = 0.15; b.add(wp); }
    // LED destination boards
    this.ledMat = new THREE.MeshStandardMaterial({ map: makeLED('06', 'CHỢ LỚN – NÔNG LAM'.replace('LAM', 'LÂM')), emissiveMap: null, emissive: '#ffffff', emissiveIntensity: 1.6, roughness: 0.4, color: '#000' });
    this.ledMat.emissiveMap = this.ledMat.map; this.ledMat.color.set('#222');
    b.add(BOX(2.0, 0.34, 0.06, dark, 0, 2.72, -5.58)); const led = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.26), this.ledMat); led.position.set(0, 2.72, -5.615); led.rotation.y = Math.PI; led.scale.x = -1; b.add(led);
    const ledSide = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.2), this.ledMat); ledSide.position.set(1.256, 2.35, -2.2); ledSide.rotation.y = Math.PI / 2; b.add(ledSide);
    // plate
    const plate = BOX(0.5, 0.12, 0.02, new THREE.MeshStandardMaterial({ color: '#f5f5ee', roughness: 0.5 }), 0, 0.55, -5.63); b.add(plate);
    // rear
    b.add(BOX(2.5, 2.2, 0.2, paintW, 0, 1.45, 5.5));
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.7), glass); rw.position.set(0, 2.0, 5.605); rw.rotation.y = Math.PI; b.add(rw);
    this.brakeMat = new THREE.MeshStandardMaterial({ color: '#7f1010', emissive: '#ff1010', emissiveIntensity: 0.25, roughness: 0.3 });
    for (const sx of [-1, 1]) b.add(BOX(0.2, 0.5, 0.05, this.brakeMat, sx * 1.12, 1.45, 5.61));
    b.add(BOX(0.5, 0.12, 0.02, new THREE.MeshStandardMaterial({ color: '#f5f5ee' }), 0, 0.75, 5.61));
    const pipe = CYL(0.06, 0.5, inox); pipe.rotation.x = Math.PI / 2; pipe.position.set(-0.8, 0.52, 5.7); b.add(pipe); this.exhaust.position.set(-0.8, 0.5, 5.95); b.add(this.exhaust);
    // wheels
    const tireG = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 28).rotateZ(Math.PI / 2); const rimG = new THREE.CylinderGeometry(0.3, 0.3, 0.32, 20).rotateZ(Math.PI / 2);
    const rimM = new THREE.MeshStandardMaterial({ color: '#b9bec4', roughness: 0.3, metalness: 1 });
    for (const [wx, wz, _front] of [[-1.18, -3.0, true], [1.18, -3.0, true], [-1.18, 3.3, false], [1.18, 3.3, false]] as [number, number, boolean][]) {
      const piv = new THREE.Group(); piv.position.set(wx, 0.5, wz); g.add(piv); this.steerPivots.push(piv);
      const tire = new THREE.Mesh(tireG, rubber); tire.castShadow = true; const rim = new THREE.Mesh(rimG, rimM); tire.add(rim);
      for (let i = 0; i < 8; i++) { const bolt = CYL(0.018, 0.34, dark, 6); bolt.rotation.z = Math.PI / 2; bolt.position.set(0, Math.cos(i * 0.785) * 0.2, Math.sin(i * 0.785) * 0.2); tire.add(bolt); }
      piv.add(tire); this.wheels.push(tire);
      const arch = CYL(0.6, 0.02, dark, 24); arch.rotation.z = Math.PI / 2; arch.position.set(wx > 0 ? 1.257 : -1.257, 0.5, wz); arch.castShadow = false; b.add(arch);
    }
    // mirrors with long arms
    const mirrM = new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.03, metalness: 1, envMapIntensity: 2 });
    for (const sx of [-1, 1]) { const arm = CYL(0.012, 0.42, inox, 6); arm.rotation.z = Math.PI / 2; arm.position.set(sx * 1.45, 2.34, -5.4); b.add(arm); const arm2 = CYL(0.012, 0.9, inox, 6); arm2.position.set(sx * 1.65, 2.0, -5.4); b.add(arm2); b.add(BOX(0.05, 0.42, 0.24, dark, sx * 1.68, 1.98, -5.4)); const mm = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.4), mirrM); mm.position.set(sx * 1.68, 1.98, -5.275); b.add(mm); const cm = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), mirrM); cm.position.set(sx * 1.52, 2.4, -5.62); b.add(cm); }
    // interior
    const cushG = new THREE.BoxGeometry(0.44, 0.08, 0.42), backG = new THREE.BoxGeometry(0.44, 0.52, 0.07), baseG = new THREE.BoxGeometry(0.4, 0.34, 0.36);
    const seatPos: [number, number][] = []; const rows = 9;
    for (let i = 0; i < rows; i++) { const z = -2.5 + i * 0.84; seatPos.push([-0.92, z], [-0.47, z]); if (i > 0) seatPos.push([0.9, z]); }
    seatPos.push([-0.9, 5.0], [-0.45, 5.0], [0, 5.0], [0.45, 5.0], [0.9, 5.0]);
    const cush = new THREE.InstancedMesh(cushG, seatBlue, seatPos.length), back = new THREE.InstancedMesh(backG, seatBlue, seatPos.length), base = new THREE.InstancedMesh(baseG, seatGrey, seatPos.length);
    const m4 = new THREE.Matrix4();
    seatPos.forEach(([x, z], i) => {
      const rear = z > 4.9; m4.makeTranslation(x, FLOOR_Y + 0.4, z); cush.setMatrixAt(i, m4); m4.makeTranslation(x, FLOOR_Y + 0.65, z + (rear ? -0.17 * -1 : 0.2) * (rear ? -1 : 1)); back.setMatrixAt(i, m4); m4.makeTranslation(x, FLOOR_Y + 0.17, z); base.setMatrixAt(i, m4);
      if (x > 0.5 && z < 4.9 || (x < 0 && z > 0 && z < 4.9 && Math.random() < 0.5)) this.seats.push({ local: new THREE.Vector3(x, FLOOR_Y + 0.4, z), taken: false, yaw: Math.PI });
    });
    for (const m of [cush, back, base]) { m.castShadow = true; m.receiveShadow = true; b.add(m); }
    // poles & rails
    for (let i = 0; i < rows; i++) for (const x of [-0.2, 0.32]) { const p = CYL(0.018, 1.75, inox, 8); p.position.set(x, FLOOR_Y + 0.88, -2.5 + i * 0.84 + 0.42); b.add(p); }
    for (const x of [-0.2, 0.32]) { const r = CYL(0.016, 9.5, inox, 8); r.rotation.x = Math.PI / 2; r.position.set(x, 2.45, 1); b.add(r); }
    const pole = CYL(0.02, 1.9, new THREE.MeshStandardMaterial({ color: '#f2c200', roughness: 0.4, metalness: 0.4 }), 8); pole.position.set(0.95, FLOOR_Y + 0.95, -3.3); b.add(pole);
    for (let i = 0; i < 14; i++) { const st = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), new THREE.MeshStandardMaterial({ color: i % 2 ? '#2a6fb5' : '#d8d8d8', roughness: 0.6 })); st.position.set(i % 2 ? 0.32 : -0.2, 2.28, -2.8 + i * 0.7); st.rotation.y = Math.PI / 2; b.add(st); }
    this.cabinMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff4dc', emissiveIntensity: 0.5, roughness: 0.4 });
    for (const x of [-0.55, 0.55]) b.add(BOX(0.18, 0.02, 9, this.cabinMat, x, 2.5, 0.9, false));
    this.cabin.position.set(0, 2.2, 0); b.add(this.cabin);
    // cab: partition, dashboard, seat, steering wheel
    b.add(BOX(0.04, 1.2, 0.5, new THREE.MeshStandardMaterial({ color: '#cfd3d6', roughness: 0.5 }), -0.06, 1.55, -4.5)); const part = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), glass); part.rotation.y = Math.PI / 2; part.position.set(-0.04, 1.9, -3.9); b.add(part);
    b.add(BOX(1.15, 0.2, 5.0 > 0 ? 1.1 : 1, floorM, -0.62, 0.9, -4.7, false)); // raised cab floor top at 1.0
    const dashM = new THREE.MeshStandardMaterial({ color: '#25282b', roughness: 0.55 }); b.add(BOX(2.2, 0.32, 0.5, dashM, -0.1, 1.55, -5.25)); b.add(BOX(0.7, 0.2, 0.3, dashM, -0.62, 1.78, -5.12));
    const cluster = BOX(0.36, 0.14, 0.02, new THREE.MeshStandardMaterial({ color: '#0a1a14', emissive: '#27d37a', emissiveIntensity: 0.9, roughness: 0.3 }), -0.62, 1.84, -4.97); cluster.rotation.x = -0.35; b.add(cluster);
    const seatD = new THREE.MeshStandardMaterial({ color: '#2a2d31', roughness: 0.8 });
    b.add(BOX(0.52, 0.09, 0.5, seatD, -0.62, 1.37, -4.18)); b.add(BOX(0.5, 0.62, 0.1, seatD, -0.62, 1.7, -3.9)); b.add(BOX(0.28, 0.2, 0.08, seatD, -0.62, 2.1, -3.88)); b.add(BOX(0.3, 0.32, 0.3, dark, -0.62, 1.18, -4.18));
    this.wheelSteer.position.set(-0.62, 1.8, -4.88); this.wheelSteer.rotation.x = -0.55; this.wheelSteer.add(this.wheelSpin);
    const tor = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.019, 10, 28), new THREE.MeshStandardMaterial({ color: '#16181a', roughness: 0.6 })); tor.castShadow = true; this.wheelSpin.add(tor);
    for (let i = 0; i < 3; i++) { const sp = BOX(0.2, 0.02, 0.02, dark, 0, 0, 0); sp.position.set(Math.cos(i * 2.094 - 1.57) * 0.1, Math.sin(i * 2.094 - 1.57) * 0.1, 0); sp.rotation.z = i * 2.094 - 1.57; this.wheelSpin.add(sp); }
    this.wheelSpin.add(CYL(0.05, 0.04, dark, 14)); (this.wheelSpin.children[this.wheelSpin.children.length - 1] as THREE.Mesh).rotation.x = Math.PI / 2; b.add(this.wheelSteer);
    const lever = BOX(0.03, 0.03, 0.2, inox, 0.18, 1.55, -4.7); b.add(lever);
    this.driverEye.position.set(-0.62, 2.35, -4.1); b.add(this.driverEye); this.doorCam.position.set(2.2, 1.9, -3.2); b.add(this.doorCam);
    // headlights spots + beam cones
    const beamTex = makeGlow('rgba(255,244,214,0.55)', 'rgba(255,244,214,0)', 128);
    for (const sx of [-0.9, 0.9]) {
      const sp = new THREE.SpotLight('#fff1d0', 0, 60, 0.42, 0.6, 1.4); sp.position.set(sx, 0.85, -5.6); const tg = new THREE.Object3D(); tg.position.set(sx * 0.7, 0.2, -30); b.add(sp, tg); sp.target = tg; this.headSpots.push(sp);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 14, 20, 1, true).translate(0, -7, 0).rotateX(-Math.PI / 2 - 0.05), new THREE.MeshBasicMaterial({ map: beamTex, color: '#ffeccc', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      cone.position.set(sx, 0.85, -5.7); cone.rotation.x = 0; this.beams.push(cone); b.add(cone);
    }
    // contact shadow blob
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 12.4), new THREE.MeshBasicMaterial({ map: makeGlow('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)', 128), transparent: true, depthWrite: false, opacity: 0.55 })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; g.add(blob);
    g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const mm = m.material as THREE.MeshStandardMaterial; if (mm && 'envMapIntensity' in mm && mm.envMapIntensity === 1) mm.envMapIntensity = 1.1; } });
    // driver
    loadDriver(`${import.meta.env.BASE_URL}models/taixe.glb`).then((d) => { if (!d) return; this.driver = d; d.root.position.set(-0.62, 0.64 + 0.0, -4.16); d.root.rotation.y = Math.PI; this.body.add(d.root); });
  }

  setNight(n: number) {
    this.night = n; this.headMat.emissiveIntensity = 0.3 + n * 4; this.cabin.intensity = n * 14; this.cabinMat.emissiveIntensity = 0.35 + n * 3.2;
    this.headSpots.forEach((s) => (s.intensity = n * 260)); this.beams.forEach((b) => ((b.material as THREE.MeshBasicMaterial).opacity = n * 0.35));
  }

  update(dt: number, accel: number) {
    this.time += dt;
    // door
    this.door += (this.doorTarget - this.door) * Math.min(1, dt * 2.6); const d = THREE.MathUtils.clamp(this.door, 0, 1);
    this.leafA.rotation.y = d * 1.45; this.leafB.rotation.y = -d * 1.45;
    // suspension (spring-damper) driven by longitudinal accel + steering
    const pt = THREE.MathUtils.clamp(accel * 0.0075, -0.045, 0.03);
    this.pitchV += (-46 * (this.pitch - pt) - 6.5 * this.pitchV) * dt; this.pitch += this.pitchV * dt;
    const rt = -this.steer * Math.min(1, this.speed / 8) * 0.045 - d * 0.012;
    this.rollV += (-52 * (this.roll - rt) - 6 * this.rollV) * dt; this.roll += this.rollV * dt;
    this.bounceV += (-90 * (this.bounce - (Math.abs(this.speed) > 0.5 ? Math.sin(this.time * 17) * 0.002 : Math.sin(this.time * 38) * 0.0012)) - 9 * this.bounceV) * dt; this.bounce += this.bounceV * dt;
    this.body.rotation.set(this.pitch, 0, this.roll); this.body.position.y = this.bounce - Math.abs(this.pitch) * 0.1;
    // wheels
    this.wheelAngle += (this.speed * dt) / 0.5; this.wheels.forEach((w) => (w.rotation.x = this.wheelAngle));
    this.steerVis += (this.steer - this.steerVis) * Math.min(1, dt * 4); this.steerPivots[0].rotation.y = this.steerPivots[1].rotation.y = -this.steerVis * 0.45;
    // indicators
    const blink = (Math.floor(this.time * 2.6) % 2) === 0; const on = (side: 'r' | 'l') => (this.hazard || this.indicator === (side === 'r' ? 'right' : 'left')) && blink;
    (['r', 'l'] as const).forEach((s) => this.indMats[s].forEach((m) => (m.emissiveIntensity = on(s) ? 4.5 : 0.0)));
    this.brakeMat.emissiveIntensity = 0.3 + this.brake * 3.5 + this.night * 0.8;
    // steering wheel + driver
    const sw = this.steerVis * 1.6; this.wheelSpin.rotation.z = sw;
    if (this.driver) poseDriver(this.driver, { steer: this.steerVis, head: this.lookYaw, headPitch: 0.0, lever: this.lever, breathe: Math.sin(this.time * 1.7) });
  }
}

/** Soft smoke puffs for the exhaust */
export class Smoke {
  sprites: THREE.Sprite[] = []; life: number[] = []; vel: THREE.Vector3[] = []; idx = 0; acc = 0;
  constructor(scene: THREE.Scene) {
    const t = makeGlow('rgba(150,150,150,0.9)', 'rgba(150,150,150,0)', 64);
    for (let i = 0; i < 44; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0, color: '#aaa' })); s.visible = false; scene.add(s); this.sprites.push(s); this.life.push(0); this.vel.push(new THREE.Vector3()); }
  }
  update(dt: number, pos: THREE.Vector3, rate: number, wind = 0.5) {
    this.acc += dt * rate; while (this.acc > 1) { this.acc -= 1; const i = this.idx++ % this.sprites.length; const s = this.sprites[i]; s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1)); this.life[i] = 1; this.vel[i].set(wind * 0.4 + (Math.random() - 0.5) * 0.3, 0.45 + Math.random() * 0.3, 0.3 + Math.random() * 0.6); s.visible = true; s.scale.setScalar(0.18); }
    this.sprites.forEach((s, i) => { if (this.life[i] <= 0) return; this.life[i] -= dt * 0.45; s.position.addScaledVector(this.vel[i], dt); const k = 1 - this.life[i]; s.scale.setScalar(0.2 + k * 1.6); (s.material as THREE.SpriteMaterial).opacity = Math.max(0, this.life[i]) * 0.3; if (this.life[i] <= 0) s.visible = false; });
  }
}
