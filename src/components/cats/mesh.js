// Smooth deformation of the original cat drawings.
//
// Each sprite is covered by a fine grid mesh and every vertex is weighted to a
// small skeleton (body, legs, tail chain, head, ears). Moving the bones bends
// the drawing like a 2D puppet in Spine or Live2D: the image itself is never
// cut, so there are no seams. The mesh is only split through fully
// transparent gaps (e.g. between two legs) so those limbs can move freely.

export const DEG = Math.PI / 180;

// --- 2D affine matrices [a, b, c, d, e, f] (canvas transform order) ------------
export const mat = {
  identity: () => [1, 0, 0, 1, 0, 0],
  mul(m, n) {
    return [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4],
      m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  },
  translate: (x, y) => [1, 0, 0, 1, x, y],
  rotate: (r) => [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0],
  scale: (x, y) => [x, 0, 0, y, 0, 0],
  apply: (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]],
  // rotate by `r` and stretch by `k` along the unit axis `u`, about point p
  about(p, r = 0, k = 1, u = [0, 1], w = 1) {
    let m = mat.translate(p[0], p[1]);
    if (r) m = mat.mul(m, mat.rotate(r));
    if (k !== 1 || w !== 1) {
      const a = Math.atan2(u[1], u[0]);
      m = mat.mul(m, mat.mul(mat.rotate(a), mat.mul(mat.scale(k, w), mat.rotate(-a))));
    }
    return mat.mul(m, mat.translate(-p[0], -p[1]));
  },
};

const pointInPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// Projects a point on a polyline: arc-length parameter s in [0, 1] and distance d.
function chainParam(chain, x, y) {
  let best = { d: Infinity, s: 0 };
  let total = 0;
  const lengths = [];
  for (let i = 0; i < chain.length - 1; i += 1) {
    const l = Math.hypot(chain[i + 1][0] - chain[i][0], chain[i + 1][1] - chain[i][1]);
    lengths.push(l);
    total += l;
  }
  let acc = 0;
  for (let i = 0; i < chain.length - 1; i += 1) {
    const [ax, ay] = chain[i];
    const [bx, by] = chain[i + 1];
    const dx = bx - ax; const dy = by - ay;
    const t = Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / (lengths[i] * lengths[i] || 1), -0.5), 1.5);
    const px = ax + dx * Math.min(Math.max(t, 0), 1);
    const py = ay + dy * Math.min(Math.max(t, 0), 1);
    const d = Math.hypot(x - px, y - py);
    if (d < best.d) best = { d, s: (acc + t * lengths[i]) / total };
    acc += lengths[i];
  }
  return best;
}

