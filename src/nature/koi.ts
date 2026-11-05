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
const RED: RGB = [236, 96, 34];
const BLACK: RGB = [38, 36, 40];
const ORANGE: RGB = [240, 134, 44];
/** Seen through a little water. */
const WATER: RGB = [20, 70, 88];

type Pattern = (x: number, y: number) => RGB;
const blotch = (x: number, y: number, s: number) =>
  Math.sin(x * 11 + s) * Math.sin(y * 19 + s * 1.7) + 0.6 * Math.sin(x * 23 - y * 7 + s * 2.3);

/**
 * Each variety's colours over body coordinates (x along the fish, y across it from the
 * midline): the classic white, black and orange koi. Listed more than once = more common.
 */
const KOHAKU = { gloss: 0.5, fin: WHITE, paint: (s: number): Pattern => (x, y) => (blotch(x, y, s) > 0.3 ? RED : WHITE) };
const SANKE = {
  gloss: 0.5, fin: WHITE,
  paint: (s: number): Pattern => (x, y) => (blotch(x, y, s + 5) > 0.95 ? BLACK : blotch(x, y, s) > 0.35 ? RED : WHITE),
};
const SHOWA = {
  gloss: 0.6, fin: [210, 200, 190] as RGB,
  paint: (s: number): Pattern => (x, y) => (blotch(x, y, s) > 0.3 ? RED : blotch(x, y, s + 9) > 0.55 ? WHITE : BLACK),
};
const TANCHO = { gloss: 0.5, fin: WHITE, paint: (): Pattern => (x, y) => ((x - 0.3) ** 2 + y * y < 0.0045 ? RED : WHITE) };
const ORANGE_OGON = {
  gloss: 1.2, fin: [246, 190, 120] as RGB,
  paint: (): Pattern => (x) => mix(ORANGE, [250, 196, 110], clamp(x + 0.3, 0, 1) * 0.4),
};
const VARIETIES = [KOHAKU, KOHAKU, KOHAKU, SANKE, SANKE, SHOWA, SHOWA, TANCHO, ORANGE_OGON];

// Body segments head to tail: x, half-length, half-width (fractions of L).
const SEGMENTS = [
  [0.32, 0.13, 0.095],
  [0.14, 0.15, 0.12],
  [-0.04, 0.15, 0.105],
  [-0.2, 0.12, 0.075],
  [-0.33, 0.08, 0.045],
] as const;
const PECTORAL = [0.02, 0, 0, 0.1, -0.06, 0.16, -0.12, 0.14, -0.08, 0.05, -0.04, 0];

/** A stretch of water (on the pond plane) for koi to patrol: origin and size. */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  /** How much the water veils it: more for fish farther off. */
  fog: number;
}

export function makeKoi(id: number, x: number, y: number, L: number, orbitR: number): Koi {
  const v = VARIETIES[Math.floor(Math.random() * VARIETIES.length)];
  const p = v.paint(rand(0, 100));
  const k: Koi = {
    id, x, y, L, orbitR, heading: rand(0, Math.PI * 2), speed: 0, phase: rand(0, 6), wander: 0,
    orbitDir: id % 2 ? 1 : -1, pattern: p, fin: mix(v.fin, WATER, 0.25), gloss: v.gloss, fog: 0.12,
  };
  k.pattern = (bx, by) => mix(p(bx, by), WATER, k.fog);
  return k;
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
export function stepKoi(k: Koi, dt: number, time: number, area: Area, food: Food[], school: Koi[]): Food | null {
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
    const [px, py] = patrol(k.x - area.x, k.y - area.y, area.w, area.h, k.orbitR * (1 + 0.15 * Math.sin(time * 0.05 + k.id)), k.orbitDir);
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
  // Out of the area for good: it comes back in elsewhere (reenter works in the area's own frame).
  k.x -= area.x;
  k.y -= area.y;
  if (reenter(k, area.w, area.h, 1.8)) k.orbitR = rand(0.25, 0.45) * Math.min(area.w, area.h);
  k.x += area.x;
  k.y += area.y;
  return meal && md < Math.max(14, L * 0.06) ? meal : null;
}
