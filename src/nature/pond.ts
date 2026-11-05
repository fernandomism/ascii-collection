/**
 * A koi pond seen from above. Click the water: it ripples and you scatter food,
 * which the koi come up to eat. Sakura petals drift down and ripple the surface
 * where they land, float a while and sink. Lily pads, some in flower, sit on
 * top; gnats drift over the water and now and then a dragonfly comes by.
 */
import { mix, SIDES } from "../core/anatomy";
import type { Scene } from "../core/engine";
import { clamp, hash3, rand, TAU } from "../core/math";
import { slope, WING, type Backdrop, type Figure, type Part, type Renderer, type RGB } from "../core/render";
import { Dragonfly } from "../insects/dragonfly";
import { Gnats } from "../insects/gnats";
import { type Food, type Koi, koiFigure, makeKoi, stepKoi } from "./koi";

// Half outlines (u along the axis, v out to one side).
const PETAL = [0.42, 0, 0.5, 0.12, 0.4, 0.26, 0.1, 0.3, -0.2, 0.22, -0.42, 0.08, -0.5, 0];
const PAD = [0.5, 0, 0.43, 0.25, 0.25, 0.43, 0, 0.5, -0.25, 0.43, -0.43, 0.25, -0.48, 0.12, 0, 0];

const PETAL_PALE: RGB = [252, 214, 226];
const PETAL_DEEP: RGB = [236, 140, 172];
const PAD_GREEN: RGB = [64, 136, 64];
const PAD_RIM: RGB = [40, 96, 46];
const LILY: RGB = [246, 232, 240];
const LILY_HEART: RGB = [244, 206, 80];
const FOOD: RGB = [214, 168, 104];

