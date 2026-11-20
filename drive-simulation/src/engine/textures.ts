import * as THREE from 'three';

/** Deterministic RNG */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
}
export const R = rng(20240607);

export function canvas(w: number, h = w) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!] as const;
}

let maxTextureEdge=Infinity;
export function limitTextureSize(edge:number){maxTextureEdge=edge;}
function tex(c: HTMLCanvasElement, srgb = true, repeat = false, aniso = 8) {
  const scale=Math.min(1,maxTextureEdge/Math.max(c.width,c.height));
  if(scale<1){const [small,ctx]=canvas(Math.max(1,Math.round(c.width*scale)),Math.max(1,Math.round(c.height*scale)));ctx.drawImage(c,0,0,small.width,small.height);c=small;}
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** height canvas (grayscale) -> tangent normal map */
export function heightToNormal(h: HTMLCanvasElement, strength = 2, wrap = true) {
  const w = h.width, ht = h.height; const src = h.getContext('2d')!.getImageData(0, 0, w, ht).data;
  const [c, ctx] = canvas(w, ht); const out = ctx.createImageData(w, ht);
  const g = (x: number, y: number) => {
    if (wrap) { x = (x + w) % w; y = (y + ht) % ht; } else { x = Math.min(w - 1, Math.max(0, x)); y = Math.min(ht - 1, Math.max(0, y)); }
    return src[(y * w + x) * 4] / 255;
  };
  for (let y = 0; y < ht; y++) for (let x = 0; x < w; x++) {
    const dx = (g(x + 1, y) - g(x - 1, y)) * strength, dy = (g(x, y + 1) - g(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1); const i = (y * w + x) * 4;
    out.data[i] = (-dx / l * 0.5 + 0.5) * 255; out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0); return tex(c, false, true);
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, minS: number, maxS: number, light: [number, number], alpha: number, seed = 1) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const v = light[0] + r() * (light[1] - light[0]);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * (0.4 + r() * 0.6)})`;
    const s = minS + r() * (maxS - minS);
    ctx.beginPath(); ctx.arc(r() * w, r() * h, s, 0, 6.3); ctx.fill();
  }
}

/** Road: albedo, roughness(G), normal. Covers full 12.8 m road width across U. */
export function makeAsphalt() {
  const W = 1024, H = 1024; const [c, x] = canvas(W, H);
  x.fillStyle = '#4b4c4e'; x.fillRect(0, 0, W, H);
  speckle(x, W, H, 26000, 0.4, 1.4, [30, 150], 0.35, 3);
  speckle(x, W, H, 1500, 1.5, 4, [20, 80], 0.2, 4);
  // blotchy large-scale variation
  x.filter = 'blur(28px)'; const r = rng(77);
  for (let i = 0; i < 40; i++) { const v = 55 + r() * 40; x.fillStyle = `rgba(${v},${v},${v + 3},0.28)`; x.beginPath(); x.ellipse(r() * W, r() * H, 40 + r() * 140, 30 + r() * 180, 0, 0, 6.3); x.fill(); }
  x.filter = 'none';
  // wheel tracks: lane centres east x=1.8, 4.6 ; west -1.8,-4.6 (road spans -6.4..6.4)
  const u = (m: number) => ((m + 6.4) / 12.8) * W;
  x.filter = 'blur(10px)';
  for (const lane of [-4.6, -1.8, 1.8, 4.6]) for (const off of [-0.75, 0.75]) { const px = u(lane + off); const g = x.createLinearGradient(px - 38, 0, px + 38, 0); g.addColorStop(0, 'rgba(20,20,22,0)'); g.addColorStop(0.5, 'rgba(25,25,28,0.5)'); g.addColorStop(1, 'rgba(20,20,22,0)'); x.fillStyle = g; x.fillRect(px - 38, 0, 76, H); }
  x.filter = 'none';
  // asphalt patches (darker rectangular repairs) + cracks
  for (let i = 0; i < 7; i++) { x.fillStyle = `rgba(24,24,27,${0.55 + r() * 0.2})`; const pw = 70 + r() * 160, ph = 50 + r() * 120; x.fillRect(r() * W, r() * H, pw, ph); }
  x.strokeStyle = 'rgba(15,15,15,0.7)'; x.lineWidth = 1.2;
  for (let i = 0; i < 22; i++) { let px = r() * W, py = r() * H; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 14; k++) { px += (r() - 0.5) * 36; py += (r() - 0.35) * 30; x.lineTo(px, py); } x.stroke(); }
  // roughness: G channel
  const [rc, rx] = canvas(W, H); rx.fillStyle = 'rgb(255,235,0)'; rx.fillRect(0, 0, W, H);
  speckle(rx, W, H, 18000, 0.5, 2, [180, 255], 0.6, 8);
  rx.filter = 'blur(10px)';
  for (const lane of [-4.6, -1.8, 1.8, 4.6]) for (const off of [-0.75, 0.75]) { const px = u(lane + off); rx.fillStyle = 'rgba(0,150,0,0.5)'; rx.fillRect(px - 30, 0, 60, H); }
  rx.filter = 'none';
  // height
  const [hc, hx] = canvas(W, H); hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H);
  speckle(hx, W, H, 60000, 0.5, 1.6, [20, 235], 0.6, 11);
  hx.strokeStyle = '#101010'; hx.lineWidth = 2; for (let i = 0; i < 22; i++) { let px = r() * W, py = r() * H; hx.beginPath(); hx.moveTo(px, py); for (let k = 0; k < 14; k++) { px += (r() - 0.5) * 36; py += (r() - 0.35) * 30; hx.lineTo(px, py); } hx.stroke(); }
  const map = tex(c, true, true), rough = tex(rc, false, true), normal = heightToNormal(hc, 2.6);
  return { map, rough, normal };
}

export function makePuddleMask() {
  const S = 512; const [c, x] = canvas(S); x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  const r = rng(5); x.filter = 'blur(6px)';
  for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(255,255,255,${0.5 + r() * 0.5})`; x.beginPath(); x.ellipse(r() * S, r() * S, 8 + r() * 50, 5 + r() * 28, r() * 3, 0, 6.3); x.fill(); }
  x.filter = 'none'; return tex(c, false, true);
}