// Builds the mesh for one sprite. `rig.parts` lists the bones; the implicit
// root part "body" owns everything not claimed by another part's polygon.
export function buildMesh(image, rig, cell = 10) {
  const w = image.width;
  const h = image.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.drawImage(image, 0, 0);
  const alpha = g.getImageData(0, 0, w, h).data;
  const parts = [{ name: "body", z: rig.bodyZ ?? 50 }, ...(rig.parts || [])];
  const index = Object.fromEntries(parts.map((part, i) => [part.name, i]));
  const parentOf = parts.map((part) => (part.parent ? index[part.parent] : part.name === "body" ? -1 : 0));
  const depth = parts.map((_, i) => { let d = 0; for (let p = parentOf[i]; p >= 0; p = parentOf[p]) d += 1; return d; });
  const isAncestor = (a, b) => { for (let p = parentOf[b]; p >= 0; p = parentOf[p]) if (p === a) return true; return false; };
  const claimants = parts.map((part, i) => ({ part, i })).filter(({ part }) => part.poly).sort((a, b) => (a.part.priority ?? 0) - (b.part.priority ?? 0));
  const partAt = (x, y) => {
    for (const { part, i } of claimants) if (pointInPoly(x, y, part.poly)) return i;
    return 0;
  };

  // label every grid cell with the part that owns most of its opaque pixels
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const labels = new Int16Array(cols * rows).fill(-1);
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const counts = new Map();
      for (let y = cy * cell; y < Math.min(h, (cy + 1) * cell); y += 2) {
        for (let x = cx * cell; x < Math.min(w, (cx + 1) * cell); x += 2) {
          if (alpha[(y * w + x) * 4 + 3] < 6) continue;
          const p = partAt(x, y);
          counts.set(p, (counts.get(p) || 0) + 1);
        }
      }
      let best = -1; let bestN = 0;
      counts.forEach((n, p) => { if (n > bestN) { bestN = n; best = p; } });
      labels[cy * cols + cx] = best;
    }
  }
  // one cell of margin around the silhouette for soft edges
  const grown = labels.slice();
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      if (labels[cy * cols + cx] >= 0) continue;
      for (let dy = -1; dy <= 1 && grown[cy * cols + cx] < 0; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = cx + dx; const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const l = labels[ny * cols + nx];
          if (l >= 0) { grown[cy * cols + cx] = l; break; }
        }
      }
    }
  }
  const label = (cx, cy) => (cx < 0 || cy < 0 || cx >= cols || cy >= rows ? -1 : grown[cy * cols + cx]);
  // parts on one branch (an ear and the body under it) stay stitched together
  const connected = (a, b) => a === b || isAncestor(a, b) || isAncestor(b, a);

  // vertices: shared between neighbouring cells only if their parts connect
  const positions = [];
  const vertexParts = [];
  const keys = new Map();
  const vertexFor = (vx, vy, part) => {
    const around = new Set();
    [[vx - 1, vy - 1], [vx, vy - 1], [vx - 1, vy], [vx, vy]].forEach(([cx, cy]) => {
      const l = label(cx, cy);
      if (l >= 0) around.add(l);
    });
    // component of `part` among the labels meeting at this corner
    const comp = new Set([part]);
    let grew = true;
    while (grew) {
      grew = false;
      around.forEach((l) => {
        if (comp.has(l)) return;
        for (const c of comp) if (connected(c, l)) { comp.add(l); grew = true; break; }
      });
    }
    const id = Math.min(...comp);
    const key = `${vx},${vy},${id}`;
    let v = keys.get(key);
    if (v === undefined) {
      v = positions.length / 2;
      positions.push(Math.min(vx * cell, w), Math.min(vy * cell, h));
      vertexParts.push(comp);
      keys.set(key, v);
    }
    return v;
  };
  const triangles = parts.map(() => []);
  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      const l = label(cx, cy);
      if (l < 0) continue;
      const a = vertexFor(cx, cy, l);
      const b = vertexFor(cx + 1, cy, l);
      const c = vertexFor(cx, cy + 1, l);
      const d = vertexFor(cx + 1, cy + 1, l);
      triangles[l].push(a, b, d, a, d, c);
    }
  }

  // How far along a limb a point sits: 0 at the joint (or on the base line, for
  // ears), growing toward the tip. `falloff` is where the limb takes over.
  const along = (part, x, y) => {
    if (part.base) {
      const [[x0, y0], [x1, y1]] = part.base;
      const l = Math.hypot(x1 - x0, y1 - y0) || 1;
      let nx = -(y1 - y0) / l;
      let ny = (x1 - x0) / l;
      if ((part.axis[0] - x0) * nx + (part.axis[1] - y0) * ny < 0) { nx = -nx; ny = -ny; }
      return (x - x0) * nx + (y - y0) * ny;
    }
    const [jx, jy] = part.joint;
    const [ax, ay] = part.axis;
    return ((x - jx) * (ax - jx) + (y - jy) * (ay - jy)) / (Math.hypot(ax - jx, ay - jy) || 1);
  };
  const limbAmount = (part, x, y) => {
    const r = part.blend ?? 14;
    const [from, to] = part.falloff || [-r, r];
    const amount = smoothstep(from, to, along(part, x, y));
    if (!part.spread || amount <= 0) return amount;
    // fade out sideways too (in base half-widths), so fur between two close
    // ears is never pulled both ways at once
    const [[x0, y0], [x1, y1]] = part.base;
    const [jx, jy] = part.joint;
    const l = Math.hypot(part.axis[0] - jx, part.axis[1] - jy) || 1;
    const across = Math.abs(((x - jx) * (part.axis[1] - jy) - (y - jy) * (part.axis[0] - jx)) / l);
    const half = Math.hypot(x1 - x0, y1 - y0) / 2;
    return amount * (1 - smoothstep(half * part.spread[0], half * part.spread[1], across));
  };

  // skinning weights: each part pulls its own vertices, blending into its
  // parent around the joint so bends stay smooth
  const count = positions.length / 2;
  const bones = new Uint8Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let v = 0; v < count; v += 1) {
    const x = positions[v * 2];
    const y = positions[v * 2 + 1];
    const own = vertexParts[v];
    const influence = new Map();
    parts.forEach((part, i) => {
      if (i === 0) return;
      const mine = own.has(i);
      const nearParent = own.has(parentOf[i]);
      if (!mine && !nearParent) return;
      const r = part.blend ?? 14;
      if (part.chain) {
        // tail: spread along the chain, each joint taking the stretch past it
        const { s, d } = chainParam(part.chain, x, y);
        const base = smoothstep(-0.05, 0.08, s);
        const amount = mine ? base : d < r * 1.6 && s < 0.12 ? base * 0.5 : 0;
        if (amount <= 0) return;
        const segments = part.chain.length - 1;
        const f = Math.min(Math.max(s, 0), 1) * segments;
        for (let k = 0; k < segments; k += 1) {
          const wk = Math.max(0, 1 - Math.abs(f - (k + 0.5)));
          if (k === 0 && f < 0.5) influence.set(`${i}:${k}`, amount);
          else if (k === segments - 1 && f > segments - 0.5) influence.set(`${i}:${k}`, amount);
          else if (wk > 0) influence.set(`${i}:${k}`, amount * wk);
        }
        return;
      }
      let amount = limbAmount(part, x, y);
      if (!mine) amount *= Math.hypot(x - part.joint[0], y - part.joint[1]) < r * 1.8 ? 0.5 : 0;
      if (amount > 0) influence.set(`${i}:0`, amount);
    });
    let total = 0;
    influence.forEach((value) => { total += value; });
    if (total > 1) { influence.forEach((value, key) => influence.set(key, value / total)); total = 1; }
    const entries = [...influence.entries()].sort((p, q) => q[1] - p[1]).slice(0, 3);
    // What is left over passes up the hierarchy: to the strongest part's
    // parent, or, if nothing pulls on this vertex, from the part it belongs to
    // (so the base of an ear follows the head, not the body).
    let rest = 1 - entries.reduce((sum, [, value]) => sum + value, 0);
    const lead = entries.length ? Number(entries[0][0].split(":")[0]) : 0;
    let up = lead ? parentOf[lead] : [...own].reduce((a, b) => (depth[b] > depth[a] ? b : a), 0);
    while (rest > 0.0001 && up > 0) {
      const amount = parts[up].chain ? 0 : limbAmount(parts[up], x, y);
      if (amount > 0) { entries.push([`${up}:0`, rest * amount]); rest *= 1 - amount; }
      up = parentOf[up];
    }
    if (rest > 0.0001) entries.push(["0:0", rest]);
    const merged = new Map();
    entries.forEach(([key, value]) => merged.set(key, (merged.get(key) || 0) + value));
    const kept = [...merged.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4);
    const sum = kept.reduce((acc, [, value]) => acc + value, 0);
    kept.forEach(([key, value], k) => {
      const [p, seg] = key.split(":").map(Number);
      bones[v * 4 + k] = boneIndex(parts, p, seg);
      weights[v * 4 + k] = value / sum;
    });
  }

  // Optional gentle reshaping (e.g. a rounder rump): every vertex and joint
  // moves through the same smooth warp, so the drawing stays continuous.
  const bulge = bulgeWarp(rig.bulge);
  const lift = liftWarp(rig.lift);
  const warp = (x, y) => lift(...bulge(x, y));
  const warpPoint = (point) => (point ? warp(point[0], point[1]) : point);
  const uvs = new Float32Array(positions.map((value, k) => value / (k % 2 === 0 ? w : h)));
  for (let v = 0; v < count; v += 1) {
    const [wx, wy] = warp(positions[v * 2], positions[v * 2 + 1]);
    positions[v * 2] = wx;
    positions[v * 2 + 1] = wy;
  }
  const shaped = parts.map((part) => ({
    ...part,
    joint: warpPoint(part.joint),
    axis: warpPoint(part.axis),
    chain: part.chain && part.chain.map(warpPoint),
  }));

  const order = parts.map((part, i) => ({ i, z: part.z ?? 50 })).sort((a, b) => a.z - b.z);
  const indexList = [];
  const ranges = {};
  order.forEach(({ i }) => {
    ranges[parts[i].name] = { start: indexList.length, count: triangles[i].length };
    indexList.push(...triangles[i]);
  });
  return {
    width: w,
    height: h,
    parts: shaped,
    boneCount: boneIndex(parts, parts.length, 0),
    rest: new Float32Array(positions),
    uvs,
    bones,
    weights,
    indices: new Uint16Array(indexList),
    ranges,
    order: order.map(({ i }) => parts[i].name),
    out: new Float32Array(positions.length),
  };
}

