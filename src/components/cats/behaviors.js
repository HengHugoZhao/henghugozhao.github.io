// Cat behaviour scripts. Each one is a generator stepped once per frame, so a
// routine reads like what a cat actually does: "circle, knead, lie down, nap,
// wake up, stretch" instead of a pile of timers.
import { chance, clamp, rand } from "./cat";

// --- primitives ------------------------------------------------------------
function* wait(cat, seconds, each) {
  const end = cat.t + seconds;
  while (cat.t < end) {
    if (each && each() === false) return;
    yield;
  }
}

function* waitUntil(cat, condition, timeout = 8) {
  const end = cat.t + timeout;
  while (!condition() && cat.t < end) yield;
}

function* face(cat, direction, via) {
  if (!direction || direction === cat.facing || cat.mode !== "ground") return;
  cat.startTurn(direction, via ? { via } : undefined);
  while (cat.turn) yield;
}

const faceToward = (cat, x, via) => face(cat, x >= cat.x ? 1 : -1, via);

function* walkTo(cat, x, speed, each) {
  if (cat.mode !== "ground" || !cat.platform) return false;
  const margin = cat.bodyLen * 0.4;
  const target = clamp(x, cat.platform.left + margin, Math.max(cat.platform.left + margin, cat.platform.right - margin));
  let stuck = 0;
  while (cat.mode === "ground" && Math.abs(cat.x - target) > Math.max(2, speed * 0.02)) {
    cat.moveTo(target, speed);
    if (each && each() === false) { cat.stop(); return false; }
    stuck = Math.abs(cat.vx) < 1 && !cat.turn ? stuck + cat.dt : 0;
    if (stuck > 1.2) break;
    yield;
  }
  cat.stop();
  return cat.mode === "ground";
}

function* settle(cat, posture, seconds = 0.45) {
  cat.setPosture(posture);
  yield* wait(cat, seconds);
}

// Look around like a cat: quick head turns that then hold, now and then
// checking the cursor or the other cat.
function glance(cat, engine) {
  const other = engine.otherCat(cat);
  const pointer = engine.pointer;
  if (pointer.active && engine.pointerNear(cat, cat.bodyLen * 8) && chance(0.55)) return { x: pointer.x, y: pointer.y };
  if (other && chance(0.3)) return other.headPoint();
  const ahead = cat.facing * cat.bodyLen * rand(1.5, 6);
  return { x: cat.x + ahead, y: cat.y + cat.standH * rand(-2.6, 0.9) };
}

function* lookAround(cat, engine, seconds) {
  const end = cat.t + seconds;
  while (cat.t < end) {
    cat.lookAt(chance(0.15) ? null : glance(cat, engine), false);
    yield* wait(cat, rand(0.7, 2.4), () => {
      if (engine.pointer.fresh && engine.pointerNear(cat, cat.bodyLen * 6)) cat.lookAt(engine.pointer, true);
    });
  }
}

// --- jumping, dropping, climbing -------------------------------------------
function* jumpTo(cat, engine, plan) {
  const { to, landX } = plan;
  yield* faceToward(cat, landX);
  if (cat.mode !== "ground") return false;
  const rise = cat.y - to.y;
  const big = rise > cat.standH * 1.6;
  // Measure the jump: stare at the landing spot, sink down, maybe wiggle.
  cat.lookAt({ x: landX, y: to.y - cat.standH * 0.35 }, false);
  cat.tailMood = "curious";
  cat.setPosture(rise < -cat.standH * 0.5 ? "peek" : "crouch");
  yield* wait(cat, big ? rand(0.55, 1.2) : rand(0.2, 0.38));
  if (big && chance(0.7)) {
    cat.want.wiggle = 1;
    yield* wait(cat, rand(0.3, 0.6));
    cat.want.wiggle = 0;
  }
  if (cat.mode !== "ground") return false;
  const g = engine.gravity;
  let apex = rise > 0 ? rise + cat.standH * 0.3 + 4 : cat.standH * (0.16 + Math.min(-rise, 300) / 2600);
  if (plan.short) apex = rise - cat.standH * 0.15; // paws reach the edge, feet don't
  const vy = -Math.sqrt(2 * g * apex);
  const time = Math.sqrt((2 * apex) / g) + Math.sqrt((2 * Math.max(apex - rise, 1)) / g);
  const vx = (landX - cat.x) / time;
  const smallHop = Math.abs(rise) < cat.standH * 0.7 && Math.abs(landX - cat.x) < cat.bodyLen * 1.6;
  cat.squashVel = -3.5;
  cat.setPosture("stand");
  cat.ignorePlatform = rise <= 0 ? cat.platform : null;
  cat.wantsLedge = !!plan.short;
  cat.launch(vx, vy, smallHop ? "hop" : "leap");
  yield* waitUntil(cat, () => cat.mode !== "air", 4);
  cat.ignorePlatform = null;
  cat.wantsLedge = false;
  if (cat.mode === "cling") yield* pullUp(cat, engine);
  cat.lookAt(null);
  if (cat.mode !== "ground") return false;
  const hard = (cat.landImpact || 0) > 0.75;
  cat.setPosture(hard ? "crouch" : "stand");
  yield* wait(cat, hard ? rand(0.25, 0.4) : 0.1);
  cat.setPosture("stand");
  cat.tailMood = "relaxed";
  return true;
}

