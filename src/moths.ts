/**
 * Moths around a lamp: atlas, luna, polyphemus, death's-head hawkmoth and
 * rosy maple moths, with a cloud of tiny moths. Two modes:
 *
 *   fly    Wings beat and the moths circle the lamp. They hold a steady angle
 *          to the light, so each one spirals into an orbit, now and then dives
 *          in and bonks the bulb. The cursor is a second, weaker light.
 *          Click to move the lamp.
 *   crawl  They land, fold their wings back into a resting delta and walk in
 *          short bursts on six legs. A cursor near one freezes it; clicking
 *          one makes it flash its wings open to show its eyespots.
 */
import { limb, mix, scale, SIDES, tripod } from "./anatomy";
import type { Scene } from "./engine";
import { clamp, edgePull, hash3, rand, steer, TAU } from "./math";
import { FUZZ, WING, type Figure, type Paint, type Part, type Renderer, type RGB, type Stroke } from "./render";

export type MothKind = "luna" | "rosy" | "polyphemus" | "atlas" | "deathshead";
export type MothMode = "fly" | "crawl";

// Wing outlines in wing space: u toward the head, v outward from the hinge.
const SAT_FORE = [0.03, 0, 0.05, 0.16, 0.06, 0.32, 0.05, 0.46, 0, 0.47, -0.07, 0.41, -0.12, 0.31, -0.14, 0.2, -0.12, 0.1, -0.07, 0.02, -0.02, 0];
const SAT_HIND = [-0.02, 0, -0.05, 0.15, -0.1, 0.27, -0.17, 0.32, -0.25, 0.3, -0.31, 0.22, -0.33, 0.12, -0.29, 0.04, -0.2, 0];
const LUNA_HIND = [-0.02, 0, -0.05, 0.15, -0.1, 0.27, -0.17, 0.3, -0.24, 0.27, -0.3, 0.2, -0.42, 0.17, -0.56, 0.16, -0.62, 0.13, -0.55, 0.1, -0.4, 0.07, -0.3, 0.03, -0.2, 0];
const ATLAS_FORE = [0.03, 0, 0.05, 0.16, 0.07, 0.32, 0.1, 0.44, 0.12, 0.5, 0.06, 0.52, 0, 0.5, -0.07, 0.42, -0.13, 0.31, -0.15, 0.19, -0.12, 0.08, -0.06, 0.01, -0.02, 0];
const HAWK_FORE = [0.03, 0, 0.05, 0.18, 0.04, 0.36, 0, 0.47, -0.04, 0.46, -0.07, 0.33, -0.08, 0.18, -0.07, 0.06, -0.03, 0];
const HAWK_HIND = [-0.02, 0, -0.05, 0.1, -0.08, 0.2, -0.12, 0.24, -0.17, 0.2, -0.18, 0.1, -0.13, 0.02, -0.06, 0];

/** Concentric rings (eyespots) centred at (cu, cv), innermost colour first. */
function rings(u: number, v: number, cu: number, cv: number, r: number, colors: RGB[]): RGB | null {
  const d = Math.hypot(u - cu, v - cv) / r;
  return d < 1 ? colors[Math.floor(d * colors.length)] : null;
}

/** Distance in from the forewing's outer margin, for bands that follow it. */
const margin = (u: number, v: number) => (u - 0.05) * 0.807 - (v - 0.46) * 0.59;

/** Faint veins radiating from the wing hinge. */
const veins = (u: number, v: number, base: RGB): RGB =>
  Math.abs(Math.sin(Math.atan2(v, 0.03 - u) * 8)) < 0.1 ? scale(base, 0.8) : base;

const banded = (base: RGB) => (u: number): RGB => (((u + 1) * 3.5) % 1 < 0.2 ? scale(base, 0.7) : base);

const LUNA: RGB = [168, 226, 150];
const LUNA_EYE: RGB[] = [[236, 240, 220], [216, 186, 76], [120, 64, 86]];
const PINK: RGB = [236, 112, 164];
const YELLOW: RGB = [248, 222, 112];
const TAN: RGB = [188, 142, 96];
const TAN_EDGE: RGB = [148, 106, 72];
const RUST: RGB = [168, 72, 42];
const RUST_EDGE: RGB = [118, 68, 50];
const PALE_LINE: RGB = [228, 166, 152];
const WINDOW: RGB = [240, 236, 226];
const DARK: RGB = [36, 28, 24];

