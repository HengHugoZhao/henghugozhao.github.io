import { CAT_DEFS } from "./data";
import { Cat, chance, clamp, rand } from "./cat";
import { buildMesh } from "./mesh";
import {
  RESPONSES, afterDrop, chaseBall, chooseActivity, enjoyPet, idleWatch, investigateCursor, loafRest,
  stalkCursor, startle, wakeForPets, wandPlay,
} from "./behaviors";

// --- the page as a cat sees it ---------------------------------------------------
// Cats live in a side view: the bottom of the section is the floor and the top
// edge of every card is a shelf. Shelves are one-way (cats pass in front of a
// card while jumping and land on its top edge); card sides can be climbed.
class World {
  constructor(area, page) {
    this.area = area;
    this.page = page;
    this.platforms = [];
    this.byElement = new Map();
    this.floor = { id: "floor", kind: "floor", left: 0, right: 0, y: 0, gone: false };
    this.viewTop = 0;
    this.viewBottom = 0;
  }

  refresh() {
    const areaRect = this.area.getBoundingClientRect();
    this.left = areaRect.left;
    this.top = areaRect.top;
    this.width = this.area.clientWidth;
    this.height = this.area.clientHeight;
    this.floor.left = 0;
    this.floor.right = this.width;
    this.floor.y = this.height - 3;
    const seen = new Set();
    const cards = [];
    this.page.querySelectorAll(".misc-interactive-surface").forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 60 || rect.height < 20) return;
      let platform = this.byElement.get(element);
      if (!platform) {
        platform = { id: `card-${this.byElement.size}`, kind: "card", el: element, owner: element.dataset.cat || null };
        this.byElement.set(element, platform);
      }
      const radius = 10;
      Object.assign(platform, {
        left: rect.left - areaRect.left + radius,
        right: rect.right - areaRect.left - radius,
        y: rect.top - areaRect.top,
        bottom: rect.bottom - areaRect.top,
        edgeLeft: rect.left - areaRect.left,
        edgeRight: rect.right - areaRect.left,
        gone: false,
      });
      platform.walls = [
        { side: "left", x: platform.edgeLeft, top: platform.y, bottom: platform.bottom, platform },
        { side: "right", x: platform.edgeRight, top: platform.y, bottom: platform.bottom, platform },
      ];
      seen.add(element);
      cards.push(platform);
    });
    this.byElement.forEach((platform, element) => {
      if (!seen.has(element)) { platform.gone = true; this.byElement.delete(element); }
    });
    this.platforms = [this.floor, ...cards];
    this.updateView();
  }

  updateView() {
    const rect = this.area.getBoundingClientRect();
    this.left = rect.left;
    this.top = rect.top;
    this.viewTop = -rect.top;
    this.viewBottom = this.viewTop + window.innerHeight;
  }

  isVisible(cat, margin = 0) {
    return cat.y > this.viewTop + cat.standH * 0.6 - margin && cat.y < this.viewBottom + margin;
  }

  platformVisible(platform) {
    return platform.y > this.viewTop + 40 && platform.y < this.viewBottom - 10;
  }

  landingFor(cat, prevY, y) {
    const tolerance = cat.bodyLen * 0.22;
    let best = null;
    this.platforms.forEach((platform) => {
      if (platform.gone || platform === cat.ignorePlatform) return;
      if (prevY <= platform.y + 0.5 && y >= platform.y && cat.x >= platform.left - tolerance && cat.x <= platform.right + tolerance) {
        if (!best || platform.y < best.y) best = platform;
      }
    });
    if (best && best !== this.floor) cat.x = clamp(cat.x, best.left + cat.bodyLen * 0.3, best.right - cat.bodyLen * 0.3);
    return best;
  }

  // A falling cat whose front paws pass a shelf corner hooks onto it.
  ledgeFor(cat, prevY, y) {
    for (const platform of this.platforms) {
      if (platform.kind !== "card" || platform.gone) continue;
      const hang = platform.y + cat.standH * 0.85;
      if (!(prevY < hang && y >= hang)) continue;
      const reach = cat.bodyLen * 0.75;
      if (cat.x > platform.edgeLeft - reach && cat.x < platform.edgeLeft + cat.bodyLen * 0.1) {
        return { platform, side: "left", x: platform.edgeLeft, y: platform.y };
      }
      if (cat.x < platform.edgeRight + reach && cat.x > platform.edgeRight - cat.bodyLen * 0.1) {
        return { platform, side: "right", x: platform.edgeRight, y: platform.y };
      }
    }
    return null;
  }

  platformBelow(x, y) {
    let best = null;
    this.platforms.forEach((platform) => {
      if (platform.gone || platform.y < y - 1 || x < platform.left - 4 || x > platform.right + 4) return;
      if (!best || platform.y < best.y) best = platform;
    });
    return best;
  }

  maxJump(cat) { return cat.standH * cat.p.jumpHeight; }

  links(cat, from) {
    const out = [];
    const margin = cat.bodyLen * 0.5;
    this.platforms.forEach((to) => {
      if (to === from || to.gone) return;
      const rise = from.y - to.y;
      const overlap = Math.min(from.right, to.right) - Math.max(from.left, to.left);
      if (rise > cat.standH * 0.4) {
        if (rise <= this.maxJump(cat) && overlap > margin) out.push({ type: "jump", from, to });
        else if (cat.p.climber && overlap > -cat.bodyLen && to.walls) {
          const wall = to.walls
            .filter((w) => w.x > from.left + cat.bodyLen && w.x < from.right - cat.bodyLen && from.y - w.bottom < this.maxJump(cat) && w.bottom <= from.y)
            .sort((a, b) => Math.abs(a.x - cat.x) - Math.abs(b.x - cat.x))[0];
          if (wall) out.push({ type: "climb", from, to, wall });
        }
      } else if (rise < -cat.standH * 0.4 && overlap > margin) {
        // hop down off the front of the shelf, somewhere nothing is in between
        const hopX = this.clearDrop(cat, from, to);
        if (hopX !== null) out.push({ type: "jump", from, to, hopX });
      } else {
        // dropping or hopping across: land beyond one of the edges
        const leftLand = from.left - cat.bodyLen * 0.9;
        const rightLand = from.right + cat.bodyLen * 0.9;
        const canLeft = to.left < leftLand - cat.bodyLen * 0.2 || (rise < 0 && to.left < from.left - cat.bodyLen * 0.6);
        const canRight = to.right > rightLand + cat.bodyLen * 0.2 || (rise < 0 && to.right > from.right + cat.bodyLen * 0.6);
        const gap = Math.max(to.left - from.right, from.left - to.right, 0);
        if ((canLeft || canRight) && gap < cat.bodyLen * 3) out.push({ type: "jump", from, to });
      }
    });
    return out;
  }

  clearDrop(cat, from, to, prefer = cat.x) {
    const margin = cat.bodyLen * 0.5;
    const lo = Math.max(from.left, to.left) + margin;
    const hi = Math.min(from.right, to.right) - margin;
    if (hi < lo) return null;
    const blocked = (x) => this.platforms.some((p) => !p.gone && p !== from && p !== to && p.y > from.y && p.y < to.y && x > p.left - cat.bodyLen * 0.4 && x < p.right + cat.bodyLen * 0.4);
    const samples = [];
    for (let i = 0; i <= 8; i += 1) samples.push(lo + ((hi - lo) * i) / 8);
    samples.sort((a, b) => Math.abs(a - prefer) - Math.abs(b - prefer));
    return samples.find((x) => !blocked(x)) ?? null;
  }

  route(cat, from, to) {
    if (!from || !to || to.gone) return null;
    const queue = [[from, []]];
    const visited = new Set([from]);
    while (queue.length) {
      const [node, path] = queue.shift();
      if (path.length > 3) continue;
      for (const link of this.links(cat, node)) {
        if (visited.has(link.to)) continue;
        const next = [...path, link];
        if (link.to === to) return next;
        visited.add(link.to);
        queue.push([link.to, next]);
      }
    }
    return null;
  }

  planJump(cat, from, to, preferX) {
    const margin = cat.bodyLen * 0.45;
    const rise = from.y - to.y;
    const inside = (platform, x) => clamp(x, platform.left + margin, Math.max(platform.left + margin, platform.right - margin));
    if (rise > cat.standH * 0.4) {
      // Now and then a big jump comes up a little short: the cat hooks the
      // corner with its front paws and hauls itself up.
      if (rise > cat.standH * 3 && to.kind === "card" && chance(0.15)) {
        const fromLeft = cat.x < (to.left + to.right) / 2;
        const edge = fromLeft ? to.edgeLeft : to.edgeRight;
        const dir = fromLeft ? 1 : -1;
        const takeoffX = inside(from, edge - dir * cat.bodyLen * 0.7);
        if (Math.abs(takeoffX - (edge - dir * cat.bodyLen * 0.7)) < 1) {
          return { from, to, landX: edge + dir * cat.bodyLen * 0.05, takeoffX, short: true };
        }
      }
      const lo = Math.max(from.left, to.left) + margin;
      const hi = Math.min(from.right, to.right) - margin;
      const want = preferX ?? cat.x;
      const landX = clamp(want, lo, Math.max(lo, hi));
      const run = clamp(rise * 0.12, cat.bodyLen * 0.25, cat.bodyLen * 0.9);
      const dir = cat.x <= landX ? 1 : -1;
      return { from, to, landX, takeoffX: inside(from, landX - dir * run) };
    }
    const overlap = Math.min(from.right, to.right) - Math.max(from.left, to.left);
    if (rise < -cat.standH * 0.4 && overlap > margin) {
      const prefer = preferX ?? cat.x;
      const landX = this.clearDrop(cat, from, to, prefer);
      if (landX !== null) {
        const dir = prefer >= cat.x ? 1 : -1;
        return { from, to, landX, takeoffX: inside(from, landX - dir * cat.bodyLen * 0.3) };
      }
    }
    const target = preferX ?? (to.left + to.right) / 2;
    const viaRight = to.right > from.right + cat.bodyLen * 0.6 && (target > from.right || to.left > from.left - cat.bodyLen * 0.6);
    const edge = viaRight ? from.right - cat.bodyLen * 0.35 : from.left + cat.bodyLen * 0.35;
    const dir = viaRight ? 1 : -1;
    const out = clamp(cat.bodyLen * (0.8 + Math.max(0, -rise) / 900), cat.bodyLen * 0.7, cat.bodyLen * 1.8);
    let landX = inside(to, edge + dir * (out + cat.bodyLen * 0.35));
    if (viaRight) landX = Math.max(landX, from.right + cat.bodyLen * 0.45);
    else landX = Math.min(landX, from.left - cat.bodyLen * 0.45);
    return { from, to, landX, takeoffX: edge };
  }

  pickSpotOn(cat, platform) {
    const margin = cat.bodyLen * 0.6;
    const lo = platform.left + margin;
    const hi = Math.max(lo, platform.right - margin);
    const candidates = [];
    for (let i = 0; i < 6; i += 1) candidates.push(rand(lo, hi));
    const engine = cat.engine;
    const other = engine.otherCat(cat);
    const score = (x) => {
      let s = Math.random() * 0.6;
      if (Math.abs(x - cat.x) < cat.bodyLen * 1.5) s -= 0.6;
      if (other && other.platform === platform) s += Math.abs(x - other.x) < cat.bodyLen * 2.5 ? 0.15 * cat.p.social : 0;
      if (engine.pointer.active && engine.pointer.x !== null) s += 0.3 * (1 - clamp(Math.abs(x - engine.pointer.x) / (this.width || 1), 0, 1));
      if (x - platform.left < cat.bodyLen * 1.3 || platform.right - x < cat.bodyLen * 1.3) s += 0.25; // cats like edges
      return s;
    };
    return candidates.sort((a, b) => score(b) - score(a))[0];
  }

  pickSpot(cat, options = {}) {
    const from = cat.platform;
    if (!from) return null;
    const choices = [];
    this.platforms.forEach((platform) => {
      if (platform.gone) return;
      if (options.elsewhere && platform === from) return;
      if (platform !== from && !this.route(cat, from, platform)) return;
      let weight = 1;
      if (options.visible && this.platformVisible(platform)) weight *= 3;
      if (platform.kind === "card") weight *= cat.p.climber ? 1.2 : 1.5;
      if (options.high || cat.p.bold > 0.65) weight *= 1 + (this.floor.y - platform.y) / Math.max(this.floor.y, 1);
      if (platform.owner === cat.id) weight *= 1.6;
      if (options.cozy && platform.kind === "floor") weight *= 0.7;
      choices.push({ platform, weight });
    });
    if (!choices.length) return null;
    const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
    let roll = Math.random() * total;
    const choice = choices.find((c) => (roll -= c.weight) <= 0) || choices[0];
    return { platform: choice.platform, x: this.pickSpotOn(cat, choice.platform) };
  }

  spotNear(cat, point) {
    let best = null;
    this.platforms.forEach((platform) => {
      if (platform.gone || (platform !== cat.platform && !this.route(cat, cat.platform, platform))) return;
      const x = clamp(point.x ?? cat.x, platform.left + cat.bodyLen * 0.6, platform.right - cat.bodyLen * 0.6);
      const d = Math.hypot(x - (point.x ?? cat.x), Math.max(0, platform.y - (point.y ?? cat.y)) * 0.6 + Math.max(0, (point.y ?? cat.y) - platform.y));
      if (!best || d < best.d) best = { platform, x, d };
    });
    return best;
  }

  nearEdge(cat) {
    const platform = cat.platform;
    if (!platform || platform.kind !== "card") return false;
    return cat.x - platform.left < cat.bodyLen * 1.4 || platform.right - cat.x < cat.bodyLen * 1.4;
  }
}

