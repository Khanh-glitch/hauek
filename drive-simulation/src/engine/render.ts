import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import {
  EffectComposer, EffectPass, RenderPass, BloomEffect, DepthOfFieldEffect, VignetteEffect, NoiseEffect, HueSaturationEffect,
  BrightnessContrastEffect, ToneMappingEffect, ToneMappingMode, SMAAEffect, SMAAPreset, Effect, EffectAttribute, BlendFunction,
  ChromaticAberrationEffect, Pass,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { makeBeam, makeCloud, makeGlow, rng } from './textures';

export type TimePreset = 'noon' | 'sunset' | 'night';

export interface Env {
  label: string; skyElev: number; lightElev: number; az: number; turbidity: number; rayleigh: number; mie: number; mieG: number;
  sunColor: string; sunInt: number; hemiSky: string; hemiGround: string; hemiInt: number; fogColor: string; fog: number;
  exposure: number; bloom: number; bloomThr: number; wet: number; puddle: number; night: number; rain: number; shafts: number;
  sat: number; contrast: number; envInt: number; cloud: number; cloudTint: string; stars: number; grade: string;
}

export const PRESETS: Record<TimePreset, Env> = {
  noon: { label: 'Trưa nắng gắt Sài Gòn', skyElev: 62, lightElev: 62, az: 110, turbidity: 7, rayleigh: 1.2, mie: 0.005, mieG: 0.8, sunColor: '#fff0d4', sunInt: 5.2, hemiSky: '#9fc6ff', hemiGround: '#8a7a62', hemiInt: 0.85, fogColor: '#c3d6e8', fog: 0.0036, exposure: 1.0, bloom: 0.3, bloomThr: 0.95, wet: 0, puddle: 0.55, night: 0, rain: 0, shafts: 0.1, sat: 0.14, contrast: 0.06, envInt: 1.0, cloud: 1, cloudTint: '#ffffff', stars: 0, grade: 'Teal & Orange nhẹ' },
  sunset: { label: 'Hoàng hôn GTA 6', skyElev: 4, lightElev: 7, az: 200, turbidity: 11, rayleigh: 2.4, mie: 0.016, mieG: 0.92, sunColor: '#ff9340', sunInt: 5.0, hemiSky: '#ff9d78', hemiGround: '#5a3e35', hemiInt: 0.5, fogColor: '#f0a67c', fog: 0.0058, exposure: 1.1, bloom: 0.7, bloomThr: 0.8, wet: 0.45, puddle: 0.9, night: 0.4, rain: 0, shafts: 0.38, sat: 0.22, contrast: 0.1, envInt: 0.9, cloud: 1, cloudTint: '#ffb27a', stars: 0, grade: 'Vàng cam điện ảnh' },
  night: { label: 'Đêm mưa phản chiếu Neon', skyElev: -9, lightElev: 36, az: 140, turbidity: 6, rayleigh: 0.6, mie: 0.004, mieG: 0.7, sunColor: '#7090ff', sunInt: 0.7, hemiSky: '#2b3a63', hemiGround: '#171310', hemiInt: 0.38, fogColor: '#10172b', fog: 0.0085, exposure: 1.35, bloom: 1.15, bloomThr: 0.55, wet: 1, puddle: 1, night: 1, rain: 1, shafts: 0, sat: 0.1, contrast: 0.12, envInt: 0.35, cloud: 0.15, cloudTint: '#445577', stars: 0.8, grade: 'Xanh neon / hồng' },
};

const NUM_KEYS: (keyof Env)[] = ['skyElev', 'lightElev', 'az', 'turbidity', 'rayleigh', 'mie', 'mieG', 'sunInt', 'hemiInt', 'fog', 'exposure', 'bloom', 'bloomThr', 'wet', 'puddle', 'night', 'rain', 'shafts', 'sat', 'contrast', 'envInt', 'cloud', 'stars'];
const COL_KEYS: (keyof Env)[] = ['sunColor', 'hemiSky', 'hemiGround', 'fogColor', 'cloudTint'];

/* ---------- Planar reflection for puddles / wet asphalt ---------- */
export class PlanarReflection {
  rt: THREE.WebGLRenderTarget; cam = new THREE.PerspectiveCamera(); texMat = new THREE.Matrix4(); enabled = true; hide: THREE.Object3D[] = [];
  constructor(public scale = 0.5) { this.rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: 0 }); }
  setSize(w: number, h: number) { this.rt.setSize(Math.max(64, Math.floor(w * this.scale)), Math.max(64, Math.floor(h * this.scale))); }
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    if (!this.enabled) return;
    const n = new THREE.Vector3(0, 1, 0), rp = new THREE.Vector3(0, 0, 0);
    const cp = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const view = rp.clone().sub(cp); if (view.dot(n) > 0) return;
    view.reflect(n).negate().add(rp);
    const rot = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rot).add(cp);
    const target = rp.clone().sub(look).reflect(n).negate().add(rp);
    const c = this.cam; c.position.copy(view); c.up.set(0, 1, 0).applyMatrix4(rot).reflect(n); c.lookAt(target);
    c.far = camera.far; c.near = camera.near; c.updateMatrixWorld(); c.projectionMatrix.copy(camera.projectionMatrix);
    this.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
    const prev = renderer.getRenderTarget(); const sa = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    this.hide.forEach((o) => (o.visible = false));
    renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(scene, c);
    this.hide.forEach((o) => (o.visible = true));
    renderer.shadowMap.autoUpdate = sa; renderer.setRenderTarget(prev);
  }
}