interface Look {
  scale: number;
  /** Forewing sweep at rest (radians folded back); flight is ~0. */
  rest: number;
  fore: readonly number[];
  hind: readonly number[];
  forePaint: Paint;
  hindPaint: Paint;
  thorax: Paint;
  abdomen: Paint;
  /** Abdomen half-length and half-width. */
  belly: [number, number];
  head: RGB;
  antenna: RGB;
  feathered: boolean;
  legs: RGB;
}

const LOOKS: Record<MothKind, Look> = {
  // Luna: pale green, a purple leading edge, small eyespots and long trailing tails.
  luna: {
    scale: 1, rest: 0.75, fore: SAT_FORE, hind: LUNA_HIND,
    forePaint: (u, v) => (u > -0.012 + 0.08 * v && v < 0.44 ? [132, 74, 98] : rings(u, v, -0.05, 0.25, 0.034, LUNA_EYE) ?? veins(u, v, LUNA)),
    hindPaint: (u, v) =>
      rings(u, v, -0.16, 0.18, 0.034, LUNA_EYE) ??
      (u < -0.38 ? mix(LUNA, [226, 214, 120], clamp((-u - 0.38) / 0.2, 0, 1)) : veins(u, v, LUNA)),
    thorax: [236, 236, 226], abdomen: banded([226, 232, 212]), belly: [0.14, 0.045],
    head: [222, 222, 210], antenna: [186, 154, 92], feathered: true, legs: [200, 150, 160],
  },
  // Rosy maple: pink with a broad yellow band, fuzzy yellow body.
  rosy: {
    scale: 0.62, rest: 1, fore: SAT_FORE, hind: SAT_HIND,
    forePaint: (u, v) => {
      const s = margin(u, v);
      return s > 0.07 && s < 0.17 ? YELLOW : PINK;
    },
    hindPaint: (u, v) => mix(YELLOW, PINK, clamp(Math.hypot(u, v) / 0.35, 0, 1) * 0.45),
    thorax: [246, 214, 90], abdomen: banded([246, 214, 110]), belly: [0.14, 0.05],
    head: [240, 150, 180], antenna: [230, 130, 170], feathered: true, legs: [236, 130, 170],
  },
  // Polyphemus: tan, a small forewing eyespot and a big blue-ringed one on each hindwing.
  polyphemus: {
    scale: 1, rest: 0.85, fore: SAT_FORE, hind: SAT_HIND,
    forePaint: (u, v) => {
      const s = margin(u, v);
      return rings(u, v, -0.04, 0.26, 0.026, [[240, 236, 210], [228, 190, 70], [60, 40, 30]]) ??
        (s < 0.04 ? TAN_EDGE : Math.abs(s - 0.065) < 0.01 ? [232, 196, 186] : veins(u, v, TAN));
    },
    hindPaint: (u, v) =>
      rings(u, v, -0.17, 0.17, 0.08, [[236, 232, 206], [232, 192, 66], [96, 116, 160], DARK, DARK]) ??
      (Math.hypot(u + 0.02, v) > 0.27 ? TAN_EDGE : veins(u, v, TAN)),
    thorax: [172, 122, 82], abdomen: banded([178, 132, 92]), belly: [0.14, 0.048],
    head: [160, 112, 76], antenna: [196, 156, 92], feathered: true, legs: [150, 106, 74],
  },
  // Atlas: rust red, white windows, wavy pale lines, and forewing tips patterned like a snake's head.
  atlas: {
    scale: 1.2, rest: 0.6, fore: ATLAS_FORE, hind: SAT_HIND,
    forePaint: (u, v) => {
      if (u > 0.04 && v > 0.4) return (u - 0.075) ** 2 + (v - 0.47) ** 2 < 0.0007 ? DARK : [218, 178, 96];
      if (((u + 0.05) / 0.03) ** 2 + ((v - 0.22) / 0.05) ** 2 < 1) return WINDOW;
      const s = margin(u, v);
      if (Math.abs(s - 0.09 - 0.012 * Math.sin(v * 50)) < 0.01) return PALE_LINE;
      return s < 0.035 ? RUST_EDGE : veins(u, v, RUST);
    },
    hindPaint: (u, v) => {
      if (((u + 0.15) / 0.035) ** 2 + ((v - 0.14) / 0.04) ** 2 < 1) return WINDOW;
      const r = Math.hypot(u + 0.02, v);
      if (Math.abs(r - 0.22 - 0.01 * Math.sin(Math.atan2(v, u) * 12)) < 0.01) return PALE_LINE;
      return r > 0.27 ? RUST_EDGE : veins(u, v, RUST);
    },
    thorax: [150, 72, 46], abdomen: banded([176, 84, 52]), belly: [0.15, 0.05],
    head: [140, 66, 44], antenna: [196, 136, 74], feathered: true, legs: [150, 80, 54],
  },
  // Death's-head hawkmoth: narrow mottled forewings, banded yellow hindwings and abdomen,
  // and the pale skull on its back.
  deathshead: {
    scale: 0.85, rest: 1.25, fore: HAWK_FORE, hind: HAWK_HIND,
    forePaint: (u, v) =>
      (u + 0.04) ** 2 + (v - 0.2) ** 2 < 0.0005
        ? [210, 190, 150]
        : mix([62, 52, 46], [132, 112, 84], hash3(Math.round(u * 28), Math.round(v * 22), 4) * 0.7),
    hindPaint: (u, v) => {
      const r = Math.hypot(u + 0.02, v);
      return Math.abs(r - 0.11) < 0.016 || Math.abs(r - 0.17) < 0.018 || r > 0.215 ? DARK : [230, 188, 50];
    },
    thorax: (u, v) => {
      if (Math.hypot(u - 0.15, Math.abs(v) - 0.28) < 0.2) return [60, 46, 40];
      return u > -0.5 && u < 0.65 && Math.abs(v) < 0.62 ? [226, 206, 152] : [70, 56, 46];
    },
    abdomen: (u, v) => (Math.abs(v) < 0.22 ? [92, 98, 124] : ((u + 1) * 3.2) % 1 < 0.5 ? [232, 190, 54] : DARK),
    belly: [0.19, 0.055],
    head: [70, 56, 46], antenna: [110, 96, 80], feathered: false, legs: [96, 82, 70],
  },
};