export function makeTiles(kind: 'worm' | 'square' | 'granite') {
  const S = 512; const [c, x] = canvas(S); const [hc, hx] = canvas(S); const [rc, rx] = canvas(S);
  const r = rng(kind.length * 31);
  x.fillStyle = '#777'; x.fillRect(0, 0, S, S); hx.fillStyle = '#000'; hx.fillRect(0, 0, S, S); rx.fillStyle = 'rgb(255,215,0)'; rx.fillRect(0, 0, S, S);
  if (kind === 'worm') {
    // "gạch con sâu" interlocking zigzag pavers (each ~ 10x20 cm), 2 m tile
    const bw = 64, bh = 32;
    for (let row = 0; row < S / bh; row++) for (let col = 0; col < S / bw; col++) {
      const ox = (row % 2) * (bw / 2); const px = col * bw + ox, py = row * bh; const v = 135 + r() * 40;
      x.fillStyle = `rgb(${v + 10},${v + 4},${v - 10})`; x.fillRect(px + 1.5, py + 1.5, bw - 3, bh - 3);
      hx.fillStyle = '#c0c0c0'; hx.fillRect(px + 2, py + 2, bw - 4, bh - 4);
      // wavy edge
      x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(px + bw / 2 - 3, py + 1.5, 6, bh - 3);
    }
  } else if (kind === 'square') {
    const n = 4, s = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 150 + r() * 35; x.fillStyle = `rgb(${v},${v - 5},${v - 14})`; x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); hx.fillStyle = '#d0d0d0'; hx.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 2; for (let k = 1; k < 5; k++) { x.beginPath(); x.moveTo(i * s + 6, j * s + k * s / 5); x.lineTo(i * s + s - 6, j * s + k * s / 5); x.stroke(); hx.strokeStyle = '#999'; hx.beginPath(); hx.moveTo(i * s + 6, j * s + k * s / 5); hx.lineTo(i * s + s - 6, j * s + k * s / 5); hx.stroke(); } }
  } else {
    x.fillStyle = '#8a8a88'; x.fillRect(0, 0, S, S); const n = 2, s = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 120 + r() * 25; x.fillStyle = `rgb(${v},${v},${v - 4})`; x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); hx.fillStyle = '#d8d8d8'; hx.fillRect(i * s + 3, j * s + 3, s - 6, s - 6); }
    speckle(x, S, S, 9000, 0.4, 1.3, [60, 220], 0.5, 12);
  }
  // grime, moss in joints, stains
  x.filter = 'blur(14px)'; for (let i = 0; i < 24; i++) { x.fillStyle = `rgba(${r() > 0.6 ? '60,70,40' : '30,28,26'},${0.1 + r() * 0.2})`; x.beginPath(); x.ellipse(r() * S, r() * S, 20 + r() * 60, 15 + r() * 50, 0, 0, 6.3); x.fill(); } x.filter = 'none';
  speckle(x, S, S, 5000, 0.4, 1.4, [20, 200], 0.35, 14); speckle(hx, S, S, 9000, 0.4, 1.3, [60, 200], 0.35, 15);
  // chewing gum / oil spots
  for (let i = 0; i < 10; i++) { x.fillStyle = 'rgba(30,30,30,0.5)'; x.beginPath(); x.arc(r() * S, r() * S, 1.5 + r() * 3, 0, 6.3); x.fill(); }
  return { map: tex(c, true, true), rough: tex(rc, false, true), normal: heightToNormal(hc, 3.4) };
}

