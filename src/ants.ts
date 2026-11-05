/**
 * Detailed ants exploring. Click to drop food.
 *
 * Explorers roam the scene on long looping paths, like the sharks, wandering out
 * past the edges and back. When one smells food it bites off a crumb and carries
 * it straight home to the nest, laying a pheromone trail that other explorers
 * follow back out to the food. Ants that meet stop to touch antennae.
 */
import { limb, mix, scale, SIDES, tripod } from "./anatomy";
import type { Scene } from "./engine";
import { clamp, hash3, patrol, rand, reenter, steer, TAU } from "./math";
import type { Figure, Part, Renderer, RGB, Stroke } from "./render";

const HEAD: RGB = [198, 86, 46];
const THORAX: RGB = [188, 80, 44];
const GASTER: RGB = [122, 56, 40];
const HAIR: RGB = [230, 180, 100];
const JAW: RGB = [128, 52, 30];
const LEG: RGB = [176, 98, 62];
const EYE: RGB = [18, 14, 14];
const TRAIL: RGB = [200, 140, 64];
const FOODS: RGB[] = [[240, 232, 210], [214, 168, 96], [238, 198, 72], [216, 74, 60], [150, 200, 90]];

// Per leg pair (front, middle, hind): hip x, rest angle, femur/tibia/tarsus lengths, bend at each joint.
const LEGS = [
  { x: 0.17, a: 0.6, len: [0.15, 0.15, 0.11], bend: [0, 0.5, 0.25] },
  { x: 0.1, a: -0.2, len: [0.16, 0.17, 0.12], bend: [0, -0.3, -0.15] },
  { x: 0.04, a: -0.7, len: [0.19, 0.21, 0.14], bend: [0, -0.45, -0.2] },
] as const;

type State = "explore" | "toFood" | "home";

interface Food {
  x: number;
  y: number;
  amount: number;
  rgb: RGB;
}

interface Ant {
  id: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  L: number;
  /** Majors have the oversized heads. */
  major: boolean;
  state: State;
  target: Food | null;
  /** The last food this ant found; it heads back there after unloading. */
  memory: Food | null;
  carry: RGB | null;
  gait: number;
  wander: number;
  /** Antenna sweep phase. */
  feel: number;
  pauseUntil: number;
  greetAt: number;
  /** Its exploring loop round the scene (px) and which way round it walks. */
  orbitR: number;
  orbitDir: 1 | -1;
}

const gasterPaint = (u: number, v: number): RGB => {
  // Hair flecks over the tergites, with dark seams between them.
  if (hash3(Math.round(u * 16), Math.round(v * 10), 9) < 0.08) return HAIR;
  for (const seam of [0.55, 0.05, -0.45]) if (Math.abs(u - seam) < 0.07) return scale(GASTER, 0.55);
  return GASTER;
};

