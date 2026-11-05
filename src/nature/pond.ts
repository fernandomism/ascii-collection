/**
 * A koi pond seen at an angle, between straight down and side-on. The water is a
 * plane in perspective: far water at the top of the screen, where things are
 * smaller, flatter and paler; near water at the bottom. Everything on or in the
 * water lives on that plane and is projected to the screen.
 *
 * Click the water: it ripples and you scatter food, which the koi come up to eat.
 * Now and then a sakura petal drifts down, ripples the surface where it lands,
 * floats a while and sinks. Lily pads with pink water lilies float on top, a faint
 * reflection drifts across the water, a few flies wander about and red and blue
 * dragonflies come by now and then.
 */
import { mix, SIDES } from "../core/anatomy";
import type { Scene } from "../core/engine";
import { Flock, type FlockStyle } from "../core/flock";
import { clamp, hash3, rand, TAU } from "../core/math";
import { slope, WING, type Backdrop, type Figure, type Paint, type Part, type Renderer, type RGB } from "../core/render";
import { Dragonfly } from "../insects/dragonfly";
import { type Area, type Food, type Koi, koiFigure, makeKoi, stepKoi } from "./koi";

/**
 * The view from a second-floor window: size drops hard toward the far (top) edge, and the
 * water flattens with distance, nearly top-down just below you and grazing at the far side.
 */
const FAR = 0.3;
/** How flat the water looks at the far and near edges: a circle on it drawn this many times as tall as it is wide. */
const FLAT_FAR = 0.35;
const FLAT_NEAR = 0.92;

/** The angled view: plane ↔ screen. The plane is wider than the screen, since its far edge shows more. */
export class View {
  W = 0;
  H = 0;
  /** Plane width and depth. */
  Wp = 0;
  D = 0;

  /** Screen height (per unit depth) down to depth t (0 far … 1 near): the running total of size × flatness. */
  private F(t: number) {
    const a = FAR;
    const b = 1 - FAR;
    const c = FLAT_FAR;
    const d = FLAT_NEAR - FLAT_FAR;
    return a * c * t + ((a * d + b * c) * t * t) / 2 + (b * d * t ** 3) / 3;
  }

  set(W: number, H: number) {
    this.W = W;
    this.H = H;
    this.Wp = W / FAR;
    this.D = H / this.F(1);
  }

  /** Plane point → screen x, y, the size factor there, and how flat the water looks there. */
  project(px: number, pz: number): [number, number, number, number] {
    const t = pz / this.D;
    const s = Math.max(0.15, FAR + (1 - FAR) * t);
    const q = clamp(FLAT_FAR + (FLAT_NEAR - FLAT_FAR) * t, 0.2, 1);
    return [this.W / 2 + (px - this.Wp / 2) * s, this.D * this.F(t), s, q];
  }

  /** Screen point → plane point. */
  unproject(sx: number, sy: number): [number, number] {
    // Screen height only grows with depth here, so bisect for the depth at this height.
    let lo = -0.4;
    let hi = 1.6;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (this.D * this.F(mid) < sy) lo = mid;
      else hi = mid;
    }
    const t = (lo + hi) / 2;
    return [this.Wp / 2 + (sx - this.W / 2) / Math.max(0.15, FAR + (1 - FAR) * t), t * this.D];
  }
}

// Half outlines (u along the axis, v out to one side).
const PETAL = [0.42, 0, 0.5, 0.12, 0.4, 0.26, 0.1, 0.3, -0.2, 0.22, -0.42, 0.08, -0.5, 0];
const PAD = [0.5, 0, 0.43, 0.25, 0.25, 0.43, 0, 0.5, -0.25, 0.43, -0.43, 0.25, -0.48, 0.12, 0, 0];

const PETAL_PALE: RGB = [255, 200, 218];
const PETAL_DEEP: RGB = [242, 122, 162];
const PAD_GREEN: RGB = [64, 136, 64];
const PAD_RIM: RGB = [40, 96, 46];
const LILY_OUTER: RGB = [236, 112, 164];
const LILY_INNER: RGB = [252, 196, 220];
const LILY_HEART: RGB = [250, 210, 90];
const RED_DRAGONFLY: RGB = [214, 54, 40];
const BLUE_DRAGONFLY: RGB = [60, 112, 226];
const FOOD: RGB = [214, 168, 104];
const DEEP_WATER: RGB = [10, 34, 42];

