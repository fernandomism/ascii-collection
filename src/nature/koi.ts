/**
 * Koi, seen from above. The body is a chain of segments that sway in a wave
 * running down to the tail, with a flowing forked tail and paddling pectoral
 * fins. Each fish is one of the classic varieties; its pattern is painted in
 * body space, so the patches stay put as the body bends.
 *
 * Like the sharks they patrol: a lazy loop round the pond, out of view and
 * back. When there is food on the water the nearest ones go for it.
 */
import { mix, SIDES } from "../core/anatomy";
import { clamp, patrol, rand, reenter, steer } from "../core/math";
import type { Figure, Part, RGB } from "../core/render";

const WHITE: RGB = [240, 236, 228];
const RED: RGB = [224, 72, 40];
const BLACK: RGB = [38, 36, 40];
const GOLD: RGB = [238, 188, 74];
const BRONZE: RGB = [158, 110, 68];
const BLUE: RGB = [120, 146, 172];
const ORANGE: RGB = [230, 122, 52];
/** Seen through a little water. */
const WATER: RGB = [20, 70, 88];

type Pattern = (x: number, y: number) => RGB;
const blotch = (x: number, y: number, s: number) =>
  Math.sin(x * 11 + s) * Math.sin(y * 19 + s * 1.7) + 0.6 * Math.sin(x * 23 - y * 7 + s * 2.3);
const scales = (x: number, y: number) => Math.sin(x * 70) * Math.sin(y * 70) > 0.8;

/** Each variety's colours over body coordinates (x along the fish, y across it from the midline). */
const VARIETIES: { name: string; gloss: number; fin: RGB; paint: (s: number) => Pattern }[] = [
  { name: "kohaku", gloss: 0.5, fin: WHITE, paint: (s) => (x, y) => (blotch(x, y, s) > 0.3 ? RED : WHITE) },
  {
    name: "sanke", gloss: 0.5, fin: WHITE,
    paint: (s) => (x, y) => (blotch(x, y, s + 5) > 0.95 ? BLACK : blotch(x, y, s) > 0.35 ? RED : WHITE),
  },
  {
    name: "showa", gloss: 0.6, fin: [210, 200, 190],
    paint: (s) => (x, y) => (blotch(x, y, s) > 0.3 ? RED : blotch(x, y, s + 9) > 0.55 ? WHITE : BLACK),
  },
  { name: "tancho", gloss: 0.5, fin: WHITE, paint: () => (x, y) => ((x - 0.3) ** 2 + y * y < 0.0045 ? RED : WHITE) },
  { name: "ogon", gloss: 1.3, fin: [244, 214, 120], paint: () => (x) => mix(GOLD, [250, 226, 150], clamp(x + 0.3, 0, 1) * 0.4) },
  { name: "chagoi", gloss: 0.7, fin: [190, 150, 104], paint: () => (x, y) => (scales(x, y) ? mix(BRONZE, BLACK, 0.35) : BRONZE) },
  {
    name: "asagi", gloss: 0.6, fin: [226, 150, 110],
    paint: () => (x, y) => (Math.abs(y) > 0.075 ? ORANGE : scales(x, y) ? mix(BLUE, BLACK, 0.3) : BLUE),
  },
];

// Body segments head to tail: x, half-length, half-width (fractions of L).
const SEGMENTS = [
  [0.32, 0.13, 0.095],
  [0.14, 0.15, 0.12],
  [-0.04, 0.15, 0.105],
  [-0.2, 0.12, 0.075],
  [-0.33, 0.08, 0.045],
] as const;
const PECTORAL = [0.02, 0, 0, 0.1, -0.06, 0.16, -0.12, 0.14, -0.08, 0.05, -0.04, 0];

export interface Food {
  x: number;
  y: number;
}

export interface Koi {
  id: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  L: number;
  /** Tail-beat phase. */
  phase: number;
  wander: number;
  orbitR: number;
  orbitDir: 1 | -1;
  pattern: Pattern;
  fin: RGB;
  gloss: number;
}

export function makeKoi(id: number, x: number, y: number, L: number, orbitR: number): Koi {
  const v = VARIETIES[Math.floor(Math.random() * VARIETIES.length)];
  const p = v.paint(rand(0, 100));
  return {
    id, x, y, L, orbitR, heading: rand(0, Math.PI * 2), speed: 0, phase: rand(0, 6), wander: 0,
    orbitDir: id % 2 ? 1 : -1, pattern: (bx, by) => mix(p(bx, by), WATER, 0.12), fin: mix(v.fin, WATER, 0.25), gloss: v.gloss,
  };
}

