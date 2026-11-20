import * as THREE from 'three';

/**
 * Animation retargeting: Mixamo rig (rowan / juno3 from scam-maze, 18 clips)  ->  UE-style 53-bone rig
 * (alice / sofia / yoshida ... which ship WITHOUT animation clips).
 * Works in "model-root frame" using world-rest-orientation deltas, so it is independent of bone-axis conventions.
 */
const MAP: Record<string, string> = {
  pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', head: 'Head',
  clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
  clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
  thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', ball_l: 'LeftToeBase',
  thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot', ball_r: 'RightToeBase',
};

const strip = (n: string) => n.replace(/^mixamorig[:_]?/, '');

export interface PoseOverride {
  // additive rotations in model-root frame (Euler XYZ, radians) applied after retarget, by UE bone name
  [bone: string]: [number, number, number] | undefined;
}

export class Retargeter {
  tgtRoot: THREE.Object3D;
  srcRoot: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions = new Map<string, THREE.AnimationAction>();
  current?: THREE.AnimationAction;
  tRest = new Map<THREE.Object3D, THREE.Quaternion>();
  sRest = new Map<THREE.Object3D, THREE.Quaternion>();
  bones: Record<string, THREE.Object3D> = {};
  overrides: PoseOverride = {};
  private pairMap = new Map<THREE.Object3D, THREE.Object3D | null>();
  private tmpQ = new THREE.Quaternion();
  private tmpQ2 = new THREE.Quaternion();
  private gqS = new Map<THREE.Object3D, THREE.Quaternion>();
  private sMap = new Map<string, THREE.Object3D>();
  private ovQ = new THREE.Quaternion();
  private ovE = new THREE.Euler();

  constructor(tgtRoot: THREE.Object3D, srcRigClone: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.tgtRoot = tgtRoot; this.srcRoot = srcRigClone;
    srcRigClone.traverse((o) => { if ((o as THREE.Bone).isBone || o.name.startsWith('mixamorig')) this.sMap.set(strip(o.name), o); });
    this.rest(tgtRoot, new THREE.Quaternion(), this.tRest);
    this.rest(srcRigClone, new THREE.Quaternion(), this.sRest);
    tgtRoot.traverse((o) => {
      if ((o as THREE.Bone).isBone) { this.bones[o.name] = o; this.pairMap.set(o, MAP[o.name] ? this.sMap.get(MAP[o.name]) ?? null : null); }
    });
    this.mixer = new THREE.AnimationMixer(srcRigClone);
    for (const c of clips) {
      const clip = c.clone();
      clip.tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion'));
      this.actions.set(c.name, this.mixer.clipAction(clip));
    }
  }

  private rest(o: THREE.Object3D, parentQ: THREE.Quaternion, store: Map<THREE.Object3D, THREE.Quaternion>) {
    const q = parentQ.clone().multiply(o.quaternion);
    store.set(o, q);
    o.children.forEach((c) => { if (!(c as THREE.Mesh).isMesh) this.rest(c, q, store); });
  }

  play(name: string, fade = 0.3, offset = 0, speed = 1) {
    const a = this.actions.get(name); if (!a) return;
    if (this.current === a) { a.timeScale = speed; return; }
    a.reset().setEffectiveWeight(1).setEffectiveTimeScale(speed).play();
    a.time = offset % (a.getClip().duration || 1);
    if (this.current) this.current.crossFadeTo(a, fade, false);
    this.current = a;
  }

  private walkS(o: THREE.Object3D, pq: THREE.Quaternion) {
    const q = pq.clone().multiply(o.quaternion); this.gqS.set(o, q);
    o.children.forEach((c) => { if (!(c as THREE.Mesh).isMesh) this.walkS(c, q); });
  }

  private walkT(o: THREE.Object3D, pq: THREE.Quaternion, acc: THREE.Quaternion) {
    let q: THREE.Quaternion;
    const s = this.pairMap.get(o);
    const ov = this.overrides[o.name];
    let nacc = acc;
    if (ov) { this.ovE.set(ov[0], ov[1], ov[2]); nacc = this.ovQ.setFromEuler(this.ovE).clone().multiply(acc); }
    if (s) {
      const sa = this.gqS.get(s)!, sr = this.sRest.get(s)!, tr = this.tRest.get(o)!;
      q = nacc.clone().multiply(this.tmpQ.copy(sa).multiply(this.tmpQ2.copy(sr).invert()).multiply(tr));
      o.quaternion.copy(pq).invert().multiply(q);
    } else {
      q = pq.clone().multiply(o.quaternion);
      if (ov) { q.premultiply(this.ovQ.setFromEuler(this.ovE.set(ov[0], ov[1], ov[2]))); o.quaternion.copy(pq).invert().multiply(q); }
    }
    o.children.forEach((c) => { if (!(c as THREE.Mesh).isMesh) this.walkT(c, q, nacc); });
  }

  update(dt: number) {
    this.mixer.update(dt);
    this.gqS.clear();
    this.walkS(this.srcRoot, new THREE.Quaternion());
    this.walkT(this.tgtRoot, new THREE.Quaternion(), new THREE.Quaternion());
  }

  dispose() { this.mixer.stopAllAction(); }
}

/** Build a bones-only clone of a rig (no meshes) to use as animation source. */
export function boneOnlyClone(root: THREE.Object3D): THREE.Object3D {
  const c = root.clone(true);
  const rm: THREE.Object3D[] = [];
  c.traverse((o) => { if ((o as THREE.Mesh).isMesh || (o as THREE.SkinnedMesh).isSkinnedMesh) rm.push(o); });
  rm.forEach((o) => o.parent?.remove(o));
  return c;
}