// Hanging off an edge: scrabble, then haul up onto the surface.
function* pullUp(cat, engine) {
  const ledge = cat.ledge;
  cat.climbReach = 0;
  engine.say(`${cat.name} caught the edge!`, 2);
  cat.lookAt({ x: ledge.x + (ledge.side === "left" ? 1 : -1) * cat.bodyLen, y: ledge.y - cat.standH * 0.5 }, false);
  yield* wait(cat, rand(0.35, 0.75)); // hind paws scrabbling
  const platform = ledge.platform;
  if (platform.gone) { cat.startFall(0, 0); return; }
  // haul up: the feet become the reference point and the body flows over the edge
  cat.mode = "ground";
  cat.platform = platform;
  cat.facing = ledge.side === "left" ? 1 : -1;
  const x = ledge.side === "left" ? platform.left + cat.bodyLen * 0.42 : platform.right - cat.bodyLen * 0.42;
  cat.rebase(x, platform.y);
  cat.postureRate = 5;
  cat.setPosture("crouch");
  yield* wait(cat, 0.4);
  cat.postureRate = null;
  cat.lookAt(null);
  cat.setPosture("stand");
}

// Kittens climb what they cannot jump onto (Ono vs. the photo frames).
function* climbWall(cat, engine, link) {
  const { wall, to } = link;
  const sideDir = wall.side === "left" ? 1 : -1; // direction the cat faces while climbing
  const approachX = wall.x - sideDir * cat.bodyLen * 0.55;
  yield* walkTo(cat, approachX, cat.bodyLen * 1.3);
  yield* face(cat, sideDir);
  if (cat.mode !== "ground") return false;
  cat.lookAt({ x: wall.x, y: to.y }, false);
  cat.setPosture("crouch");
  yield* wait(cat, rand(0.35, 0.7));
  // hop onto the side of the frame: the front paws become the reference point
  const startY = Math.min(cat.y - cat.standH * 0.95, wall.bottom - cat.standH * 0.2);
  cat.rebase(wall.x, startY);
  cat.mode = "climb";
  cat.platform = null;
  cat.vx = 0;
  cat.lookAt({ x: wall.x, y: to.y - cat.standH }, false);
  engine.say(`${cat.name} is climbing the frame.`, 1);
  let y = startY;
  while (y > to.y + cat.standH * 0.12) {
    if (cat.mode !== "climb") return false;
    if (to.gone) { cat.startFall(0, 0); return false; }
    // reach with one pair of paws...
    cat.climbReach = 1 - cat.climbReach;
    yield* wait(cat, rand(0.1, 0.15));
    // ...then pull: the body moves on the pull
    const step = cat.standH * rand(0.26, 0.38);
    const from = y;
    y = Math.max(to.y + cat.standH * 0.08, y - step);
    const begin = cat.t;
    yield* wait(cat, 0.16, () => { cat.y = from + (y - from) * clamp((cat.t - begin) / 0.16, 0, 1); cat.x = wall.x; });
    if (chance(0.12)) yield* wait(cat, rand(0.5, 1.1)); // kittens stop and look around halfway up
  }
  cat.ledge = { platform: to, side: wall.side, x: wall.x, y: to.y };
  cat.rebase(wall.x, to.y);
  cat.mode = "cling";
  yield* pullUp(cat, engine);
  return cat.platform === to;
}

function* travel(cat, engine, destination, destX, speed) {
  if (!cat.platform || cat.mode !== "ground") return false;
  if (destination === cat.platform) return yield* walkTo(cat, destX, speed);
  const path = engine.world.route(cat, cat.platform, destination);
  if (!path) return false;
  for (const link of path) {
    if (cat.mode !== "ground" || cat.platform !== link.from) return false;
    if (link.type === "climb") {
      if (!(yield* climbWall(cat, engine, link))) return false;
    } else {
      const last = link.to === destination;
      const plan = engine.world.planJump(cat, link.from, link.to, last ? destX : null);
      yield* walkTo(cat, plan.takeoffX, speed);
      if (!(yield* jumpTo(cat, engine, plan))) return false;
    }
  }
  if (cat.platform !== destination) return false;
  return yield* walkTo(cat, destX, speed);
}

// --- everyday activities -----------------------------------------------------
export function* idleWatch(cat, engine) {
  cat.tailMood = chance(0.5) ? "rest" : "relaxed";
  yield* settle(cat, chance(0.75) ? "sit" : "stand", 0.6);
  yield* lookAround(cat, engine, rand(5, 14));
  if (chance(0.3)) yield* groom(cat, engine, rand(2.5, 5));
}

export function* loafRest(cat, engine) {
  cat.tailMood = "rest";
  if (cat.postureName === "stand") yield* settle(cat, "sit", 0.5);
  yield* settle(cat, chance(0.55) ? "loaf" : "sphinx", 0.7);
  cat.eyesMode = "half";
  yield* lookAround(cat, engine, rand(6, 16));
  if (cat.needs.energy < 0.35 && chance(0.6)) {
    yield* sleepHere(cat, engine);
    return;
  }
  cat.eyesMode = "auto";
  yield* settle(cat, "sit", 0.5);
}

export function* groom(cat, engine, seconds = rand(3, 7)) {
  cat.tailMood = "rest";
  if (cat.postureName !== "sit") yield* settle(cat, "sit", 0.55);
  cat.lookAt(null);
  cat.eyesMode = "half";
  const end = cat.t + seconds;
  while (cat.t < end) {
    cat.want.lick = 1;
    yield* wait(cat, rand(1.1, 2.4));
    cat.want.lick = 0;
    yield* wait(cat, rand(0.35, 0.9));
    if (chance(0.3)) cat.lookAt(glance(cat, engine), false);
  }
  cat.want.lick = 0;
  cat.eyesMode = "auto";
  yield* wait(cat, 0.3);
}