function antFigure(a: Ant): Figure {
  const parts: Part[] = [];
  const strokes: Stroke[] = [];
  const big = a.major ? 1 : 0;
  const walking = Math.min(1, a.speed / 25);

  for (let i = 0; i < 3; i++) {
    const leg = LEGS[i];
    for (const side of SIDES) {
      const [swing, lift] = tripod(a.gait, i, side);
      limb(strokes, leg.x, 0.03, side, leg.a + swing * 0.32 * walking, leg.len, leg.bend, LEG, undefined, 1 - 0.12 * lift * walking);
    }
  }
  // Elbowed antennae: a long scape, then the funiculus bent forward, tapping.
  for (const side of SIDES) {
    const tap = Math.sin(a.feel * 1.7 + side * 1.3 + a.id);
    limb(strokes, 0.33 + big * 0.03, 0.04, side, 0.75 + 0.12 * tap, [0.16, 0.18], [0, 0.75 + 0.3 * Math.sin(a.feel + side)], LEG);
  }

  parts.push({ k: "ell", x: -0.22, y: 0, rx: 0.17, ry: 0.12, paint: gasterPaint, gloss: 0.7 });
  parts.push({ k: "ell", x: -0.04, y: 0, rx: 0.028, ry: 0.032, paint: THORAX, gloss: 0.4 }); // petiole node
  parts.push({ k: "ell", x: 0.065, y: 0, rx: 0.075, ry: 0.048, paint: THORAX, gloss: 0.35 }); // mesonotum + propodeum
  parts.push({ k: "ell", x: 0.155, y: 0, rx: 0.065, ry: 0.06, paint: THORAX, gloss: 0.35 }); // pronotum

  // Mandibles under the head: working idly, or clamped on a crumb.
  const hx = 0.27 + big * 0.02;
  const hrx = 0.09 + big * 0.03;
  const hry = 0.085 + big * 0.035;
  const open = a.carry ? 0.05 : 0.2 + 0.15 * Math.sin(a.feel * 0.7);
  const jx = hx + hrx * 0.75;
  for (const side of SIDES) {
    const th = 0.55 - open;
    parts.push({
      k: "seg", x0: jx, y0: side * hry * 0.6, x1: jx + 0.12 * Math.cos(th), y1: side * (hry * 0.6 - 0.12 * Math.sin(th)),
      r0: 0.032, r1: 0.01, paint: JAW, gloss: 0.6,
    });
  }
  parts.push({ k: "ell", x: hx, y: 0, rx: hrx, ry: hry, paint: (u) => mix(HEAD, scale(HEAD, 0.7), Math.max(0, -u) * 0.5), gloss: 0.45 });
  for (const side of SIDES) {
    parts.push({ k: "ell", x: hx + 0.01, y: side * hry * 0.8, rx: 0.024, ry: 0.017, paint: EYE, gloss: 1.2 });
  }
  if (a.carry) parts.push({ k: "ell", x: jx + 0.11, y: 0, rx: 0.045, ry: 0.045, paint: a.carry, gloss: 0.2 });
  return { parts, strokes };
}

export class AntScene implements Scene {
  time = 0;
  pointer = { x: 0, y: 0, active: false };
  ants: Ant[] = [];
  foods: Food[] = [];
  private W = 0;
  private H = 0;
  private cw = 10;
  private ch = 14;
  private cols = 0;
  private rows = 0;
  /** Food-trail pheromone per grid cell. */
  private pher = new Float32Array(0);
  private nest = { x: 0, y: 0, r: 0 };
  private baseL = 200;
  private nextId = 1;

