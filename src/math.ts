// Adapted from ascii-sharks (MIT, © 2026 drewdi).
export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDiff(a: number, b: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Turn heading h toward desired by at most maxTurn. */
export const steer = (h: number, desired: number, maxTurn: number) =>
  h + clamp(angleDiff(h, desired), -maxTurn, maxTurn);

/** Cheap integer hash → [0, 1). Deterministic, so textures stay stable. */
export function hash3(x: number, y: number, z: number) {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(z | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** How far (x, y) is outside the W×H screen; negative while inside. */
export const outside = (x: number, y: number, W: number, H: number) => Math.max(-x, x - W, -y, y - H);

/**
 * Wandering bugs dip past the edge, like the sharks, and turn back once their
 * centre is well out (0.3 L, full strength by 0.9 L). Returns the pull toward the
 * middle to add to a steering vector. Bugs on a trip skip it and leave for real.
 */
export function edgePull(x: number, y: number, W: number, H: number, L: number): [number, number] {
  const over = outside(x, y, W, H) - L * 0.3;
  if (over <= 0) return [0, 0];
  const w = Math.min(1, over / (L * 0.6)) * 3.5;
  const d = Math.hypot(W / 2 - x, H / 2 - y) || 1;
  return [((W / 2 - x) / d) * w, ((H / 2 - y) / d) * w];
}

/** A point `out` px beyond a random edge of the screen. */
export function beyondEdge(W: number, H: number, out: number): [number, number] {
  const t = rand(0.1, 0.9);
  const side = Math.floor(Math.random() * 4);
  if (side === 0) return [-out, t * H];
  if (side === 1) return [W + out, t * H];
  if (side === 2) return [t * W, -out];
  return [t * W, H + out];
}

/**
 * Like the sharks, bugs come and go: one that has wandered a body length out
 * of sight comes back in past another edge, heading into the scene.
 * Returns true when it re-entered.
 */
export function reenter(b: { x: number; y: number; heading: number; L: number }, W: number, H: number) {
  if (outside(b.x, b.y, W, H) < b.L) return false;
  // Just inside the trigger distance, so it can't bounce straight back out.
  [b.x, b.y] = beyondEdge(W, H, b.L * 0.95);
  b.heading = Math.atan2(rand(0.25, 0.75) * H - b.y, rand(0.25, 0.75) * W - b.x);
  return true;
}