function* stretch(cat) {
  cat.tailMood = "relaxed";
  cat.eyesMode = "half";
  yield* settle(cat, "stand", 0.4);
  yield* settle(cat, "stretchFront", rand(1, 1.5));
  yield* settle(cat, "stand", 0.3);
  if (chance(0.7)) yield* settle(cat, "stretchBack", rand(0.6, 0.9));
  yield* settle(cat, "stand", 0.35);
  cat.eyesMode = "auto";
}

function* sleepHere(cat, engine) {
  // circle once or twice, maybe knead, then curl up
  const circles = chance(0.65) ? 1 : 2;
  yield* settle(cat, "stand", 0.4);
  for (let i = 0; i < circles; i += 1) {
    yield* face(cat, -cat.facing);
    yield* walkTo(cat, cat.x + cat.facing * cat.bodyLen * 0.12, cat.bodyLen * 0.4);
  }
  if (chance(0.4)) {
    cat.eyesMode = "half";
    cat.want.knead = 1;
    yield* wait(cat, rand(1.6, 3.2));
    cat.want.knead = 0;
  }
  cat.tailMood = "sleepy";
  yield* settle(cat, "loaf", 0.8);
  cat.eyesMode = "half";
  yield* wait(cat, rand(0.8, 1.6));
  cat.eyesMode = "closed";
  yield* wait(cat, rand(0.6, 1.2));
  cat.forcedPose = "sleep";
  cat.zzz = true;
  engine.say(`${cat.name} curled up for a nap.`, 1);
  const duration = rand(16, 40) * (0.6 + cat.p.sleepy);
  const end = cat.t + duration;
  while (cat.t < end && cat.needs.energy < 0.98) {
    yield* wait(cat, rand(4, 9));
    if (chance(0.3)) cat.dream = rand(0.3, 0.7); // REM twitch
  }
  yield* wakeUp(cat, engine);
}

function* wakeUp(cat, engine) {
  cat.zzz = false;
  cat.forcedPose = null;
  cat.setPosture("loaf");
  cat.eyesMode = "closed";
  yield* wait(cat, rand(0.5, 1));
  cat.mouthWant = 1; // a big yawn
  yield* wait(cat, rand(0.7, 1.1));
  cat.mouthWant = 0;
  cat.eyesMode = "half";
  yield* lookAround(cat, engine, rand(1, 2.5));
  yield* stretch(cat);
  if (chance(0.5)) yield* groom(cat, engine, rand(2, 4));
}

export function* nap(cat, engine) {
  const world = engine.world;
  const other = engine.otherCat(cat);
  // The cushions on the cat tree make the best beds (the higher the better);
  // otherwise sleep near the other cat if it is napping, or somewhere visible.
  const pads = world.platforms.filter((p) => p.kind === "pad" && !p.gone && other?.platform !== p && (p === cat.platform || world.route(cat, cat.platform, p)));
  let spot = null;
  if (pads.length && chance(0.75)) {
    const weights = pads.map((p) => 1 + (world.floor.y - p.y) / Math.max(world.floor.y, 1));
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    const pad = pads.find((_, i) => (roll -= weights[i]) <= 0) || pads[0];
    spot = { platform: pad, x: (pad.left + pad.right) / 2 + rand(-0.1, 0.1) * (pad.right - pad.left) };
  } else if (other && other.pose === "sleep" && other.platform && other.platform.kind !== "pad" && chance(0.7)) {
    spot = { platform: other.platform, x: other.x + (chance(0.5) ? -1 : 1) * (other.bodyLen * 0.55 + cat.bodyLen * 0.55) };
  } else if (chance(0.45)) {
    spot = world.pickSpot(cat, { visible: true, cozy: true });
  }
  if (spot) yield* travel(cat, engine, spot.platform, spot.x, cat.bodyLen * 0.7);
  if (cat.mode !== "ground") return;
  yield* sleepHere(cat, engine);
}

export function* stroll(cat, engine) {
  const platform = cat.platform;
  if (!platform) return;
  cat.tailMood = chance(0.7) ? "relaxed" : "curious";
  yield* settle(cat, "stand", 0.3);
  const target = engine.world.pickSpotOn(cat, platform);
  const speed = cat.bodyLen * rand(0.5, 0.9);
  let nextPause = cat.t + rand(1.5, 4);
  const giveUp = cat.t + 25;
  while (cat.mode === "ground" && Math.abs(cat.x - target) > 4 && cat.t < giveUp) {
    const arrived = yield* walkTo(cat, target, speed * rand(0.85, 1.15), () => {
      if (engine.pointer.fresh && engine.pointerNear(cat, cat.bodyLen * 5)) cat.lookAt(engine.pointer, true);
      else if (cat.look && chance(0.01)) cat.lookAt(null);
      return cat.t < nextPause;
    });
    if (arrived && Math.abs(cat.x - target) <= 4) break;
    // stop to sniff something or look around
    nextPause = cat.t + rand(2, 5);
    if (chance(0.5)) {
      cat.lookAt({ x: cat.x + cat.facing * cat.bodyLen, y: cat.y }, false);
      cat.want.sniff = 1;
      yield* wait(cat, rand(0.6, 1.4));
      cat.want.sniff = 0;
    } else {
      yield* lookAround(cat, engine, rand(0.8, 2));
    }
  }
  cat.lookAt(null);
  const roll = Math.random();
  if (roll < 0.45) yield* idleWatch(cat, engine);
  else if (roll < 0.6 && engine.world.nearEdge(cat)) yield* peekOver(cat, engine);
}