  resize(width: number, height: number, cw: number, ch: number) {
    const first = this.W === 0;
    this.W = width;
    this.H = height;
    this.cw = cw;
    this.ch = ch;
    const cols = Math.ceil(width / cw);
    const rows = Math.ceil(height / ch);
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols;
      this.rows = rows;
      this.pher = new Float32Array(cols * rows);
    }
    this.baseL = clamp(Math.min(width, height) * 0.14, 70, 140);
    this.nest = { x: width / 2, y: height * 0.55, r: clamp(Math.min(width, height) * 0.06, 36, 64) };
    if (first) {
      const n = clamp(Math.round((width * height) / (this.baseL ** 2 * 4.5)), 10, 24);
      for (let i = 0; i < n; i++) this.spawn(i % 8 === 0);
    }
  }

  click(x: number, y: number) {
    for (const f of this.foods) {
      if (Math.hypot(f.x - x, f.y - y) < this.foodR(f) + 10) {
        f.amount = Math.min(60, f.amount + 12);
        return;
      }
    }
    this.foods.push({ x, y, amount: 12, rgb: FOODS[Math.floor(Math.random() * FOODS.length)] });
  }

  step(dt: number) {
    this.time += dt;
    for (const a of this.ants) this.stepAnt(a, dt);
    this.jostle();
    const fade = Math.exp(-dt / 28);
    for (let i = 0; i < this.pher.length; i++) this.pher[i] *= fade;
    if (this.foods.some((f) => f.amount <= 0)) this.foods = this.foods.filter((f) => f.amount > 0);
  }

  draw(r: Renderer) {
    const { pher, cols, cw, ch } = this;
    for (let i = 0; i < pher.length; i++) {
      const p = pher[i];
      if (p > 0.05) r.putCell(i % cols, (i / cols) | 0, p > 0.45 ? ":" : ".", scale(TRAIL, 0.25 + 0.55 * p));
    }
    for (const f of this.foods) {
      const R = this.foodR(f);
      for (let row = Math.floor((f.y - R) / ch); row <= Math.floor((f.y + R) / ch); row++) {
        for (let col = Math.floor((f.x - R) / cw); col <= Math.floor((f.x + R) / cw); col++) {
          const d = Math.hypot((col + 0.5) * cw - f.x, (row + 0.5) * ch - f.y) / R;
          const h = hash3(col, row, 77);
          if (d < 0.7) r.putCell(col, row, "@%#&8"[Math.floor(h * 5)], scale(f.rgb, 0.3), scale(f.rgb, 0.55 + 0.45 * h));
          else if (d < 1 && h < 0.6) r.putCell(col, row, ".:'"[Math.floor(h * 5) % 3], scale(f.rgb, 0.8));
        }
      }
    }
    for (const a of this.ants) r.bug(antFigure(a), { x: a.x, y: a.y, heading: a.heading, L: a.L, id: a.id });
  }

  /** Bare soil, with the nest entrance and its ring of excavated grains. */
  ground(col: number, row: number): [string, RGB] | null {
    const { nest, cw, ch } = this;
    const d = Math.hypot((col + 0.5) * cw - nest.x, ((row + 0.5) * ch - nest.y) * 1.15) / nest.r;
    const h = hash3(col, row, 101);
    if (d < 0.5) return null;
    if (d < 1.7 && h < 0.95 - (d - 0.5) * 0.45) {
      return ["%#:;.,"[Math.min(5, Math.floor((d - 0.5) * 3.5 + h * 1.5))], [160 - d * 34, 110 - d * 24, 66 - d * 14]];
    }
    if (h < 0.06) return [".,'`"[Math.floor(h * 66) % 4], [74, 54, 38]];
    return null;
  }

  /** Loops from well inside the scene to well beyond its edges. */
  private pickOrbit() {
    return rand(0.2, 0.62) * Math.min(this.W, this.H);
  }

  private foodR(f: Food) {
    return this.cw * (1.2 + Math.sqrt(f.amount) * 0.7);
  }

  private spawn(major: boolean) {
    // Scattered over the scene, already out exploring.
    const a = rand(0, TAU);
    const r = this.pickOrbit();
    this.ants.push({
      id: this.nextId++,
      x: this.W / 2 + Math.cos(a) * r * (this.W / Math.min(this.W, this.H)),
      y: this.H / 2 + Math.sin(a) * r,
      heading: a + Math.PI / 2,
      speed: 0,
      L: this.baseL * (major ? 1.25 : rand(0.8, 1)),
      major,
      state: "explore",
      target: null,
      memory: null,
      carry: null,
      gait: rand(0, TAU),
      wander: 0,
      feel: rand(0, TAU),
      pauseUntil: 0,
      greetAt: this.time + 3,
      orbitR: r,
      orbitDir: this.nextId % 2 ? 1 : -1,
    });
    // Smaller ants draw first so the big ones walk over them.
    this.ants.sort((p, q) => p.L - q.L);
  }

  private stepAnt(a: Ant, dt: number) {
    const { nest, time } = this;
    const L = a.L;
    a.feel += dt * (time < a.pauseUntil ? 9 : 4);
    if (time < a.pauseUntil) {
      a.speed *= Math.exp(-dt * 10);
      return;
    }
    const hx = a.x + Math.cos(a.heading) * L * 0.4;
    const hy = a.y + Math.sin(a.heading) * L * 0.4;
    let dx = Math.cos(a.heading);
    let dy = Math.sin(a.heading);
    a.wander = clamp(a.wander + (Math.random() - 0.5) * dt * 5, -0.8, 0.8);
    dx += Math.cos(a.heading + a.wander) * 0.6;
    dy += Math.sin(a.heading + a.wander) * 0.6;

    if (a.state === "home") {
      const tx = nest.x - a.x;
      const ty = nest.y - a.y;
      const d = Math.hypot(tx, ty) || 1;
      dx += (tx / d) * 2.5;
      dy += (ty / d) * 2.5;
      if (a.carry) {
        const i = this.cellIndex(a.x, a.y);
        if (i >= 0) this.pher[i] = Math.min(1, this.pher[i] + dt * 2);
      }
      if (Math.hypot(hx - nest.x, hy - nest.y) < nest.r * 1.3) {
        a.carry = null;
        const back = a.memory && a.memory.amount > 0 ? a.memory : null;
        a.state = back ? "toFood" : "explore";
        a.target = back;
        a.heading += Math.PI + rand(-0.4, 0.4);
        a.pauseUntil = time + rand(0.4, 0.8);
        return;
      }
    } else if (a.state === "toFood") {
      const f = a.target;
      if (!f || f.amount <= 0) {
        a.state = "explore";
        a.target = null;
      } else {
        const tx = f.x - hx;
        const ty = f.y - hy;
        const d = Math.hypot(tx, ty) || 1;
        dx += (tx / d) * 2.5;
        dy += (ty / d) * 2.5;
        if (d < this.foodR(f) * 0.8 + 4) {
          f.amount--;
          a.carry = f.rgb;
          a.memory = f;
          a.state = "home";
          a.pauseUntil = time + rand(0.3, 0.6);
          return;
        }
      }
    } else {
      const smell = L * 1.6 + 160;
      let best: Food | null = null;
      let bd = smell;
      for (const f of this.foods) {
        const d = Math.hypot(f.x - a.x, f.y - a.y);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      if (best) {
        a.state = "toFood";
        a.target = best;
      } else {
        // Follow food trails, preferring the way that leads away from the nest.
        let bestScore = 0.04;
        let bestA = 0;
        for (const off of [-0.6, 0, 0.6]) {
          const ang = a.heading + off;
          const sx = a.x + Math.cos(ang) * L * 0.5;
          const sy = a.y + Math.sin(ang) * L * 0.5;
          const i = this.cellIndex(sx, sy);
          if (i < 0) continue;
          const away = (Math.cos(ang) * (sx - nest.x) + Math.sin(ang) * (sy - nest.y)) / (Math.hypot(sx - nest.x, sy - nest.y) || 1);
          const score = this.pher[i] * (1 + 0.8 * away);
          if (score > bestScore) {
            bestScore = score;
            bestA = ang;
          }
        }
        if (bestScore > 0.04) {
          dx += Math.cos(bestA) * 2;
          dy += Math.sin(bestA) * 2;
        }
        // Explore like the sharks patrol: a loop round the scene that runs out past the edges and back.
        const [px, py] = patrol(a.x, a.y, this.W, this.H, a.orbitR * (1 + 0.15 * Math.sin(time * 0.07 + a.id)), a.orbitDir);
        dx += px * 0.8;
        dy += py * 0.8;
        if (Math.random() < dt / 30) a.orbitR = this.pickOrbit();
      }
    }

    a.heading = steer(a.heading, Math.atan2(dy, dx), 2.8 * dt);
    const cruise = (52 + L * 0.18) * (a.carry ? 0.85 : 1);
    a.speed += (cruise - a.speed) * Math.min(1, dt * 3);
    a.x += Math.cos(a.heading) * a.speed * dt;
    a.y += Math.sin(a.heading) * a.speed * dt;
    a.gait += ((a.speed * dt) / (L * 0.3)) * Math.PI;
    if (reenter(a, this.W, this.H, 1.8)) a.orbitR = this.pickOrbit();
  }

  /** Keep bodies apart, and let ants that bump heads stop to touch antennae. */
  private jostle() {
    const { ants, time } = this;
    for (let i = 0; i < ants.length; i++) {
      for (let j = i + 1; j < ants.length; j++) {
        const a = ants[i];
        const b = ants[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-3;
        const min = (a.L + b.L) * 0.25;
        if (d < min) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
        const head = Math.hypot(
          a.x + Math.cos(a.heading) * a.L * 0.35 - b.x - Math.cos(b.heading) * b.L * 0.35,
          a.y + Math.sin(a.heading) * a.L * 0.35 - b.y - Math.sin(b.heading) * b.L * 0.35,
        );
        if (head < (a.L + b.L) * 0.18 && time > a.greetAt && time > b.greetAt) {
          a.pauseUntil = b.pauseUntil = time + rand(0.4, 0.7);
          a.greetAt = b.greetAt = time + rand(8, 14);
        }
      }
    }
  }

  private cellIndex(x: number, y: number) {
    const c = Math.floor(x / this.cw);
    const r = Math.floor(y / this.ch);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }
}
