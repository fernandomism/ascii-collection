/**
 * Small creatures drawn one glyph each, in groups that flock as Reynolds boids
 * (separation, alignment, cohesion) round a leader drifting on its own loop
 * through the scene, in and out of view, like the sharks' fish. A style sets
 * what they are: gnat swarms, lone flies (groups of one), or schools of fish.
 */
import { clamp, patrol, rand, reenter, steer, TAU } from "./math";
import type { Renderer, RGB } from "./render";

export interface FlockStyle {
  /** Two glyphs to flick between: a wingbeat or a tail beat. */
  glyphs: string;
  ink: RGB;
  groups: number;
  /** Members per group, [min, max]. */
  size: [number, number];
  /** Leader speed and members' top speed, px/s. */
  cruise: number;
  maxSpeed: number;
  /** Random buzz added to each member's steering, px/s². */
  jitter: number;
  /** Glyph flicks per second (radians). */
  beat: number;
  /** Dart away from the cursor. */
  shy: boolean;
  /** Personal space between members, px (default 14, for one-glyph creatures). */
  spacing?: number;
}

interface Member {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  /** 0.55 far → 1 near. */
  depth: number;
}

interface Group {
  x: number;
  y: number;
  heading: number;
  wander: number;
  orbitR: number;
  orbitDir: 1 | -1;
  /** Rough size of the group, used to send it off-screen and back. */
  L: number;
  members: Member[];
}

const FLEE = 1100;

export class Flock {
  groups: Group[] = [];

  constructor(private style: FlockStyle) {}

  seed(W: number, H: number) {
    const minSide = Math.min(W, H);
    const { groups, size } = this.style;
    this.groups = [];
    for (let s = 0; s < groups; s++) {
      const a = rand(0, TAU);
      const orbitR = rand(0.25, 0.7) * minSide;
      const x = W / 2 + Math.cos(a) * orbitR * (W / minSide);
      const y = H / 2 + Math.sin(a) * orbitR;
      const members: Member[] = [];
      for (let k = 0, m = Math.round(rand(size[0], size[1])); k < m; k++) {
        members.push({ x: x + rand(-40, 40), y: y + rand(-30, 30), vx: 0, vy: 0, phase: rand(0, TAU), depth: rand(0.55, 1) });
      }
      this.groups.push({ x, y, heading: a + Math.PI / 2, wander: 0, orbitR, orbitDir: s % 2 ? -1 : 1, L: 120, members });
    }
  }

  /** Flash expansion: everything near a click bolts straight out. */
  scatter(x: number, y: number) {
    for (const s of this.groups) {
      for (const g of s.members) {
        const d = Math.hypot(g.x - x, g.y - y);
        if (d > 240 || d < 1e-3) continue;
        const k = (1 - d / 240) * 320;
        g.vx += ((g.x - x) / d) * k;
        g.vy += ((g.y - y) / d) * k;
      }
    }
  }

  step(dt: number, W: number, H: number, time: number, pointer?: { x: number; y: number; active: boolean }) {
    const { cruise, maxSpeed, jitter, beat, shy, spacing = 14 } = this.style;
    const near2 = Math.max(60, spacing * 2.5) ** 2;
    const space2 = spacing * spacing;
    for (const s of this.groups) {
      // The leader drifts like a shark on patrol: a wobbling loop through and out of the scene.
      s.wander = clamp(s.wander + (Math.random() - 0.5) * dt * 3, -1.1, 1.1);
      const [px, py] = patrol(s.x, s.y, W, H, s.orbitR * (1 + 0.2 * Math.sin(time * 0.06 + s.orbitR)), s.orbitDir);
      const dx = Math.cos(s.heading) + Math.cos(s.heading + s.wander) * 0.5 + px * 0.6;
      const dy = Math.sin(s.heading) + Math.sin(s.heading + s.wander) * 0.5 + py * 0.6;
      s.heading = steer(s.heading, Math.atan2(dy, dx), 0.8 * dt);
      s.x += Math.cos(s.heading) * cruise * dt;
      s.y += Math.sin(s.heading) * cruise * dt;
      const ox = s.x;
      const oy = s.y;
      if (reenter(s, W, H, 2.5)) {
        // The whole group comes back in with its leader.
        for (const g of s.members) {
          g.x += s.x - ox;
          g.y += s.y - oy;
        }
        s.orbitR = rand(0.25, 0.7) * Math.min(W, H);
      }

      const members = s.members;
      for (const g of members) {
        let ax = (s.x - g.x) * 1.4;
        let ay = (s.y - g.y) * 1.4;
        let avx = 0;
        let avy = 0;
        let n = 0;
        for (const o of members) {
          if (o === g) continue;
          const ex = g.x - o.x;
          const ey = g.y - o.y;
          const d2 = ex * ex + ey * ey;
          if (d2 > near2) continue;
          avx += o.vx;
          avy += o.vy;
          n++;
          if (d2 < space2 && d2 > 1e-6) {
            ax += (ex / d2) * 13 * space2;
            ay += (ey / d2) * 13 * space2;
          }
        }
        if (n) {
          ax += (avx / n - g.vx) * 0.8;
          ay += (avy / n - g.vy) * 0.8;
        }
        if (shy && pointer?.active) {
          const ex = g.x - pointer.x;
          const ey = g.y - pointer.y;
          const d = Math.hypot(ex, ey);
          if (d < 130 && d > 1e-3) {
            const w = (1 - d / 130) ** 2;
            ax += (ex / d) * FLEE * w;
            ay += (ey / d) * FLEE * w;
          }
        }
        ax += (Math.random() - 0.5) * jitter;
        ay += (Math.random() - 0.5) * jitter;
        g.vx += ax * dt;
        g.vy += ay * dt;
        const sp = Math.hypot(g.vx, g.vy);
        if (sp > maxSpeed) {
          g.vx *= maxSpeed / sp;
          g.vy *= maxSpeed / sp;
        }
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.phase += dt * beat;
      }
    }
  }

  /**
   * One glyph per member, nearer ones brighter. `place` maps a position to the screen
   * plus a brightness factor (for scenes drawn in perspective); identity by default.
   */
  draw(r: Renderer, cw: number, ch: number, place?: (x: number, y: number) => [number, number, number]) {
    const { glyphs, ink } = this.style;
    for (const s of this.groups) {
      for (const g of s.members) {
        const [x, y, b] = place ? place(g.x, g.y) : [g.x, g.y, 1];
        const k = (0.55 + 0.45 * ((g.depth - 0.55) / 0.45)) * b;
        r.putCell(Math.floor(x / cw), Math.floor(y / ch), glyphs[Math.sin(g.phase) > 0 ? 0 : 1], [ink[0] * k, ink[1] * k, ink[2] * k]);
      }
    }
  }
}