function* peekOver(cat, engine) {
  const platform = cat.platform;
  const edge = cat.x - platform.left < platform.right - cat.x ? -1 : 1;
  yield* face(cat, edge);
  yield* walkTo(cat, edge > 0 ? platform.right : platform.left, cat.bodyLen * 0.5);
  cat.tailMood = "curious";
  cat.lookAt({ x: cat.x + edge * cat.bodyLen * 1.2, y: cat.y + cat.standH * 3 }, false);
  yield* settle(cat, "peek", rand(1.5, 3));
  yield* settle(cat, "sit", 0.6);
  yield* lookAround(cat, engine, rand(3, 7));
}

export function* explore(cat, engine) {
  const spot = engine.world.pickSpot(cat, { visible: true, elsewhere: true });
  if (!spot) { yield* stroll(cat, engine); return; }
  cat.tailMood = "curious";
  const ok = yield* travel(cat, engine, spot.platform, spot.x, cat.bodyLen * rand(0.7, 1.1));
  if (!ok || cat.mode !== "ground") return;
  if (engine.world.nearEdge(cat) && chance(0.5)) yield* peekOver(cat, engine);
  else yield* idleWatch(cat, engine);
}

export function* zoomies(cat, engine) {
  const platform = cat.platform;
  if (!platform) return;
  cat.memory.lastZoomies = cat.t;
  engine.say(`${cat.name} has the zoomies!`, 1);
  cat.tailMood = "scared"; // puffed and up
  cat.setPosture("crouch");
  yield* wait(cat, rand(0.2, 0.4));
  cat.setPosture("stand");
  const laps = Math.round(rand(2, 4));
  for (let i = 0; i < laps; i += 1) {
    const margin = cat.bodyLen;
    const towardRight = cat.x < (platform.left + platform.right) / 2;
    const x = towardRight ? rand(platform.right - margin * 2, platform.right - margin * 0.5) : rand(platform.left + margin * 0.5, platform.left + margin * 2);
    yield* walkTo(cat, x, cat.bodyLen * rand(4.5, 6.2));
    if (cat.mode !== "ground") return;
    if (chance(0.35)) { // freeze and stare at nothing
      cat.setPosture("alert");
      cat.lookAt(glance(cat, engine), false);
      yield* wait(cat, rand(0.4, 1));
      cat.setPosture("stand");
    }
  }
  cat.tailMood = "relaxed";
  yield* settle(cat, "sit", 0.5);
  yield* groom(cat, engine, rand(2, 4)); // "I meant to do that"
}

// --- people -------------------------------------------------------------------
// Petted enough times while napping: wakes up slowly and leans into it.
export function* wakeForPets(cat, engine) {
  cat.zzz = false;
  cat.forcedPose = null;
  cat.setPosture("loaf");
  cat.eyesMode = "half";
  cat.tailMood = "happy";
  yield* wait(cat, rand(0.6, 1));
  cat.lookAt(engine.pointer, true);
  yield* enjoyPet(cat, engine, false);
}

export function* enjoyPet(cat, engine, counts = true) {
  const pointer = engine.pointer;
  const n = cat.needs;
  if (counts) cat.memory.petCount += 1;
  cat.memory.lastPet = cat.t;
  if (cat.mode !== "ground") return;
  const tolerance = (5 + cat.p.patience * 6) * (0.6 + n.affection);
  if (cat.memory.petCount > tolerance || n.annoyance > 0.75) {
    yield* overstimulated(cat, engine);
    return;
  }
  cat.hearts = 2.4;
  n.affection = clamp(n.affection + 0.06, 0, 1);
  n.annoyance = clamp(n.annoyance + 0.04 / cat.p.patience, 0, 1);
  engine.say(`${cat.name} is purring.`, 1);
  cat.tailMood = "happy";
  if (pointer.x !== null && Math.abs(pointer.x - cat.x) > cat.bodyLen * 0.3) yield* faceToward(cat, pointer.x, "front");
  cat.setPosture(chance(0.5) ? "sit" : "stand");
  cat.lookAt(pointer, true);
  cat.want.lean = 1;
  cat.eyesMode = "happy";
  if (chance(0.55)) cat.slowBlink();
  yield* wait(cat, rand(1.6, 2.8));
  cat.want.lean = 0;
  cat.eyesMode = "auto";
  if (n.annoyance > 0.45) cat.tailMood = "annoyed"; // tail starts swishing: a warning
  yield* wait(cat, rand(0.8, 1.6));
  cat.tailMood = "relaxed";
}

function* overstimulated(cat, engine) {
  const pointer = engine.pointer;
  cat.memory.petCount = 0;
  cat.needs.annoyance = 1;
  cat.tailMood = "angry";
  engine.say(`${cat.name} has had enough petting.`, 2);
  cat.setPosture("alert");
  if (pointer.x !== null) yield* faceToward(cat, pointer.x);
  cat.lookAt(pointer, false);
  cat.mouthWant = 0.7; // a little hiss
  yield* wait(cat, rand(0.3, 0.6));
  cat.mouthWant = 0;
  cat.want.swat = 1; // a warning swat
  yield* wait(cat, 0.16);
  cat.want.swat = 0;
  yield* wait(cat, rand(0.3, 0.6));
  const platform = cat.platform;
  if (!platform) return;
  const away = pointer.x !== null && pointer.x > cat.x ? -1 : 1;
  yield* walkTo(cat, cat.x + away * cat.bodyLen * rand(2.5, 4.5), cat.bodyLen * 1.1);
  cat.tailMood = "annoyed";
  yield* groom(cat, engine, rand(2, 3.5));
  cat.tailMood = "relaxed";
}

