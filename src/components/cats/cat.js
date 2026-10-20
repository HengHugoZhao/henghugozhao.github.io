import { POSTURES } from "./data";
import { DEG, boneMatrices, createRenderer, mat, skin } from "./mesh";

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (min, max) => min + Math.random() * (max - min);
export const chance = (p) => Math.random() < p;
const smooth = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const ease = (t) => t * t * (3 - 2 * t);
const TAU = Math.PI * 2;

// Footfall timing per gait: fraction of the cycle a paw is on the ground,
// stride (body lengths per cycle), paw lift (fraction of hip height), how far
// the paw folds back at the wrist mid-swing (degrees) and the phase offset of
// each leg.
const GAITS = {
  walk: { duty: 0.6, stride: 0.3, lift: 0.13, fold: 70, offsets: { hindNear: 0, foreNear: 0.25, hindFar: 0.5, foreFar: 0.75 } },
  trot: { duty: 0.45, stride: 0.5, lift: 0.18, fold: 80, offsets: { hindNear: 0, foreFar: 0.02, hindFar: 0.5, foreNear: 0.52 } },
  gallop: { duty: 0.36, stride: 0.85, lift: 0.24, fold: 85, offsets: { hindFar: 0, hindNear: 0.1, foreNear: 0.5, foreFar: 0.62 } },
};

// Tail moods as offsets from the drawing (degrees; positive raises it).
const TAIL_MOODS = {
  relaxed: { base: 0, curl: 0, sway: 5, swayHz: 0.45 },
  happy: { base: 22, curl: 4, sway: 3, swayHz: 6, hook: 9 },
  curious: { base: 16, curl: 6, sway: 4, swayHz: 0.5, hook: 6 },
  hunt: { base: -38, curl: -2, flick: 16 },
  annoyed: { base: -8, curl: 0, lash: 18, lashHz: 1.3 },
  angry: { base: -6, curl: 0, lash: 28, lashHz: 2.2, puff: 1.15 },
  scared: { base: 26, curl: 0, puff: 1.45, sway: 2, swayHz: 9 },
  rest: { base: -30, curl: -3, flick: 8 },
  run: { base: -20, curl: 1, sway: 4, swayHz: 2.4 },
  sleepy: { base: 0, curl: 0, flick: 4 },
};

const SIDE_ALIASES = { sit: "relaxed" };
const LYING = new Set(["loaf", "sphinx", "sleep"]);

export class Cat {
  constructor({ definition, assets, elements, engine }) {
    this.def = definition;
    this.id = definition.id;
    this.name = definition.name;
    this.p = definition.personality;
    this.poses = definition.poses;
    this.assets = assets;
    this.engine = engine;
    this.el = elements.el;
    this.canvas = elements.canvas;
    this.shadowEl = elements.shadow;
    this.renderer = createRenderer(this.canvas);
    this.g2d = this.renderer ? null : this.canvas.getContext("2d");

    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.facing = 1;
    this.mode = "ground"; this.platform = null;
    this.goalX = null; this.goalSpeed = 0; this.accel = 1;
    this.turn = null;
    this.forcedPose = null;
    this.climbReach = 0;
    this.pitch = 0;
    this.heldAngle = 0; this.heldVel = 0; this.heldVx = 0;
    this.squash = 0; this.squashVel = 0;
    this.flight = null;
    this.fade = null;
    this.lastFrame = null;
    this.spritePose = "side";

    this.postureName = "stand";
    this.post = { ...POSTURES.stand };
    this.phase = Math.random();
    this.gait = "walk"; this.gaitSince = 0;
    this.stride = 0; // 0 standing .. 1 full strides
    this.sag = { hind: 0, fore: 0 };
    const sideParts = assets.meshes.side.parts;
    this.legs = sideParts.filter((part) => part.kind === "leg").map((part) => ({
      part, paw: sideParts.find((p) => p.kind === "paw" && p.parent === part.name),
      rest: Math.atan2(part.axis[0] - part.joint[0], part.axis[1] - part.joint[1]) / DEG,
      length: Math.hypot(part.axis[0] - part.joint[0], part.axis[1] - part.joint[1]),
      angle: null, lift: 0, fold: 0,
    }));
    const hipX = (role) => this.legs.find((leg) => leg.part.role === role).part.joint[0];
    this.span = Math.max(Math.abs(hipX("foreNear") - hipX("hindNear")), 40); // hips to shoulders, sprite px
    this.look = null;
    this.head = { rot: 0, vel: 0 };
    this.tailRot = {};
    this.tailVel = {};
    this.tailPuff = 1;
    this.tailFlick = 0; this.tailFlickAt = 0;
    this.tailMood = "relaxed";
    this.ears = { back: 0, front: 0 };
    this.earTwitchAt = rand(3, 8); this.earTwitch = null;
    this.eyes = 0; this.eyesMode = "auto"; this.blinkAt = rand(1, 4); this.blinkSeq = null;
    this.mouthWant = 0; // a little "meow"/yawn head lift
    this.dream = 0;
    this.breath = Math.random() * TAU;
    this.fx = { wiggle: 0, shake: 0, sniff: 0, lick: 0, knead: 0, lean: 0, swat: 0 };
    this.want = { wiggle: 0, sniff: 0, lick: 0, knead: 0, lean: 0, swat: 0 };

    this.t = 0; this.dt = 1 / 60;
    this.task = null; this.taskName = "idle"; this.taskPriority = 0;
    this.needs = { energy: rand(0.55, 0.9), social: rand(0.2, 0.5), boredom: rand(0.2, 0.5), annoyance: 0, affection: 0.3 };
    this.memory = { lastPet: -99, lastStartle: -99, habituation: 0, lastGreet: -99, lastZoomies: -99, strokes: 0, lastStroke: -99, petCount: 0, lastLanding: -99 };
    this.hearts = 0; this.zzz = false;
    this.hit = { x: 0, y: 0, w: 0, h: 0 };
    this.z = 0;
    this.measure();
  }

