// Yuzu and Ono are drawn from the original sprite art. Every sprite was
// cropped from the source artwork and rescaled so one sprite pixel is the same
// physical size in every pose; the cats never change size when they switch.
//
// Each pose gets a rig: polygons say which part of the drawing a bone owns,
// joints say where it pivots. The drawing is bent smoothly by these bones (see
// mesh.js) — it is never cut apart. Coordinates are sprite pixels.

const dir = "/cats/sprites";
const spriteSet = (id) => ({
  side: `${dir}/${id}-side.webp`,
  sideClosed: `${dir}/${id}-side-closed.webp`,
  front: `${dir}/${id}-front.webp`,
  back: `${dir}/${id}-back.webp`,
  sleep: `${dir}/${id}-sleep.webp`,
  held: `${dir}/${id}-held.webp`,
  cling: `${dir}/${id}-cling.webp`,
  climb: `${dir}/${id}-climb.webp`,
  fall: `${dir}/${id}-fall.webp`,
});

// A leg and its paw, which bends at the wrist (front) or hock (back). The paw
// touches the floor at the height it is drawn (far paws sit a little higher).
// For a paw drawn in the air: `flat` turns it (degrees) to sit flat and
// `ground` is where it would touch down.
const leg = (name, role, poly, joint, foot, z, { flat = 0, ground = foot[1] } = {}) => {
  const at = role.startsWith("fore") ? 0.72 : 0.64; // wrist / hock, hip-to-foot
  const wrist = [joint[0] + (foot[0] - joint[0]) * at, joint[1] + (foot[1] - joint[1]) * at];
  const l = Math.hypot(foot[0] - joint[0], foot[1] - joint[1]);
  const [nx, ny] = [-(foot[1] - joint[1]) / l, (foot[0] - joint[0]) / l];
  return [
    { name, role, kind: "leg", poly, joint, axis: foot, ground, z, blend: 18, priority: 1 },
    { name: `${name}Paw`, kind: "paw", parent: name, base: [[wrist[0] - nx * 40, wrist[1] - ny * 40], [wrist[0] + nx * 40, wrist[1] + ny * 40]], joint: wrist, axis: foot, falloff: [-4, 6], flat, z },
  ];
};

// An ear swivels about the middle of its base. Only what lies above the base
// line moves with it, so the eyes and forehead below never get dragged along.
// `spread` (optional) also fades it out sideways, for ears drawn close together.
const ear = (name, poly, base, tip, z, parent, spread) => ({
  name, parent, poly, base, joint: [(base[0][0] + base[1][0]) / 2, (base[0][1] + base[1][1]) / 2], axis: tip, z, falloff: [0, 16], spread, priority: 0,
});

