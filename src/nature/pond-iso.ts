/**
 * A koi pond up close, seen at an almost isometric angle: the water fills the view.
 * Bands of light ripple across it, a deep gradient runs through it and a warm glow
 * slowly breathes over everything.
 *
 * Four big koi glide through, out of view and back like the sharks, and now and then
 * rise to breathe; small dark fish drift alone far below; lily pads with pink water
 * lilies drift on a slow current; two dragonflies, one teal and one scarlet, come and
 * go. Click the water to ripple it and feed the koi.
 */
import { mix, SIDES } from "../core/anatomy";
import type { Scene } from "../core/engine";
import { rand, TAU } from "../core/math";
import { slope, WING, type Backdrop, type Part, type Placement, type Renderer, type RGB } from "../core/render";
import { Dragonfly } from "../insects/dragonfly";
import { type Area, type Food, type Koi, koiFigure, makeKoi, stepKoi } from "./koi";

// Almost isometric: screen x per unit of (u - v), screen y per unit of (u + v); a touch taller than true isometric.
const IC = 0.866;
const IS = 0.55;
// The same map for a figure lying on the water: a quarter-turn, a scale and a squash.
const ISO_TURN = Math.PI / 4;
const ISO_SCALE = IC * Math.SQRT2;
const ISO_SQUASH = IS / IC;

const PAD = [0.5, 0, 0.43, 0.25, 0.25, 0.43, 0, 0.5, -0.25, 0.43, -0.43, 0.25, -0.48, 0.12, 0, 0];
const PAD_GREEN: RGB = [58, 128, 62];
const PAD_RIM: RGB = [36, 90, 44];
const LILY_OUTER: RGB = [236, 112, 164];
const LILY_INNER: RGB = [252, 196, 220];
const LILY_HEART: RGB = [250, 210, 90];
const FOOD: RGB = [214, 168, 104];
const DEEP: RGB = [30, 72, 80];

const padPaint = (u: number, v: number): RGB => {
  const r = Math.hypot(u, v);
  if (r > 0.44) return PAD_RIM;
  return Math.abs(Math.sin(Math.atan2(v, u) * 7)) < 0.1 && r > 0.06 ? mix(PAD_GREEN, [120, 180, 100], 0.4) : PAD_GREEN;
};

interface Ripple {
  u: number;
  v: number;
  born: number;
  strength: number;
}

interface Pad {
  id: number;
  u: number;
  v: number;
  L: number;
  angle: number;
  flower: boolean;
}

interface Pellet extends Food {
  born: number;
}

export class IsoPondScene implements Scene {
  time = 0;
  pointer = { x: 0, y: 0, active: false };
  koi: Koi[] = [];
  deep: Koi[] = [];
  pads: Pad[] = [];
  food: Pellet[] = [];
  ripples: Ripple[] = [];
  dragonflies: Dragonfly[] = [];
  /** Screen centre, and half the size (water units) of the square of water the view covers. */
  cx = 0;
  cy = 0;
  A = 0;
  backdrop: Backdrop = {
    bg: "#061a21", grid: "rgba(255,255,255,0.04)", big: true, shadows: false,
    paint: (g, W, H) => this.paintWater(g, W, H),
    light: (g, W, H, t) => this.breathe(g, W, H, t),
  };
  /** Every cell's spot on the water (u, v), for the bands of light. */
  private cells = new Float32Array(0);
  private cols = 0;
  private gulpAt = new Map<Koi, number>();
  private cw = 12;
  private ch = 17;
  private nextId = 1;

  /** Water point → screen. */
  project(u: number, v: number): [number, number] {
    return [this.cx + (u - v) * IC, this.cy + (u + v) * IS];
  }

  /** Screen point → water. */
  unproject(x: number, y: number): [number, number] {
    const a = (x - this.cx) / IC;
    const b = (y - this.cy) / IS;
    return [(a + b) / 2, (b - a) / 2];
  }

  /** Placement for a figure lying on the water at (u, v), sized in water units. */
  private place(u: number, v: number, heading: number, L: number, id: number): Placement {
    const [x, y] = this.project(u, v);
    return { x, y, heading: heading + ISO_TURN, L: L * ISO_SCALE, id, squash: ISO_SQUASH };
  }

  /** The water the koi patrol, out of view and back: the square the view covers. */
  private area(): Area {
    return { x: -this.A, y: -this.A, w: 2 * this.A, h: 2 * this.A };
  }