export function* investigateCursor(cat, engine) {
  const pointer = engine.pointer;
  const platform = cat.platform;
  if (!platform) return;
  cat.tailMood = "curious";
  cat.lookAt(pointer, true);
  yield* faceToward(cat, pointer.x, "front");
  const targetX = pointer.x - Math.sign(pointer.x - cat.x || 1) * cat.bodyLen * 0.6;
  yield* walkTo(cat, targetX, cat.bodyLen * 0.75, () => !(pointer.speed > 900));
  if (pointer.speed > 900) return;
  // stretch the neck and sniff
  cat.setPosture(pointer.y < cat.y - cat.standH * 1.2 ? "lookUp" : "stand");
  cat.want.sniff = 1;
  yield* wait(cat, rand(0.8, 1.6));
  cat.want.sniff = 0;
  if (engine.pointerOver(cat) || Math.abs(pointer.x - cat.x) < cat.bodyLen) {
    cat.tailMood = "happy";
    cat.want.lean = 1; // rub against it
    cat.hearts = 1.2;
    yield* wait(cat, rand(1, 2));
    cat.want.lean = 0;
  }
  yield* idleWatch(cat, engine);
}

export function* stalkCursor(cat, engine) {
  const pointer = engine.pointer;
  const target = () => (engine.ball.mode === "cursor" ? engine.ball : pointer);
  cat.tailMood = "hunt";
  cat.lookAt(target(), true);
  yield* faceToward(cat, target().x);
  cat.setPosture("stalk");
  engine.say(`${cat.name} is stalking ${engine.ball.mode === "cursor" ? "the ball" : "your cursor"}…`, 1);
  // creep closer, freezing whenever the "prey" moves
  const end = cat.t + 6;
  while (cat.t < end && cat.mode === "ground") {
    const tx = target().x;
    const dist = Math.abs(tx - cat.x);
    if (dist < cat.bodyLen * 1.5) break;
    if (Math.sign(tx - cat.x) !== cat.facing) yield* faceToward(cat, tx);
    if (target().speed > 500) { cat.stop(); yield* wait(cat, 0.25); continue; }
    cat.moveTo(tx - cat.facing * cat.bodyLen * 1.3, cat.bodyLen * 0.45);
    yield;
  }
  cat.stop();
  if (cat.mode !== "ground") return;
  cat.setPosture("crouch");
  cat.want.wiggle = 1;
  yield* wait(cat, rand(0.4, 0.9));
  cat.want.wiggle = 0;
  const prey = target();
  const platform = cat.platform;
  const height = clamp(platform.y - prey.y, 0, cat.standH * 1.8);
  const landX = clamp(prey.x, platform.left + cat.bodyLen * 0.4, platform.right - cat.bodyLen * 0.4);
  yield* pounce(cat, engine, landX, height);
  const caught = Math.abs(target().x - cat.x) < cat.bodyLen * 0.7 && Math.abs(target().y - (cat.y - cat.standH * 0.4)) < cat.standH;
  if (caught) {
    engine.say(`${cat.name} got it!`, 1);
    for (let i = 0; i < 2; i += 1) {
      cat.want.swat = 1;
      yield* wait(cat, 0.14);
      cat.want.swat = 0;
      yield* wait(cat, rand(0.2, 0.4));
    }
  }
  cat.tailMood = "relaxed";
  cat.lookAt(caught ? null : target(), true);
  yield* settle(cat, "sit", 0.5);
  if (chance(0.5)) yield* groom(cat, engine, rand(1.5, 3));
  else yield* lookAround(cat, engine, rand(2, 4));
}

function* pounce(cat, engine, landX, height = 0) {
  const g = engine.gravity;
  const apex = cat.standH * 0.45 + height;
  const vy = -Math.sqrt(2 * g * apex);
  const time = Math.sqrt((2 * apex) / g) * 2;
  cat.squashVel = -4;
  cat.setPosture("stand");
  cat.launch((landX - cat.x) / time, vy, "leap");
  yield* waitUntil(cat, () => cat.mode !== "air", 3);
  if (cat.mode === "cling") yield* pullUp(cat, engine);
}

export function* startle(cat, engine) {
  const pointer = engine.pointer;
  cat.memory.lastStartle = cat.t;
  cat.memory.habituation += 0.35;
  const away = pointer.x > cat.x ? -1 : 1;
  cat.tailMood = "scared";
  cat.eyesMode = "auto";
  if (cat.pose === "sleep") { cat.forcedPose = null; cat.zzz = false; }
  engine.say(`${cat.name} jumped!`, 2);
  // straight-up startle hop
  const g = engine.gravity;
  cat.setPosture("alert");
  cat.launch(away * cat.bodyLen * 0.6, -Math.sqrt(2 * g * cat.standH * 0.32), "hop");
  yield* waitUntil(cat, () => cat.mode !== "air", 2);
  if (cat.mode !== "ground") return;
  cat.lookAt(pointer, false);
  if (cat.p.bold < 0.6 || chance(0.5)) {
    yield* face(cat, away);
    yield* walkTo(cat, cat.x + away * cat.bodyLen * rand(2.5, 4), cat.bodyLen * 4.5);
    yield* face(cat, -away, "front");
  }
  cat.setPosture("alert");
  cat.lookAt(pointer, false);
  yield* wait(cat, rand(1, 2));
  cat.tailMood = "relaxed";
  yield* settle(cat, "sit", 0.5);
}

