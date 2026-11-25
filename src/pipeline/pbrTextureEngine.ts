import * as THREE from 'three';
import type { MaterialPattern, PartMaterialSpec, PBRMapPreview } from '../types/polygen';

export interface GeneratedPBRTextures {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  metalnessMap: THREE.CanvasTexture;
  preview: PBRMapPreview;
}

function hash2D(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const n00 = hash2D(xi, yi, seed);
  const n10 = hash2D(xi + 1, yi, seed);
  const n01 = hash2D(xi, yi + 1, seed);
  const n11 = hash2D(xi + 1, yi + 1, seed);

  const nx0 = n00 * (1 - u) + n10 * u;
  const nx1 = n01 * (1 - u) + n11 * u;
  return nx0 * (1 - v) + nx1 * v;
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * valueNoise(x * freq, y * freq, seed + i * 17);
    freq *= 2.02;
    amp *= 0.5;
  }
  return val;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0');
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [140, 148, 160];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function computePatternField(
  u: number,
  v: number,
  pattern: MaterialPattern,
  seed: number
): { mix: number; height: number; roughMod: number; metalMod: number } {
  switch (pattern) {
    case 'rusted_iron': {
      const base = fbm(u * 6, v * 6, seed, 4);
      const rustPatch = fbm(u * 3.5 + 11, v * 3.5 + 7, seed + 5, 4);
      const pits = valueNoise(u * 28, v * 28, seed + 9);
      const isRust = Math.max(0, Math.min(1, (rustPatch - 0.42) * 3.2));
      return {
        mix: isRust,
        height: base * 0.65 - isRust * 0.25 + pits * 0.15,
        roughMod: isRust * 0.38,
        metalMod: -isRust * 0.62,
      };
    }

    case 'brushed_brass':
    case 'forged_metal': {
      const streak = fbm(u * 26, v * 2.5, seed, 3);
      const micro = fbm(u * 10, v * 10, seed + 3, 3);
      return {
        mix: streak * 0.5 + micro * 0.35,
        height: streak * 0.45 + micro * 0.35,
        roughMod: (streak - 0.5) * 0.18,
        metalMod: 0,
      };
    }

    case 'polished_wood': {
      const ring = Math.sin((u * 9 + fbm(u * 3, v * 2, seed, 3) * 2.8) * Math.PI);
      const grain = 0.5 + 0.5 * ring;
      return {
        mix: grain * 0.75,
        height: grain * 0.45 + valueNoise(u * 32, v * 4, seed) * 0.12,
        roughMod: grain * 0.15,
        metalMod: 0,
      };
    }

    case 'carved_stone': {
      const stone = fbm(u * 7, v * 7, seed, 4);
      const moss = fbm(u * 3.2, v * 3.2, seed + 23, 3);
      const pores = valueNoise(u * 34, v * 34, seed + 12);
      const mossFactor = Math.max(0, Math.min(1, (moss - 0.54) * 3.5));
      return {
        mix: mossFactor * 0.8 + stone * 0.2,
        height: stone * 0.75 - pores * 0.2,
        roughMod: 0.12,
        metalMod: 0,
      };
    }

    case 'carbon_weave': {
      const cx = Math.floor(u * 24);
      const cy = Math.floor(v * 24);
      const checker = (cx + cy) % 2 === 0 ? 1 : 0;
      const fx = (u * 24) % 1;
      const fy = (v * 24) % 1;
      const strand = checker ? Math.sin(fx * Math.PI) : Math.sin(fy * Math.PI);
      return {
        mix: 1 - strand * 0.65,
        height: strand * 0.6,
        roughMod: (1 - strand) * 0.2,
        metalMod: strand * 0.12,
      };
    }

    case 'obsidian_crystal': {
      const facet = fbm(u * 8, v * 8, seed, 3);
      const vein = Math.abs(fbm(u * 5, v * 5, seed + 19, 3) - 0.5) * 2;
      return {
        mix: 1 - vein * 0.6,
        height: facet * 0.35 + (1 - vein) * 0.2,
        roughMod: -0.05,
        metalMod: 0,
      };
    }

    case 'ceramic_glaze':
    default: {
      const glaze = fbm(u * 5, v * 5, seed, 3);
      return {
        mix: glaze * 0.35,
        height: glaze * 0.22,
        roughMod: (glaze - 0.5) * 0.1,
        metalMod: 0,
      };
    }
  }
}