  resize(width: number, height: number, cw: number, ch: number) {
    const first = this.A === 0;
    this.cw = cw;
    this.ch = ch;
    this.cx = width / 2;
    this.cy = height / 2;
    // The view's corners: a square of water that just covers the screen once turned and squashed.
    this.A = Math.max(width / (4 * IC), height / (4 * IS));
    this.cols = Math.ceil(width / cw);
    const rows = Math.ceil(height / ch);
    this.cells = new Float32Array(this.cols * rows * 2);
    for (let i = 0; i < this.cols * rows; i++) {
      const [u, v] = this.unproject(((i % this.cols) + 0.5) * cw, (((i / this.cols) | 0) + 0.5) * ch);
      this.cells[i * 2] = u;
      this.cells[i * 2 + 1] = v;
    }
    if (!first) return;
    // Sized off the screen, so the fish are big enough to watch.
    const unit = Math.min(width, height) / ISO_SCALE;
    const inView = (): [number, number] => this.unproject(rand(0.15, 0.85) * width, rand(0.15, 0.85) * height);
    const area = this.area();
    for (let i = 0; i < 4; i++) {
      const [u, v] = inView();
      const k = makeKoi(this.nextId++, u, v, unit * rand(0.3, 0.38), rand(0.2, 0.4) * area.w);
      this.koi.push(k);
      this.gulpAt.set(k, rand(3, 12));
    }
    for (let i = 0; i < 6; i++) {
      const [u, v] = inView();
      const f = makeKoi(this.nextId++, u, v, unit * rand(0.07, 0.1), rand(0.2, 0.45) * area.w);
      // Deep down: darker, closer to the water's own colour.
      const tint = rand(0.8, 1.15);
      f.pattern = () => [DEEP[0] * tint, DEEP[1] * tint, DEEP[2] * tint];
      f.fin = [DEEP[0] * 0.8, DEEP[1] * 0.8, DEEP[2] * 0.8];
      f.gloss = 0.1;
      this.deep.push(f);
    }
    for (let i = 0; i < 5; i++) {
      const L = unit * rand(0.18, 0.26);
      let u = 0;
      let v = 0;
      for (let t = 0; t < 30; t++) {
        [u, v] = inView();
        if (this.pads.every((p) => Math.hypot(p.u - u, p.v - v) > (p.L + L) * 0.6)) break;
      }
      this.pads.push({ id: this.nextId++, u, v, L, angle: rand(0, TAU), flower: Math.random() < 0.6 });
    }
    this.dragonflies = [new Dragonfly(unit * 0.2, rand(2, 6)), new Dragonfly(unit * 0.18, rand(9, 15), [214, 64, 40])];
  }

  /** The water itself: deep at the far side, lighter where the light pools, darker at the edges. */
  private paintWater(g: CanvasRenderingContext2D, W: number, H: number) {
    const depth = g.createLinearGradient(0, 0, 0, H);
    depth.addColorStop(0, "#04121a");
    depth.addColorStop(0.5, "#0a2f38");
    depth.addColorStop(1, "#0d3d45");
    g.fillStyle = depth;
    g.fillRect(0, 0, W, H);
    const pool = g.createRadialGradient(W * 0.42, H * 0.45, 0, W * 0.42, H * 0.45, Math.max(W, H) * 0.6);
    pool.addColorStop(0, "rgba(40,130,140,0.35)");
    pool.addColorStop(1, "rgba(40,130,140,0)");
    g.fillStyle = pool;
    g.fillRect(0, 0, W, H);
    const vignette = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = vignette;
    g.fillRect(0, 0, W, H);
  }

  /** A warm glow from the upper left, slowly breathing, as if late sun is on the water. */
  private breathe(g: CanvasRenderingContext2D, W: number, H: number, t: number) {
    const k = 0.5 + 0.5 * Math.sin(t * 0.35);
    const glow = g.createRadialGradient(W * 0.15, H * 0.1, 0, W * 0.15, H * 0.1, Math.max(W, H) * 0.8);
    glow.addColorStop(0, `rgba(255,170,96,${(0.1 + 0.07 * k).toFixed(3)})`);
    glow.addColorStop(1, "rgba(255,170,96,0)");
    g.globalCompositeOperation = "lighter";
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
  }

  click(x: number, y: number) {
    const [u, v] = this.unproject(x, y);
    this.ripples.push({ u, v, born: this.time, strength: 1 });
    for (let i = 0; i < 6; i++) this.food.push({ x: u + rand(-30, 30), y: v + rand(-30, 30), born: this.time });
  }

  step(dt: number) {
    this.time += dt;
    const { time, A } = this;
    const area = this.area();
    for (const k of this.koi) {
      const ate = stepKoi(k, dt, time, area, this.food, this.koi);
      if (ate) {
        this.food.splice(this.food.indexOf(ate as Pellet), 1);
        this.ripples.push({ u: ate.x, v: ate.y, born: time, strength: 0.35 });
      }
      // Now and then a koi comes up to the surface to breathe.
      if (time > (this.gulpAt.get(k) ?? 0)) {
        this.ripples.push({ u: k.x + Math.cos(k.heading) * k.L * 0.45, v: k.y + Math.sin(k.heading) * k.L * 0.45, born: time, strength: 0.3 });
        this.gulpAt.set(k, time + rand(7, 18));
      }
    }
    for (const f of this.deep) stepKoi(f, dt, time, area, [], this.deep);
    // A slow current carries the lily pads across; one that drifts out comes back in on the far side.
    for (const p of this.pads) {
      p.u += 5 * dt;
      p.angle += 0.01 * dt;
      if (p.u > A + p.L) p.u -= 2 * (A + p.L);
    }
    this.food = this.food.filter((f) => time - f.born < 40);
    this.ripples = this.ripples.filter((r) => time - r.born < 1.6 + 1.8 * r.strength);
    for (const d of this.dragonflies) d.step(dt, time, 2 * A, 2 * A);
  }