// The ball dangling from the cursor works like a wand toy.
export function* wandPlay(cat, engine) {
  const ball = engine.ball;
  cat.tailMood = "hunt";
  const end = cat.t + rand(6, 12) * (0.5 + cat.p.playful);
  while (cat.t < end && ball.mode === "cursor" && cat.mode === "ground") {
    cat.lookAt(ball, true);
    const platform = cat.platform;
    const dx = ball.x - cat.x;
    const above = platform.y - ball.y;
    if (Math.sign(dx) !== cat.facing && Math.abs(dx) > cat.bodyLen * 0.3) { yield* faceToward(cat, ball.x); continue; }
    if (Math.abs(dx) < cat.bodyLen * 0.9 && above > cat.standH * 0.55 && above < cat.standH * 2.1) {
      // rear up and bat at it
      cat.stop();
      cat.forcedPose = "rear";
      yield* wait(cat, rand(0.22, 0.32));
      engine.nudgeBall(cat);
      cat.forcedPose = null;
      cat.setPosture("stand");
      yield* wait(cat, rand(0.25, 0.5));
    } else if (Math.abs(dx) < cat.bodyLen * 1.8 && above < cat.standH * 0.75 && ball.speed > 60) {
      cat.setPosture("crouch");
      cat.want.wiggle = 1;
      yield* wait(cat, rand(0.2, 0.45));
      cat.want.wiggle = 0;
      yield* pounce(cat, engine, clamp(ball.x, platform.left + cat.bodyLen * 0.4, platform.right - cat.bodyLen * 0.4), clamp(above, 0, cat.standH));
      engine.nudgeBall(cat);
      cat.setPosture("stand");
    } else if (Math.abs(dx) > cat.bodyLen * 1.2 && above < cat.standH * 4) {
      cat.setPosture(ball.speed > 200 ? "stand" : "stalk");
      cat.moveTo(ball.x - Math.sign(dx) * cat.bodyLen * 0.8, cat.bodyLen * (ball.speed > 200 ? 2.6 : 0.6));
      yield;
    } else {
      cat.stop();
      cat.setPosture("crouch");
      yield* wait(cat, 0.2);
    }
    if (ball.idleFor > 3.5) break; // the toy stopped moving: lose interest
  }
  cat.stop();
  cat.forcedPose = null;
  cat.tailMood = "relaxed";
  yield* settle(cat, "sit", 0.5);
  yield* lookAround(cat, engine, rand(1.5, 3));
}

export function* chaseBall(cat, engine) {
  const ball = engine.ball;
  cat.tailMood = "hunt";
  cat.lookAt(ball, true);
  yield* faceToward(cat, ball.x);
  cat.setPosture("crouch");
  yield* wait(cat, rand(0.2, 0.5));
  if (chance(0.4)) { cat.want.wiggle = 1; yield* wait(cat, rand(0.3, 0.5)); cat.want.wiggle = 0; }
  cat.setPosture("stand");
  engine.say(`${cat.name} is after the ball!`, 1);
  const end = cat.t + 14;
  let bats = 0;
  while (cat.t < end && (ball.mode === "free" || ball.mode === "rest") && cat.mode === "ground") {
    cat.lookAt(ball, true);
    const ballPlatform = ball.platform || engine.world.platformBelow(ball.x, ball.y);
    if (!ballPlatform) { yield; continue; }
    if (ballPlatform !== cat.platform) {
      if (ball.mode === "free" && !ball.platform) { cat.stop(); yield; continue; } // wait for it to land
      const ok = yield* travel(cat, engine, ballPlatform, ball.x, cat.bodyLen * 3);
      if (!ok) break;
      continue;
    }
    const dx = ball.x - cat.x;
    if (Math.abs(dx) > cat.bodyLen * 0.75) {
      cat.moveTo(ball.x - Math.sign(dx) * cat.bodyLen * 0.5, cat.bodyLen * (ball.mode === "free" ? 4.2 : 2.4));
      yield;
      continue;
    }
    cat.stop();
    yield* faceToward(cat, ball.x);
    if (bats < (chance(0.5) ? 2 : 1) && chance(0.75)) {
      bats += 1;
      cat.want.swat = 1;
      yield* wait(cat, 0.12);
      engine.batBall(cat);
      cat.want.swat = 0;
      yield* wait(cat, rand(0.15, 0.35));
      continue;
    }
    if (chance(cat.p.fetches)) {
      engine.pickUpBall(cat);
      yield* fetchBack(cat, engine);
      return;
    }
    engine.say(`${cat.name} lost interest in the ball.`, 1);
    break;
  }
  cat.tailMood = "relaxed";
  yield* settle(cat, "sit", 0.5);
  yield* lookAround(cat, engine, rand(1.5, 3));
}

function* fetchBack(cat, engine) {
  const ball = engine.ball;
  cat.tailMood = "happy";
  engine.say(`${cat.name} picked up the ball!`, 2);
  const home = engine.world.spotNear(cat, ball.throwFrom || engine.pointer);
  if (home) yield* travel(cat, engine, home.platform, home.x, cat.bodyLen * 1.7);
  if (cat.mode !== "ground" || ball.owner !== cat) return;
  yield* face(cat, engine.pointer.x !== null && engine.pointer.x < cat.x ? -1 : 1, "front");
  engine.dropBall(cat);
  engine.say(`${cat.name} brought the ball back for you.`, 2);
  cat.lookAt(engine.pointer, true);
  cat.mouthWant = 0.6; // meow!
  yield* wait(cat, 0.35);
  cat.mouthWant = 0;
  yield* settle(cat, "sit", 0.5);
  cat.lookAt(engine.pointer, true);
  cat.tailMood = "happy";
  yield* wait(cat, rand(2.5, 4.5)); // waiting for you to throw it again
  cat.tailMood = "relaxed";
}