export function makeConcrete(color = '#9a9a96', seed = 3) {
  const S = 512; const [c, x] = canvas(S); const [hc, hx] = canvas(S); const r = rng(seed);
  x.fillStyle = color; x.fillRect(0, 0, S, S); hx.fillStyle = '#808080'; hx.fillRect(0, 0, S, S);
  speckle(x, S, S, 14000, 0.4, 1.6, [60, 220], 0.35, seed); speckle(hx, S, S, 24000, 0.4, 1.5, [30, 220], 0.5, seed + 1);
  x.filter = 'blur(18px)'; for (let i = 0; i < 18; i++) { const v = r() > 0.5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},0.08)`; x.beginPath(); x.ellipse(r() * S, r() * S, 50, 80, 0, 0, 6.3); x.fill(); } x.filter = 'none';
  return { map: tex(c, true, true), normal: heightToNormal(hc, 2.2) };
}

/** Painted road markings (white/yellow) with wear. Tile = 12.8m wide x 12.8m long. */
export function makeMarkings() {
  const W = 1024, H = 1024; const [c, x] = canvas(W, H); const u = (m: number) => ((m + 6.4) / 12.8) * W; const ppm = W / 12.8;
  x.fillStyle = '#f4f4ee';
  const solid = (m: number, wm = 0.15) => x.fillRect(u(m) - wm * ppm / 2, 0, wm * ppm, H);
  solid(0.62); solid(-0.62); solid(6.05, 0.12); solid(-6.05, 0.12);
  // dashed lane dividers: 3m dash / 4.4m gap
  for (const m of [3.3, -3.3]) x.fillRect(u(m) - 0.075 * ppm, 0.5 * ppm, 0.15 * ppm, 3 * ppm);
  for (const m of [3.3, -3.3]) x.fillRect(u(m) - 0.075 * ppm, 7.9 * ppm, 0.15 * ppm, 3 * ppm);
  // wear: erase noise, heavier in wheel tracks
  const img = x.getImageData(0, 0, W, H); const r = rng(9);
  for (let i = 0; i < W * H; i++) { if (img.data[i * 4 + 3] > 0) { const px = (i % W); const wheel = [-4.6, -1.8, 1.8, 4.6].some((l) => [-0.75, 0.75].some((o) => Math.abs(px - u(l + o)) < 24)); if (r() < (wheel ? 0.45 : 0.14)) img.data[i * 4 + 3] = 40 + r() * 80; } }
  x.putImageData(img, 0, 0);
  x.globalCompositeOperation = 'destination-out'; x.filter = 'blur(5px)'; for (let i = 0; i < 80; i++) { x.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.6})`; x.beginPath(); x.ellipse(r() * W, r() * H, 5 + r() * 28, 4 + r() * 18, 0, 0, 6.3); x.fill(); } x.filter = 'none'; x.globalCompositeOperation = 'source-over';
  return tex(c, true, true);
}

/** Bus-bay painted area: 3.0 m x 24 m. */
export function makeBusBay() {
  const W = 256, H = 2048; const [c, x] = canvas(W, H); const ppm = W / 3.0;
  x.strokeStyle = '#f2c200'; x.lineWidth = 0.16 * ppm; x.strokeRect(0.1 * ppm, 0.1 * ppm, W - 0.2 * ppm, H - 0.2 * ppm);
  x.strokeStyle = '#f2c200'; x.lineWidth = 0.1 * ppm; x.beginPath(); x.moveTo(0.1 * ppm, H * 0.5); x.lineTo(W - 0.1 * ppm, H * 0.5); x.stroke();
  x.save(); x.translate(W / 2, H * 0.25); x.rotate(-Math.PI / 2); x.fillStyle = '#f4f4ee'; x.font = `bold ${1.2 * ppm}px Barlow Condensed, Arial Narrow, sans-serif`; x.textAlign = 'center'; x.fillText('XE BUÝT', 0, 0.4 * ppm); x.restore();
  x.save(); x.translate(W / 2, H * 0.75); x.rotate(-Math.PI / 2); x.fillStyle = '#f2c200'; x.font = `bold ${1.0 * ppm}px Barlow Condensed, Arial Narrow, sans-serif`; x.textAlign = 'center'; x.fillText('BUS ONLY', 0, 0.35 * ppm); x.restore();
  const img = x.getImageData(0, 0, W, H); const r = rng(33);
  for (let i = 0; i < W * H; i++) if (img.data[i * 4 + 3] > 0 && r() < 0.3) img.data[i * 4 + 3] = 30 + r() * 90; x.putImageData(img, 0, 0);
  return tex(c, true, false);
}

export function makeZebra() {
  const W = 1024, H = 256; const [c, x] = canvas(W, H); x.fillStyle = '#efefe8'; const n = 22;
  for (let i = 0; i < n; i++) x.fillRect((i + 0.2) * W / n, 0, W / n * 0.55, H);
  const img = x.getImageData(0, 0, W, H); const r = rng(44);
  for (let i = 0; i < W * H; i++) if (img.data[i * 4 + 3] > 0 && r() < 0.28) img.data[i * 4 + 3] = 40 + r() * 100; x.putImageData(img, 0, 0);
  return tex(c, true, false);
}

