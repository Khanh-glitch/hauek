// Asphalt bake source adapted from build-aaa-saigon-simulation.zip (Drive).
import * as THREE from "three";

/** Deterministic RNG */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s % 100000) / 100000;
  };
}
export const R = rng(20240607);

export function canvas(w: number, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function tex(c: HTMLCanvasElement, srgb = true, repeat = false, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** height canvas (grayscale) -> tangent normal map */
export function heightToNormal(
  h: HTMLCanvasElement,
  strength = 2,
  wrap = true,
) {
  const w = h.width,
    ht = h.height;
  const src = h.getContext("2d")!.getImageData(0, 0, w, ht).data;
  const [c, ctx] = canvas(w, ht);
  const out = ctx.createImageData(w, ht);
  const g = (x: number, y: number) => {
    if (wrap) {
      x = (x + w) % w;
      y = (y + ht) % ht;
    } else {
      x = Math.min(w - 1, Math.max(0, x));
      y = Math.min(ht - 1, Math.max(0, y));
    }
    return src[(y * w + x) * 4] / 255;
  };
  for (let y = 0; y < ht; y++)
    for (let x = 0; x < w; x++) {
      const dx = (g(x + 1, y) - g(x - 1, y)) * strength,
        dy = (g(x, y + 1) - g(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  ctx.putImageData(out, 0, 0);
  return tex(c, false, true);
}

function speckle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  n: number,
  minS: number,
  maxS: number,
  light: [number, number],
  alpha: number,
  seed = 1,
) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const v = light[0] + r() * (light[1] - light[0]);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * (0.4 + r() * 0.6)})`;
    const s = minS + r() * (maxS - minS);
    ctx.beginPath();
    ctx.arc(r() * w, r() * h, s, 0, 6.3);
    ctx.fill();
  }
}

/** Road: albedo, roughness(G), normal. Covers full 12.8 m road width across U. */
export function makeAsphalt() {
  const W = 1024,
    H = 1024;
  const [c, x] = canvas(W, H);
  x.fillStyle = "#4b4c4e";
  x.fillRect(0, 0, W, H);
  speckle(x, W, H, 26000, 0.4, 1.4, [30, 150], 0.35, 3);
  speckle(x, W, H, 1500, 1.5, 4, [20, 80], 0.2, 4);
  // blotchy large-scale variation
  x.filter = "blur(28px)";
  const r = rng(77);
  for (let i = 0; i < 40; i++) {
    const v = 55 + r() * 40;
    x.fillStyle = `rgba(${v},${v},${v + 3},0.28)`;
    x.beginPath();
    x.ellipse(r() * W, r() * H, 40 + r() * 140, 30 + r() * 180, 0, 0, 6.3);
    x.fill();
  }
  x.filter = "none";
  // wheel tracks: lane centres east x=1.8, 4.6 ; west -1.8,-4.6 (road spans -6.4..6.4)
  const u = (m: number) => ((m + 6.4) / 12.8) * W;
  x.filter = "blur(10px)";
  for (const lane of [-4.6, -1.8, 1.8, 4.6])
    for (const off of [-0.75, 0.75]) {
      const px = u(lane + off);
      const g = x.createLinearGradient(px - 38, 0, px + 38, 0);
      g.addColorStop(0, "rgba(20,20,22,0)");
      g.addColorStop(0.5, "rgba(25,25,28,0.19)");
      g.addColorStop(1, "rgba(20,20,22,0)");
      x.fillStyle = g;
      x.fillRect(px - 38, 0, 76, H);
    }
  x.filter = "none";
  // asphalt patches (darker rectangular repairs) + cracks
  for (let i = 0; i < 7; i++) {
    x.fillStyle = `rgba(24,24,27,${0.12 + r() * 0.09})`;
    const pw = 70 + r() * 160,
      ph = 50 + r() * 120;
    x.fillRect(r() * W, r() * H, pw, ph);
  }
  x.strokeStyle = "rgba(15,15,15,0.7)";
  x.lineWidth = 1.2;
  for (let i = 0; i < 22; i++) {
    let px = r() * W,
      py = r() * H;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 14; k++) {
      px += (r() - 0.5) * 36;
      py += (r() - 0.35) * 30;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  // roughness: G channel
  const [rc, rx] = canvas(W, H);
  rx.fillStyle = "rgb(255,235,0)";
  rx.fillRect(0, 0, W, H);
  speckle(rx, W, H, 18000, 0.5, 2, [180, 255], 0.6, 8);
  rx.filter = "blur(10px)";
  for (const lane of [-4.6, -1.8, 1.8, 4.6])
    for (const off of [-0.75, 0.75]) {
      const px = u(lane + off);
      rx.fillStyle = "rgba(0,150,0,0.5)";
      rx.fillRect(px - 30, 0, 60, H);
    }
  rx.filter = "none";
  // height
  const [hc, hx] = canvas(W, H);
  hx.fillStyle = "#808080";
  hx.fillRect(0, 0, W, H);
  speckle(hx, W, H, 60000, 0.5, 1.6, [20, 235], 0.6, 11);
  hx.strokeStyle = "#101010";
  hx.lineWidth = 2;
  for (let i = 0; i < 22; i++) {
    let px = r() * W,
      py = r() * H;
    hx.beginPath();
    hx.moveTo(px, py);
    for (let k = 0; k < 14; k++) {
      px += (r() - 0.5) * 36;
      py += (r() - 0.35) * 30;
      hx.lineTo(px, py);
    }
    hx.stroke();
  }
  const map = tex(c, true, true),
    rough = tex(rc, false, true),
    normal = heightToNormal(hc, 2.6);
  return { map, rough, normal };
}