/** A few lone flies about the water at all times. */
const FLIES: FlockStyle = {
  glyphs: "+x", ink: [230, 238, 220], groups: 6, size: [1, 1], cruise: 80, maxSpeed: 200, jitter: 700, beat: 40, shy: true,
};

const padPaint = (u: number, v: number): RGB => {
  const r = Math.hypot(u, v);
  if (r > 0.44) return PAD_RIM;
  return Math.abs(Math.sin(Math.atan2(v, u) * 7)) < 0.1 && r > 0.06 ? mix(PAD_GREEN, [120, 180, 100], 0.4) : PAD_GREEN;
};

interface Ripple {
  x: number;
  y: number;
  born: number;
  /** 1 for a click; smaller for a petal landing or a koi taking food. */
  strength: number;
}

interface Petal {
  id: number;
  /** Where it lands (or floats) on the plane. */
  x: number;
  y: number;
  /** Height above the water in px (at near scale); 0 once it's landed. */
  alt: number;
  fall: number;
  drift: number;
  L: number;
  angle: number;
  spin: number;
  flip: number;
  sinkAt: number;
  /** 0 afloat → 1 gone under. */
  sink: number;
  paint: Paint;
}

interface Pad {
  id: number;
  x: number;
  y: number;
  L: number;
  angle: number;
  flower: boolean;
}

interface Pellet extends Food {
  born: number;
}

export class PondScene implements Scene {
  time = 0;
  pointer = { x: 0, y: 0, active: false };
  backdrop: Backdrop = { bg: "#000", grid: "rgba(255,255,255,0.055)", big: true, shadows: false };
  view = new View();
  koi: Koi[] = [];
  pads: Pad[] = [];
  petals: Petal[] = [];
  food: Pellet[] = [];
  ripples: Ripple[] = [];
  flies = new Flock(FLIES);
  dragonflies: Dragonfly[] = [];
  /** Where the koi swim: the stretch of the pond in view at the near edge, from a little past the far edge. */
  private koiArea: Area = { x: 0, y: 0, w: 0, h: 0 };
  private cw = 12;
  private ch = 17;
  /** Every cell's spot on the water (u, v), for the drifting reflection. */
  private cells = new Float32Array(0);
  private cols = 0;
  private nextPetal = 0;
  private nextId = 1;

  resize(width: number, height: number, cw: number, ch: number) {
    const first = this.view.W === 0;
    this.view.set(width, height);
    this.koiArea = { x: this.view.Wp / 2 - width / 2, y: this.view.D * 0.15, w: width, h: this.view.D * 0.85 };
    this.cw = cw;
    this.ch = ch;
    this.cols = Math.ceil(width / cw);
    const rows = Math.ceil(height / ch);
    this.cells = new Float32Array(this.cols * rows * 2);
    for (let i = 0; i < this.cols * rows; i++) {
      const [u, v] = this.view.unproject(((i % this.cols) + 0.5) * cw, (((i / this.cols) | 0) + 0.5) * ch);
      this.cells[i * 2] = u;
      this.cells[i * 2 + 1] = v;
    }
    if (!first) return;
    const minSide = Math.min(width, height);
    // Somewhere on the water that's on screen.
    const onScreen = (): [number, number] => this.view.unproject(rand(0.05, 0.95) * width, rand(0.08, 0.95) * height);
    const { w, h } = this.koiArea;
    for (let i = 0, n = Math.random() < 0.5 ? 3 : 4; i < n; i++) {
      const [x, y] = onScreen();
      this.koi.push(makeKoi(this.nextId++, x, y, minSide * rand(0.3, 0.38), rand(0.25, 0.45) * Math.min(w, h)));
    }
    for (let i = 0, n = clamp(Math.round((width * height) / 150000), 5, 10); i < n; i++) {
      const L = minSide * rand(0.12, 0.22);
      let x = 0;
      let y = 0;
      // Scatter without overlaps where there's room.
      for (let t = 0; t < 30; t++) {
        [x, y] = onScreen();
        if (this.pads.every((p) => Math.hypot(p.x - x, p.y - y) > (p.L + L) * 0.6)) break;
      }
      this.pads.push({ id: this.nextId++, x, y, L, angle: rand(0, TAU), flower: Math.random() < 0.6 });
    }
    for (let i = 0; i < 3; i++) this.dropPetal(true);
    this.flies.seed(width, height);
    this.dragonflies = [new Dragonfly(minSide * 0.17, rand(2, 6), RED_DRAGONFLY), new Dragonfly(minSide * 0.15, rand(9, 15), BLUE_DRAGONFLY)];
  }