const petalPaint = (u: number, v: number): RGB => mix(PETAL_PALE, PETAL_DEEP, clamp((0.5 - u) * 0.8 - v, 0, 1) ** 1.5);
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
  x: number;
  y: number;
  /** 1 high in the air → 0 on the water. */
  z: number;
  fallRate: number;
  drift: number;
  L: number;
  angle: number;
  spin: number;
  flip: number;
  landed: number;
  sinkAt: number;
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
  backdrop: Backdrop = { bg: "#061419", grid: "rgba(120,200,220,0.05)", big: true, shadows: false };
  koi: Koi[] = [];
  pads: Pad[] = [];
  petals: Petal[] = [];
  food: Pellet[] = [];
  ripples: Ripple[] = [];
  gnats = new Gnats();
  dragonfly = new Dragonfly(0);
  private W = 0;
  private H = 0;
  private cw = 12;
  private ch = 17;
  private nextPetal = 0;
  private nextId = 1;

  resize(width: number, height: number, cw: number, ch: number) {
    const first = this.W === 0;
    this.W = width;
    this.H = height;
    this.cw = cw;
    this.ch = ch;
    if (!first) return;
    const minSide = Math.min(width, height);
    for (let i = 0, n = clamp(Math.round((width * height) / 200000), 4, 9); i < n; i++) {
      this.koi.push(makeKoi(this.nextId++, rand(0, width), rand(0, height), minSide * rand(0.18, 0.28), rand(0.25, 0.65) * minSide));
    }
    this.koi.sort((a, b) => a.L - b.L);
    for (let i = 0, n = clamp(Math.round((width * height) / 180000), 4, 9); i < n; i++) {
      const L = minSide * rand(0.1, 0.2);
      // Scatter without overlaps where there's room.
      let x = 0;
      let y = 0;
      for (let t = 0; t < 30; t++) {
        x = rand(0.05, 0.95) * width;
        y = rand(0.05, 0.95) * height;
        if (this.pads.every((p) => Math.hypot(p.x - x, p.y - y) > (p.L + L) * 0.6)) break;
      }
      this.pads.push({ id: this.nextId++, x, y, L, angle: rand(0, TAU), flower: Math.random() < 0.35 });
    }
    for (let i = 0; i < 12; i++) this.dropPetal(Math.random() < 0.6);
    this.gnats.seed(width, height);
    this.dragonfly = new Dragonfly(minSide * 0.22);
  }

  click(x: number, y: number) {
    this.ripples.push({ x, y, born: this.time, strength: 1 });
    for (let i = 0; i < 6; i++) this.food.push({ x: x + rand(-25, 25), y: y + rand(-25, 25), born: this.time });
  }

  /** A petal falls from above (or, at the start, is already floating). */
  private dropPetal(floating = false) {
    const { W, H, time } = this;
    this.petals.push({
      id: this.nextId++,
      x: rand(0, W),
      y: rand(0, H),
      z: floating ? 0 : 1,
      fallRate: rand(1 / 7, 1 / 4),
      drift: rand(10, 30),
      L: Math.min(W, H) * rand(0.035, 0.06),
      angle: rand(0, TAU),
      spin: rand(-1.5, 1.5),
      flip: rand(0, TAU),
      landed: floating ? time : -1,
      sinkAt: time + rand(20, 35),
    });
  }

  step(dt: number) {
    this.time += dt;
    const { time, W, H } = this;
    for (const k of this.koi) {
      const ate = stepKoi(k, dt, time, W, H, this.food, this.koi);
      if (ate) {
        this.food.splice(this.food.indexOf(ate as Pellet), 1);
        this.ripples.push({ x: ate.x, y: ate.y, born: time, strength: 0.35 });
      }
    }
    // Uneaten food sinks after a while.
    this.food = this.food.filter((f) => time - f.born < 40);

    if (time > this.nextPetal && this.petals.filter((p) => p.z > 0).length < 16) {
      this.dropPetal();
      this.nextPetal = time + rand(0.4, 1.2);
    }
    for (const p of this.petals) {
      if (p.z > 0) {
        // Falling: drifting on the breeze, tumbling, until it touches the water.
        p.z -= p.fallRate * dt;
        p.x += p.drift * dt + Math.sin(time * 1.3 + p.id) * 20 * dt;
        p.angle += p.spin * dt;
        p.flip += dt * 3;
        if (p.z <= 0) {
          p.z = 0;
          p.landed = time;
          p.sinkAt = time + rand(20, 35);
          this.ripples.push({ x: p.x, y: p.y, born: time, strength: 0.45 });
        }
      } else {
        // Afloat: a slow turn and drift.
        p.x += 4 * dt;
        p.angle += p.spin * 0.08 * dt;
      }
    }
    this.petals = this.petals.filter((p) => p.z > 0 || time < p.sinkAt);
    this.ripples = this.ripples.filter((r) => time - r.born < 1.6 + 1.8 * r.strength);
    this.gnats.step(dt, W, H, time, this.pointer);
    this.dragonfly.step(dt, time, W, H);
  }

  draw(r: Renderer) {
    const { cw, ch, time: t } = this;
    for (const k of this.koi) r.bug(koiFigure(k), { x: k.x, y: k.y, heading: k.heading, L: k.L, id: k.id });

    // Ripples: expanding rings on the surface, drawn as glyphs that follow the curve.
    for (const rp of this.ripples) {
      const age = t - rp.born;
      const life = 1.6 + 1.8 * rp.strength;
      for (let ring = 0; ring < 3; ring++) {
        const rad = age * (40 + 50 * rp.strength) - ring * 16;
        const a = (1 - age / life) * rp.strength * (1 - ring * 0.28);
        if (rad < 4 || a < 0.05) continue;
        const n = Math.ceil((TAU * rad) / (cw * 0.7));
        for (let j = 0; j < n; j++) {
          const th = (j / n) * TAU;
          const g = slope(-Math.sin(th) / cw, Math.cos(th) / ch);
          r.overlay(Math.floor((rp.x + Math.cos(th) * rad) / cw), Math.floor((rp.y + Math.sin(th) * rad) / ch), g, [150 * a + 30, 220 * a + 40, 232 * a + 50]);
        }
      }
    }
    for (const f of this.food) r.overlay(Math.floor(f.x / cw), Math.floor(f.y / ch), "o", FOOD);

    for (const p of this.pads) {
      const parts: Part[] = SIDES.map((side): Part => ({ k: "wing", poly: PAD, x: 0, side, sweep: 0, flap: 1, paint: padPaint, ramp: WING }));
      if (p.flower) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + p.id;
          parts.push({ k: "ell", x: 0.12 + Math.cos(a) * 0.07, y: 0.1 + Math.sin(a) * 0.07, rx: 0.08, ry: 0.035, a, paint: LILY, gloss: 0.4 });
        }
        parts.push({ k: "ell", x: 0.12, y: 0.1, rx: 0.035, ry: 0.035, paint: LILY_HEART, gloss: 0.6 });
      }
      const fig: Figure = { parts, strokes: [] };
      r.bug(fig, { x: p.x, y: p.y, heading: p.angle + 0.06 * Math.sin(t * 0.3 + p.id), L: p.L, id: p.id });
    }

    // Afloat first, then the falling ones above them; higher petals look bigger, nearer the eye.
    const order = [...this.petals].sort((a, b) => a.z - b.z);
    for (const p of order) {
      const flap = p.z > 0 ? Math.max(0.2, Math.abs(Math.cos(p.flip))) : 1;
      const fig: Figure = {
        parts: SIDES.map((side): Part => ({ k: "wing", poly: PETAL, x: 0, side, sweep: 0, flap, paint: petalPaint, ramp: WING })),
        strokes: [],
      };
      r.bug(fig, { x: p.x, y: p.y, heading: p.angle, L: p.L * (1 + p.z * 1.6), id: p.id });
    }

    this.dragonfly.draw(r, 999);
    this.gnats.draw(r, cw, ch);
  }

  /** Dark water with a scatter of small waves. */
  ground(col: number, row: number): [string, RGB] | null {
    const h = hash3(col, row, 404);
    if (h < 0.04) return ["~", [26, 66, 76]];
    if (h < 0.06) return [".", [22, 54, 64]];
    return null;
  }
}