export const CAT_DEFS = [
  {
    id: "yuzu",
    name: "Yuzu", // flame point Siamese
    scale: 0.24, // CSS px per sprite px on a wide screen
    personality: {
      playful: 0.55, curious: 0.75, social: 0.6, sleepy: 0.6, bold: 0.7,
      fetches: 0.85, // Siamese love to fetch
      climber: false, jumpHeight: 7.2, patience: 1,
    },
    sprites: spriteSet("yuzu"),
    poses: {
      side: {
        anchor: [255, 317], ground: 317, com: [267, 170], head: [395, 110], mouth: [428, 164],
        rig: {
          bodyZ: 40,
          // a rounder, fuller rump whose top rises into the tail like Ono's
          bulge: { center: [174, 186], inner: 72, outer: 124, scale: [1.17, 1.13] },
          lift: { center: [148, 143], radius: [84, 72], move: [-9, -17] },
          parts: [
            ...leg("legA", "hindFar", [[124, 172], [126, 190], [130, 206], [138, 220], [150, 233], [166, 244], [150, 256], [120, 290], [110, 322], [42, 322], [38, 260]], [150, 205], [88, 309], 10),
            ...leg("legD", "foreFar", [[350, 246], [356, 256], [372, 266], [392, 270], [420, 304], [462, 304], [458, 270], [440, 250], [415, 222], [402, 204]], [370, 217], [440, 300], 12, { flat: -20, ground: 309 }),
            { name: "tail", poly: [[154, 138], [128, 175], [118, 183], [0, 93], [0, 0], [80, 0], [136, 96], [152, 124], [156, 132]], chain: [[150, 152], [118, 120], [86, 88], [55, 57], [24, 24]], z: 20, blend: 16, priority: 1 },
            ...leg("legB", "hindNear", [[160, 243], [156, 250], [168, 285], [188, 322], [254, 322], [250, 296], [222, 270], [216, 248], [232, 234], [229, 229]], [194, 226], [222, 315], 60),
            ...leg("legC", "foreNear", [[276, 234], [272, 245], [300, 280], [325, 324], [392, 324], [385, 300], [366, 280], [356, 260], [350, 246]], [314, 228], [362, 318], 62),
            { name: "head", poly: [[318, 140], [310, 100], [318, 0], [475, 0], [475, 192], [410, 192], [396, 183]], joint: [342, 168], axis: [400, 100], z: 80, blend: 16, priority: 2 },
            ear("earBack", [[314, 106], [304, 60], [334, -4], [358, -4], [382, 36], [400, 72], [388, 78]], [[314, 106], [388, 78]], [345, 5], 81, "head", [0.75, 1.3]),
            ear("earFront", [[414, 84], [404, 70], [434, 12], [454, 0], [478, 18], [478, 94], [470, 92]], [[414, 84], [470, 92]], [452, 22], 82, "head", [0.75, 1.3]),
          ],
        },
      },
      front: { anchor: [128, 389] },
      back: { anchor: [120, 299], rig: { bulge: { center: [128, 176], inner: 56, outer: 98, scale: [1.15, 1.1] } } },
      sleep: {
        anchor: [222, 217], head: [400, 120],
        rig: {
          bulge: { center: [116, 112], inner: 72, outer: 124, scale: [1.13, 1.12] },
          parts: [
            // the tail is curled around the body: only its tip may twitch
            { name: "tail", poly: [[0, 98], [40, 112], [62, 147], [110, 157], [175, 157], [232, 162], [252, 178], [252, 222], [0, 222]], chain: [[20, 128], [34, 176], [82, 198], [142, 203], [200, 199], [243, 190]], flex: [0, 0, 0, 0.3, 1], z: 60, blend: 14, priority: 1 },
            ear("earBack", [[294, 108], [284, 40], [310, -6], [334, -6], [364, 38], [374, 60], [364, 64]], [[294, 108], [364, 64]], [322, 4], 70),
            ear("earFront", [[404, 64], [398, 56], [432, 12], [454, 6], [468, 28], [468, 112], [460, 108]], [[404, 64], [460, 108]], [445, 25], 71),
          ],
        },
      },
      held: {
        anchor: [182, 60], com: [161, 279], head: [182, 110],
        rig: {
          parts: [
            { name: "tail", poly: [[92, 372], [124, 380], [128, 430], [96, 475], [66, 528], [52, 556], [0, 556], [0, 470], [44, 438]], chain: [[112, 388], [86, 432], [60, 470], [38, 505], [26, 535]], z: 20, blend: 16, priority: 1 },
          ],
        },
      },
      cling: {
        anchor: [275, 55], wall: 306, head: [180, 95],
        rig: {
          parts: [
            { name: "tail", poly: [[82, 438], [128, 444], [132, 482], [96, 522], [74, 591], [0, 591], [0, 482], [40, 468]], chain: [[104, 456], [74, 490], [40, 512], [30, 546], [50, 575]], z: 20, blend: 14, priority: 1 },
          ],
        },
      },
      climb: {
        anchor: [300, 500], hands: [345, 70], wall: 386, head: [245, 95],
        rig: {
          parts: [
            { name: "tail", poly: [[200, 362], [198, 446], [120, 442], [58, 402], [4, 334], [4, 278], [62, 278], [122, 350], [176, 384]], chain: [[192, 405], [145, 418], [100, 395], [65, 355], [30, 310]], z: 20, blend: 16, priority: 1 },
            { name: "arms", poly: [[292, 262], [300, 118], [330, 58], [388, 66], [394, 204], [336, 262]], joint: [312, 250], axis: [362, 90], z: 70, blend: 22, priority: 1 },
          ],
        },
      },
      fall: {
        anchor: [236, 222], head: [390, 200],
        rig: {
          bulge: { center: [166, 214], inner: 66, outer: 114, scale: [1.15, 1.12] },
          parts: [
            { name: "tail", poly: [[152, 128], [140, 168], [104, 162], [0, 64], [0, 0], [66, 0], [122, 108], [146, 124]], chain: [[140, 146], [106, 116], [78, 80], [55, 45], [30, 22]], z: 20, blend: 16, priority: 1 },
          ],
        },
      },
    },
  },
  {
    id: "ono",
    name: "Ono", // seal point Siamese kitten
    scale: 0.175,
    personality: {
      playful: 0.95, curious: 0.9, social: 0.85, sleepy: 0.45, bold: 0.55,
      fetches: 0.4,
      climber: true, // kittens climb what they cannot jump onto
      jumpHeight: 4.6, patience: 0.6,
      stride: 0.82, // quick little kitten steps
    },
    sprites: spriteSet("ono"),
    poses: {
      side: {
        anchor: [182, 304], ground: 304, com: [178, 170], head: [260, 110], mouth: [300, 168],
        rig: {
          bodyZ: 40,
          parts: [
            ...leg("legA", "hindFar", [[50, 204], [54, 222], [64, 238], [78, 250], [95, 255], [66, 265], [68, 312], [8, 312], [10, 250]], [80, 222], [40, 302], 10),
            ...leg("legD", "foreFar", [[240, 276], [250, 290], [258, 312], [320, 312], [315, 290], [304, 270], [300, 252], [286, 250], [266, 256], [250, 262]], [270, 252], [290, 304], 12),
            { name: "tail", poly: [[86, 150], [76, 163], [66, 177], [58, 192], [53, 205], [50, 218], [46, 226], [0, 180], [0, 55], [105, 55], [105, 128], [88, 138]], chain: [[66, 192], [45, 160], [28, 122], [32, 86], [60, 66], [92, 82], [97, 108]], z: 20, blend: 14, priority: 1 },
            ...leg("legB", "hindNear", [[90, 254], [86, 262], [100, 290], [115, 312], [172, 312], [165, 290], [150, 272], [140, 262], [150, 254], [178, 248]], [130, 240], [140, 304], 60),
            ...leg("legC", "foreNear", [[181, 247], [178, 262], [182, 300], [186, 312], [240, 312], [238, 290], [225, 276], [212, 266], [200, 256], [192, 249]], [205, 240], [210, 304], 62),
            { name: "head", poly: [[170, 150], [160, 120], [160, 0], [354, 0], [354, 200], [300, 200]], joint: [226, 176], axis: [270, 110], z: 80, blend: 16, priority: 2 },
            ear("earBack", [[158, 134], [146, 136], [144, 24], [158, 8], [178, 12], [226, 40], [224, 60], [222, 96]], [[158, 134], [222, 96]], [162, 22], 81, "head"),
            ear("earFront", [[258, 84], [254, 60], [284, 6], [302, -2], [320, 6], [330, 60], [330, 92], [324, 90]], [[258, 84], [324, 90]], [300, 10], 82, "head"),
          ],
        },
      },
      front: { anchor: [132, 286] },
      back: { anchor: [95, 288] },
      sleep: {
        anchor: [236, 206], head: [380, 110],
        rig: {
          parts: [
            { name: "tail", poly: [[70, 92], [78, 122], [62, 150], [110, 160], [172, 165], [226, 170], [234, 211], [0, 211], [0, 98]], chain: [[56, 108], [22, 140], [40, 186], [100, 196], [160, 196], [216, 190]], flex: [0, 0, 0, 0.3, 1], z: 60, blend: 14, priority: 1 },
            ear("earBack", [[232, 112], [222, 116], [222, 30], [248, -6], [272, -6], [304, 36], [310, 60], [302, 68]], [[232, 112], [302, 68]], [258, 4], 70),
            ear("earFront", [[362, 66], [354, 62], [362, 36], [394, 2], [418, 0], [432, 28], [434, 110], [424, 106]], [[362, 66], [424, 106]], [410, 12], 71),
          ],
        },
      },
      held: {
        anchor: [92, 45], com: [94, 198], head: [92, 95],
        rig: {
          parts: [
            { name: "tail", poly: [[68, 328], [116, 328], [118, 438], [58, 438], [62, 380]], chain: [[92, 336], [88, 366], [86, 396], [96, 426]], z: 20, blend: 12, priority: 1 },
          ],
        },
      },
      cling: {
        anchor: [160, 70], wall: 204, head: [100, 100],
        rig: {
          parts: [
            { name: "tail", poly: [[42, 300], [78, 318], [82, 362], [78, 454], [8, 454], [4, 330]], chain: [[54, 320], [40, 356], [36, 396], [50, 436]], z: 20, blend: 12, priority: 1 },
          ],
        },
      },
      climb: {
        anchor: [155, 397], hands: [215, 80], wall: 246, head: [160, 100],
        rig: {
          parts: [
            { name: "tail", poly: [[116, 298], [122, 346], [58, 348], [4, 302], [4, 212], [78, 204], [94, 240], [62, 252], [58, 290], [102, 300]], chain: [[112, 322], [62, 330], [26, 292], [28, 246], [60, 220]], z: 20, blend: 12, priority: 1 },
            { name: "arms", poly: [[172, 244], [188, 128], [208, 84], [252, 94], [252, 212], [206, 252]], joint: [182, 232], axis: [226, 112], z: 70, blend: 20, priority: 1 },
          ],
        },
      },
      fall: {
        anchor: [155, 159], head: [250, 130],
        rig: {
          parts: [
            { name: "tail", poly: [[92, 100], [76, 136], [26, 132], [0, 82], [4, 8], [62, 0], [128, 8], [132, 62], [96, 66], [66, 44], [52, 60], [58, 96]], chain: [[70, 118], [36, 96], [20, 56], [50, 16], [94, 20], [110, 46]], z: 20, blend: 12, priority: 1 },
          ],
        },
      },
    },
  },
];

// Postures of the walking (side) drawing, as small offsets from how it is
// drawn: body drop/tilt (sprite px, degrees), head and tail angles, ear angle.
// The legs fold just enough to keep the paws on the floor. Only gentle
// changes, so the cat always looks like the original art.
export const POSTURES = {
  stand: { drop: 0, tilt: 0, head: 0, tail: 0, ears: 0 },
  relaxed: { drop: 6, tilt: 0, head: 4, tail: -16, ears: 0 },
  alert: { drop: -4, tilt: -2, head: -10, tail: 10, ears: -8 },
  crouch: { drop: 20, tilt: 2, head: 8, tail: -34, ears: 10 },
  stalk: { drop: 15, tilt: 1, head: 6, tail: -26, ears: 8 },
  stretchFront: { drop: 8, tilt: 9, head: -8, tail: 14, ears: 0, reach: { fore: 12, hind: 0 } },
  stretchBack: { drop: 2, tilt: -5, head: 6, tail: -12, ears: 0, reach: { fore: 0, hind: -12 } },
  lookUp: { drop: 0, tilt: -3, head: -16, tail: 6, ears: -4 },
  peek: { drop: 8, tilt: 6, head: 18, tail: -8, ears: 6 },
};
