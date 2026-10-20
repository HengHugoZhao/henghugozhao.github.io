// The cat tree, painted as pixel art to match the cats. Everything is in art
// pixels: the canvas is scaled up with crisp, square pixels. The pads double
// as platforms (see CatTree.jsx), so their numbers are the single source.

export const TREE_W = 120;
export const TREE_H = 200;
export const CUSHION_LIFT = 3; // cushion top above the wood, art px

// centre of each wooden disc's top, and its radii
export const TREE_PADS = [
  { cx: 33, cy: 150, rx: 29, ry: 6 }, // low, left
  { cx: 87, cy: 113, rx: 29, ry: 6 }, // middle, right
  { cx: 34, cy: 75, rx: 26, ry: 5.5 }, // upper, left
  { cx: 80, cy: 37, rx: 31, ry: 6.5 }, // top
];

const WOOD = {
  shine: [244, 206, 150],
  light: [222, 166, 104],
  mid: [186, 124, 68],
  dark: [140, 88, 48],
  deep: [100, 60, 32],
  line: [62, 36, 20],
};
const CUSHION = {
  shine: [116, 124, 140],
  top: [84, 90, 104],
  low: [66, 71, 83],
  side: [46, 49, 58],
  line: [24, 25, 30],
};

// trunk centre-line (bottom to top) and branches out to under each pad
const TRUNK = [[60, 199], [58, 182], [61, 158], [57, 128], [61, 98], [59, 70], [62, 48]];
const BRANCHES = [
  { from: [57, 167], via: [46, 164], to: [37, 156], w0: 7, w1: 4 },
  { from: [63, 132], via: [75, 129], to: [83, 119], w0: 7, w1: 4 },
  { from: [58, 96], via: [47, 93], to: [38, 81], w0: 6, w1: 4 },
  { from: [61, 54], via: [67, 41], to: [76, 43], w0: 6, w1: 5 },
];

const trunkX = (y) => {
  // smooth through the centre-line points
  for (let i = 0; i < TRUNK.length - 1; i += 1) {
    const [x0, y0] = TRUNK[i];
    const [x1, y1] = TRUNK[i + 1];
    if (y <= y0 && y >= y1) {
      const t = (y0 - y) / (y0 - y1);
      const s = t * t * (3 - 2 * t);
      return x0 + (x1 - x0) * s;
    }
  }
  return TRUNK[TRUNK.length - 1][0];
};
const trunkWidth = (y) => {
  const base = 17 - (199 - y) * 0.06; // tapers upward
  const flare = (Math.max(0, y - 183) / 16) ** 2 * 20; // roots grip the floor
  return Math.max(base, 8) + flare;
};

export function paintTree() {
  const w = TREE_W;
  const h = TREE_H;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const wood = new Int8Array(w * h).fill(-1); // shade index per wood pixel
  const shades = [WOOD.shine, WOOD.light, WOOD.mid, WOOD.dark, WOOD.deep];
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    const k = a / 255;
    rgba[i] = r * k + rgba[i] * (1 - k);
    rgba[i + 1] = g * k + rgba[i + 1] * (1 - k);
    rgba[i + 2] = b * k + rgba[i + 2] * (1 - k);
    rgba[i + 3] = Math.max(rgba[i + 3], a);
  };

  // soft shadow on the floor
  for (let y = 192; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const d = ((x - 60) / 46) ** 2 + ((y - 198) / 3) ** 2;
      if (d < 1) set(x, y, [0, 0, 0], d < 0.45 ? 70 : 40);
    }
  }

  // trunk: lit from the left, with twisting bark grooves
  for (let y = 44; y < h; y += 1) {
    const cx = trunkX(y);
    const half = trunkWidth(y) / 2;
    const left = Math.round(cx - half);
    const right = Math.round(cx + half);
    // a twist: the lit band winds slowly around the trunk
    const twist = Math.sin(y / 23) * 0.08;
    for (let x = left; x <= right; x += 1) {
      const u = (x - left) / Math.max(right - left, 1) - twist;
      let shade = u < 0.2 ? 0 : u < 0.48 ? 1 : u < 0.8 ? 2 : 3;
      // one long groove winding up the trunk, and short bark marks
      const groove = cx + half * 0.25 + Math.sin(y / 13) * half * 0.45;
      if (y < 186 && Math.abs(x - groove) < 0.55) shade = Math.min(shade + 1, 4);
      if (y < 186 && u > 0.55 && (x * 7 + y * 3) % 23 === 0) shade = 4;
      wood[y * w + x] = shade;
    }
  }
  // knots
  [[60, 118, 1.4, 2.2], [57, 168, 1.2, 1.8]].forEach(([kx, ky, rx, ry]) => {
    for (let y = Math.floor(ky - ry); y <= ky + ry; y += 1) {
      for (let x = Math.floor(kx - rx); x <= kx + rx; x += 1) {
        if (((x - kx) / rx) ** 2 + ((y - ky) / ry) ** 2 <= 1 && wood[y * w + x] >= 0) wood[y * w + x] = 4;
      }
    }
  });
  // branches: lit on top, shaded underneath
  BRANCHES.forEach(({ from, via, to, w0, w1 }) => {
    for (let i = 0; i <= 60; i += 1) {
      const t = i / 60;
      const x = (1 - t) ** 2 * from[0] + 2 * (1 - t) * t * via[0] + t * t * to[0];
      const y = (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * via[1] + t * t * to[1];
      const r = (w0 + (w1 - w0) * t) / 2;
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy += 1) {
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx += 1) {
          if (dx * dx + dy * dy > r * r) continue;
          const px = Math.round(x + dx);
          const py = Math.round(y + dy);
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          const v = dy / r; // -1 top .. 1 bottom
          const shade = v < -0.45 ? 0 : v < 0.1 ? 1 : v < 0.6 ? 2 : 3;
          const k = py * w + px;
          wood[k] = wood[k] < 0 ? shade : Math.min(wood[k], shade);
        }
      }
    }
  });
  // paint the wood with a dark outline around its silhouette
  const inWood = (x, y) => x >= 0 && y >= 0 && x < w && y < h && wood[y * w + x] >= 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!inWood(x, y)) continue;
      const edge = !inWood(x - 1, y) || !inWood(x + 1, y) || !inWood(x, y - 1) || (y < h - 1 && !inWood(x, y + 1));
      set(x, y, edge ? WOOD.line : shades[wood[y * w + x]]);
    }
  }

  // pads: a wooden disc with a cushion on top
  TREE_PADS.forEach((pad) => paintPad(pad, set, w, h));
  return rgba;
}