function bulgeWarp(bulge) {
  if (!bulge) return (x, y) => [x, y];
  const { center: [cx, cy], inner, outer, scale: [sx, sy] } = bulge;
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const f = 1 - smoothstep(inner, outer, Math.hypot(dx, dy));
    return [cx + dx * (1 + (sx - 1) * f), cy + dy * (1 + (sy - 1) * f)];
  };
}

// Pushes a soft oval region by `move`, fading out at its edge (e.g. to raise
// and round the top of a rump).
function liftWarp(lift) {
  if (!lift) return (x, y) => [x, y];
  const { center: [cx, cy], radius: [rx, ry], move: [mx, my] } = lift;
  return (x, y) => {
    const f = 1 - smoothstep(0, 1, Math.hypot((x - cx) / rx, (y - cy) / ry));
    return [x + mx * f, y + my * f];
  };
}

// Bone slots: one per part, plus one per extra tail segment.
function boneIndex(parts, partIndex, segment) {
  let slot = 0;
  for (let i = 0; i < partIndex; i += 1) slot += parts[i].chain ? parts[i].chain.length - 1 : 1;
  return slot + segment;
}

// Bone matrices for a pose. `pose` maps part names to { rot, k, w, dx, dy } and
// chains to arrays of per-joint rotations; parents are applied first.
export function boneMatrices(mesh, pose) {
  const out = new Array(mesh.boneCount);
  const world = {};
  const resolve = (part) => {
    if (world[part.name]) return world[part.name];
    const parent = part.parent ? mesh.parts.find((p) => p.name === part.parent) : part.name === "body" ? null : mesh.parts[0];
    const base = parent ? resolve(parent) : pose.root || mat.identity();
    const q = pose[part.name] || {};
    let local;
    if (part.name === "body") {
      local = mat.mul(mat.translate(q.dx || 0, q.dy || 0), mat.about(q.pivot || [0, 0], q.rot || 0, q.k || 1, [0, 1], q.w || 1));
    } else if (part.chain) {
      local = mat.translate(q.dx || 0, q.dy || 0);
    } else {
      const axis = [part.axis[0] - part.joint[0], part.axis[1] - part.joint[1]];
      const l = Math.hypot(axis[0], axis[1]) || 1;
      local = mat.mul(mat.translate(q.dx || 0, q.dy || 0), mat.about(part.joint, q.rot || 0, q.k || 1, [axis[0] / l, axis[1] / l], q.w || 1));
    }
    world[part.name] = mat.mul(base, local);
    return world[part.name];
  };
  mesh.parts.forEach((part, i) => {
    const m = resolve(part);
    const slot = boneIndex(mesh.parts, i, 0);
    if (!part.chain) { out[slot] = m; return; }
    // chain: each joint rotates everything after it
    const rots = pose[`${part.name}Chain`] || [];
    const puff = pose[part.name]?.w || 1;
    let acc = m;
    for (let k = 0; k < part.chain.length - 1; k += 1) {
      const joint = part.chain[k];
      const next = part.chain[k + 1];
      const axis = [next[0] - joint[0], next[1] - joint[1]];
      const l = Math.hypot(axis[0], axis[1]) || 1;
      acc = mat.mul(acc, mat.about(joint, rots[k] || 0, 1, [axis[0] / l, axis[1] / l], 1));
      out[slot + k] = puff !== 1 ? mat.mul(acc, mat.about(joint, 0, 1, [axis[0] / l, axis[1] / l], puff)) : acc;
    }
  });
  return { bones: out, world };
}