const ALL_KINDS: MothKind[] = ["atlas", "luna", "polyphemus", "deathshead", "rosy", "rosy"];

const LEGS = [
  { x: 0.12, a: 0.7, len: [0.07, 0.08, 0.05], bend: [0, 0.4, 0.25] },
  { x: 0.09, a: -0.1, len: [0.08, 0.09, 0.06], bend: [0, -0.35, -0.2] },
  { x: 0.06, a: -0.7, len: [0.09, 0.1, 0.07], bend: [0, -0.35, -0.15] },
] as const;

interface Moth {
  id: number;
  look: Look;
  x: number;
  y: number;
  heading: number;
  speed: number;
  L: number;
  /** 0 perched → 1 flying. */
  lift: number;
  /** 0 → 1 while flashing the wings open in alarm. */
  flash: number;
  flashUntil: number;
  flapPhase: number;
  wander: number;
  /** Which way round the light it circles. */
  orbit: 1 | -1;
  orbitR: number;
  gait: number;
  feel: number;
  takeoffAt: number;
  restUntil: number;
  walkUntil: number;
}

/** A tiny moth: one glyph fluttering round the lamp. */
interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  r: number;
  side: 1 | -1;
}

function mothFigure(m: Moth, t: number): Figure {
  const k = m.look;
  const parts: Part[] = [];
  const strokes: Stroke[] = [];
  const open = Math.max(m.lift, m.flash);
  // In flight the forewings reach slightly forward.
  const sweep = k.rest + (-0.12 - k.rest) * open;
  const beat = 0.15 + 0.85 * Math.abs(Math.cos(m.flapPhase));
  let flap = 1 - (1 - beat) * m.lift;
  if (m.flash > 0) flap *= 1 - 0.1 * m.flash * (0.5 + 0.5 * Math.sin(t * 45));

  if (m.lift < 0.6) {
    const walking = clamp(m.speed / (m.L * 0.03), 0, 1);
    for (let i = 0; i < 3; i++) {
      for (const side of SIDES) {
        const [swing] = tripod(m.gait, i, side);
        const leg = LEGS[i];
        limb(strokes, leg.x, 0.03, side, leg.a + swing * 0.3 * walking, leg.len, leg.bend, k.legs, undefined, 1 - m.lift * 1.5);
      }
    }
  }
  for (const side of SIDES) {
    const a = 1.05 + 0.1 * Math.sin(m.feel + side * 1.7) - 0.3 * m.lift;
    limb(strokes, 0.17, 0.02, side, a, [k.feathered ? 0.11 : 0.13], [0], k.antenna, k.feathered ? "#" : undefined);
  }

  // Perched, the wings cover the abdomen; in flight it shows between the hindwings.
  const [blen, bwid] = k.belly;
  const abdomen: Part = { k: "ell", x: 0.04 - blen, y: 0, rx: blen, ry: bwid, paint: k.abdomen, ramp: FUZZ };
  if (m.lift < 0.5) parts.push(abdomen);
  for (const side of SIDES) parts.push({ k: "wing", poly: k.hind, x: 0.05, side, sweep: sweep * 1.08, flap, paint: k.hindPaint, ramp: WING });
  for (const side of SIDES) parts.push({ k: "wing", poly: k.fore, x: 0.1, side, sweep, flap, paint: k.forePaint, ramp: WING });
  if (m.lift >= 0.5) parts.push(abdomen);
  parts.push({ k: "ell", x: 0.08, y: 0, rx: 0.07, ry: 0.055, paint: k.thorax, ramp: FUZZ });
  parts.push({ k: "ell", x: 0.155, y: 0, rx: 0.035, ry: 0.045, paint: k.head, ramp: FUZZ });
  for (const side of SIDES) parts.push({ k: "ell", x: 0.165, y: side * 0.035, rx: 0.017, ry: 0.017, paint: DARK, gloss: 1 });
  return { parts, strokes };
}

