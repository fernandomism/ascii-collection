/**
 * A swarm of small, plain moths round a lamp, in the spirit of the sharks' fish:
 * no species detail, just pale wings beating as they spiral in on the light. They
 * keep a little space from each other, the cursor is a second light, and a click
 * makes the ones nearby burst away before the light draws them back.
 */
import { mix, SIDES } from "../core/anatomy";
import type { Scene } from "../core/engine";
import { clamp, rand, steer, TAU } from "../core/math";
import { WING, type Figure, type Part, type Renderer, type RGB } from "../core/render";
import { lampGlow } from "./moths";

// One simple wing: fore and hind as a single blob (u toward the head, v outward).
const WING_SHAPE = [0.06, 0, 0.1, 0.3, 0, 0.48, -0.16, 0.4, -0.2, 0.2, -0.08, 0];
const TONES: RGB[] = [[214, 196, 160], [190, 160, 120], [160, 150, 140], [232, 222, 200], [176, 130, 96]];

interface SmallMoth {
  id: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  L: number;
  /** 0.5 far → 1 near: smaller and dimmer when far. */
  depth: number;
  rgb: RGB;
  flap: number;
  wander: number;
  orbit: 1 | -1;
  orbitR: number;
  /** Bolting from a click until then. */
  scatterUntil: number;
}

function smallMothFigure(m: SmallMoth): Figure {
  // Beating wings foreshorten across the body.
  const flap = 0.2 + 0.8 * Math.abs(Math.cos(m.flap));
  const parts: Part[] = SIDES.map((side): Part => ({ k: "wing", poly: WING_SHAPE, x: 0.06, side, sweep: 0, flap, paint: m.rgb, ramp: WING }));
  parts.push({ k: "ell", x: 0.02, y: 0, rx: 0.2, ry: 0.06, paint: mix(m.rgb, [60, 44, 30], 0.5) });
  return { parts, strokes: [] };
}

export class MothSwarmScene implements Scene {
  time = 0;
  pointer = { x: 0, y: 0, active: false };
  moths: SmallMoth[] = [];
  /** Lamp position as a fraction of the canvas, so it survives resizes. */
  lamp = { fx: 0.5, fy: 0.45 };
  private W = 0;
  private H = 0;
  private cw = 10;
  private ch = 14;

  resize(width: number, height: number, cw: number, ch: number) {
    const first = this.W === 0;
    this.W = width;
    this.H = height;
    this.cw = cw;
    this.ch = ch;
    if (!first) return;
    const minSide = Math.min(width, height);
    const n = clamp(Math.round((width * height) / 30000), 24, 64);
    for (let i = 0; i < n; i++) {
      const depth = rand(0.5, 1);
      const a = rand(0, TAU);
      const r = rand(0.1, 0.45) * minSide;
      const tone = TONES[Math.floor(Math.random() * TONES.length)];
      this.moths.push({
        id: i + 1, x: width * this.lamp.fx + Math.cos(a) * r, y: height * this.lamp.fy + Math.sin(a) * r,
        heading: a + Math.PI / 2, speed: 0, L: minSide * 0.09 * depth, depth, rgb: mix([0, 0, 0], tone, 0.65 + 0.35 * depth),
        flap: rand(0, TAU), wander: 0, orbit: Math.random() < 0.5 ? 1 : -1, orbitR: this.pickOrbit(), scatterUntil: 0,
      });
    }
    // Far (small) moths draw first so near ones pass in front.
    this.moths.sort((p, q) => p.L - q.L);
  }

  private pickOrbit() {
    return rand(0.06, 0.4) * Math.min(this.W, this.H);
  }

  click(x: number, y: number) {
    for (const m of this.moths) {
      const d = Math.hypot(m.x - x, m.y - y);
      if (d > 260) continue;
      m.heading = Math.atan2(m.y - y, m.x - x) + rand(-0.4, 0.4);
      m.speed = m.L * 9;
      m.scatterUntil = this.time + rand(0.6, 1.1);
    }
  }

  /** The nearest light: the lamp, or the cursor if that's closer. */
  private light(m: SmallMoth): [number, number] {
    const lx = this.lamp.fx * this.W;
    const ly = this.lamp.fy * this.H;
    const p = this.pointer;
    if (p.active && Math.hypot(p.x - m.x, p.y - m.y) < Math.hypot(lx - m.x, ly - m.y)) return [p.x, p.y];
    return [lx, ly];
  }

  step(dt: number) {
    this.time += dt;
    const { moths, time } = this;
    for (const m of moths) {
      m.flap += dt * 22;
      if (time < m.scatterUntil) {
        m.x += Math.cos(m.heading) * m.speed * dt;
        m.y += Math.sin(m.heading) * m.speed * dt;
        continue;
      }
      const [lx, ly] = this.light(m);
      const d = Math.hypot(lx - m.x, ly - m.y) || 1;
      m.wander = clamp(m.wander + (Math.random() - 0.5) * dt * 10, -1.2, 1.2);
      // Hold an angle to the light, as the big moths do: tangent at the orbit, cutting in from outside.
      const off = clamp((d - m.orbitR) / m.orbitR, -1, 1);
      const want = Math.atan2(ly - m.y, lx - m.x) + m.orbit * (Math.PI / 2 - 1.1 * off) + m.wander * 0.5;
      let dx = Math.cos(want);
      let dy = Math.sin(want);
      for (const o of moths) {
        if (o === m) continue;
        const ox = m.x - o.x;
        const oy = m.y - o.y;
        const od = Math.hypot(ox, oy) || 1;
        const min = (m.L + o.L) * 0.7;
        if (od < min) {
          dx += (ox / od) * (1 - od / min) * 2;
          dy += (oy / od) * (1 - od / min) * 2;
        }
      }
      m.heading = steer(m.heading, Math.atan2(dy, dx), 6 * dt);
      const target = m.L * (3.2 + 1.2 * Math.sin(time * 1.7 + m.id));
      m.speed += (target - m.speed) * Math.min(1, dt * 3);
      m.x += Math.cos(m.heading) * m.speed * dt;
      m.y += Math.sin(m.heading) * m.speed * dt;
      if (Math.random() < dt * 0.08) m.orbit = m.orbit === 1 ? -1 : 1;
      if (Math.random() < dt * 0.1) m.orbitR = this.pickOrbit();
    }
  }

  draw(r: Renderer) {
    const { W, H, cw, ch, time: t } = this;
    const flicker = 0.92 + 0.08 * Math.sin(t * 17) * Math.sin(t * 5.3);
    lampGlow(r, this.lamp.fx * W, this.lamp.fy * H, Math.min(W, H) * 0.3, flicker, cw * 1.6, cw, ch);
    const p = this.pointer;
    if (p.active) lampGlow(r, p.x, p.y, Math.min(W, H) * 0.12, flicker, cw * 1.2, cw, ch);
    for (const m of this.moths) r.bug(smallMothFigure(m), { x: m.x, y: m.y, heading: m.heading, L: m.L, id: m.id, lift: 1 });
  }
}
