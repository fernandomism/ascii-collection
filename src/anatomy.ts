/** Shared bits of insect anatomy: jointed legs, the tripod gait and colour helpers. */
import { hash3 } from "./math";
import type { RGB, Stroke } from "./render";

export const SIDES = [1, -1] as const;

export const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * Tripod gait: front and hind legs on one side step with the middle leg on the
 * other. Returns [swing -1..1 (back → forward), lift 0..1].
 */
export function tripod(phase: number, leg: number, side: number): [number, number] {
  const p = phase + ((leg + (side > 0 ? 1 : 0)) % 2) * Math.PI;
  return [Math.sin(p), Math.max(0, Math.cos(p))];
}

/**
 * A jointed limb from a hip at (x, side·y). angle 0 points straight out from
 * the body and positive swings toward the head; each segment turns by its bend.
 * k scales every segment (legs look shorter while lifted or tucked).
 */
export function limb(
  out: Stroke[], x: number, y: number, side: 1 | -1, angle: number,
  lengths: readonly number[], bends: readonly number[], rgb: RGB, tip?: string, k = 1,
) {
  let a = angle;
  let px = x;
  let py = y * side;
  for (let i = 0; i < lengths.length; i++) {
    a += bends[i];
    const nx = px + Math.sin(a) * lengths[i] * k;
    const ny = py + side * Math.cos(a) * lengths[i] * k;
    out.push({ x0: px, y0: py, x1: nx, y1: ny, rgb, glyph: i === lengths.length - 1 ? tip : undefined });
    px = nx;
    py = ny;
  }
}

/** Jittered polka dots over (u, v), so spots ride along with the skin. */
export function dotted(u: number, v: number, cellU: number, cellV: number, seed: number, radius: number) {
  const gu = u / cellU;
  const gv = v / cellV;
  const cu = Math.floor(gu);
  const cv = Math.floor(gv);
  const jx = 0.25 + hash3(cu, cv, seed) * 0.5;
  const jy = 0.25 + hash3(cu, cv, seed + 11) * 0.5;
  return (gu - cu - jx) ** 2 + (gv - cv - jy) ** 2 < radius * radius;
}