function paintPad({ cx, cy, rx, ry }, set, w, h) {
  const t = 4; // wood thickness
  const inside = (x, y, ex, ey, erx, ery) => ((x + 0.5 - ex) / erx) ** 2 + ((y + 0.5 - ey) / ery) ** 2 <= 1;
  const discTop = (x, y) => inside(x, y, cx, cy, rx, ry);
  // the disc's rim below the top face
  const discSide = (x, y) => !discTop(x, y) && Math.abs(x + 0.5 - cx) <= rx && y + 0.5 > cy && y + 0.5 - t <= cy + ry * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / rx) ** 2));
  const disc = (x, y) => discTop(x, y) || discSide(x, y);
  const top = cy - CUSHION_LIFT;
  const crx = rx - 3;
  const cry = ry - 1.5;
  const cushionTop = (x, y) => inside(x, y, cx, top, crx, cry);
  const cushionSide = (x, y) => !cushionTop(x, y) && Math.abs(x + 0.5 - cx) <= crx && y + 0.5 > top && y + 0.5 - CUSHION_LIFT <= top + cry * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / crx) ** 2));
  const cushion = (x, y) => cushionTop(x, y) || cushionSide(x, y);
  const x0 = Math.floor(cx - rx - 1);
  const x1 = Math.ceil(cx + rx + 1);
  const y0 = Math.floor(top - cry - 1);
  const y1 = Math.ceil(cy + ry + t + 1);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (cushion(x, y)) {
        const edge = !cushion(x - 1, y) || !cushion(x + 1, y) || !cushion(x, y - 1) || !cushion(x, y + 1);
        let color;
        if (edge) color = CUSHION.line;
        else if (cushionSide(x, y)) color = CUSHION.side;
        else {
          const u = (x + 0.5 - cx) / crx;
          const v = (y + 0.5 - top) / cry;
          color = u * 0.6 + v < -0.55 ? CUSHION.shine : v < 0.35 ? CUSHION.top : CUSHION.low;
        }
        set(x, y, color);
      } else if (disc(x, y)) {
        const edge = !disc(x - 1, y) || !disc(x + 1, y) || !disc(x, y - 1) || !disc(x, y + 1);
        let color;
        if (edge) color = WOOD.line;
        else if (discSide(x, y)) color = (x + 0.5 - cx) / rx > 0.45 ? WOOD.deep : WOOD.dark;
        else {
          // a growth ring around the cushion, lit from the top left
          const ring = Math.abs(((x + 0.5 - cx) / (rx - 1.5)) ** 2 + ((y + 0.5 - cy) / (ry - 0.8)) ** 2 - 1) < 0.18;
          color = ring ? WOOD.mid : (x + 0.5 - cx) / rx < -0.5 ? WOOD.shine : WOOD.light;
        }
        set(x, y, color);
      }
    }
  }
}