export function* afterDrop(cat, engine) {
  yield* waitUntil(cat, () => cat.mode === "ground" || cat.mode === "cling", 5);
  if (cat.mode === "cling") yield* pullUp(cat, engine);
  if (cat.mode !== "ground") return;
  const hard = (cat.landImpact || 0) > 0.6;
  cat.setPosture(hard ? "crouch" : "stand");
  yield* wait(cat, hard ? 0.35 : 0.15);
  cat.setPosture("stand");
  yield* wait(cat, 0.15);
  cat.fx.shake = 1; // shake it off
  yield* wait(cat, 0.55);
  cat.lookAt(engine.pointer, false); // a look at whoever did that
  yield* wait(cat, rand(0.4, 0.9));
  if (chance(0.6)) yield* groom(cat, engine, rand(2, 4)); // displacement grooming
  else yield* idleWatch(cat, engine);
}

// --- each other -------------------------------------------------------------
export function* greet(cat, engine, other) {
  if (!other || other.platform !== cat.platform) {
    if (!other || !other.platform) return;
    const ok = yield* travel(cat, engine, other.platform, other.x, cat.bodyLen * 0.9);
    if (!ok) return;
  }
  cat.tailMood = "happy";
  const gap = (cat.bodyLen + other.bodyLen) * 0.42;
  const side = cat.x < other.x ? -1 : 1;
  yield* walkTo(cat, other.x + side * gap, cat.bodyLen * 0.8);
  if (cat.mode !== "ground" || Math.abs(cat.x - other.x) > gap * 1.8) return;
  engine.invite(other, "greeted", cat);
  yield* faceToward(cat, other.x);
  cat.lookAt(other.headPoint(), false);
  cat.setPosture("stand");
  cat.want.sniff = 1;
  cat.want.lean = 1;
  yield* wait(cat, rand(1.2, 2));
  cat.want.sniff = 0;
  cat.want.lean = 0;
  cat.memory.lastGreet = cat.t;
  cat.needs.social = 0;
  const kitten = cat.p.playful > 0.8;
  if (!kitten && chance(0.5)) {
    engine.say(`${cat.name} is grooming ${other.name}.`, 1);
    engine.invite(other, "groomed", cat);
    cat.eyesMode = "half";
    cat.lookAt(other.headPoint(), false);
    yield* wait(cat, rand(2.5, 4), () => { cat.want.sniff = 0.6 + 0.4 * Math.sin(cat.t * 8); });
    cat.want.sniff = 0;
    cat.eyesMode = "auto";
  } else if (kitten && chance(0.6)) {
    yield* playWith(cat, engine, other);
    return;
  } else {
    engine.say(`${cat.name} and ${other.name} said hello.`, 1);
  }
  cat.tailMood = "relaxed";
  yield* settle(cat, "sit", 0.5);
  yield* lookAround(cat, engine, rand(2, 5));
}

export function* beGreeted(cat, engine, from) {
  cat.stop();
  cat.tailMood = "happy";
  if (cat.pose === "sleep") { cat.forcedPose = null; cat.zzz = false; cat.setPosture("loaf"); cat.eyesMode = "half"; }
  else yield* faceToward(cat, from.x, "front");
  cat.lookAt(from.headPoint(), false);
  cat.want.lean = 0.6;
  yield* wait(cat, rand(1.6, 2.6));
  cat.want.lean = 0;
  cat.needs.social = 0;
  cat.eyesMode = "auto";
  yield* lookAround(cat, engine, rand(1.5, 3));
  cat.tailMood = "relaxed";
}

export function* beGroomed(cat) {
  cat.stop();
  cat.tailMood = "rest";
  if (cat.postureName === "stand") cat.setPosture("sit");
  cat.eyesMode = "half";
  cat.lookAt(null);
  yield* wait(cat, rand(2.6, 4));
  if (chance(0.5)) cat.slowBlink();
  cat.eyesMode = "auto";
  yield* wait(cat, 0.8);
}

function* playWith(cat, engine, other) {
  engine.say(`${cat.name} wants to play with ${other.name}!`, 1);
  cat.tailMood = "hunt";
  cat.setPosture("crouch");
  cat.lookAt(other.headPoint(), true);
  cat.want.wiggle = 1;
  yield* wait(cat, rand(0.4, 0.8));
  cat.want.wiggle = 0;
  const willing = other.needs.annoyance < 0.5 && other.needs.energy > 0.3 && chance(0.6 + other.p.playful * 0.3);
  engine.invite(other, willing ? "play" : "rebuff", cat);
  // a little pounce at the other cat
  if (cat.platform) yield* pounce(cat, engine, clamp(other.x - cat.facing * other.bodyLen * 0.35, cat.platform.left + cat.bodyLen * 0.4, cat.platform.right - cat.bodyLen * 0.4), 0);
  if (cat.mode !== "ground") return;
  if (willing) {
    // stand up and box for a moment
    for (let i = 0; i < 3; i += 1) {
      yield* faceToward(cat, other.x);
      cat.forcedPose = "rear";
      yield* wait(cat, rand(0.25, 0.4));
      cat.forcedPose = null;
      yield* wait(cat, rand(0.2, 0.45));
    }
    // then a chase
    const platform = cat.platform;
    if (!platform) return;
    cat.tailMood = "scared";
    const runTo = other.x > (platform.left + platform.right) / 2 ? platform.left + cat.bodyLen : platform.right - cat.bodyLen;
    engine.invite(other, "chase", cat);
    yield* walkTo(cat, runTo, cat.bodyLen * 4.2);
    cat.tailMood = "relaxed";
    yield* settle(cat, "sit", 0.4);
    yield* groom(cat, engine, rand(1.5, 3));
  } else {
    cat.tailMood = "relaxed";
    yield* settle(cat, "sit", 0.5);
    cat.lookAt(other.headPoint(), false);
    yield* wait(cat, rand(1.5, 2.5));
  }
  cat.needs.social = 0;
}