  draw(r: Renderer) {
    const { cw, ch, time: t, A, cells, cols } = this;

    // Light dancing on the water: moving bands of glyphs, breathing slowly.
    const breath = 0.85 + 0.15 * Math.sin(t * 0.4);
    for (let i = 0; i < cells.length / 2; i++) {
      const u = cells[i * 2];
      const v = cells[i * 2 + 1];
      const c = Math.sin(u * 0.03 + t * 0.8) + Math.sin(v * 0.026 - t * 0.6) + Math.sin((u - v) * 0.018 + t * 0.45);
      if (c < 1.75) continue;
      const k = Math.min(1, (c - 1.75) / 1.25) * breath;
      r.putCell(i % cols, (i / cols) | 0, c > 2.1 ? "~" : "-", [50 + 90 * k, 112 + 100 * k, 118 + 84 * k]);
    }

    // Deepest first: the small dark fish, shown a little lower as if seen through the water.
    for (const f of this.deep) {
      const p = this.place(f.x, f.y, f.heading, f.L, f.id);
      p.y += f.L * 0.6;
      r.bug(koiFigure(f), p);
    }
    this.koi.sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const k of this.koi) r.bug(koiFigure(k), this.place(k.x, k.y, k.heading, k.L, k.id));

    // Ripples: rings spreading on the water, drawn as glyphs that follow the curve.
    for (const rp of this.ripples) {
      const age = t - rp.born;
      const life = 1.6 + 1.8 * rp.strength;
      for (let ring = 0; ring < 3; ring++) {
        const rad = age * (50 + 60 * rp.strength) - ring * 18;
        const a = (1 - age / life) * rp.strength * (1 - ring * 0.28);
        if (rad < 4 || a < 0.05) continue;
        const n = Math.ceil((TAU * rad * ISO_SCALE) / (cw * 0.6));
        for (let j = 0; j < n; j++) {
          const th = (j / n) * TAU;
          const [x, y] = this.project(rp.u + Math.cos(th) * rad, rp.v + Math.sin(th) * rad);
          const g = slope((IC * (-Math.sin(th) - Math.cos(th))) / cw, (IS * (Math.cos(th) - Math.sin(th))) / ch);
          r.overlay(Math.floor(x / cw), Math.floor(y / ch), g, [150 * a + 40, 220 * a + 60, 230 * a + 70]);
        }
      }
    }
    for (const f of this.food) {
      const [x, y] = this.project(f.x, f.y);
      r.overlay(Math.floor(x / cw), Math.floor(y / ch), "o", FOOD);
    }

    this.pads.sort((a, b) => a.u + a.v - (b.u + b.v));
    for (const p of this.pads) {
      const parts: Part[] = SIDES.map((side): Part => ({ k: "wing", poly: PAD, x: 0, side, sweep: 0, flap: 1, paint: padPaint, ramp: WING }));
      if (p.flower) {
        // A pink water lily: an outer ring, an inner ring and a golden heart.
        const fx = 0.1;
        const fy = 0.08;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + p.id;
          parts.push({ k: "ell", x: fx + Math.cos(a) * 0.13, y: fy + Math.sin(a) * 0.13, rx: 0.14, ry: 0.055, a, paint: LILY_OUTER, gloss: 0.5 });
        }
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + p.id + 0.4;
          parts.push({ k: "ell", x: fx + Math.cos(a) * 0.07, y: fy + Math.sin(a) * 0.07, rx: 0.09, ry: 0.04, a, paint: LILY_INNER, gloss: 0.6 });
        }
        parts.push({ k: "ell", x: fx, y: fy, rx: 0.05, ry: 0.05, paint: LILY_HEART, gloss: 0.7 });
      }
      r.bug({ parts, strokes: [] }, this.place(p.u, p.v, p.angle + 0.05 * Math.sin(t * 0.3 + p.id), p.L, p.id));
    }

    // Dragonflies hover a little above the water; their frame is offset to start at 0.
    this.dragonflies.forEach((d, i) =>
      d.draw(r, 900 + i, (x, y) => {
        const [sx, sy] = this.project(x - A, y - A);
        return [sx, sy - d.L * 0.6, ISO_SCALE, ISO_SQUASH, ISO_TURN];
      }),
    );
  }
}