// Skins the mesh and maps it into canvas space with `view`.
export function skin(mesh, bones, view) {
  const { rest, out } = mesh;
  const b = mesh.bones;
  const wt = mesh.weights;
  for (let v = 0, n = rest.length / 2; v < n; v += 1) {
    const x = rest[v * 2];
    const y = rest[v * 2 + 1];
    let sx = 0;
    let sy = 0;
    for (let k = 0; k < 4; k += 1) {
      const weight = wt[v * 4 + k];
      if (!weight) continue;
      const m = bones[b[v * 4 + k]];
      sx += weight * (m[0] * x + m[2] * y + m[4]);
      sy += weight * (m[1] * x + m[3] * y + m[5]);
    }
    out[v * 2] = view[0] * sx + view[2] * sy + view[4];
    out[v * 2 + 1] = view[1] * sx + view[3] * sy + view[5];
  }
  return out;
}

// --- WebGL drawing -------------------------------------------------------------
const SHADERS = {
  2: {
    vert: `#version 300 es
in vec2 a_pos; in vec2 a_uv; uniform vec2 u_view; out vec2 v_uv;
void main() { vec2 p = a_pos / u_view * 2.0 - 1.0; gl_Position = vec4(p.x, -p.y, 0.0, 1.0); v_uv = a_uv; }`,
    frag: `#version 300 es
precision mediump float; in vec2 v_uv; uniform sampler2D u_tex; uniform float u_alpha; out vec4 color;
void main() { color = texture(u_tex, v_uv) * u_alpha; }`,
  },
  1: {
    vert: `attribute vec2 a_pos; attribute vec2 a_uv; uniform vec2 u_view; varying vec2 v_uv;
void main() { vec2 p = a_pos / u_view * 2.0 - 1.0; gl_Position = vec4(p.x, -p.y, 0.0, 1.0); v_uv = a_uv; }`,
    frag: `precision mediump float; varying vec2 v_uv; uniform sampler2D u_tex; uniform float u_alpha;
void main() { gl_FragColor = texture2D(u_tex, v_uv) * u_alpha; }`,
  },
};