export function* playBack(cat, engine, from) {
  cat.stop();
  if (cat.pose === "sleep") { cat.forcedPose = null; cat.zzz = false; }
  cat.tailMood = "hunt";
  yield* faceToward(cat, from.x);
  cat.lookAt(from.headPoint(), true);
  cat.setPosture("crouch");
  yield* wait(cat, rand(0.5, 0.9));
  for (let i = 0; i < 3; i += 1) {
    yield* faceToward(cat, from.x);
    cat.forcedPose = "rear";
    yield* wait(cat, rand(0.25, 0.4));
    cat.forcedPose = null;
    yield* wait(cat, rand(0.25, 0.45));
  }
  yield* waitUntil(cat, () => from.taskName !== "greet" || from.moving, 1.5);
}

export function* chaseAfter(cat, engine, from) {
  cat.tailMood = "hunt";
  yield* wait(cat, rand(0.1, 0.3));
  const end = cat.t + rand(1.8, 3);
  while (cat.t < end && cat.mode === "ground" && from.platform === cat.platform) {
    cat.moveTo(from.x - Math.sign(from.x - cat.x || 1) * cat.bodyLen * 0.9, cat.bodyLen * 4);
    yield;
  }
  cat.stop();
  cat.tailMood = "relaxed";
  yield* settle(cat, "sit", 0.5);
  yield* lookAround(cat, engine, rand(1, 2));
}

export function* rebuff(cat, engine, from) {
  cat.stop();
  if (cat.pose === "sleep") { cat.forcedPose = null; cat.zzz = false; cat.setPosture("loaf"); }
  cat.tailMood = "angry";
  cat.needs.annoyance = clamp(cat.needs.annoyance + 0.3, 0, 1);
  engine.say(`${cat.name} is not in the mood.`, 1);
  yield* faceToward(cat, from.x);
  cat.setPosture("alert");
  cat.lookAt(from.headPoint(), false);
  yield* wait(cat, rand(0.5, 0.8));
  cat.want.swat = 1;
  yield* wait(cat, 0.14);
  cat.want.swat = 0;
  yield* wait(cat, rand(0.4, 0.7));
  // move off, preferably somewhere higher
  const spot = engine.world.pickSpot(cat, { visible: true, elsewhere: true, high: true });
  cat.tailMood = "annoyed";
  if (spot && chance(0.6)) yield* travel(cat, engine, spot.platform, spot.x, cat.bodyLen * 1.2);
  else if (cat.platform) yield* walkTo(cat, cat.x + (cat.x > from.x ? 1 : -1) * cat.bodyLen * 3, cat.bodyLen * 1.1);
  cat.tailMood = "relaxed";
  yield* groom(cat, engine, rand(2, 3));
}

export function* follow(cat, engine, other) {
  if (!other || !other.platform) return;
  cat.tailMood = "relaxed";
  const end = cat.t + rand(8, 16);
  while (cat.t < end) {
    if (!other.platform) break;
    if (other.platform !== cat.platform) {
      const ok = yield* travel(cat, engine, other.platform, other.x - other.facing * other.bodyLen * 1.3, cat.bodyLen * 1.2);
      if (!ok) break;
      continue;
    }
    const dist = Math.abs(other.x - cat.x);
    if (dist > other.bodyLen * 2.4) {
      cat.moveTo(other.x - Math.sign(other.x - cat.x) * other.bodyLen * 1.4, cat.bodyLen * (dist > other.bodyLen * 5 ? 2.2 : 1));
      yield;
    } else {
      cat.stop();
      if (Math.sign(other.x - cat.x) !== cat.facing) yield* faceToward(cat, other.x);
      cat.setPosture("sit");
      cat.lookAt(other.headPoint(), false);
      yield* wait(cat, rand(0.8, 1.8));
      if (other.pose === "sleep") break;
    }
  }
  cat.stop();
  yield* idleWatch(cat, engine);
}

// --- choosing what to do next -------------------------------------------------
export function chooseActivity(cat, engine) {
  const n = cat.needs;
  const p = cat.p;
  const other = engine.otherCat(cat);
  const otherAvailable = other && other.mode === "ground" && other.platform && !["held"].includes(other.taskName);
  const options = [];
  const add = (weight, name, make) => { if (weight > 0) options.push({ weight, name, make }); };
  const tired = 1 - n.energy;
  add(tired * tired * 7 * (0.5 + p.sleepy) + (n.energy < 0.2 ? 6 : 0), "nap", () => nap(cat, engine));
  add(1.4 + tired * 1.5, "loaf", () => loafRest(cat, engine));
  add(2.2, "watch", () => idleWatch(cat, engine));
  add(1 + (cat.t - cat.memory.lastLanding < 8 ? 2 : 0), "groom", () => groom(cat, engine));
  add(1.8 * (0.4 + n.boredom) * n.energy, "stroll", () => stroll(cat, engine));
  add(2.2 * p.curious * (0.3 + n.boredom) * n.energy * (engine.world.isVisible(cat) ? 1 : 3), "explore", () => explore(cat, engine));
  if (cat.t - cat.memory.lastZoomies > 45) add(0.5 * p.playful * n.energy * n.energy, "zoomies", () => zoomies(cat, engine));
  if (otherAvailable && cat.t - cat.memory.lastGreet > 25) add(2.4 * p.social * n.social, "greet", () => greet(cat, engine, other));
  if (otherAvailable && p.playful > 0.8 && other.pose !== "sleep") add(1.1 * p.social, "follow", () => follow(cat, engine, other));
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let roll = Math.random() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option;
  }
  return options[0];
}

export const RESPONSES = { greeted: beGreeted, groomed: beGroomed, play: playBack, rebuff, chase: chaseAfter };
