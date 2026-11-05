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

/**
 * Like the sharks: bugs may wander off the edge of the screen, and once their
 * centre is well past it (0.3 L, full strength by 0.9 L) they get pulled back
 * toward the middle. Returns the pull to add to a steering vector.
 */
export function edgePull(x: number, y: number, W: number, H: number, L: number): [number, number] {
  const over = Math.max(-x, x - W, -y, y - H) - L * 0.3;
  if (over <= 0) return [0, 0];
  const w = Math.min(1, over / (L * 0.6)) * 3.5;
  const tx = W / 2 - x;
  const ty = H / 2 - y;
  const d = Math.hypot(tx, ty) || 1;
  return [(tx / d) * w, (ty / d) * w];
}