  click(x: number, y: number) {
    const [px, pz] = this.view.unproject(x, y);
    this.ripples.push({ x: px, y: pz, born: this.time, strength: 1 });
    for (let i = 0; i < 6; i++) this.food.push({ x: px + rand(-30, 30), y: pz + rand(-30, 30), born: this.time });
    this.flies.scatter(x, y);
  }

  /** A petal drifts down from above (or, at the start, is already afloat). */
  private dropPetal(afloat = false) {
    const { W, H } = this.view;
    const [x, y] = this.view.unproject(rand(0.05, 0.95) * W, rand(0.1, 0.95) * H);
    const p: Petal = {
      id: this.nextId++, x, y,
      alt: afloat ? 0 : rand(0.5, 0.8) * H,
      fall: rand(0.12, 0.18) * H,
      drift: rand(10, 30),
      L: Math.min(W, H) * rand(0.03, 0.045),
      angle: rand(0, TAU),
      spin: rand(-1.5, 1.5),
      flip: rand(0, TAU),
      sinkAt: this.time + rand(8, 15),
      sink: 0,
      paint: PETAL_PALE,
    };
    // Sinking veils it in water until it's gone.
    p.paint = (u, v) => mix(mix(PETAL_PALE, PETAL_DEEP, clamp((0.5 - u) * 0.8 - v, 0, 1) ** 1.5), DEEP_WATER, p.sink * 0.85);
    this.petals.push(p);
  }

  step(dt: number) {
    this.time += dt;
    const { time, view } = this;
    const { W, H, Wp, D } = view;
    for (const k of this.koi) {
      const ate = stepKoi(k, dt, time, this.koiArea, this.food, this.koi);
      if (ate) {
        this.food.splice(this.food.indexOf(ate as Pellet), 1);
        this.ripples.push({ x: ate.x, y: ate.y, born: time, strength: 0.35 });
      }
    }
    // Uneaten food sinks after a while.
    this.food = this.food.filter((f) => time - f.born < 40);

    // Not common, not rare: a petal every few seconds, never a crowd.
    const falling = this.petals.filter((p) => p.alt > 0).length;
    if (time > this.nextPetal && falling < 4 && this.petals.length - falling < 10) {
      this.dropPetal();
      this.nextPetal = time + rand(1.5, 3.5);
    }
    for (const p of this.petals) {
      if (p.alt > 0) {
        // Falling: drifting on the breeze, tumbling, until it touches the water.
        p.alt -= p.fall * dt;
        p.x += p.drift * dt + Math.sin(time * 1.3 + p.id) * 20 * dt;
        p.angle += p.spin * dt;
        p.flip += dt * 3;
        if (p.alt <= 0) {
          p.alt = 0;
          p.sinkAt = time + rand(8, 15);
          this.ripples.push({ x: p.x, y: p.y, born: time, strength: 0.45 });
        }
      } else {
        // Afloat: a slow turn and drift, then it waterlogs and sinks.
        p.x += 4 * dt;
        p.angle += p.spin * 0.08 * dt;
        if (time > p.sinkAt) p.sink = Math.min(1, p.sink + dt / 4);
      }
    }
    this.petals = this.petals.filter((p) => p.sink < 1);
    this.ripples = this.ripples.filter((r) => time - r.born < 1.6 + 1.8 * r.strength);
    this.flies.step(dt, W, H, time, this.pointer);
    for (const d of this.dragonflies) d.step(dt, time, Wp, D);
  }