/** Road/asphalt shader patch: wet puddles with planar reflections + roughness break-up. */
export function patchWetSurface(mat: THREE.MeshStandardMaterial, refl: PlanarReflection, puddle: THREE.Texture, u: { wet: { value: number }; puddle: { value: number }; useRefl: { value: number }; time: { value: number } }, curbX = 5.4) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRefl = { value: refl.rt.texture }; sh.uniforms.uTexMat = { value: refl.texMat }; sh.uniforms.uPuddle = { value: puddle };
    sh.uniforms.uWet = u.wet; sh.uniforms.uPudAmt = u.puddle; sh.uniforms.uUseRefl = u.useRefl; sh.uniforms.uTime = u.time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec4 vRefl; uniform mat4 uTexMat;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvec4 wpp = modelMatrix * vec4(transformed,1.0); vWPos = wpp.xyz; vRefl = uTexMat * wpp;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec4 vRefl; uniform sampler2D uRefl; uniform sampler2D uPuddle; uniform float uWet; uniform float uPudAmt; uniform float uUseRefl; uniform float uTime;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float pudTex = texture2D(uPuddle, vWPos.xz*0.031).r * 0.65 + texture2D(uPuddle, vWPos.xz*0.093+0.37).r*0.35;
        float curbB = smoothstep(${curbX.toFixed(1)}, 6.3, abs(vWPos.x)) * 0.35;
        float pm = smoothstep(0.52, 0.72, pudTex + curbB) * uPudAmt;
        float wetAll = uWet;
        roughnessFactor = mix(roughnessFactor, 0.03, pm);
        roughnessFactor = mix(roughnessFactor, roughnessFactor*0.38, wetAll);
        diffuseColor.rgb *= mix(1.0, 0.5, clamp(pm*0.85 + wetAll*0.45, 0.0, 1.0));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 flatN = normalize((viewMatrix*vec4(0.0,1.0,0.0,0.0)).xyz);
        float rip = sin(length(fract(vWPos.xz*0.9)-0.5)*40.0 - uTime*9.0) * 0.5 + 0.5;
        normal = normalize(mix(normal, flatN, pm*0.92));
        normal = normalize(normal + (flatN*0.0 + vec3(rip-0.5, 0.0, rip-0.5)*0.05) * pm * uWet);`)
      .replace('#include <opaque_fragment>', `
        if (uUseRefl > 0.5) {
          vec3 vd = normalize(cameraPosition - vWPos);
          float fres = 0.04 + 0.96*pow(1.0 - clamp(vd.y,0.0,1.0), 4.0);
          vec2 ruv = vRefl.xy / vRefl.w + normal.xy * 0.012 * (0.3+roughnessFactor*3.0);
          vec3 rc = texture2D(uRefl, ruv).rgb;
          float k = clamp(pm + wetAll*0.55*(1.0-roughnessFactor*1.2), 0.0, 1.0);
          outgoingLight = mix(outgoingLight, rc, clamp(fres*1.35*k + pm*0.35, 0.0, 0.92));
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => `wetroad:${curbX}`;
}