  // --- sizing -------------------------------------------------------------
  measure() {
    const side = this.poses.side;
    this.scale = this.def.scale * this.engine.sizeFactor;
    this.standH = (side.ground - 6) * this.scale;
    this.bodyLen = 0.62 * this.assets.images.side.width * this.scale;
    this.hipH = (side.ground - this.legs[0].part.joint[1]) * this.scale;
    this.comOffset = [(side.com[0] - side.anchor[0]) * this.scale, (side.com[1] - side.anchor[1]) * this.scale];
    // a canvas big enough for every pose, including swinging and rotated ones
    let up = side.ground + 70; let down = 40; let wide = Math.max(side.anchor[0], this.assets.images.side.width - side.anchor[0]) + 70;
    Object.entries(this.poses).forEach(([name, def]) => {
      if (name === "side") return;
      const image = this.assets.images[name];
      const [ax, ay] = def.anchor;
      const radius = Math.max(Math.hypot(ax, ay), Math.hypot(image.width - ax, ay), Math.hypot(ax, image.height - ay), Math.hypot(image.width - ax, image.height - ay));
      if (name === "held" || name === "cling") { down = Math.max(down, radius); wide = Math.max(wide, radius * 0.8); up = Math.max(up, ay + 40); }
      else if (name === "fall") { up = Math.max(up, radius - this.comOffset[1] / this.scale); down = Math.max(down, radius + this.comOffset[1] / this.scale); wide = Math.max(wide, radius); }
      else if (name === "climb") { up = Math.max(up, ay + 30); down = Math.max(down, image.height - def.hands[1] + 30); wide = Math.max(wide, Math.max(ax, image.width - ax) + 30); }
      else { up = Math.max(up, ay + 40); wide = Math.max(wide, Math.max(ax, image.width - ax) + 30); }
    });
    const s = this.scale;
    this.box = { up: Math.ceil(up * s), down: Math.ceil(down * s), side: Math.ceil(wide * s) };
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = this.box.side * 2;
    const height = this.box.up + this.box.down;
    if (this.canvas.width !== Math.round(width * this.dpr) || this.canvas.height !== Math.round(height * this.dpr)) {
      this.canvas.width = Math.round(width * this.dpr);
      this.canvas.height = Math.round(height * this.dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
  }

  // --- intent API used by behaviours -------------------------------------
  setPosture(name) { this.postureName = name; }
  snapPosture(name) {
    this.setPosture(name);
    const target = POSTURES[SIDE_ALIASES[name] || name];
    if (target) this.post = { ...target };
    this.legs.forEach((leg) => { leg.angle = null; leg.lift = 0; leg.fold = 0; });
  }
  get pose() {
    if (this.mode === "held" || this.mode === "cling" || this.mode === "climb" || this.mode === "air") return this.mode;
    return this.forcedPose || "normal";
  }
  moveTo(x, speed, accel = 1) {
    if (LYING.has(this.postureName)) this.postureName = "stand"; // get up first
    this.goalX = x; this.goalSpeed = speed; this.accel = accel;
  }
  stop() { this.goalX = null; this.goalSpeed = 0; }
  lookAt(point, smoothTrack = true, viewer = point === this.engine.pointer) {
    this.look = point ? { target: point, smooth: smoothTrack, viewer } : null;
  }
  get moving() { return Math.abs(this.vx) > 4; }
  center() {
    if (this.mode === "held") {
      const held = this.poses.held;
      return { x: this.x + (held.com[0] - held.anchor[0]) * this.scale * this.facing, y: this.y + (held.com[1] - held.anchor[1]) * this.scale };
    }
    if (this.mode === "cling" || this.mode === "climb") return { x: this.x - this.facing * this.bodyLen * 0.2, y: this.y + this.standH * 0.8 };
    return { x: this.x + this.comOffset[0] * this.facing, y: this.y + this.comOffset[1] };
  }
  headPoint() { return this.frame?.head || { x: this.x, y: this.y - this.standH }; }
  mouthPoint() { return this.frame?.mouth || this.headPoint(); }

  // Reference point changes (feet / hand / paws); the cross-fade keeps the
  // previous drawing where it was, so nothing jumps.
  rebase(newX, newY) { this.x = newX; this.y = newY; }

  pickUp() {
    // held by the scruff: the hand becomes the reference point
    const held = this.poses.held;
    const c = this.center();
    this.rebase(c.x - (held.com[0] - held.anchor[0]) * this.scale * this.facing, c.y - (held.com[1] - held.anchor[1]) * this.scale);
    this.mode = "held";
    this.platform = null;
    this.turn = null;
    this.forcedPose = null;
    this.zzz = false;
    this.heldAngle = 0;
    this.heldVel = 0;
    this.heldVx = 0;
    this.pitch = 0;
    this.tailMood = "annoyed";
  }

  releaseFromHold(vx, vy) {
    const held = this.poses.held;
    const comX = this.x + (held.com[0] - held.anchor[0]) * this.scale * this.facing;
    const comY = this.y + (held.com[1] - held.anchor[1]) * this.scale;
    const angle = this.heldAngle;
    if (Math.abs(vx) > 80) this.facing = Math.sign(vx);
    this.rebase(comX - this.comOffset[0] * this.facing, comY - this.comOffset[1]);
    this.mode = "air";
    this.vx = vx;
    this.vy = vy;
    this.flight = null;
    this.pitch = clamp(angle * this.facing * 0.6, -0.5, 0.5);
  }

  // --- physics -------------------------------------------------------------
  update(dt, t) {
    this.t = t;
    this.dt = dt;
    if (this.mode === "ground") this.updateGround(dt);
    else if (this.mode === "air") this.updateAir(dt);
    else if (this.mode === "held") this.updateHeld(dt);
    this.updateTurn(dt);
    this.animate(dt);
    this.updateNeeds(dt);
  }

  updateNeeds(dt) {
    const n = this.needs;
    const speed = Math.abs(this.vx) / Math.max(this.bodyLen, 1);
    const sleeping = this.pose === "sleep";
    // awake cats slowly get sleepy; running tires them, napping restores them
    const drain = speed > 3 ? 0.03 : speed > 1.2 ? 0.012 : speed > 0.1 ? 0.005 : 0.003;
    const restful = this.postureName === "loaf" || this.postureName === "sphinx";
    n.energy = clamp(n.energy + (sleeping ? 0.02 : restful ? 0.0012 - drain : -drain) * dt, 0, 1);
    n.social = clamp(n.social + 0.006 * this.p.social * dt, 0, 1);
    n.boredom = clamp(n.boredom + (speed < 0.1 && !sleeping ? 0.01 : -0.004) * dt, 0, 1);
    n.annoyance = clamp(n.annoyance - 0.05 * dt, 0, 1);
    this.memory.habituation = Math.max(0, this.memory.habituation - 0.01 * dt);
    if (this.hearts > 0) this.hearts -= dt;
  }

  updateGround(dt) {
    const platform = this.platform;
    if (!platform || platform.gone) { this.startFall(); return; }
    this.y = platform.y;
    let desired = 0;
    if (this.goalX != null && !this.turn && this.forcedPose !== "sleep") {
      const dx = this.goalX - this.x;
      const dist = Math.abs(dx);
      if (dist > 0.6) {
        const brake = (this.goalSpeed > this.bodyLen * 2.5 ? 7 : 3.4) * this.bodyLen;
        desired = Math.sign(dx) * Math.min(this.goalSpeed, Math.sqrt(2 * brake * dist));
        if (Math.sign(dx) !== this.facing && Math.abs(this.vx) < this.bodyLen * 0.5) {
          this.startTurn(Math.sign(dx));
          desired = 0;
        } else if (Math.sign(dx) !== this.facing) {
          desired = 0; // skid to a stop before turning around
        }
      }
    }
    const fast = Math.max(Math.abs(desired), Math.abs(this.vx)) > this.bodyLen * 2;
    const rate = (Math.abs(desired) > Math.abs(this.vx) ? (fast ? 9 : 3.2) : (fast ? 6 : 5)) * this.bodyLen * this.accel;
    this.vx += clamp(desired - this.vx, -rate * dt, rate * dt);
    if (Math.abs(this.vx) < 0.5 && desired === 0) this.vx = 0;
    this.prevX = this.x;
    this.x += this.vx * dt;
    const margin = this.bodyLen * 0.38;
    const minX = platform.left + margin;
    const maxX = platform.right - margin;
    if (this.x < minX || this.x > maxX) {
      this.x = clamp(this.x, minX, Math.max(minX, maxX));
      this.vx = 0;
    }
    this.vy = 0;
  }

  startFall(vx = this.vx * 0.6, vy = 0) {
    this.mode = "air";
    this.platform = null;
    this.vx = vx; this.vy = vy;
    this.flight = null;
  }

  launch(vx, vy, flight = "leap") {
    this.mode = "air";
    this.platform = null;
    this.vx = vx; this.vy = vy;
    this.flight = flight;
  }

  updateAir(dt) {
    const world = this.engine.world;
    const g = this.engine.gravity;
    const prevY = this.y;
    this.vy = Math.min(this.vy + g * dt, g * 1.1);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < this.bodyLen * 0.4) { this.x = this.bodyLen * 0.4; this.vx = Math.abs(this.vx) * 0.3; }
    if (this.x > world.width - this.bodyLen * 0.4) { this.x = world.width - this.bodyLen * 0.4; this.vx = -Math.abs(this.vx) * 0.3; }
    if (this.y < this.standH * 0.8 && this.vy < 0) { this.y = this.standH * 0.8; this.vy = 0; }
    if (Math.abs(this.vx) > 30) this.facing = Math.sign(this.vx);
    // nose follows the trajectory
    const speed = Math.hypot(this.vx, this.vy);
    const target = speed > 60 && this.flight !== "hop" ? clamp(Math.atan2(this.vy, Math.abs(this.vx) + 80) * 0.5, -0.5, 0.45) : 0;
    this.pitch = smooth(this.pitch, target, 9, dt);
    if (this.vy > 0) {
      const landing = world.landingFor(this, prevY, this.y);
      if (landing) { this.land(landing); return; }
      const ledge = this.vy > 120 && this.wantsLedge && world.ledgeFor(this, prevY, this.y);
      if (ledge) { this.catchLedge(ledge); return; }
    }
    if (this.y > world.height + 400) this.engine.respawn(this);
  }

  land(platform) {
    const impact = clamp(this.vy / (this.engine.gravity * 0.55), 0, 1.2);
    this.mode = "ground";
    this.platform = platform;
    this.y = platform.y;
    this.vy = 0;
    this.vx *= 0.25;
    this.pitch = 0;
    this.flight = null;
    this.squashVel = 3 + impact * 5;
    this.landImpact = impact;
    this.memory.lastLanding = this.t;
    this.setPosture(impact > 0.6 ? "crouch" : "stand");
    this.engine.onLanding(this, platform, impact);
  }

  catchLedge(ledge) {
    this.mode = "cling";
    this.ledge = ledge;
    this.facing = ledge.side === "left" ? 1 : -1;
    this.rebase(ledge.x, ledge.y);
    this.vx = 0; this.vy = 0;
    this.pitch = 0;
  }

  updateHeld(dt) {
    const grip = this.engine.pointer;
    const follow = 1 - Math.exp(-28 * dt);
    const px = this.x;
    this.x += (grip.x - this.x) * follow;
    this.y += (grip.y - this.y) * follow;
    const vx = (this.x - px) / Math.max(dt, 1e-3);
    const accel = (vx - this.heldVx) / Math.max(dt, 1e-3);
    this.heldVx = vx;
    // dangling pendulum: swings opposite to the hand's acceleration
    const length = this.standH * 1.25;
    const torque = -(this.engine.gravity / length) * Math.sin(this.heldAngle) - (accel / length) * Math.cos(this.heldAngle) * 0.9;
    this.heldVel += torque * dt;
    this.heldVel *= Math.exp(-2.6 * dt);
    this.heldAngle = clamp(this.heldAngle + this.heldVel * dt, -1.1, 1.1);
    this.vx = vx;
  }

  // --- turning: the front (or back) view shows for a moment mid-turn ------
  startTurn(direction, options = {}) {
    if (this.turn || direction === this.facing) return;
    const via = options.via || (this.look || chance(0.55) ? "front" : "back");
    this.turn = { t: 0, dur: options.dur || clamp(rand(0.28, 0.42) / (this.p.playful > 0.8 ? 1.15 : 1), 0.2, 0.5), to: direction, via, flipped: false };
  }

  updateTurn(dt) {
    const turn = this.turn;
    if (!turn) return;
    if (this.mode !== "ground") { this.turn = null; return; }
    turn.t += dt / turn.dur;
    this.vx *= Math.exp(-10 * dt);
    if (turn.t >= 0.5 && !turn.flipped) {
      turn.flipped = true;
      this.facing = turn.to;
      this.legs.forEach((leg) => { leg.angle = null; });
    }
    if (turn.t >= 1) this.turn = null;
  }

  slowBlink() {
    this.blinkSeq = [{ eyes: 1, t: rand(0.5, 0.8) }];
    this.blinkAt = this.t + rand(3, 6);
  }

  // --- animation -----------------------------------------------------------
  animate(dt) {
    const t = this.t;
    // squash spring (landing / take-off)
    this.squashVel += (-180 * this.squash - 16 * this.squashVel) * dt;
    this.squash = clamp(this.squash + this.squashVel * dt, -0.18, 0.3);
    const lying = this.mode === "ground" && (this.forcedPose === "sleep" || LYING.has(this.postureName));
    this.breath += dt * TAU * (lying ? 0.28 : 0.45 + Math.min(Math.abs(this.vx) / (this.bodyLen * 6), 0.6));
    Object.keys(this.want).forEach((key) => { this.fx[key] = smooth(this.fx[key], this.want[key], key === "swat" ? 22 : 9, dt); });
    this.fx.shake = Math.max(0, this.fx.shake - dt * 1.6);
    // posture glides toward its target
    const target = POSTURES[SIDE_ALIASES[this.postureName] || this.postureName] || POSTURES.stand;
    const rate = this.postureRate || 7;
    ["drop", "tilt", "head", "tail", "ears"].forEach((key) => { this.post[key] = smooth(this.post[key], target[key], rate, dt); });
    this.post.reach = target.reach || null;
    // eyes
    if (this.blinkSeq) {
      const step = this.blinkSeq[0];
      step.t -= dt;
      this.eyes = step.eyes;
      if (step.t <= 0) this.blinkSeq.shift();
      if (!this.blinkSeq.length) this.blinkSeq = null;
    } else {
      this.eyes = this.eyesMode === "closed" || this.eyesMode === "happy" ? 1 : 0;
      if (!this.eyes && t > this.blinkAt) {
        this.blinkSeq = chance(0.2) ? [{ eyes: 1, t: 0.09 }, { eyes: 0, t: 0.12 }, { eyes: 1, t: 0.09 }] : [{ eyes: 1, t: rand(0.08, 0.13) }];
        this.blinkAt = t + rand(2.2, 6.5);
      }
    }
    // ears: now and then one flicks
    if (t > this.earTwitchAt) {
      this.earTwitch = { ear: chance(0.5) ? "back" : "front", until: t + 0.16, dir: chance(0.5) ? 1 : -1 };
      this.earTwitchAt = t + rand(2.5, 9);
    }
    if (this.dream > 0) {
      this.dream -= dt;
      if (chance(dt * 6)) {
        this.earTwitch = { ear: chance(0.5) ? "back" : "front", until: t + 0.12, dir: -1 };
        this.tailFlick = (chance(0.5) ? 1 : -1) * 10;
      }
    }
    this.animateTail(dt);
  }

  animateTail(dt) {
    const t = this.t;
    let mood = this.tailMood;
    if (this.mode === "ground" && Math.abs(this.vx) > this.bodyLen * 2.6 && mood === "relaxed") mood = "run";
    const m = TAIL_MOODS[mood] || TAIL_MOODS.relaxed;
    let base = m.base + (this.spritePose === "side" ? this.post.tail : 0);
    if (m.sway) base += Math.sin(t * TAU * m.swayHz) * m.sway;
    if (m.lash) base += Math.sin(t * TAU * m.lashHz) * m.lash;
    if (this.mode === "ground" && Math.abs(this.vx) > 3) base += Math.sin(this.phase * TAU * 2) * 2.5;
    const accel = (this.vx - (this.prevVx ?? this.vx)) / Math.max(dt, 1e-3);
    this.prevVx = this.vx;
    base += clamp((-accel * this.facing) / (this.bodyLen * 6), -12, 12);
    if (this.mode === "held") base += clamp(-this.heldVel * 18, -25, 25);
    if (this.mode === "air") base += -this.pitch * 50;
    if (m.flick && t > this.tailFlickAt) {
      this.tailFlickAt = t + (mood === "hunt" ? rand(0.25, 1.1) : rand(2.5, 7));
      this.tailFlick = (chance(0.5) ? 1 : -1) * m.flick;
    }
    this.tailFlick *= Math.exp(-5 * dt);
    const def = this.poses[this.spritePose]?.rig?.parts.find((part) => part.chain);
    if (!def) return;
    const key = this.spritePose;
    const joints = def.chain.length - 1;
    const rot = this.tailRot[key] || (this.tailRot[key] = new Array(joints).fill(0));
    const vel = this.tailVel[key] || (this.tailVel[key] = new Array(joints).fill(0));
    // spring chain: the base leads, each joint lags the one before it. A tail
    // curled around the body (`flex`) only lets its tip twitch.
    const scaleDown = this.spritePose === "side" ? 1 : 0.45;
    for (let i = 0; i < joints; i += 1) {
      const along = joints > 1 ? i / (joints - 1) : 0;
      const flex = def.flex ? def.flex[i] ?? 1 : 1;
      let goal = i === 0 ? base * scaleDown : m.curl * scaleDown;
      if (m.hook && along > 0.5) goal += m.hook * scaleDown;
      if (def.flex) goal = 0;
      if (along > 0.5) goal += this.tailFlick * along * scaleDown;
      if (i > 0 && m.sway) goal += Math.sin(t * TAU * m.swayHz - along * 2) * m.sway * 0.3 * scaleDown;
      goal *= flex;
      const k = 80 * (1 - 0.5 * along);
      const damping = 2 * Math.sqrt(k) * 0.6;
      vel[i] += (k * (goal - rot[i]) - damping * vel[i] - (i > 0 ? vel[i - 1] * 0.2 : 0)) * dt;
      rot[i] += vel[i] * dt;
    }
    this.tailPuff = smooth(this.tailPuff, m.puff || 1, 6, dt);
  }

  // --- the drawing for this frame ------------------------------------------
  currentSprite() {
    if (this.mode === "held") return "held";
    if (this.mode === "cling") return "cling";
    if (this.mode === "climb") return this.climbReach ? "climb" : "cling";
    if (this.mode === "air") return this.flight === "hop" ? "side" : "fall";
    if (this.forcedPose === "rear") return "climb";
    if (this.forcedPose === "sleep" || LYING.has(this.postureName)) return "sleep";
    return "side";
  }

  sideBones() {
    const def = this.poses.side;
    const post = this.post;
    const fx = this.fx;
    const t = this.t;
    const grounded = this.mode === "ground";
    const dt = this.dt;
    const speed = Math.abs(this.vx);
    const speedBL = speed / Math.max(this.bodyLen, 1);
    const gaitName = speedBL > 3.1 ? "gallop" : speedBL > 1.35 ? "trot" : "walk";
    if (gaitName !== this.gait) { this.gait = gaitName; this.gaitSince = t; }
    const gait = GAITS[this.gait];
    const walking = grounded && speed > 3 && !this.turn;
    // The gait phase follows the distance covered, so a planted paw stays
    // exactly where it touched down. Strides lengthen a little with speed.
    const strideBL = gait.stride * (this.p.stride ?? 1) * (0.9 + 0.2 * clamp(speedBL / (this.gait === "walk" ? 1.3 : 3), 0, 1));
    const moved = grounded ? Math.abs(this.x - (this.prevX ?? this.x)) : 0;
    this.prevX = this.x;
    this.phase = (this.phase + moved / (strideBL * this.bodyLen)) % 1;
    this.stride = smooth(this.stride, walking ? clamp(speedBL / 0.25, 0, 1) : 0, 8, dt);

    // body: posture drop/tilt, breathing, wiggle, landing squash, gallop flex
    let drop = post.drop;
    let tilt = post.tilt;
    if (walking && this.gait === "gallop") {
      drop += -Math.sin(this.phase * TAU) * 6;
      tilt += Math.sin(this.phase * TAU + 0.9) * 4;
    }
    drop += Math.sin(this.breath) * 0.9;
    if (fx.wiggle > 0.01) tilt += Math.sin(t * TAU * 5.5) * 2.2 * fx.wiggle;
    if (fx.shake > 0.01) tilt += Math.sin(t * TAU * 9) * 4 * fx.shake;
    if (fx.knead > 0.01) drop += Math.sin(t * TAU * 1.7) * 1.2 * fx.knead;
    if (grounded) drop += this.squash * 40;
    const pivot = [def.anchor[0], def.ground];
    const bodyAt = (dy, rot) => mat.mul(mat.translate(0, dy), mat.about(pivot, rot * DEG));

    // legs, pass 1: where each paw is. In stance it stays put on the floor
    // while the body passes over it; in swing it lifts and reaches forward.
    const stance = gait.duty;
    const strideLen = (strideBL * this.bodyLen) / this.scale; // sprite px
    const sweep = stance * strideLen;
    let bodyM = bodyAt(drop, tilt);
    const sag = { hind: null, fore: null };
    const paws = this.legs.map((leg) => {
      const part = leg.part;
      const hip = mat.apply(bodyM, part.joint[0], part.joint[1]);
      const h = def.ground - hip[1];
      // centre the stride where the paw reaches both ends without the leg
      // stretching; at the near end it folds a little instead
      const reach = Math.sqrt(Math.max(0, (1.03 * leg.length) ** 2 - h * h));
      const c = Math.sign(leg.rest || 1) * Math.max(0, reach - sweep / 2);
      const centre = Math.atan2(c, h);
      const q = (this.phase + (gait.offsets[part.role] ?? 0)) % 1;
      let px; let lift = 0; let fold = 0;
      if (q < stance) {
        px = c + sweep * (0.5 - q / stance);
        // a straight leg reaching out lowers the body over it a little
        const dev = Math.atan2(px, h) - centre;
        const end = part.role.startsWith("fore") ? "fore" : "hind";
        const s = h * (1 - Math.cos(dev));
        sag[end] = sag[end] == null ? s : Math.min(sag[end], s);
      } else {
        // the paw peels off, swings forward over its next spot, then sets
        // straight down there (no skid)
        const s = (q - stance) / (1 - stance);
        px = c - sweep / 2 + strideLen * (ease(Math.min(s / 0.8, 1)) - (1 - stance) * s);
        lift = Math.sin(Math.PI * s) * gait.lift * h;
        // the paw curls back early and has opened out again before it lands
        fold = Math.sin(Math.PI * Math.min(s / 0.7, 1)) * gait.fold;
      }
      return { x: hip[0] + px, lift, fold };
    });
    if (this.gait !== "gallop") {
      // gait bob and pitch follow the legs: low as they reach, high over them
      ["hind", "fore"].forEach((end) => { this.sag[end] = smooth(this.sag[end], walking ? sag[end] ?? this.sag[end] : 0, 24, dt); });
      drop += ((this.sag.hind + this.sag.fore) / 2) * 0.6 * this.stride;
      tilt += (Math.atan2(this.sag.fore - this.sag.hind, this.span) / DEG) * 0.6 * this.stride;
      bodyM = bodyAt(drop, tilt);
    }
    const pose = { body: { dy: drop, rot: tilt * DEG, pivot } };

    // pass 2: aim each leg at its paw, keeping it on the floor
    const blending = t - this.gaitSince < 0.3;
    this.legs.forEach((leg, i) => {
      const part = leg.part;
      const fore = part.role.startsWith("fore");
      const hip = mat.apply(bodyM, part.joint[0], part.joint[1]);
      const h = def.ground - hip[1];
      let angle;
      let lift;
      let fold = 0;
      if (grounded) {
        const reach = post.reach ? (fore ? post.reach.fore : post.reach.hind) : 0;
        const paw = paws[i];
        // a lifted paw mostly folds at the wrist; the leg itself bends only a
        // little, so it never looks stubby
        lift = paw.lift * 0.5 * this.stride;
        fold = paw.fold * this.stride;
        angle = lerp(leg.rest + reach, Math.atan2(paw.x - hip[0], h - lift) / DEG, this.stride);
      } else {
        // a hop: tuck the paws up
        angle = leg.rest + (fore ? 6 : -6);
        lift = 6;
        fold = 40;
      }
      if (fore && fx.knead > 0.01) {
        const press = Math.max(0, Math.sin(t * TAU * 1.7 + (part.role === "foreFar" ? Math.PI : 0))) * fx.knead;
        lift += 6 * press;
        fold += 45 * press;
      }
      if (part.role === "foreFar" && fx.swat > 0.01) { angle += 38 * fx.swat; lift += 14 * fx.swat; fold += 30 * fx.swat; }
      const rate = walking ? (blending ? 16 : 60) : 12;
      leg.angle = leg.angle == null ? angle : smooth(leg.angle, angle, rate, dt);
      leg.lift = smooth(leg.lift, lift, walking ? 60 : 30, dt);
      leg.fold = smooth(leg.fold, fold, walking ? 60 : 20, dt);
      // stretch or fold the leg just enough for the paw to meet the floor
      const reachDown = (h - leg.lift) / Math.max(Math.cos(leg.angle * DEG), 0.3);
      const k = clamp(reachDown / leg.length, grounded ? 0.78 : 0.82, 1.06);
      // the leg hangs from the body, so undo the body's tilt
      pose[part.name] = { rot: -(leg.angle + tilt - leg.rest) * DEG, k };
      if (leg.paw) pose[leg.paw.name] = { rot: leg.fold * DEG };
    });

    // head: posture, looking at things, sniffing, licking, shaking
    let head = post.head;
    if (this.look) {
      const target = this.look.target;
      const headWorld = this.localToWorld(this.assets.meshes.side.parts.find((p) => p.name === "head").joint);
      const dx = (target.x - headWorld.x) * this.facing;
      const dy = target.y - headWorld.y;
      if (dx > -this.bodyLen * 0.2) {
        const angle = Math.atan2(dy, Math.max(dx, this.bodyLen * 0.3)) / DEG; // + is below
        head += clamp(angle, -30, 30) * 0.45;
      }
    }
    if (this.mouthWant > 0.05) head -= 14 * this.mouthWant;
    if (fx.sniff > 0.01) head += 12 * fx.sniff + Math.sin(t * TAU * 6.5) * 3 * fx.sniff;
    if (fx.lick > 0.01) head += 24 * fx.lick + Math.sin(t * TAU * 3.4) * 6 * fx.lick;
    if (fx.lean > 0.01) head += Math.sin(t * TAU * 0.8) * 4 * fx.lean - 4 * fx.lean;
    if (fx.shake > 0.01) head += Math.sin(t * TAU * 9 + 1) * 8 * fx.shake;
    head -= tilt * 0.7; // cats keep their head steady
    const stiffness = this.look && !this.look.smooth ? 240 : 110;
    this.head.vel += (stiffness * (head - this.head.rot) - 2 * Math.sqrt(stiffness) * 0.9 * this.head.vel) * this.dt;
    this.head.rot += this.head.vel * this.dt;
    pose.head = { rot: this.head.rot * DEG };
    this.earPose(pose);
    return pose;
  }

  earPose(pose) {
    const moodEar = { angry: -20, scared: -18, annoyed: -10, hunt: 6, curious: 4 }[this.tailMood] || 0;
    const twitch = this.earTwitch && this.t < this.earTwitch.until ? this.earTwitch : null;
    const asleep = this.spritePose === "sleep";
    ["back", "front"].forEach((ear) => {
      let rot = (this.spritePose === "side" ? this.post.ears : 0) + moodEar * (asleep ? 0.5 : 1);
      if (twitch && twitch.ear === ear) rot += (asleep ? 8 : 12) * twitch.dir;
      this.ears[ear] = smooth(this.ears[ear], rot, 18, this.dt);
      pose[`ear${ear === "back" ? "Back" : "Front"}`] = { rot: this.ears[ear] * DEG, k: moodEar < -15 ? 0.85 : 1 };
    });
  }

  poseBones(name) {
    if (name === "side") return this.sideBones();
    const pose = {};
    const def = this.poses[name];
    if (name === "sleep") {
      // slow breathing, rising from the floor
      pose.body = { pivot: [def.anchor[0], def.anchor[1]], k: 1 + Math.sin(this.breath) * 0.016, w: 1 - Math.sin(this.breath) * 0.004 };
      this.earPose(pose);
    } else if (name === "held") {
      const squirm = Math.max(0, Math.sin(this.t * TAU * 2.4)) * clamp((this.t - (this.heldSince ?? this.t)) - 2, 0, 1);
      pose.body = { pivot: def.anchor, k: 1 + squirm * 0.03, w: 1 - squirm * 0.02 };
    } else if (name === "climb") {
      const swat = this.fx.swat;
      pose.arms = { rot: (-0.35 * swat + Math.sin(this.t * TAU * 1.2) * 0.04) };
    } else if (name === "cling") {
      pose.body = { dy: Math.sin(this.t * TAU * 1.4) * 2 };
    }
    return pose;
  }

  frameTransform(name) {
    // sprite px -> canvas CSS px: anchor at the reference point, mirrored
    // when facing left, rotated when swinging or flying
    const def = this.poses[name];
    let anchor = def.anchor;
    let ox = this.x;
    let oy = this.y;
    let rot = 0;
    let sx = 1;
    let sy = 1;
    if (name === "fall") { ox += this.comOffset[0] * this.facing; oy += this.comOffset[1]; rot = this.pitch * this.facing; }
    if (name === "held") rot = this.heldAngle;
    if (name === "side" && this.mode === "air") rot = this.pitch * this.facing * 0.5;
    if (this.mode === "climb") anchor = name === "climb" ? [def.wall, def.hands[1]] : [def.wall, def.anchor[1]];
    if (this.mode === "ground" && name !== "side") { sy = 1 - this.squash * 0.6; sx = 1 + this.squash * 0.3; }
    const cx = ox - this.canvasX;
    const cy = oy - this.canvasY;
    const s = this.scale;
    return mat.mul(
      mat.mul(mat.translate(cx, cy), mat.rotate(rot)),
      mat.mul(mat.scale(this.facing * s * sx, s * sy), mat.translate(-anchor[0], -anchor[1])),
    );
  }

  localToWorld([lx, ly]) {
    const def = this.poses.side;
    return { x: this.x + (lx - def.anchor[0]) * this.scale * this.facing, y: this.y + (ly - def.anchor[1]) * this.scale };
  }

  render() {
    this.canvasX = Math.round(this.x) - this.box.side;
    this.canvasY = Math.round(this.y) - this.box.up;
    const name = this.currentSprite();
    if (name !== this.spritePose) {
      if (this.lastFrame) {
        this.fade = { from: { ...this.lastFrame, positions: this.lastFrame.positions.slice() }, t: 0, dur: this.mode === "climb" ? 0 : 0.1 };
      }
      this.spritePose = name;
      if (name === "held") this.heldSince = this.t;
    }
    const mesh = this.assets.meshes[name];
    const pose = this.poseBones(name);
    const chain = mesh.parts.find((part) => part.chain);
    if (chain) {
      pose[`${chain.name}Chain`] = (this.tailRot[name] || []).map((r) => r * DEG);
      pose[chain.name] = { ...(pose[chain.name] || {}), w: this.tailPuff };
    }
    const { bones, world } = boneMatrices(mesh, pose);
    const view = this.frameTransform(name);
    const positions = skin(mesh, bones, view);
    const image = name === "side" && this.eyes ? this.assets.images.sideClosed : this.assets.images[name];

    // turning: squash the side view and show the front/back view mid-turn
    let turnAlpha = 0;
    let turnView = null;
    if (this.turn && name === "side") {
      const k = 1 - Math.abs(this.turn.t - 0.5) / 0.5;
      turnAlpha = clamp((k - 0.36) / 0.12, 0, 1);
      const squeeze = 1 - 0.3 * ease(clamp(k, 0, 1));
      for (let i = 0; i < positions.length; i += 2) positions[i] = (positions[i] - (this.x - this.canvasX)) * squeeze + (this.x - this.canvasX);
      if (turnAlpha > 0) {
        const via = this.turn.via;
        const def = this.poses[via];
        const s = this.scale;
        const sx = 0.82 + 0.18 * ease(turnAlpha);
        turnView = mat.mul(mat.translate(this.x - this.canvasX, this.y - this.canvasY), mat.mul(mat.scale(-this.turn.to * s * sx, s), mat.translate(-def.anchor[0], -def.anchor[1])));
      }
    }

    if (this.fade) {
      this.fade.t += this.fade.dur ? this.dt / this.fade.dur : 1;
      if (this.fade.t >= 1) this.fade = null;
    }
    const fadeIn = this.fade ? ease(clamp(this.fade.t, 0, 1)) : 1;
    const r = this.renderer;
    if (r) {
      r.begin(this.box.side * 2, this.box.up + this.box.down, this.dpr);
      if (this.fade) {
        const from = this.fade.from;
        const shifted = from.positions.slice();
        const dx = from.canvasX - this.canvasX;
        const dy = from.canvasY - this.canvasY;
        for (let i = 0; i < shifted.length; i += 2) { shifted[i] += dx; shifted[i + 1] += dy; }
        r.draw(from.mesh, shifted, from.image, 1 - fadeIn);
      }
      if (turnAlpha < 1) r.draw(mesh, positions, image, fadeIn * (1 - turnAlpha));
      if (turnView) {
        const turnMesh = this.assets.meshes[this.turn.via];
        r.draw(turnMesh, skin(turnMesh, boneMatrices(turnMesh, {}).bones, turnView), this.assets.images[this.turn.via], turnAlpha * fadeIn);
      }
    } else {
      this.drawFallback(name, view);
    }
    this.lastFrame = { mesh, positions, image, canvasX: this.canvasX, canvasY: this.canvasY };
    this.canvas.style.transform = `translate3d(${this.canvasX}px, ${this.canvasY}px, 0)`;

    // remember where the head and mouth are for hearts, looks and the ball
    const def = this.poses[name];
    const headM = world.head ? mat.mul(view, world.head) : view;
    const toWorld = ([x, y]) => ({ x: x + this.canvasX, y: y + this.canvasY });
    this.frame = {
      head: def.head ? toWorld(mat.apply(headM, def.head[0], def.head[1])) : null,
      mouth: def.mouth ? toWorld(mat.apply(headM, def.mouth[0], def.mouth[1])) : null,
    };
    this.syncDom(positions);
  }

  drawFallback(name, view) {
    const g = this.g2d;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.box.side * 2, this.box.up + this.box.down);
    g.save();
    g.transform(...view);
    g.drawImage(this.assets.images[name], 0, 0);
    g.restore();
  }