export function synthesizePBRTextures(
  partName: string,
  mat: PartMaterialSpec,
  maxAnisotropy: number,
  size = 256
): GeneratedPBRTextures {
  const seed = Array.from(partName).reduce((acc, ch) => acc + ch.charCodeAt(0), 13);
  const [r1, g1, b1] = hexToRgb(mat.baseColor);
  const [r2, g2, b2] = hexToRgb(mat.secondaryColor);

  const albedoCanvas = document.createElement('canvas');
  const normalCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  const metalCanvas = document.createElement('canvas');

  [albedoCanvas, normalCanvas, roughCanvas, metalCanvas].forEach((c) => {
    c.width = size;
    c.height = size;
  });

  const aCtx = albedoCanvas.getContext('2d')!;
  const nCtx = normalCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;
  const mCtx = metalCanvas.getContext('2d')!;

  const aImg = aCtx.createImageData(size, size);
  const nImg = nCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const mImg = mCtx.createImageData(size, size);

  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;
      const pIdx = idx * 4;

      const field = computePatternField(u, v, mat.pattern, seed);
      heights[idx] = field.height;

      const t = Math.max(0, Math.min(1, field.mix));
      aImg.data[pIdx] = Math.round(r1 * (1 - t) + r2 * t);
      aImg.data[pIdx + 1] = Math.round(g1 * (1 - t) + g2 * t);
      aImg.data[pIdx + 2] = Math.round(b1 * (1 - t) + b2 * t);
      aImg.data[pIdx + 3] = 255;

      const roughVal = Math.round(
        Math.max(0.05, Math.min(0.98, mat.roughness + field.roughMod)) * 255
      );
      rImg.data[pIdx] = roughVal;
      rImg.data[pIdx + 1] = roughVal;
      rImg.data[pIdx + 2] = roughVal;
      rImg.data[pIdx + 3] = 255;

      const metalVal = Math.round(
        Math.max(0.0, Math.min(1.0, mat.metalness + field.metalMod)) * 255
      );
      mImg.data[pIdx] = metalVal;
      mImg.data[pIdx + 1] = metalVal;
      mImg.data[pIdx + 2] = metalVal;
      mImg.data[pIdx + 3] = 255;
    }
  }

  // Sobel 3x3 Tangent-Space Normal Map derivation from heightfield
  const strength = 2.8;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const tl = heights[ym * size + xm];
      const tc = heights[ym * size + x];
      const tr = heights[ym * size + xp];
      const ml = heights[y * size + xm];
      const mr = heights[y * size + xp];
      const bl = heights[yp * size + xm];
      const bc = heights[yp * size + x];
      const br = heights[yp * size + xp];

      const gx = (tr + 2 * mr + br - (tl + 2 * ml + bl)) * strength;
      const gy = (bl + 2 * bc + br - (tl + 2 * tc + tr)) * strength;
      const gz = 1.0;

      const invLen = 1 / Math.hypot(gx, gy, gz);
      const pIdx = (y * size + x) * 4;
      nImg.data[pIdx] = Math.round((-gx * invLen * 0.5 + 0.5) * 255);
      nImg.data[pIdx + 1] = Math.round((-gy * invLen * 0.5 + 0.5) * 255);
      nImg.data[pIdx + 2] = Math.round((gz * invLen * 0.5 + 0.5) * 255);
      nImg.data[pIdx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  mCtx.putImageData(mImg, 0, 0);

  const makeTex = (canvas: HTMLCanvasElement, isColor: boolean) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = maxAnisotropy;
    tex.needsUpdate = true;
    return tex;
  };

  return {
    map: makeTex(albedoCanvas, true),
    normalMap: makeTex(normalCanvas, false),
    roughnessMap: makeTex(roughCanvas, false),
    metalnessMap: makeTex(metalCanvas, false),
    preview: {
      partName,
      pattern: mat.pattern,
      albedoUrl: albedoCanvas.toDataURL('image/png'),
      normalUrl: normalCanvas.toDataURL('image/png'),
      roughnessUrl: roughCanvas.toDataURL('image/png'),
      metalnessUrl: metalCanvas.toDataURL('image/png'),
    },
  };
}

export function createUVCheckerTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const cells = 8;
  const cellSize = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const dark = (x + y) % 2 === 0;
      ctx.fillStyle = dark ? '#1e293b' : '#e2e8f0';
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);

      ctx.fillStyle = dark ? '#94a3b8' : '#334155';
      ctx.font = '600 13px monospace';
      ctx.fillText(`${String.fromCharCode(65 + x)}${y + 1}`, x * cellSize + 8, y * cellSize + 20);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}