/** Fake subsurface scattering / foliage translucency injected into any standard material */
export function addSSS(mat: THREE.MeshStandardMaterial, color = '#ff7a4a', strength = 0.6, rim = 0.5) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uSSSCol = { value: new THREE.Color(color) }; sh.uniforms.uSSSStr = { value: strength }; sh.uniforms.uSSSRim = { value: rim };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSSSCol; uniform float uSSSStr; uniform float uSSSRim;')
      .replace('#include <opaque_fragment>', `
        #if NUM_DIR_LIGHTS > 0
          vec3 Ld = normalize(directionalLights[0].direction);
          vec3 Nn = normalize(normal);
          float wrapD = clamp((dot(Nn, Ld) + 0.45) / 1.45, 0.0, 1.0);
          float back = pow(clamp(dot(-Nn, Ld), 0.0, 1.0), 1.6);
          float rimT = pow(1.0 - clamp(dot(Nn, normalize(vViewPosition)), 0.0, 1.0), 2.5);
          outgoingLight += uSSSCol * diffuseColor.rgb * directionalLights[0].color * (back * uSSSStr * 1.4 + wrapD * wrapD * uSSSStr * 0.18 + rimT * uSSSRim * 0.1);
        #endif
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'sss' + color + strength;
}

/* ---------- custom post effects ---------- */
class ExposureEffect extends Effect {
  constructor() { super('Exposure', 'uniform float uExp; void mainImage(const in vec4 i, const in vec2 uv, out vec4 o){ o = vec4(i.rgb*uExp, i.a); }', { uniforms: new Map<string, THREE.Uniform>([['uExp', new THREE.Uniform(1)]]) }); }
  set exposure(v: number) { (this.uniforms.get('uExp') as THREE.Uniform).value = v; }
}
class MotionBlurEffect extends Effect {
  prev = new THREE.Matrix4(); cur = new THREE.Matrix4(); first = true;
  constructor(public cam: THREE.Camera) {
    super('MotionBlur', `uniform mat4 uPrev; uniform mat4 uInv; uniform float uStr;
      void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor){
        if (uStr < 0.001 || depth > 0.99999) { outputColor = inputColor; return; }
        vec4 ndc = vec4(uv*2.0-1.0, depth*2.0-1.0, 1.0); vec4 w = uInv*ndc; w /= w.w; vec4 p = uPrev*w; p /= p.w;
        vec2 v = (uv - (p.xy*0.5+0.5)) * uStr; float l = length(v); if (l > 0.025) v *= 0.025 / l;
        vec3 c = inputColor.rgb; for (int i=1;i<=6;i++){ c += texture2D(inputBuffer, uv - v*(float(i)/6.0)).rgb; } outputColor = vec4(c/7.0, inputColor.a);
      }`, { attributes: EffectAttribute.DEPTH, uniforms: new Map<string, THREE.Uniform>([['uPrev', new THREE.Uniform(new THREE.Matrix4())], ['uInv', new THREE.Uniform(new THREE.Matrix4())], ['uStr', new THREE.Uniform(0.5)]]) });
  }
  set strength(v: number) { (this.uniforms.get('uStr') as THREE.Uniform).value = v; }
  update() {
    this.cam.updateMatrixWorld();
    this.cur.multiplyMatrices((this.cam as THREE.PerspectiveCamera).projectionMatrix, (this.cam as THREE.PerspectiveCamera).matrixWorldInverse);
    (this.uniforms.get('uInv') as THREE.Uniform).value.copy(this.cur).invert();
    (this.uniforms.get('uPrev') as THREE.Uniform).value.copy(this.first ? this.cur : this.prev); this.first = false;
    this.prev.copy(this.cur);
  }
}

export interface PostSettings { ao: boolean; bloom: boolean; dof: boolean; motion: boolean; grain: boolean; chroma: boolean }

export class Post {
  composer: EffectComposer; ao?: any; renderPass?: RenderPass;
  dof: DepthOfFieldEffect; bloom: BloomEffect; vignette: VignetteEffect; huesat: HueSaturationEffect; bc: BrightnessContrastEffect;
  exposure = new ExposureEffect(); motion: MotionBlurEffect; noise: NoiseEffect; chroma: ChromaticAberrationEffect;
  dofPass: EffectPass; mainPass: EffectPass; motionPass: EffectPass; smaaPass: EffectPass; chromaPass: EffectPass;
  settings: PostSettings = { ao: true, bloom: true, dof: false, motion: true, grain: true, chroma: true };
  constructor(public renderer: THREE.WebGLRenderer, public scene: THREE.Scene, public camera: THREE.PerspectiveCamera) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    // N8AOPostPass consumes scene color and depth. It is not a scene RenderPass.
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    const size = renderer.getSize(new THREE.Vector2());
    try {
      this.ao = new N8AOPostPass(scene, camera, size.x, size.y);
      const c = this.ao.configuration; c.aoRadius = 1.6; c.distanceFalloff = 1.2; c.intensity = 3.2; c.halfRes = true; c.gammaCorrection = false; c.aoSamples = 12; c.denoiseSamples = 6; c.denoiseRadius = 10;
      this.composer.addPass(this.ao as unknown as Pass);
    } catch (e) { console.warn('N8AO unavailable', e); }
    this.dof = new DepthOfFieldEffect(camera, { worldFocusDistance: 12, worldFocusRange: 8, bokehScale: 3.2, resolutionScale: 0.5 });
    this.dofPass = new EffectPass(camera, this.dof); this.dofPass.enabled = false; this.composer.addPass(this.dofPass);
    this.motion = new MotionBlurEffect(camera); this.motionPass = new EffectPass(camera, this.motion); this.composer.addPass(this.motionPass);
    this.bloom = new BloomEffect({ intensity: 0.4, luminanceThreshold: 0.9, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.72 });
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.55 });
    this.huesat = new HueSaturationEffect({ saturation: 0.12 }); this.bc = new BrightnessContrastEffect({ contrast: 0.08, brightness: 0.0 });
    this.noise = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.OVERLAY }); this.noise.blendMode.opacity.value = 0.18;
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.mainPass = new EffectPass(camera, this.exposure, this.bloom, this.huesat, this.bc, tone, this.vignette, this.noise); this.composer.addPass(this.mainPass);
    this.chroma = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0006, 0.0006), radialModulation: true, modulationOffset: 0.35 });
    this.chromaPass = new EffectPass(camera, this.chroma); this.composer.addPass(this.chromaPass);
    this.smaaPass = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })); this.composer.addPass(this.smaaPass);
    this.apply();
  }
  apply() {
    const s = this.settings; if (this.ao) this.ao.enabled = s.ao; this.bloom.blendMode.opacity.value = s.bloom ? 1 : 0;
    this.dofPass.enabled = s.dof; this.motionPass.enabled = s.motion; this.noise.blendMode.opacity.value = s.grain ? 0.18 : 0; this.chromaPass.enabled = s.chroma;
  }
  setSize(w: number, h: number) { this.composer.setSize(w, h); }
  focus(dist: number, range = 8) { const m = this.dof.cocMaterial as unknown as { worldFocusDistance: number; worldFocusRange: number }; m.worldFocusDistance = dist; m.worldFocusRange = range; }
  render(dt: number) { this.composer.render(dt); }
}

/* ---------- Atmosphere: sky, sun, lights, clouds, rain, shafts, dust ---------- */
export class Atmosphere {
  sky = new Sky(); sun = new THREE.DirectionalLight('#fff', 4); hemi = new THREE.HemisphereLight('#9cf', '#765', 0.8);
  fog = new THREE.FogExp2('#c3d6e8', 0.004); sunDir = new THREE.Vector3(); target = new THREE.Object3D();
  cur: Env = { ...PRESETS.noon }; from: Env = { ...PRESETS.noon }; to: Env = { ...PRESETS.noon }; t = 1; key: TimePreset = 'noon';
  pmrem: THREE.PMREMGenerator; envScene = new THREE.Scene(); envSky = new Sky();
  clouds = new THREE.Group(); stars: THREE.Points; rain: THREE.LineSegments; dust: THREE.Points; shafts = new THREE.Group(); shaftMats: THREE.MeshBasicMaterial[] = [];
  rainU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uOp: { value: 0 } };
  wetU = { wet: { value: 0 }, puddle: { value: 0.5 }, useRefl: { value: 1 }, time: { value: 0 } };
  nightListeners: ((n: number) => void)[] = [];
  constructor(public scene: THREE.Scene, public renderer: THREE.WebGLRenderer) {
    scene.add(this.sky); this.sky.scale.setScalar(1800); scene.fog = this.fog;
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(4096, 4096); const sc = this.sun.shadow.camera; sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 320;
    this.sun.shadow.bias = -0.00025; this.sun.shadow.normalBias = 0.035; this.sun.shadow.radius = 2.4; this.sun.target = this.target;
    scene.add(this.sun, this.target, this.hemi); this.pmrem = new THREE.PMREMGenerator(renderer); this.envScene.add(this.envSky); this.envSky.scale.setScalar(1800);
    // clouds (sprites)
    const r = rng(12); const ctex = [makeCloud(1), makeCloud(2), makeCloud(3)];
    for (let i = 0; i < 34; i++) {
      const m = new THREE.SpriteMaterial({ map: ctex[i % 3], transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
      const s = new THREE.Sprite(m); const a = r() * 6.28, d = 500 + r() * 900; s.position.set(Math.cos(a) * d, 150 + r() * 260, Math.sin(a) * d); s.scale.set(420 + r() * 520, 160 + r() * 200, 1); this.clouds.add(s);
    }
    scene.add(this.clouds);
    const sp = new Float32Array(900 * 3); for (let i = 0; i < 900; i++) { const th = r() * 6.28, ph = Math.acos(r() * 0.95 + 0.05); sp.set([Math.sin(ph) * Math.cos(th) * 1500, Math.cos(ph) * 1500, Math.sin(ph) * Math.sin(th) * 1500], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 3.2, color: '#dfe8ff', transparent: true, opacity: 0, fog: false, depthWrite: false, sizeAttenuation: false })); scene.add(this.stars);
    // rain
    const N = 9000; const pos = new Float32Array(N * 2 * 3), seed = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { const a = r(), b = r(), c = r(); for (let k = 0; k < 2; k++) { seed.set([a, b, c], (i * 2 + k) * 3); end[i * 2 + k] = k; } }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); rg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3)); rg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({ uniforms: this.rainU, transparent: true, depthWrite: false, vertexShader: `attribute vec3 aSeed; attribute float aEnd; uniform float uTime; uniform vec3 uCam; varying float vE;
      void main(){ vec3 p; p.x = mod(aSeed.x*46.0 - uCam.x + 23.0, 46.0) - 23.0 + uCam.x; p.z = mod(aSeed.z*46.0 - uCam.z + 23.0, 46.0) - 23.0 + uCam.z; p.y = mod(aSeed.y*32.0 - uTime*(16.0+aSeed.x*6.0), 32.0) + uCam.y - 14.0; p.y += aEnd*0.7; p.x += aEnd*0.06; vE = aEnd; gl_Position = projectionMatrix*viewMatrix*vec4(p,1.0); }`,
      fragmentShader: `uniform float uOp; varying float vE; void main(){ gl_FragColor = vec4(0.78,0.85,0.95, uOp*0.32*(1.0-vE*0.7)); }` }));
    this.rain.frustumCulled = false; this.rain.visible = false; scene.add(this.rain);
    // dust motes
    const dp = new Float32Array(500 * 3); for (let i = 0; i < 500; i++) dp.set([(r() - 0.5) * 30, r() * 10, (r() - 0.5) * 30], i * 3); const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.06, map: makeGlow('rgba(255,240,210,1)', 'rgba(255,240,210,0)', 32), color: '#ffe9c4', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })); this.dust.frustumCulled = false; scene.add(this.dust);
    scene.add(this.shafts);
    this.setPreset('noon', true);
  }
  addShafts(anchors: THREE.Vector3[]) {
    const beam = makeBeam();
    for (const a of anchors) for (let k = 0; k < 2; k++) {
      const m = new THREE.MeshBasicMaterial({ map: beam, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, side: THREE.DoubleSide, fog: false, color: '#ffe7b8' }); this.shaftMats.push(m);
      const g = new THREE.Mesh(new THREE.PlaneGeometry(2.4 + Math.random() * 2, 26), m); g.userData.anchor = a; g.userData.k = k; this.shafts.add(g);
    }
  }
  private updateShafts() {
    const up = new THREE.Vector3(0, 1, 0); const q = new THREE.Quaternion().setFromUnitVectors(up, this.sunDir.clone().negate());
    this.shafts.children.forEach((c) => { const a = c.userData.anchor as THREE.Vector3; c.quaternion.copy(q); c.rotateY(c.userData.k * Math.PI / 2 + 0.3); c.position.copy(a).addScaledVector(this.sunDir, -13).setY(a.y - 13 * Math.max(0.2, this.sunDir.y) * 0); c.position.copy(a).addScaledVector(this.sunDir, 0).addScaledVector(this.sunDir, -0); c.position.copy(a).add(this.sunDir.clone().multiplyScalar(-1).multiplyScalar(13)); });
  }
  setPreset(k: TimePreset, instant = false) {
    this.key = k; this.from = { ...this.cur }; this.to = PRESETS[k]; this.t = instant ? 1 : 0; if (instant) { this.cur = { ...PRESETS[k] }; this.apply(true); }
  }
  /** call every frame; focus = world point the shadow frustum centers on */
  update(dt: number, camPos: THREE.Vector3, focus: THREE.Vector3, time: number) {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / 2.8); const e = this.t * this.t * (3 - 2 * this.t);
      for (const k of NUM_KEYS) (this.cur as any)[k] = (this.from as any)[k] + ((this.to as any)[k] - (this.from as any)[k]) * e;
      for (const k of COL_KEYS) (this.cur as any)[k] = '#' + new THREE.Color((this.from as any)[k]).lerp(new THREE.Color((this.to as any)[k]), e).getHexString();
      this.cur.label = this.to.label; this.cur.grade = this.to.grade; this.apply(this.t >= 1);
    }
    const sc = this.sun.shadow.camera; const tx = 96 / this.sun.shadow.mapSize.x; // snap target to texel
    this.target.position.set(Math.round(focus.x / tx) * tx, 0, Math.round(focus.z / tx) * tx);
    this.sun.position.copy(this.target.position).addScaledVector(this.lightDir(), 150); sc.updateProjectionMatrix();
    this.sky.position.copy(camPos); this.clouds.position.set(camPos.x, 0, camPos.z); this.stars.position.copy(camPos);
    this.clouds.children.forEach((c, i) => { c.position.x += dt * 1.2 * (1 + (i % 3) * 0.3); if (c.position.x > 1500) c.position.x = -1500; });
    this.rainU.uTime.value = time; this.rainU.uCam.value.copy(camPos); this.rainU.uOp.value = this.cur.rain; this.rain.visible = this.cur.rain > 0.02;
    this.wetU.time.value = time; this.dust.position.copy(camPos).setY(0); (this.dust.material as THREE.PointsMaterial).opacity = 0.1 + 0.35 * (this.cur.shafts) + 0.08;
    const dp = this.dust.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < dp.count; i += 1) { dp.setY(i, (dp.getY(i) + dt * (0.08 + (i % 5) * 0.03)) % 10); dp.setX(i, dp.getX(i) + Math.sin(time * 0.4 + i) * dt * 0.1); } dp.needsUpdate = true;
  }
  lightDir() { const e = THREE.MathUtils.degToRad(this.cur.lightElev), a = THREE.MathUtils.degToRad(this.cur.az); return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)); }
  private apply(final: boolean) {
    const c = this.cur; const se = THREE.MathUtils.degToRad(c.skyElev), a = THREE.MathUtils.degToRad(c.az);
    this.sunDir.set(Math.cos(se) * Math.sin(a), Math.sin(se), Math.cos(se) * Math.cos(a));
    for (const s of [this.sky, this.envSky]) { const u = s.material.uniforms; u.turbidity.value = c.turbidity; u.rayleigh.value = c.rayleigh; u.mieCoefficient.value = c.mie; u.mieDirectionalG.value = c.mieG; u.sunPosition.value.copy(this.sunDir); }
    this.sun.color.set(c.sunColor); this.sun.intensity = c.sunInt; this.hemi.color.set(c.hemiSky); this.hemi.groundColor.set(c.hemiGround); this.hemi.intensity = c.hemiInt;
    this.fog.color.set(c.fogColor); this.fog.density = c.fog; this.scene.environmentIntensity = c.envInt;
    this.wetU.wet.value = c.wet; this.wetU.puddle.value = c.puddle;
    this.clouds.children.forEach((s) => { const m = (s as THREE.Sprite).material as THREE.SpriteMaterial; m.color.set(c.cloudTint); m.opacity = 0.92 * c.cloud; });
    (this.stars.material as THREE.PointsMaterial).opacity = c.stars; this.shaftMats.forEach((m) => (m.opacity = c.shafts * 0.2)); this.updateShafts();
    this.nightListeners.forEach((f) => f(c.night));
    if (final || this.t === 0) this.rebuildEnv();
  }
  rebuildEnv() {
    const rt = this.pmrem.fromScene(this.envScene, 0, 1, 3000); this.scene.environment?.dispose?.(); this.scene.environment = rt.texture;
  }
  get env() { return this.cur; }
}