  syncDom(positions) {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (let i = 0; i < positions.length; i += 2) {
      const x = positions[i]; const y = positions[i + 1];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    // the mesh carries a margin of empty pixels; trim it for the hit area
    const inset = 4;
    const hit = { x: this.canvasX + minX + inset, y: this.canvasY + minY + inset, w: Math.max(maxX - minX - inset * 2, 10), h: Math.max(maxY - minY - inset * 2, 10) };
    const el = this.el;
    const w = Math.round(hit.w);
    const h = Math.round(hit.h);
    if (w !== this.hit.w || h !== this.hit.h) {
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    }
    this.hit = { x: hit.x, y: hit.y, w, h };
    el.style.transform = `translate3d(${hit.x.toFixed(1)}px, ${hit.y.toFixed(1)}px, 0)`;
    const head = this.headPoint();
    el.style.setProperty("--head-x", `${(head.x - hit.x).toFixed(1)}px`);
    el.style.setProperty("--head-y", `${(head.y - hit.y - this.standH * 0.2).toFixed(1)}px`);
    const state = this.mode === "held" ? "held" : this.forcedPose === "sleep" ? "sleep" : this.hearts > 0 ? "pet" : this.mode;
    if (el.dataset.state !== state) el.dataset.state = state;
    const z = String(this.z);
    if (el.style.zIndex !== z) { el.style.zIndex = z; this.canvas.style.zIndex = z; }

    // contact shadow on whatever surface is below the cat
    const below = this.mode === "ground" ? this.platform : this.engine.world.platformBelow(this.x, this.y - 2);
    const shadow = this.shadowEl;
    if (below) {
      const ref = this.mode === "held" || this.mode === "cling" || this.mode === "climb" ? hit.y + hit.h : this.y;
      const height = Math.max(0, below.y - ref);
      const fadeOut = clamp(1 - height / (this.standH * 5), 0, 1);
      const lying = this.spritePose === "sleep" ? 1.15 : 1;
      const width = this.bodyLen * (0.8 + 0.25 * (1 - fadeOut)) * lying;
      shadow.style.opacity = (0.95 * fadeOut).toFixed(2);
      shadow.style.width = `${Math.round(width)}px`;
      const cx = this.x + (this.spritePose === "side" || this.spritePose === "sleep" ? this.comOffset[0] * this.facing * 0.4 : 0);
      shadow.style.transform = `translate3d(${(cx - width / 2).toFixed(1)}px, ${(below.y - 2).toFixed(1)}px, 0) scale(${(0.7 + 0.3 * fadeOut).toFixed(2)})`;
    } else {
      shadow.style.opacity = "0";
    }
  }
}