export class MothScene implements Scene {
  time = 0;
  pointer = { x: 0, y: 0, active: false };
  moths: Moth[] = [];
  motes: Mote[] = [];
  /** Lamp position as a fraction of the canvas, so it survives resizes. */
  lamp = { fx: 0.5, fy: 0.45 };
  private W = 0;
  private H = 0;
  private cw = 10;
  private ch = 14;

  constructor(private kinds: MothKind[] = ALL_KINDS, public mode: MothMode = "fly") {
    this.kinds = kinds.filter((k) => k in LOOKS);
    if (!this.kinds.length) this.kinds = ALL_KINDS;
  }

  setMode(mode: MothMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    for (const m of this.moths) {
      m.takeoffAt = this.time + rand(0, 1.5);
      // Moths out on a wide swing come back in to land.
      if (mode === "crawl") m.orbitR = Math.min(m.orbitR, 0.42 * Math.min(this.W, this.H) + m.L * 0.35);
    }
  }

  private get lx() {
    return this.lamp.fx * this.W;
  }

  private get ly() {
    return this.lamp.fy * this.H;
  }

  private get bulbR() {
    return this.cw * 1.6;
  }

  resize(width: number, height: number, cw: number, ch: number) {
    const first = this.W === 0;
    this.W = width;
    this.H = height;
    this.cw = cw;
    this.ch = ch;
    if (first) this.seed();
  }

