/**
 * Gnats: the beetle scene's take on the sharks' fish. Swarms of tiny flies, one
 * glyph each, flocking as Reynolds boids (separation, alignment, cohesion) round
 * a leader that drifts on its own loop through the scene, in and out of view.
 * They dart away from the cursor and burst apart where you click.
 */
import { clamp, patrol, rand, reenter, steer, TAU } from "./math";
import type { Renderer, RGB } from "./render";

interface Gnat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Wingbeat; flips the glyph. */
  phase: number;
  /** 0.55 far → 1 near. */
  depth: number;
}

interface Swarm {
  x: number;
  y: number;
  heading: number;
  wander: number;
  orbitR: number;
  orbitDir: 1 | -1;
  /** Rough size of the cloud, used to send the whole swarm off-screen and back. */
  L: number;
  gnats: Gnat[];
}

const INK: RGB = [240, 244, 226];
const MAX_SPEED = 170;
const FLEE = 1100;

export class Gnats {
  swarms: Swarm[] = [];

  seed(W: number, H: number) {
    const minSide = Math.min(W, H);
    this.swarms = [];
    const n = clamp(Math.round((W * H) / 350000), 3, 6);
    for (let s = 0; s < n; s++) {
      const a = rand(0, TAU);
      const orbitR = rand(0.25, 0.7) * minSide;
      const x = W / 2 + Math.cos(a) * orbitR * (W / minSide);
      const y = H / 2 + Math.sin(a) * orbitR;
      const gnats: Gnat[] = [];
      for (let k = 0, m = Math.round(rand(12, 22)); k < m; k++) {
        gnats.push({ x: x + rand(-40, 40), y: y + rand(-30, 30), vx: 0, vy: 0, phase: rand(0, TAU), depth: rand(0.55, 1) });
      }
      this.swarms.push({ x, y, heading: a + Math.PI / 2, wander: 0, orbitR, orbitDir: s % 2 ? -1 : 1, L: 120, gnats });
    }
  }

  /** Flash expansion: everything near a click bolts straight out. */
  scatter(x: number, y: number) {
    for (const s of this.swarms) {
      for (const g of s.gnats) {
        const d = Math.hypot(g.x - x, g.y - y);
        if (d > 240 || d < 1e-3) continue;
        const k = (1 - d / 240) * 320;
        g.vx += ((g.x - x) / d) * k;
        g.vy += ((g.y - y) / d) * k;
      }
    }
  }

  step(dt: number, W: number, H: number, time: number, pointer: { x: number; y: number; active: boolean }) {
    for (const s of this.swarms) {
      // The leader drifts like a shark on patrol: a wobbling loop through and out of the scene.
      s.wander = clamp(s.wander + (Math.random() - 0.5) * dt * 3, -1.1, 1.1);
      const [px, py] = patrol(s.x, s.y, W, H, s.orbitR * (1 + 0.2 * Math.sin(time * 0.06 + s.orbitR)), s.orbitDir);
      const dx = Math.cos(s.heading) + Math.cos(s.heading + s.wander) * 0.5 + px * 0.6;
      const dy = Math.sin(s.heading) + Math.sin(s.heading + s.wander) * 0.5 + py * 0.6;
      s.heading = steer(s.heading, Math.atan2(dy, dx), 0.8 * dt);
      s.x += Math.cos(s.heading) * 70 * dt;
      s.y += Math.sin(s.heading) * 70 * dt;
      const ox = s.x;
      const oy = s.y;
      if (reenter(s, W, H, 2.5)) {
        // The whole cloud comes back in with its leader.
        for (const g of s.gnats) {
          g.x += s.x - ox;
          g.y += s.y - oy;
        }
        s.orbitR = rand(0.25, 0.7) * Math.min(W, H);
      }

      const gnats = s.gnats;
      for (const g of gnats) {
        let ax = (s.x - g.x) * 1.4;
        let ay = (s.y - g.y) * 1.4;
        let avx = 0;
        let avy = 0;
        let n = 0;
        for (const o of gnats) {
          if (o === g) continue;
          const ex = g.x - o.x;
          const ey = g.y - o.y;
          const d2 = ex * ex + ey * ey;
          if (d2 > 3600) continue;
          avx += o.vx;
          avy += o.vy;
          n++;
          if (d2 < 196 && d2 > 1e-6) {
            ax += (ex / d2) * 2600;
            ay += (ey / d2) * 2600;
          }
        }
        if (n) {
          ax += (avx / n - g.vx) * 0.8;
          ay += (avy / n - g.vy) * 0.8;
        }
        if (pointer.active) {
          const ex = g.x - pointer.x;
          const ey = g.y - pointer.y;
          const d = Math.hypot(ex, ey);
          if (d < 130 && d > 1e-3) {
            const w = (1 - d / 130) ** 2;
            ax += (ex / d) * FLEE * w;
            ay += (ey / d) * FLEE * w;
          }
        }
        // Gnats never fly straight: a constant buzz of jitter.
        ax += (Math.random() - 0.5) * 900;
        ay += (Math.random() - 0.5) * 900;
        g.vx += ax * dt;
        g.vy += ay * dt;
        const sp = Math.hypot(g.vx, g.vy);
        if (sp > MAX_SPEED) {
          g.vx *= MAX_SPEED / sp;
          g.vy *= MAX_SPEED / sp;
        }
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.phase += dt * 40;
      }
    }
  }

  /** One glyph per gnat, nearer ones brighter. */
  draw(r: Renderer, cw: number, ch: number) {
    for (const s of this.swarms) {
      for (const g of s.gnats) {
        const k = 0.55 + 0.45 * ((g.depth - 0.55) / 0.45);
        // Wingbeat: + and x, distinct from the leaf litter's dots and ticks.
        r.putCell(Math.floor(g.x / cw), Math.floor(g.y / ch), Math.sin(g.phase) > 0 ? "+" : "x", [INK[0] * k, INK[1] * k, INK[2] * k]);
      }
    }
  }
}