/** Radial soft glow / pool / blob */
export function makeGlow(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128, power = 1) {
  const [c, x] = canvas(size); const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner); g.addColorStop(power > 1 ? 0.35 : 0.5, power > 1 ? inner.replace(/[\d.]+\)$/, '0.4)') : inner.replace(/[\d.]+\)$/, '0.5)')); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, size, size); return tex(c, true, false, 1);
}

export function makeBeam() {
  const [c, x] = canvas(64, 256); const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(0.2, 'rgba(255,240,200,0.5)'); g.addColorStop(1, 'rgba(255,240,200,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 256);
  x.globalCompositeOperation = 'destination-in'; const h = x.createLinearGradient(0, 0, 64, 0); h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(0.5, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = h; x.fillRect(0, 0, 64, 256);
  return tex(c, true, false, 1);
}

export function makeCloud(seed: number) {
  const S = 256; const [c, x] = canvas(S); const r = rng(seed); x.clearRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) { const px = S * (0.2 + r() * 0.6), py = S * (0.45 + (r() - 0.5) * 0.3 - Math.abs(px / S - 0.5) * 0.25), rad = 16 + r() * 42; const g = x.createRadialGradient(px, py, 0, px, py, rad); const sh = 235 + (py < S * 0.45 ? 20 : -30 + r() * 20); g.addColorStop(0, `rgba(${sh},${sh},${Math.min(255, sh + 6)},0.55)`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, 6.3); x.fill(); }
  return tex(c, true, false, 1);
}

/** Leaf cluster card with alpha (compound leaves, Sao đen / muồng style) */
export function makeLeaves() {
  const S = 512; const [c, x] = canvas(S); const r = rng(61); x.clearRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const px = S / 2 + (r() - 0.5) * S * 0.8, py = S / 2 + (r() - 0.5) * S * 0.8, a = r() * 6.28, L = 40 + r() * 50;
    x.save(); x.translate(px, py); x.rotate(a);
    x.strokeStyle = '#4c6a2a'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, 0); x.lineTo(L, 0); x.stroke();
    for (let k = 1; k <= 7; k++) for (const sgn of [-1, 1]) {
      const lx = k * L / 8, v = r(); const col = `hsl(${88 + v * 22},${48 + r() * 16}%,${20 + r() * 20}%)`;
      x.fillStyle = col; x.beginPath(); x.ellipse(lx, sgn * 6, 9, 3.6, sgn * 0.55, 0, 6.3); x.fill();
    }
    x.restore();
  }
  const t = tex(c, true, false, 8); return t;
}

export function makeBark() {
  const S = 256; const [c, x] = canvas(S); const [hc, hx] = canvas(S); const r = rng(81);
  x.fillStyle = '#4a3f35'; x.fillRect(0, 0, S, S); hx.fillStyle = '#808080'; hx.fillRect(0, 0, S, S);
  for (let i = 0; i < 160; i++) { const px = r() * S, w = 2 + r() * 5, v = 30 + r() * 50; x.fillStyle = `rgba(${v + 15},${v + 8},${v},0.6)`; x.fillRect(px, r() * S, w, 20 + r() * 90); hx.fillStyle = `rgba(${r() > 0.5 ? 220 : 30},0,0,0)`; hx.fillStyle = r() > 0.5 ? '#e0e0e0' : '#202020'; hx.fillRect(px, r() * S, w, 20 + r() * 90); }
  x.fillStyle = 'rgba(80,100,50,0.25)'; x.fillRect(0, S * 0.7, S, S * 0.3);
  return { map: tex(c, true, true), normal: heightToNormal(hc, 3) };
}