export function createRenderer(canvas) {
  const options = { premultipliedAlpha: true, alpha: true, antialias: true };
  let gl = canvas.getContext("webgl2", options);
  const version = gl ? 2 : 1;
  if (!gl) gl = canvas.getContext("webgl", options);
  if (!gl) return null;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, SHADERS[version].vert));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, SHADERS[version].frag));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  const loc = {
    pos: gl.getAttribLocation(program, "a_pos"),
    uv: gl.getAttribLocation(program, "a_uv"),
    view: gl.getUniformLocation(program, "u_view"),
    alpha: gl.getUniformLocation(program, "u_alpha"),
  };
  const positionBuffer = gl.createBuffer();
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const textures = new Map();
  const meshBuffers = new Map();

  return {
    texture(image) {
      let texture = textures.get(image);
      if (texture) return texture;
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (version === 2) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      textures.set(image, texture);
      return texture;
    },
    begin(width, height, dpr) {
      gl.viewport(0, 0, Math.round(width * dpr), Math.round(height * dpr));
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(loc.view, width, height);
    },
    draw(mesh, positions, image, alpha = 1, order = mesh.order) {
      let buffers = meshBuffers.get(mesh);
      if (!buffers) {
        const uv = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uv);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);
        const index = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
        buffers = { uv, index };
        meshBuffers.set(mesh, buffers);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(loc.pos);
      gl.vertexAttribPointer(loc.pos, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.uv);
      gl.enableVertexAttribArray(loc.uv);
      gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture(image));
      gl.uniform1f(loc.alpha, alpha);
      order.forEach((name) => {
        const range = mesh.ranges[name];
        if (range && range.count) gl.drawElements(gl.TRIANGLES, range.count, gl.UNSIGNED_SHORT, range.start * 2);
      });
    },
    lost: () => gl.isContextLost(),
  };
}