/** Sideways sway of the spine at body position x: grows toward the tail and travels down it. */
const sway = (k: Koi, x: number) => 0.07 * ((0.45 - x) / 0.9) ** 2 * Math.sin(k.phase - x * 5);

export function koiFigure(k: Koi): Figure {
  const parts: Part[] = [];
  // Tail: a forked fan off the end of the swaying spine.
  const bx = -0.4;
  const by = sway(k, bx);
  const a = 0.6 * Math.sin(k.phase + 1.4);
  for (const side of SIDES) {
    const tx = -0.24;
    const ty = 0.12 * side;
    parts.push({
      k: "seg", x0: bx, y0: by, x1: bx + tx * Math.cos(a) - ty * Math.sin(a), y1: by + tx * Math.sin(a) + ty * Math.cos(a),
      r0: 0.05, r1: 0.014, paint: k.fin, ramp: ".:-=+",
    });
  }
  const paddle = 0.6 + 0.35 * Math.sin(k.phase * 0.6);
  for (const side of SIDES) parts.push({ k: "wing", poly: PECTORAL, x: 0.2, side, sweep: paddle, flap: 1, paint: k.fin, ramp: ".:-=+" });
  for (let i = SEGMENTS.length - 1; i >= 0; i--) {
    const [x, rx, ry] = SEGMENTS[i];
    const y = sway(k, x);
    // Paint in body coordinates so the pattern bends with the fish.
    parts.push({ k: "ell", x, y, rx, ry, paint: (u, v) => k.pattern(x + u * rx, v * ry), gloss: k.gloss });
  }
  const hy = sway(k, 0.4);
  for (const side of SIDES) parts.push({ k: "ell", x: 0.4, y: hy + side * 0.065, rx: 0.016, ry: 0.016, paint: BLACK, gloss: 1 });
  return { parts, strokes: [] };
}

/**
 * One step of a koi's swimming. Returns the bit of food it ate, if any.
 */
export function stepKoi(k: Koi, dt: number, time: number, W: number, H: number, food: Food[], school: Koi[]): Food | null {
  const L = k.L;
  const mx = k.x + Math.cos(k.heading) * L * 0.46;
  const my = k.y + Math.sin(k.heading) * L * 0.46;
  let meal: Food | null = null;
  let md = 500;
  for (const f of food) {
    const d = Math.hypot(f.x - mx, f.y - my);
    if (d < md) {
      md = d;
      meal = f;
    }
  }

  let dx = Math.cos(k.heading);
  let dy = Math.sin(k.heading);
  k.wander = clamp(k.wander + (Math.random() - 0.5) * dt * 3, -1, 1);
  dx += Math.cos(k.heading + k.wander) * 0.45;
  dy += Math.sin(k.heading + k.wander) * 0.45;
  let target: number;
  if (meal) {
    dx += ((meal.x - mx) / md) * 3;
    dy += ((meal.y - my) / md) * 3;
    target = L * 0.7;
  } else {
    const [px, py] = patrol(k.x, k.y, W, H, k.orbitR * (1 + 0.15 * Math.sin(time * 0.05 + k.id)), k.orbitDir);
    dx += px * 0.55;
    dy += py * 0.55;
    target = L * 0.28 * (0.85 + 0.15 * Math.sin(time * 0.6 + k.id));
  }
  for (const o of school) {
    if (o === k) continue;
    const ox = o.x - k.x;
    const oy = o.y - k.y;
    const d = Math.hypot(ox, oy) || 1;
    const range = (L + o.L) * 0.4;
    if (d < range) {
      dx -= (ox / d) * (1 - d / range) * 2.5;
      dy -= (oy / d) * (1 - d / range) * 2.5;
    }
  }
  // A turning circle that grows with speed: koi glide in arcs.
  k.heading = steer(k.heading, Math.atan2(dy, dx), Math.min(1.6, k.speed / (L * 0.28)) * dt);
  k.speed += (target - k.speed) * Math.min(1, dt * 2);
  k.x += Math.cos(k.heading) * k.speed * dt;
  k.y += Math.sin(k.heading) * k.speed * dt;
  k.phase += dt * (2.5 + (k.speed / L) * 9);
  if (reenter(k, W, H, 1.8)) k.orbitR = rand(0.25, 0.65) * Math.min(W, H);
  return meal && md < Math.max(14, L * 0.06) ? meal : null;
}