/** Plaster wall (tileable) with stains, tinted by `color`. returns map + normal + rough. Has streaks of rain stain and moss at the bottom (v=1 is bottom, flipY). */
export function makePlaster(color: string, seed: number, moss = true) {
  const W = 256, H = 512; const [c, x] = canvas(W, H); const [hc, hx] = canvas(W, H); const r = rng(seed);
  x.fillStyle = color; x.fillRect(0, 0, W, H); hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H);
  speckle(x, W, H, 5000, 0.4, 1.3, [0, 255], 0.14, seed); speckle(hx, W, H, 12000, 0.4, 1.4, [30, 220], 0.45, seed + 1);
  x.filter = 'blur(6px)'; for (let i = 0; i < 18; i++) { const px = r() * W; const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(40,36,30,0.0)'); g.addColorStop(0.3, `rgba(40,36,30,${0.12 + r() * 0.15})`); g.addColorStop(1, 'rgba(40,36,30,0)'); x.fillStyle = g; x.fillRect(px, 0, 3 + r() * 10, H * (0.4 + r() * 0.6)); } x.filter = 'none';
  if (moss) { const g = x.createLinearGradient(0, H * 0.82, 0, H); g.addColorStop(0, 'rgba(60,85,40,0)'); g.addColorStop(1, 'rgba(50,70,35,0.5)'); x.fillStyle = g; x.fillRect(0, H * 0.82, W, H * 0.18); }
  x.filter = 'blur(25px)'; for (let i = 0; i < 9; i++) { x.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`; x.beginPath(); x.ellipse(r() * W, r() * H, 40, 70, 0, 0, 6.3); x.fill(); } x.filter = 'none';
  return { map: tex(c, true, true), normal: heightToNormal(hc, 1.6) };
}

export interface FacadeSet { map: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture; emissive: THREE.Texture }

/** Shophouse facade (nhà ống): ground floor shop opening + upper floors with windows / balconies / grilles. Width ~5m. */
export function makeFacade(floors: number, wall: string, style: number, seed: number): FacadeSet {
  const W = 512, H = 256 + floors * 192 + 64; const r = rng(seed);
  const [c, x] = canvas(W, H); const [hc, hx] = canvas(W, H); const [rc, rx] = canvas(W, H); const [ec, ex] = canvas(W, H);
  x.fillStyle = wall; x.fillRect(0, 0, W, H); hx.fillStyle = '#909090'; hx.fillRect(0, 0, W, H); rx.fillStyle = 'rgb(255,200,0)'; rx.fillRect(0, 0, W, H); ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
  speckle(x, W, H, 9000, 0.4, 1.4, [0, 255], 0.12, seed); speckle(hx, W, H, 14000, 0.4, 1.3, [50, 200], 0.4, seed + 3);
  // rain stains below each floor line (streaks)
  x.filter = 'blur(5px)'; for (let i = 0; i < 40; i++) { const px = r() * W, py = 40 + r() * (H - 300); const g = x.createLinearGradient(0, py, 0, py + 150); g.addColorStop(0, 'rgba(35,30,25,0.28)'); g.addColorStop(1, 'rgba(35,30,25,0)'); x.fillStyle = g; x.fillRect(px, py, 2 + r() * 8, 150); } x.filter = 'none';
  const gh = 256; // ground floor height in px (top at H-gh)
  const top = H - gh;
  // floors
  const trim = 'rgba(235,230,215,0.95)';
  for (let f = 0; f < floors; f++) {
    const y0 = top - (f + 1) * 192, y1 = y0 + 192;
    // slab band
    x.fillStyle = trim; x.fillRect(0, y1 - 14, W, 14); hx.fillStyle = '#d8d8d8'; hx.fillRect(0, y1 - 14, W, 14);
    const kind = (style + f * 3 + Math.floor(r() * 2)) % 4;
    const wx = 60 + r() * 20, ww = W - 2 * wx;
    if (kind === 0 || kind === 3) { // glass balcony door + iron railing
      x.fillStyle = '#1d2a33'; x.fillRect(wx, y0 + 30, ww, 120); hx.fillStyle = '#404040'; hx.fillRect(wx, y0 + 30, ww, 120);
      rx.fillStyle = 'rgb(255,25,0)'; rx.fillRect(wx, y0 + 30, ww, 120);
      const lit = r() < 0.55; if (lit) { ex.fillStyle = `rgba(255,${190 + r() * 40},${110 + r() * 50},${0.5 + r() * 0.4})`; ex.fillRect(wx + 4, y0 + 34, ww - 8, 112); }
      x.strokeStyle = '#2b2b2b'; x.lineWidth = 3; x.beginPath(); x.moveTo(W / 2, y0 + 30); x.lineTo(W / 2, y0 + 150); x.stroke();
      x.strokeStyle = '#1a1a1a'; x.lineWidth = 2; for (let k = 0; k <= 28; k++) { x.beginPath(); x.moveTo(wx - 16 + k * (ww + 32) / 28, y0 + 120); x.lineTo(wx - 16 + k * (ww + 32) / 28, y1 - 14); x.stroke(); }
      x.fillStyle = '#1a1a1a'; x.fillRect(wx - 16, y0 + 118, ww + 32, 4);
    } else if (kind === 1) { // window with sunshade + cage (chuồng cọp)
      x.fillStyle = '#9fb2b8'; x.fillRect(wx + 20, y0 + 40, ww - 40, 100); rx.fillStyle = 'rgb(255,25,0)'; rx.fillRect(wx + 20, y0 + 40, ww - 40, 100);
      x.fillStyle = 'rgba(20,30,40,0.5)'; x.fillRect(wx + 20, y0 + 40, ww - 40, 100);
      if (r() < 0.5) { ex.fillStyle = 'rgba(255,215,150,0.55)'; ex.fillRect(wx + 24, y0 + 44, ww - 48, 92); }
      x.strokeStyle = '#303030'; x.lineWidth = 3; x.strokeRect(wx + 8, y0 + 28, ww - 16, 124); for (let k = 1; k < 9; k++) { x.beginPath(); x.moveTo(wx + 8 + k * (ww - 16) / 9, y0 + 28); x.lineTo(wx + 8 + k * (ww - 16) / 9, y0 + 152); x.stroke(); } for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(wx + 8, y0 + 28 + k * 31); x.lineTo(wx + ww - 8, y0 + 28 + k * 31); x.stroke(); }
      x.fillStyle = '#7a6a58'; x.fillRect(wx, y0 + 18, ww, 12);
    } else { // two shuttered windows
      for (const sx of [wx + 6, W / 2 + 10]) { const wwid = ww / 2 - 16; x.fillStyle = r() < 0.5 ? '#6f8a73' : '#7e6a52'; x.fillRect(sx, y0 + 34, wwid, 110); hx.fillStyle = '#707070'; hx.fillRect(sx, y0 + 34, wwid, 110); x.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 9; k++) x.fillRect(sx + 4, y0 + 40 + k * 11.5, wwid - 8, 2); }
    }
    // vertical pilasters
    x.fillStyle = 'rgba(0,0,0,0.08)'; x.fillRect(0, y0, 18, 192); x.fillRect(W - 18, y0, 18, 192);
  }
  // parapet
  x.fillStyle = trim; x.fillRect(0, 0, W, 26); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 26, W, 6);
  // ground floor : big opening
  const gy = top + 36; x.fillStyle = '#1b1713'; x.fillRect(26, gy, W - 52, gh - 36); hx.fillStyle = '#505050'; hx.fillRect(26, gy, W - 52, gh - 36);
  rx.fillStyle = 'rgb(255,120,0)'; rx.fillRect(26, gy, W - 52, gh - 36);
  const g = ex.createLinearGradient(0, gy, 0, gy + gh); g.addColorStop(0, 'rgba(255,225,170,0.9)'); g.addColorStop(1, 'rgba(255,200,120,0.5)'); ex.fillStyle = g; ex.fillRect(34, gy + 6, W - 68, gh - 70);
  // shelves / interior shapes
  x.fillStyle = '#e8d6a8'; x.fillRect(34, gy + 6, W - 68, gh - 70); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(34, gy + 6, W - 68, gh - 70);
  for (let k = 0; k < 14; k++) { x.fillStyle = `hsl(${r() * 360},40%,${40 + r() * 20}%)`; x.fillRect(44 + k * ((W - 96) / 14), gy + 30 + (k % 3) * 36, 22, 22); }
  // rolled shutter box at top of the opening
  x.fillStyle = '#8b8d90'; x.fillRect(22, top + 22, W - 44, 16); for (let k = 0; k < 6; k++) { x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(22, top + 24 + k * 2.2, W - 44, 0.8); }
  return { map: tex(c, true, false), normal: heightToNormal(hc, 2.2, false), rough: tex(rc, false, false), emissive: tex(ec, true, false) };
}

export const SIGN_NAMES: [string, string, string][] = [
  ['PHỞ HÒA', '#d8201f', '#ffffff'], ['NHÀ THUỐC TÂY\nAN KHANG', '#15803d', '#ffffff'], ['CÀ PHÊ SÁNG', '#6b3f1d', '#fde68a'],
  ['SỬA XE 24/7\nVÁ VỎ - THAY NHỚT', '#1d4ed8', '#fde047'], ['TẠP HÓA CÔ BA', '#f59e0b', '#7f1d1d'], ['BÁNH MÌ HỒNG HOA', '#facc15', '#b91c1c'],
  ['TIỆM VÀNG KIM NGÂN', '#7f1d1d', '#fbbf24'], ['ĐIỆN THOẠI DI ĐỘNG\nDIDONG360', '#f5b800', '#111827'], ['CƠM TẤM SÀI GÒN', '#b91c1c', '#ffffff'],
  ['TRÀ SỮA - SINH TỐ', '#0e7490', '#ffffff'], ['BẾP NHÀ\nCƠM VĂN PHÒNG', '#b91c1c', '#fef08a'], ['HỦ TIẾU NAM VANG', '#ea580c', '#ffffff'],
  ['TIỆM TÓC NAM', '#1f2937', '#f9fafb'], ['VẬT LIỆU XÂY DỰNG', '#374151', '#fde047'],
];

export function makeSign(text: string, bg: string, fg: string, w = 512, h = 160, vertical = false) {
  const [c, x] = canvas(vertical ? h : w, vertical ? w : h); const W = c.width, H = c.height;
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = fg; x.lineWidth = 5; x.strokeRect(8, 8, W - 16, H - 16);
  const lines = text.split('\n'); x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  const fs = Math.min(H / (lines.length + 0.5), W / (Math.max(...lines.map((l) => l.length)) * 0.52)); x.font = `800 ${fs}px "Barlow Condensed", "Arial Narrow", Impact, sans-serif`;
  lines.forEach((l, i) => x.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * fs * 1.0));
  // weathering
  speckle(x, W, H, 700, 0.4, 1.5, [0, 120], 0.3, text.length * 7);
  return tex(c, true, false);
}

export function makeBusLivery() {
  const W = 2048, H = 256; const [c, x] = canvas(W, H);
  x.fillStyle = '#f2f4f6'; x.fillRect(0, 0, W, H);
  // blue lower skirt with sweeping swoosh
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b64b4'); g.addColorStop(1, '#073f7c');
  x.fillStyle = g; x.beginPath(); x.moveTo(0, H * 0.58); x.bezierCurveTo(W * 0.3, H * 0.4, W * 0.62, H * 0.78, W, H * 0.42); x.lineTo(W, H); x.lineTo(0, H); x.fill();
  x.fillStyle = '#19a74a'; x.beginPath(); x.moveTo(0, H * 0.5); x.bezierCurveTo(W * 0.3, H * 0.32, W * 0.62, H * 0.7, W, H * 0.34); x.lineTo(W, H * 0.42); x.bezierCurveTo(W * 0.62, H * 0.78, W * 0.3, H * 0.4, 0, H * 0.58); x.fill();
  x.fillStyle = '#fff'; x.font = '800 70px "Barlow Condensed", Arial Narrow, sans-serif'; x.textAlign = 'left'; x.fillText('XE BUÝT TP. HỒ CHÍ MINH', 380, H * 0.9);
  x.fillStyle = '#fff'; x.font = '800 110px "Barlow Condensed", Arial Narrow, sans-serif'; x.fillText('06', 120, H * 0.9);
  x.fillStyle = '#0b3d6e'; x.font = '600 40px Inter, Arial, sans-serif'; x.fillText('Sở GTVT · Hotline 1900 1234', 1250, H * 0.9);
  speckle(x, W, H, 6000, 0.4, 1.4, [0, 255], 0.12, 5);
  const r = rng(6); x.filter = 'blur(6px)'; for (let i = 0; i < 20; i++) { const px = r() * W; x.fillStyle = 'rgba(40,35,30,0.12)'; x.fillRect(px, H * 0.6, 4 + r() * 8, H * 0.4); } x.filter = 'none';
  return tex(c, true, false);
}

export function makeLED(line1: string, line2: string, w = 512, h = 96) {
  const [c, x] = canvas(w, h); x.fillStyle = '#050403'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#ffb020'; x.textBaseline = 'middle'; x.font = `800 ${h * 0.7}px "Barlow Condensed", Arial Narrow, monospace`; x.textAlign = 'left'; x.fillText(line1, 14, h / 2 + 3);
  x.font = `700 ${h * 0.46}px "Barlow Condensed", Arial Narrow, sans-serif`; x.fillText(line2, 110, h / 2 + 4);
  // LED dot grid
  x.fillStyle = 'rgba(0,0,0,0.65)'; for (let i = 0; i < w; i += 4) x.fillRect(i, 0, 1.4, h); for (let j = 0; j < h; j += 4) x.fillRect(0, j, w, 1.4);
  return tex(c, true, false);
}

export function makeBusRoutePanel() {
  const W = 512, H = 768; const [c, x] = canvas(W, H);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H); x.fillStyle = '#0b64b4'; x.fillRect(0, 0, W, 90);
  x.fillStyle = '#fff'; x.font = '800 54px "Barlow Condensed", Arial Narrow, sans-serif'; x.textAlign = 'left'; x.fillText('TUYẾN 06 · BX CHỢ LỚN – ĐH NÔNG LÂM', 18, 62);
  x.fillStyle = '#111'; x.font = '600 28px Inter, Arial, sans-serif';
  const st = ['Bến xe Chợ Lớn', 'Hậu Giang', 'Lý Thái Tổ (điểm đón này)', 'Ngã 6 Cộng Hòa', 'Công viên Hoàng Văn Thụ', 'Bến xe Miền Đông', 'Ngã 4 Thủ Đức', 'ĐH Nông Lâm'];
  x.strokeStyle = '#0b64b4'; x.lineWidth = 8; x.beginPath(); x.moveTo(50, 140); x.lineTo(50, 140 + (st.length - 1) * 66); x.stroke();
  st.forEach((s, i) => { x.fillStyle = i === 2 ? '#e11d48' : '#0b64b4'; x.beginPath(); x.arc(50, 140 + i * 66, i === 2 ? 14 : 9, 0, 6.3); x.fill(); x.fillStyle = i === 2 ? '#e11d48' : '#111'; x.font = `${i === 2 ? 700 : 500} 28px Inter, Arial, sans-serif`; x.fillText(s, 86, 150 + i * 66); });
  x.fillStyle = '#555'; x.font = '500 22px Inter, Arial'; x.fillText('Giãn cách: 10–15 phút · 05:00 – 21:30 · Vé 7.000đ', 18, 740);
  return tex(c, true, false);
}

export function makeAdPanel(variant: number) {
  const W = 512, H = 768; const [c, x] = canvas(W, H);
  const cols = [['#ff5a36', '#ffd23f'], ['#1e88e5', '#e3f2fd'], ['#2e7d32', '#c8e6c9']][variant % 3];
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,0.18)'; x.beginPath(); x.arc(W * 0.8, H * 0.3, 190, 0, 6.3); x.fill(); x.beginPath(); x.arc(W * 0.1, H * 0.8, 130, 0, 6.3); x.fill();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '800 96px "Barlow Condensed", Arial Narrow, sans-serif';
  const t = [['SIÊU SALE', 'GIẢM ĐẾN 50%'], ['SỮA TƯƠI', 'VIỆT NAM'], ['NƯỚC MÍA', 'SIÊU SẠCH']][variant % 3]; x.fillText(t[0], W / 2, H * 0.42); x.font = '700 58px "Barlow Condensed", Arial Narrow, sans-serif'; x.fillText(t[1], W / 2, H * 0.52);
  x.fillStyle = '#111'; x.fillRect(W * 0.2, H * 0.62, W * 0.6, 70); x.fillStyle = '#ffd23f'; x.font = '800 40px Inter, Arial'; x.fillText('Hotline 1900 xxxx', W / 2, H * 0.62 + 48);
  return tex(c, true, false);
}

export function makeBusStopSign() {
  const [c, x] = canvas(256, 384);
  x.fillStyle = '#0a5aa8'; x.beginPath(); x.roundRect(6, 6, 244, 372, 22); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 8; x.beginPath(); x.roundRect(14, 14, 228, 356, 16); x.stroke();
  x.fillStyle = '#fff'; x.beginPath(); x.roundRect(48, 34, 160, 100, 14); x.fill(); x.fillStyle = '#0a5aa8'; x.fillRect(60, 46, 136, 44); x.fillStyle = '#fff'; x.fillRect(66, 52, 28, 28); x.fillRect(104, 52, 28, 28); x.fillRect(142, 52, 28, 28); x.fillStyle = '#0a5aa8'; x.beginPath(); x.arc(78, 120, 9, 0, 6.3); x.arc(178, 120, 9, 0, 6.3); x.fill();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = '800 56px "Barlow Condensed", Arial Narrow, sans-serif'; x.fillText('TRẠM DỪNG', 128, 190); x.font = '700 38px "Barlow Condensed", Arial Narrow'; x.fillText('LÝ THÁI TỔ', 128, 228);
  x.fillStyle = '#facc15'; x.fillRect(24, 246, 208, 100); x.fillStyle = '#0a3a6e'; x.font = '800 44px "Barlow Condensed", Arial Narrow'; x.fillText('Tuyến: 06 · 10', 128, 290); x.font = '600 28px Inter, Arial'; x.fillText('Chợ Lớn - Nông Lâm', 128, 328);
  return tex(c, true, false);
}

export function makeLitter() {
  const [c, x] = canvas(256); x.clearRect(0, 0, 256, 256); const r = rng(91);
  for (let i = 0; i < 26; i++) { x.save(); x.translate(r() * 256, r() * 256); x.rotate(r() * 6.28); const k = r(); if (k < 0.6) { x.fillStyle = `hsl(${30 + r() * 40},${40 + r() * 30}%,${20 + r() * 20}%)`; x.beginPath(); x.ellipse(0, 0, 7 + r() * 8, 3 + r() * 4, 0, 0, 6.3); x.fill(); } else { x.fillStyle = r() > 0.5 ? '#f1ede0' : '#f87171'; x.fillRect(-7, -5, 14 + r() * 8, 10 + r() * 6); } x.restore(); }
  return tex(c, true, false);
}

export function makeCorrugated() {
  const [c, x] = canvas(256); const [hc, hx] = canvas(256);
  x.fillStyle = '#9a9ea3'; x.fillRect(0, 0, 256, 256); hx.fillStyle = '#808080'; hx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 16; i++) { const g = hx.createLinearGradient(i * 16, 0, i * 16 + 16, 0); g.addColorStop(0, '#202020'); g.addColorStop(0.5, '#f0f0f0'); g.addColorStop(1, '#202020'); hx.fillStyle = g; hx.fillRect(i * 16, 0, 16, 256); const g2 = x.createLinearGradient(i * 16, 0, i * 16 + 16, 0); g2.addColorStop(0, 'rgba(0,0,0,0.25)'); g2.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g2.addColorStop(1, 'rgba(0,0,0,0.25)'); x.fillStyle = g2; x.fillRect(i * 16, 0, 16, 256); }
  speckle(x, 256, 256, 1500, 0.5, 2.5, [60, 200], 0.4, 17);
  return { map: tex(c, true, true), normal: heightToNormal(hc, 3) };
}