  draw(r: Renderer) {
    const { cw, ch, time: t, view } = this;
    // A faint reflection of the sky drifting slowly across the water: sparse glints in a soft
    // diagonal band, under everything else.
    const band = ((t * 0.03) % 1.4) - 0.2;
    const { cells } = this;
    const { Wp, D } = view;
    for (let i = 0; i < cells.length / 2; i++) {
      const u = cells[i * 2];
      const v = cells[i * 2 + 1];
      const off = Math.abs((u / Wp + v / D) / 2 - band);
      if (off > 0.12) continue;
      const glint = Math.sin(u * 0.04 + t * 1.5) * Math.sin(v * 0.05 - t * 1.1);
      if (glint < 0.35) continue;
      const k = (1 - off / 0.12) ** 2 * glint;
      r.putCell(i % this.cols, (i / this.cols) | 0, glint > 0.7 ? "~" : "-", [28 + 46 * k, 62 + 70 * k, 72 + 74 * k]);
    }

    this.koi.sort((a, b) => a.y - b.y);
    for (const k of this.koi) {
      const [x, y, s, q] = view.project(k.x, k.y);
      k.fog = 0.1 + 0.4 * (1 - s);
      r.bug(koiFigure(k), { x, y, heading: k.heading, L: k.L * s, id: k.id, squash: q });
    }

    // Ripples: rings spreading on the water, drawn as glyphs that follow the curve.
    for (const rp of this.ripples) {
      const age = t - rp.born;
      const life = 1.6 + 1.8 * rp.strength;
      for (let ring = 0; ring < 3; ring++) {
        const rad = age * (40 + 50 * rp.strength) - ring * 16;
        const a = (1 - age / life) * rp.strength * (1 - ring * 0.28);
        if (rad < 4 || a < 0.05) continue;
        const s0 = view.project(rp.x, rp.y)[2];
        const n = Math.ceil((TAU * rad * s0) / (cw * 0.6));
        for (let j = 0; j < n; j++) {
          const th = (j / n) * TAU;
          const [x, y, s, q] = view.project(rp.x + Math.cos(th) * rad, rp.y + Math.sin(th) * rad);
          const g = slope((-Math.sin(th) * s) / cw, (Math.cos(th) * s * q) / ch);
          const b = a * (0.5 + 0.5 * s);
          r.overlay(Math.floor(x / cw), Math.floor(y / ch), g, [150 * b + 30, 220 * b + 40, 232 * b + 50]);
        }
      }
    }
    for (const f of this.food) {
      const [x, y] = view.project(f.x, f.y);
      r.overlay(Math.floor(x / cw), Math.floor(y / ch), "o", FOOD);
    }

    this.pads.sort((a, b) => a.y - b.y);
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
      const [x, y, s, q] = view.project(p.x, p.y);
      const fig: Figure = { parts, strokes: [] };
      r.bug(fig, { x, y, heading: p.angle + 0.06 * Math.sin(t * 0.3 + p.id), L: p.L * s, id: p.id, squash: q });
    }

    // Afloat (lying flat on the water) first, then the falling ones in the air above.
    const order = [...this.petals].sort((a, b) => (a.alt > 0 ? 1 : 0) - (b.alt > 0 ? 1 : 0) || a.y - b.y);
    for (const p of order) {
      const flying = p.alt > 0;
      const [x, y, s, q] = view.project(p.x, p.y);
      const flap = flying ? Math.max(0.2, Math.abs(Math.cos(p.flip))) : 1;
      const fig: Figure = {
        parts: SIDES.map((side): Part => ({ k: "wing", poly: PETAL, x: 0, side, sweep: 0, flap, paint: p.paint, ramp: WING })),
        strokes: [],
      };
      r.bug(fig, {
        x, y: y - p.alt * s, heading: p.angle, L: p.L * s * (1 - 0.4 * p.sink), id: p.id, squash: flying ? 1 : q,
      });
    }

    // Dragonflies hover a little above the water.
    this.dragonflies.forEach((d, i) =>
      d.draw(r, 990 + i, (x, y) => {
        const [sx, sy, s, q] = view.project(x, y);
        return [sx, sy - 80 * s, s, q];
      }),
    );
    this.flies.draw(r, cw, ch);
  }

  /** Dark water with small waves, sparser and fainter toward the far side. */
  ground(col: number, row: number): [string, RGB] | null {
    const s = this.view.project(0, this.view.unproject(0, (row + 0.5) * this.ch)[1])[2];
    const h = hash3(col, row, 404);
    const k = 0.45 + 0.55 * s;
    if (h < 0.045 * k) return ["~", [26 * k, 66 * k, 76 * k]];
    if (h < 0.065 * k) return [".", [22 * k, 54 * k, 64 * k]];
    return null;
  }
}