// --- art ----------------------------------------------------------------------------
const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.decoding = "async";
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`Could not load ${src}`));
  image.src = src;
});

// Loads a cat's drawings and lays a deformable mesh over each pose.
async function loadCat(definition) {
  const entries = Object.entries(definition.sprites);
  const loaded = await Promise.all(entries.map(([, src]) => loadImage(src)));
  const images = Object.fromEntries(entries.map(([key], index) => [key, loaded[index]]));
  const meshes = Object.fromEntries(Object.entries(definition.poses).map(([name, pose]) => (
    [name, buildMesh(images[name], pose.rig || {}, name === "side" ? 8 : 10)]
  )));
  return { images, meshes };
}

// --- engine -------------------------------------------------------------------------
export function createCatPlayground({ page, area, ballElement, button, status, catElements: liveElements }) {
  // React clears ref objects before effect cleanup, so keep our own references.
  const catElements = liveElements.map((parts) => ({ ...parts }));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const world = new World(area, page);
  let destroyed = false;
  let frame = 0;
  let last = performance.now();
  let clock = 0;
  let drag = null;
  let lastSay = { at: -99, priority: 0 };

  const pointer = {
    x: null, y: null, vx: 0, vy: 0, speed: 0, lastMove: -99, active: false, fresh: false,
    stillFor: 0, type: "mouse", lastClientX: 0, lastClientY: 0, lastAt: 0,
  };
  const ball = {
    mode: "hidden", x: 0, y: 0, vx: 0, vy: 0, r: 11, spin: 0, speed: 0, idleFor: 0,
    platform: null, owner: null, chaser: null, throwFrom: null,
  };

  const engine = {
    world, pointer, ball, cats: [], reduced: reducedMotion,
    gravity: 2600, sizeFactor: 1,
    say(text, priority = 1) {
      if (clock - lastSay.at < 2.4 && priority <= lastSay.priority) return;
      lastSay = { at: clock, priority };
      status.textContent = text;
    },
    otherCat: (cat) => engine.cats.find((other) => other !== cat) || null,
    pointerNear(cat, radius) {
      if (pointer.x === null || !pointer.active) return false;
      const c = cat.center();
      return Math.hypot(pointer.x - c.x, pointer.y - c.y) < radius;
    },
    pointerOver(cat) {
      if (pointer.x === null) return false;
      const h = cat.hit;
      return pointer.x >= h.x && pointer.x <= h.x + h.w && pointer.y >= h.y && pointer.y <= h.y + h.h;
    },
    invite(cat, kind, from) {
      if (cat.mode !== "ground" || cat.taskPriority >= 4 || !RESPONSES[kind]) return false;
      startTask(cat, kind, RESPONSES[kind](cat, engine, from), 3);
      return true;
    },
    onLanding(cat, platform, impact) {
      if (impact > 0.9) engine.say(`${cat.name} landed on all four paws.`, 1);
    },
    respawn(cat) { placeOn(cat, world.floor, rand(world.width * 0.2, world.width * 0.8)); },
    nudgeBall() {
      ballElement.classList.remove("cat-ball--hit");
      void ballElement.offsetWidth;
      ballElement.classList.add("cat-ball--hit");
    },
    batBall(cat) {
      if (ball.mode !== "free" && ball.mode !== "rest") return;
      ball.mode = "free";
      ball.vx = cat.facing * rand(160, 380) * (cat.p.playful + 0.4);
      ball.vy = -rand(80, 260);
      ball.platform = null;
    },
    pickUpBall(cat) {
      ball.mode = "mouth";
      ball.owner = cat;
      ball.platform = null;
    },
    dropBall(cat) {
      if (ball.owner !== cat) return;
      ball.mode = "free";
      ball.owner = null;
      ball.vx = cat.facing * rand(30, 70);
      ball.vy = -60;
      ball.chaser = null;
    },
  };

  const startTask = (cat, name, generator, priority = 1) => {
    cat.task = generator;
    cat.taskName = name;
    cat.taskPriority = priority;
    Object.keys(cat.want).forEach((key) => { cat.want[key] = 0; });
    cat.eyesMode = "auto";
    cat.stop();
    cat.lookAt(null);
    cat.climbReach = 0;
    cat.mouthWant = 0;
    cat.forcedPose = null;
    cat.zzz = false;
  };

  const placeOn = (cat, platform, x, posture = "sit") => {
    cat.mode = "ground";
    cat.platform = platform;
    cat.x = clamp(x, platform.left + cat.bodyLen * 0.5, platform.right - cat.bodyLen * 0.5);
    cat.y = platform.y;
    cat.vx = 0; cat.vy = 0;
    cat.snapPosture(posture);
  };

  // --- input ------------------------------------------------------------------
  const toLocal = (clientX, clientY) => ({ x: clientX - world.left, y: clientY - world.top });

  const onPointerMove = (event) => {
    if (event.pointerType === "touch" && !drag && event.buttons === 0) return;
    const now = performance.now() / 1000;
    const local = toLocal(event.clientX, event.clientY);
    const dt = Math.max(now - pointer.lastAt, 1 / 240);
    if (pointer.x !== null && pointer.lastAt) {
      const vx = (local.x - pointer.x) / dt;
      const vy = (local.y - pointer.y) / dt;
      const k = clamp(dt * 14, 0.15, 0.8);
      pointer.vx += (clamp(vx, -4000, 4000) - pointer.vx) * k;
      pointer.vy += (clamp(vy, -4000, 4000) - pointer.vy) * k;
      // stroking: moving gently across a cat counts as petting it
      if (!drag && event.buttons === 0) {
        const step = Math.hypot(local.x - pointer.x, local.y - pointer.y);
        engine.cats.forEach((cat) => {
          if (cat.mode !== "ground" || !engine.pointerOver(cat)) return;
          if (pointer.speed > 1400) return;
          cat.memory.strokes += step;
          cat.memory.lastStroke = clock;
        });
      }
    }
    pointer.x = local.x;
    pointer.y = local.y;
    pointer.lastAt = now;
    pointer.lastMove = clock;
    pointer.active = local.x >= -40 && local.x <= world.width + 40 && local.y >= -40 && local.y <= world.height + 40;
    pointer.type = event.pointerType;
    if (drag && drag.pointerId === event.pointerId && !drag.holding) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) startHold(drag.cat);
    }
  };

  const onPointerLeave = (event) => {
    if (!event.relatedTarget) pointer.active = false;
  };

  const startHold = (cat) => {
    drag.holding = true;
    if (ball.owner === cat) engine.dropBall(cat);
    cat.task = null;
    cat.taskName = "held";
    cat.taskPriority = 10;
    Object.keys(cat.want).forEach((key) => { cat.want[key] = 0; });
    cat.eyesMode = "auto";
    cat.climbReach = 0;
    cat.lookAt(pointer, true, true);
    // picked up by the scruff where it is; it then swings under the hand
    cat.pickUp();
    engine.say(`You picked up ${cat.name}.`, 2);
  };

  const release = (cat) => {
    const vx = clamp(pointer.vx * 0.85, -1500, 1500);
    const vy = clamp(pointer.vy * 0.85, -1300, 700);
    cat.lookAt(null);
    cat.releaseFromHold(vx, vy);
    cat.wantsLedge = true;
    startTask(cat, "afterDrop", afterDrop(cat, engine), 7);
    const below = world.platformBelow(cat.x, cat.y);
    if (below && below.y - cat.y < cat.standH * 0.3) {
      engine.say(`${cat.name} is back on their paws.`, 1);
    } else engine.say(`${cat.name} is falling, paws out!`, 2);
  };

  const pet = (cat, how = "click") => {
    if (cat.mode !== "ground") return;
    if (cat.pose === "sleep") {
      cat.hearts = 1.6;
      cat.memory.petCount += 1;
      cat.memory.lastPet = clock;
      engine.say(`${cat.name} purrs in their sleep.`, 1);
      if (cat.memory.petCount >= 2 && chance(0.45)) startTask(cat, "pet", wakeForPets(cat, engine), 4);
      return;
    }
    if (cat.taskPriority > 4) return;
    if (how === "stroke" && cat.taskName === "pet") { cat.hearts = 2; return; }
    startTask(cat, "pet", enjoyPet(cat, engine), 4);
  };

  const catListeners = catElements.map((elements, index) => {
    const onDown = (event) => {
      const cat = engine.cats[index];
      if (!cat) return;
      event.preventDefault();
      event.stopPropagation();
      drag = { cat, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, holding: false };
      onPointerMove(event);
      try { elements.el.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
    };
    const onKey = (event) => {
      const cat = engine.cats[index];
      if (!cat || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      pet(cat);
    };
    elements.el.addEventListener("pointerdown", onDown);
    elements.el.addEventListener("keydown", onKey);
    return () => {
      elements.el.removeEventListener("pointerdown", onDown);
      elements.el.removeEventListener("keydown", onKey);
    };
  });

  const onPointerUp = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { cat, holding } = drag;
    drag = null;
    try { cat.el.releasePointerCapture(event.pointerId); } catch { /* not captured */ }
    if (holding) release(cat);
    else pet(cat);
  };

  const setBallMode = (mode) => {
    ball.mode = mode;
    ballElement.dataset.mode = mode;
    ballElement.dataset.visible = mode === "hidden" ? "false" : "true";
    const cursor = mode === "cursor";
    button.dataset.active = cursor ? "true" : "false";
    button.setAttribute("aria-pressed", cursor ? "true" : "false");
    button.setAttribute("aria-label", cursor ? "Put the ball away" : "Play with a ball");
    button.title = cursor ? "Put the ball away" : "Play with a ball";
    page.classList.toggle("cat-ball-cursor", cursor);
    if (mode !== "mouth") ball.owner = null;
  };

  const onButtonClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (ball.mode === "cursor") { setBallMode("hidden"); engine.say("Ball put away.", 2); return; }
    if (ball.owner) engine.dropBall(ball.owner);
    ball.chaser = null;
    ball.platform = null;
    setBallMode("cursor");
    if (pointer.x === null) {
      const rect = button.getBoundingClientRect();
      Object.assign(pointer, toLocal(rect.left + rect.width / 2, rect.top));
    }
    ball.x = pointer.x;
    ball.y = pointer.y;
    engine.say("Wave the ball around, then click anywhere to throw it.", 2);
  };
  const stop = (event) => event.stopPropagation();

  const throwBall = () => {
    setBallMode("free");
    ball.x = pointer.x;
    ball.y = pointer.y;
    ball.vx = clamp(pointer.vx * 0.9, -1100, 1100);
    ball.vy = clamp(pointer.vy * 0.9, -1100, 700) - 120;
    ball.platform = null;
    ball.throwFrom = { x: pointer.x, y: pointer.y };
    // the keenest awake cat goes for it
    const scored = engine.cats
      .filter((cat) => cat.mode === "ground" && cat.pose !== "sleep" && cat.taskPriority < 5 && cat.needs.energy > 0.12)
      .map((cat) => ({ cat, score: cat.p.playful + cat.p.fetches * 0.5 + cat.needs.energy - Math.abs(cat.x - ball.x) / Math.max(world.width, 1) + Math.random() * 0.4 }))
      .sort((a, b) => b.score - a.score);
    ball.chaser = engine.reduced ? null : scored[0]?.cat || null;
    ball.chaseAt = clock + rand(0.15, 0.45);
    if (ball.chaser) engine.say(`${ball.chaser.name} spotted the ball!`, 2);
  };

  const onPagePointerDown = (event) => {
    if (ball.mode !== "cursor") return;
    onPointerMove(event);
    throwBall();
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape" && ball.mode === "cursor") { setBallMode("hidden"); engine.say("Ball put away.", 2); }
  };

  // --- perception & interrupts ------------------------------------------------------
  const perceive = (cat, dt) => {
    const memory = cat.memory;
    if (clock - memory.lastPet > 25) memory.petCount = Math.max(0, memory.petCount - dt * 0.5);
    memory.strokes = Math.max(0, memory.strokes - dt * cat.bodyLen * 0.8);
    if (cat.mode !== "ground" || cat.taskPriority >= 7) return;
    const platform = cat.platform;
    const asleep = cat.pose === "sleep";
    const prey = ball.mode === "cursor" ? ball : pointer;
    const awake = !asleep && cat.needs.energy > 0.1;

    // stroking with the cursor
    if (memory.strokes > cat.bodyLen * 2.2 && clock - memory.lastStroke < 0.3) {
      memory.strokes = 0;
      pet(cat, "stroke");
      return;
    }

    // something whooshing past right next to the cat
    if (!engine.reduced && pointer.active && pointer.fresh && pointer.speed > 1900 && memory.habituation < 1.2 && clock - memory.lastStartle > 8) {
      const c = cat.center();
      const near = Math.hypot(pointer.x - c.x, pointer.y - c.y) < cat.bodyLen * 0.9;
      if (near && cat.taskPriority < 6) { startTask(cat, "startle", startle(cat, engine), 6); return; }
    }

    // the thrown ball
    if ((ball.mode === "free" || ball.mode === "rest") && ball.chaser === cat && clock > ball.chaseAt && cat.taskPriority < 5 && awake) {
      startTask(cat, "chase", chaseBall(cat, engine), 5);
      return;
    }

    // prey-like movement close to the cat's level
    if (!platform) return;
    let preyScore = cat.preyScore || 0;
    if (pointer.active && prey.x !== null) {
      const dx = Math.abs(prey.x - cat.x);
      const above = platform.y - prey.y;
      const low = above > -cat.standH * 0.3 && above < cat.standH * (ball.mode === "cursor" ? 2.6 : 1.8);
      const range = cat.bodyLen * (ball.mode === "cursor" ? 9 : 6.5);
      if (low && dx < range && pointer.fresh && prey.speed > 25 && prey.speed < 1400) {
        preyScore += dt * (0.4 + cat.p.playful) * (ball.mode === "cursor" ? 2.6 : 1) * (1 - dx / range) * 1.6;
      } else preyScore -= dt * 0.45;
    } else preyScore -= dt * 0.6;
    cat.preyScore = clamp(preyScore, 0, 3);
    if (!awake || engine.reduced) return;

    if (ball.mode === "cursor" && cat.preyScore > 0.7 && cat.taskPriority < 4 && cat.needs.energy > 0.15) {
      startTask(cat, "wand", wandPlay(cat, engine), 4);
      return;
    }
    if (ball.mode === "hidden" && cat.preyScore > 1.7 && cat.taskPriority < 3 && clock - (memory.lastStalk || -99) > 7 && cat.needs.energy > 0.2) {
      memory.lastStalk = clock;
      cat.preyScore = 0;
      startTask(cat, "stalk", stalkCursor(cat, engine), 3);
      return;
    }
    // a still cursor nearby is worth a sniff
    if (pointer.active && pointer.stillFor > 1.4 && pointer.stillFor < 20 && cat.taskPriority < 2 && clock - (memory.lastInvestigate || -99) > 28) {
      const dx = Math.abs(pointer.x - cat.x);
      const above = platform.y - pointer.y;
      if (dx < cat.bodyLen * 5 && dx > cat.bodyLen * 0.8 && above > -cat.standH * 0.2 && above < cat.standH * 2 && chance(dt * 0.5 * cat.p.curious)) {
        memory.lastInvestigate = clock;
        startTask(cat, "investigate", investigateCursor(cat, engine), 2);
      }
    }
  };

  const stepTask = (cat) => {
    if (cat.mode === "held") return;
    if (!cat.task) {
      let option;
      if (engine.reduced) option = chance(0.5) ? { name: "watch", make: () => idleWatch(cat, engine) } : { name: "loaf", make: () => loafRest(cat, engine) };
      else option = chooseActivity(cat, engine);
      startTask(cat, option.name, option.make(), 1);
    }
    try {
      const result = cat.task.next();
      if (result.done) { cat.task = null; cat.taskPriority = 0; }
    } catch (error) {
      console.error(error);
      cat.task = null;
      cat.taskPriority = 0;
    }
  };

  // --- ball physics -------------------------------------------------------------------
  const updateBall = (dt) => {
    const r = ball.r;
    if (ball.mode === "cursor") {
      const px = ball.x;
      ball.x = pointer.x ?? ball.x;
      ball.y = pointer.y ?? ball.y;
      ball.speed = pointer.speed;
      ball.idleFor = pointer.stillFor;
      ball.spin += (ball.x - px) / r;
    } else if (ball.mode === "mouth" && ball.owner) {
      const mouth = ball.owner.mouthPoint();
      ball.x = mouth.x;
      ball.y = mouth.y + r * 0.2;
      ball.speed = 0;
    } else if (ball.mode === "free") {
      const prevBottom = ball.y + r;
      if (ball.platform) {
        const p = ball.platform;
        ball.y = p.y - r;
        ball.vy = 0;
        ball.vx *= Math.exp(-1.15 * dt);
        if (ball.x < p.left - r * 0.5 || ball.x > p.right + r * 0.5 || p.gone) ball.platform = null;
      } else {
        ball.vy += engine.gravity * dt;
      }
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x < r) { ball.x = r; ball.vx = Math.abs(ball.vx) * 0.6; }
      if (ball.x > world.width - r) { ball.x = world.width - r; ball.vx = -Math.abs(ball.vx) * 0.6; }
      if (ball.y < r) { ball.y = r; ball.vy = Math.abs(ball.vy) * 0.4; }
      if (!ball.platform && ball.vy > 0) {
        const bottom = ball.y + r;
        let hit = null;
        world.platforms.forEach((p) => {
          if (p.gone || ball.x < p.left - r * 0.3 || ball.x > p.right + r * 0.3) return;
          if (prevBottom <= p.y + 0.5 && bottom >= p.y && (!hit || p.y < hit.y)) hit = p;
        });
        if (hit) {
          ball.y = hit.y - r;
          if (ball.vy > 90) { ball.vy = -ball.vy * 0.5; ball.vx *= 0.9; }
          else { ball.vy = 0; ball.platform = hit; }
        }
      }
      ball.spin += (ball.vx * dt) / r;
      ball.speed = Math.hypot(ball.vx, ball.vy);
      if (ball.platform && Math.abs(ball.vx) < 5) { ball.vx = 0; ball.mode = "rest"; ballElement.dataset.mode = "rest"; }
    } else if (ball.mode === "rest") {
      ball.speed = 0;
      if (ball.platform && ball.platform.gone) { ball.platform = null; ball.mode = "free"; }
      else if (ball.platform) ball.y = ball.platform.y - r;
    }
    ballElement.style.transform = `translate3d(${(ball.x - r).toFixed(1)}px, ${(ball.y - r).toFixed(1)}px, 0) rotate(${ball.spin.toFixed(2)}rad)`;
  };

  // --- main loop -------------------------------------------------------------------------
  const advance = (dt) => {
    clock += dt;
    pointer.fresh = clock - pointer.lastMove < 0.3;
    pointer.stillFor = clock - pointer.lastMove;
    if (!pointer.fresh) { pointer.vx *= Math.exp(-8 * dt); pointer.vy *= Math.exp(-8 * dt); }
    pointer.speed = Math.hypot(pointer.vx, pointer.vy);
    engine.cats.forEach((cat) => {
      perceive(cat, dt);
      stepTask(cat);
      cat.update(dt, clock);
    });
    updateBall(dt);
    const [a, b] = engine.cats;
    if (a && b) {
      const front = a.mode === "held" ? a : b.mode === "held" ? b : a.y > b.y + 2 ? a : b.y > a.y + 2 ? b : a.standH < b.standH ? a : b;
      a.z = front === a ? 3 : 2;
      b.z = front === b ? 3 : 2;
    }
    engine.cats.forEach((cat) => cat.render());
  };

  const tick = (now) => {
    if (destroyed) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    advance(dt);
    frame = requestAnimationFrame(tick);
  };

  const refresh = () => {
    world.refresh();
    const factor = clamp(world.width / 860, 0.72, 1);
    if (Math.abs(factor - engine.sizeFactor) > 0.01) {
      engine.sizeFactor = factor;
      engine.cats.forEach((cat) => cat.measure());
    }
    engine.gravity = 2600 * clamp(factor, 0.8, 1);
    engine.cats.forEach((cat) => {
      if (cat.mode === "ground" && cat.platform) {
        if (cat.platform.gone) cat.startFall(0, 0);
        else {
          cat.y = cat.platform.y;
          cat.x = clamp(cat.x, cat.platform.left + cat.bodyLen * 0.4, Math.max(cat.platform.left + cat.bodyLen * 0.4, cat.platform.right - cat.bodyLen * 0.4));
        }
      } else if (cat.mode === "climb" || cat.mode === "cling") {
        cat.task = null;
        cat.climbReach = 0;
        cat.startFall(0, 0);
        startTask(cat, "afterDrop", afterDrop(cat, engine), 7);
      }
    });
  };
  const onScroll = () => world.updateView();

  const resizeObserver = new ResizeObserver(refresh);
  resizeObserver.observe(page);
  page.querySelectorAll(".misc-interactive-surface").forEach((element) => resizeObserver.observe(element));

  button.addEventListener("pointerdown", stop);
  button.addEventListener("click", onButtonClick);
  page.addEventListener("pointerdown", onPagePointerDown);
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerUp);
  document.addEventListener("pointerout", onPointerLeave);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", refresh);

  const start = (assets) => {
    if (destroyed) return;
    world.refresh();
    engine.sizeFactor = clamp(world.width / 860, 0.72, 1);
    engine.cats = CAT_DEFS.map((definition, index) => new Cat({ definition, assets: assets[index], elements: catElements[index], engine }));
    const cards = world.platforms.filter((p) => p.kind === "card");
    const intro = cards.find((p) => p.el.classList.contains("misc-intro"));
    const gallery = cards.filter((p) => p !== intro);
    const [yuzu, ono] = engine.cats;
    // Start where you can see them: Yuzu on the intro card, Ono on a photo.
    const yuzuSpot = intro && world.platformVisible(intro) ? intro : gallery[0] || world.floor;
    placeOn(yuzu, yuzuSpot, yuzuSpot.left + (yuzuSpot.right - yuzuSpot.left) * 0.72, "sit");
    yuzu.facing = -1;
    const onoSpot = gallery.find((p) => p.owner === "ono") || gallery[1] || gallery[0] || world.floor;
    placeOn(ono, onoSpot, (onoSpot.left + onoSpot.right) / 2, "loaf");
    ono.facing = 1;
    startTask(yuzu, "watch", idleWatch(yuzu, engine), 1);
    startTask(ono, "loaf", loafRest(ono, engine), 1);
    area.dataset.ready = "true";
    last = performance.now();
    frame = requestAnimationFrame(tick);
  };
  Promise.all(CAT_DEFS.map(loadCat)).then(start).catch((error) => console.error(error));

  return () => {
    destroyed = true;
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    button.removeEventListener("pointerdown", stop);
    button.removeEventListener("click", onButtonClick);
    page.removeEventListener("pointerdown", onPagePointerDown);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerUp);
    document.removeEventListener("pointerout", onPointerLeave);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", refresh);
    catListeners.forEach((remove) => remove());
    page.classList.remove("cat-ball-cursor");
  };
}