  private seed() {
    const { W, H } = this;
    const minSide = Math.min(W, H);
    const baseL = clamp(minSide * 0.34, 130, 320);
    const flying = this.mode === "fly";
    this.moths = this.kinds.map((kind, i) => {
      const look = LOOKS[kind];
      const L = baseL * look.scale;
      const a = rand(0, TAU);
      const r = rand(0.15, 0.4) * minSide + L * 0.3;
      const m: Moth = {
        id: i + 1, look, L, speed: 0, lift: flying ? 1 : 0, flash: 0, flashUntil: 0,
        x: flying ? this.lx + Math.cos(a) * r : rand(L * 0.4, W - L * 0.4),
        y: flying ? this.ly + Math.sin(a) * r : rand(L * 0.4, H - L * 0.4),
        heading: a + Math.PI / 2, flapPhase: rand(0, TAU), wander: 0,
        orbit: Math.random() < 0.5 ? 1 : -1, orbitR: 0, gait: rand(0, TAU), feel: rand(0, TAU),
        takeoffAt: 0, restUntil: 0, walkUntil: rand(1, 4),
      };
      m.orbitR = this.pickOrbit(m);
      return m;
    });
    const n = clamp(Math.round((W * H) / 26000), 15, 50);
    this.motes = [];
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const r = rand(0.05, 0.3) * minSide;
      this.motes.push({
        x: this.lx + Math.cos(a) * r, y: this.ly + Math.sin(a) * r, vx: 0, vy: 0,
        phase: rand(0, TAU), r, side: Math.random() < 0.5 ? 1 : -1,
      });
    }
  }

  private pickOrbit(m: Moth) {
    // Mostly loops round the lamp; sometimes a dive at the bulb, or a wide swing out past the edges.
    const r = Math.random();
    if (r < 0.2) return m.L * 0.35;
    if (r < 0.35) return rand(0.6, 0.9) * Math.max(this.W, this.H);
    return rand(0.12, 0.42) * Math.min(this.W, this.H) + m.L * 0.35;
  }

  click(x: number, y: number) {
    if (this.mode === "fly") {
      this.lamp = { fx: clamp(x / this.W, 0.05, 0.95), fy: clamp(y / this.H, 0.05, 0.95) };
      return;
    }
    let best: Moth | null = null;
    let bd = Infinity;
    for (const m of this.moths) {
      const d = Math.hypot(m.x - x, m.y - y);
      if (m.lift < 0.3 && d < m.L * 0.55 && d < bd) {
        bd = d;
        best = m;
      }
    }
    if (best) best.flashUntil = this.time + 1.6;
  }

  step(dt: number) {
    this.time += dt;
    const fly = this.mode === "fly";
    for (const m of this.moths) {
      // A moth told to land keeps flying until it's back over the screen.
      const away = m.x < 0 || m.y < 0 || m.x > this.W || m.y > this.H;
      const up = fly ? this.time >= m.takeoffAt : away && m.lift > 0;
      m.lift = clamp(m.lift + (up ? dt * 1.2 : -dt * 0.7), 0, 1);
      m.flash = clamp(m.flash + (this.time < m.flashUntil ? dt * 6 : -dt * 3), 0, 1);
      m.flapPhase += dt * (m.lift > 0.01 ? 14 : 0);
      m.feel += dt * 2.2;
      if (m.lift > 0.3) this.flyStep(m, dt);
      else this.crawlStep(m, dt);
    }
    this.jostle();
    this.stepMotes(dt);
  }

  private flyStep(m: Moth, dt: number) {
    const L = m.L;
    let lx = this.lx;
    let ly = this.ly;
    let orbitR = m.orbitR;
    let lamp = true;
    const p = this.pointer;
    if (p.active && Math.hypot(p.x - m.x, p.y - m.y) < 260) {
      lx = p.x;
      ly = p.y;
      orbitR = L * 0.5;
      lamp = false;
    }
    const tx = lx - m.x;
    const ty = ly - m.y;
    const d = Math.hypot(tx, ty) || 1;
    m.wander = clamp(m.wander + (Math.random() - 0.5) * dt * 10, -1.2, 1.2);
    // Hold an angle to the light: tangent at the orbit, cutting in from outside, out from inside.
    const off = clamp((d - orbitR) / orbitR, -1, 1);
    const want = Math.atan2(ty, tx) + m.orbit * (Math.PI / 2 - 1.1 * off) + m.wander * 0.5;
    let dx = Math.cos(want);
    let dy = Math.sin(want);
    for (const o of this.moths) {
      if (o === m || o.lift < 0.3) continue;
      const ox = m.x - o.x;
      const oy = m.y - o.y;
      const od = Math.hypot(ox, oy) || 1;
      const min = (m.L + o.L) * 0.4;
      if (od < min) {
        dx += (ox / od) * (1 - od / min) * 3;
        dy += (oy / od) * (1 - od / min) * 3;
      }
    }
    if (lamp && d < this.bulbR + L * 0.15) {
      // Bonk.
      m.heading = Math.atan2(-ty, -tx) + rand(-0.8, 0.8);
      m.speed = L * 1.6;
      m.orbitR = this.pickOrbit(m);
    } else {
      m.heading = steer(m.heading, Math.atan2(dy, dx), 4.5 * dt);
    }
    if (Math.random() < dt * 0.07) m.orbit = m.orbit === 1 ? -1 : 1;
    if (Math.random() < dt * 0.1) m.orbitR = this.pickOrbit(m);
    const target = L * (0.85 + 0.35 * Math.sin(this.time * 1.3 + m.id * 2)) * m.lift;
    m.speed += (target - m.speed) * Math.min(1, dt * 2);
    m.x += Math.cos(m.heading) * m.speed * dt;
    m.y += Math.sin(m.heading) * m.speed * dt;
  }

  private crawlStep(m: Moth, dt: number) {
    const { time, W, H } = this;
    const L = m.L;
    if (time > m.walkUntil) {
      m.restUntil = time + rand(2, 6);
      m.walkUntil = m.restUntil + rand(2, 5);
    }
    const p = this.pointer;
    const spooked = (p.active && Math.hypot(p.x - m.x, p.y - m.y) < L * 0.6) || time < m.flashUntil;
    const resting = time < m.restUntil || spooked;
    m.wander = clamp(m.wander + (Math.random() - 0.5) * dt * 2, -0.6, 0.6);
    let dx = Math.cos(m.heading + m.wander);
    let dy = Math.sin(m.heading + m.wander);
    const [ex, ey] = edgePull(m.x, m.y, W, H, L);
    dx += ex;
    dy += ey;
    if (!resting) m.heading = steer(m.heading, Math.atan2(dy, dx), 1.2 * dt);
    const target = resting ? 0 : L * 0.07;
    m.speed += (target - m.speed) * Math.min(1, dt * (m.lift > 0 ? 1.5 : 4));
    m.x += Math.cos(m.heading) * m.speed * dt;
    m.y += Math.sin(m.heading) * m.speed * dt;
    m.gait += ((m.speed * dt) / (L * 0.12)) * Math.PI;
  }

  /** Perched moths don't stack on top of each other. */
  private jostle() {
    const { moths } = this;
    for (let i = 0; i < moths.length; i++) {
      for (let j = i + 1; j < moths.length; j++) {
        const a = moths[i];
        const b = moths[j];
        if (a.lift > 0.3 || b.lift > 0.3) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-3;
        const min = (a.L + b.L) * 0.35;
        if (d < min) {
          const push = Math.min(2, (min - d) / 2);
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }
    }
  }

  private stepMotes(dt: number) {
    const fly = this.mode === "fly";
    const { lx, ly } = this;
    for (const mo of this.motes) {
      if (fly) {
        const tx = lx - mo.x;
        const ty = ly - mo.y;
        const d = Math.hypot(tx, ty) || 1;
        const a = Math.atan2(ty, tx) + mo.side * (Math.PI / 2 - 0.9 * clamp((d - mo.r) / mo.r, -1, 1));
        mo.vx += (Math.cos(a) * 150 - mo.vx) * dt * 2 + (Math.random() - 0.5) * 900 * dt;
        mo.vy += (Math.sin(a) * 150 - mo.vy) * dt * 2 + (Math.random() - 0.5) * 900 * dt;
        mo.phase += dt * 30;
      } else {
        mo.vx *= Math.exp(-dt * 4);
        mo.vy *= Math.exp(-dt * 4);
      }
      mo.x += mo.vx * dt;
      mo.y += mo.vy * dt;
    }
  }

  draw(r: Renderer) {
    const { cw, ch, lx, ly, time: t } = this;
    // Lamplight: a bright bulb in a dotted halo.
    const R = Math.min(this.W, this.H) * 0.3;
    const flicker = 0.92 + 0.08 * Math.sin(t * 17) * Math.sin(t * 5.3);
    for (let row = Math.floor((ly - R) / ch); row <= Math.floor((ly + R) / ch); row++) {
      for (let col = Math.floor((lx - R) / cw); col <= Math.floor((lx + R) / cw); col++) {
        const dist = Math.hypot((col + 0.5) * cw - lx, (row + 0.5) * ch - ly);
        if (dist < this.bulbR) {
          r.putCell(col, row, dist < this.bulbR * 0.5 ? "@" : "*", [255, 250, 232], scale([255, 228, 150], flicker));
          continue;
        }
        const g = (1 - dist / R) ** 2 * flicker;
        if (g > 0.04 && hash3(col, row, 7) < 0.55) {
          r.putCell(col, row, g > 0.25 ? ":" : ".", [210 * g + 20, 165 * g + 16, 90 * g + 12]);
        }
      }
    }
    const fly = this.mode === "fly";
    for (const mo of this.motes) {
      const near = clamp(1 - Math.hypot(mo.x - lx, mo.y - ly) / R, 0, 1);
      r.putCell(Math.floor(mo.x / cw), Math.floor(mo.y / ch), fly && Math.sin(mo.phase) > 0 ? "v" : "^", scale([230, 220, 190], 0.45 + 0.55 * near));
    }
    this.moths.sort((p, q) => p.lift - q.lift || p.L - q.L);
    for (const m of this.moths) {
      r.bug(mothFigure(m, t), { x: m.x, y: m.y, heading: m.heading, L: m.L * (1 + 0.1 * m.lift), id: m.id, lift: m.lift });
    }
  }

  /** Night speckle. */
  ground(col: number, row: number): [string, RGB] | null {
    const h = hash3(col, row, 303);
    if (h < 0.0025) return ["+", [110, 120, 160]];
    if (h < 0.012) return [".", [60, 70, 100]];
    return null;
  }
}
