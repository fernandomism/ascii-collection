/**
 * Beetles on the forest floor: a flower chafer, a goliath, a stag, rhinoceros
 * and hercules beetles, a jewel beetle and a ladybird.
 *
 * Like the sharks, they never stop: each walks a lazy loop round the scene that
 * carries it out past the edges and back, in a tripod gait. Swarms of gnats drift
 * through like the sharks' fish. Click a beetle to startle it into flight: the
 * elytra lift, the hindwings unfold and it buzzes off to land elsewhere.
 */
import { dotted, limb, mix, SIDES, tripod } from "./anatomy";
import type { Scene } from "./engine";
import { Gnats } from "./gnats";
import { clamp, hash3, patrol, rand, reenter, smoothstep, steer, TAU } from "./math";
import type { Figure, Paint, Part, Renderer, RGB, Stroke } from "./render";

export type BeetleKind = "flower" | "goliath" | "stag" | "rhino" | "hercules" | "jewel" | "ladybug";

interface Look {
  /** Size relative to the biggest beetle. */
  scale: number;
  /** Walking speed in body lengths per second. */
  speed: number;
  /** [x, rx, ry] in body units; ely is one wing case, sitting at y = ±ry. */
  head: [number, number, number];
  pron: [number, number, number];
  ely: [number, number, number];
  headPaint: Paint;
  pronPaint: Paint;
  /** Wing-case pattern; v is mirrored so +v is always the outer edge. */
  elyPaint: (u: number, v: number) => RGB;
  under: RGB;
  leg: RGB;
  gloss: number;
  shimmer?: number;
  antenna: "club" | "elbow";
  horns?: (out: Part[], b: Beetle, t: number) => void;
}

interface Beetle {
  id: number;
  kind: BeetleKind;
  look: Look;
  x: number;
  y: number;
  heading: number;
  speed: number;
  L: number;
  gait: number;
  wander: number;
  feel: number;
  /** Its patrol loop round the scene (px) and which way round it walks. */
  orbitR: number;
  orbitDir: 1 | -1;
  /** Elytra 0 shut → 1 raised; lift 0 grounded → 1 airborne. */
  open: number;
  lift: number;
  flap: number;
  flyUntil: number;
}

const BLACK: RGB = [34, 30, 30];
const GOLD_HAIR: RGB = [214, 160, 74];
const MEMBRANE: RGB = [170, 150, 118];

const seg = (x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, paint: Paint, gloss: number): Part =>
  ({ k: "seg", x0, y0, x1, y1, r0, r1, paint, gloss });

// Hindwing, folded under the elytra until the beetle takes off.
const HINDWING = [0.03, 0, 0.06, 0.18, 0.06, 0.38, 0.02, 0.52, -0.04, 0.56, -0.1, 0.5, -0.13, 0.34, -0.12, 0.16, -0.07, 0.04, -0.02, 0];
const membrane = (u: number, v: number): RGB =>
  Math.abs(Math.sin(Math.atan2(v, u + 0.12) * 9)) < 0.18 ? [110, 92, 70] : MEMBRANE;

const LEGS = [
  { a: 0.75, len: [0.13, 0.15, 0.1], bend: [0, 0.4, 0.25] },
  { a: -0.1, len: [0.14, 0.16, 0.11], bend: [0, -0.35, -0.2] },
  { a: -0.6, len: [0.15, 0.19, 0.12], bend: [0, -0.35, -0.15] },
] as const;

const LOOKS: Record<BeetleKind, Look> = {
  // Rose chafer: compact metallic green, white flecks toward the rear.
  flower: {
    scale: 0.6, speed: 0.31,
    head: [0.31, 0.06, 0.075], pron: [0.19, 0.1, 0.16], ely: [-0.13, 0.3, 0.115],
    headPaint: [50, 140, 70], pronPaint: [56, 160, 78],
    elyPaint: (u, v) =>
      u < 0.2 && v > -0.4 && dotted(u, v, 0.32, 0.4, 5, 0.22) ? [236, 236, 224] : mix([46, 158, 76], [150, 168, 52], (1 - u) * 0.25),
    under: [40, 90, 50], leg: [90, 150, 90], gloss: 0.9, shimmer: 0.1, antenna: "club",
  },
  // Goliath: striped white-and-black pronotum, chestnut wing cases edged in white, a short Y horn.
  goliath: {
    scale: 1, speed: 0.2,
    head: [0.34, 0.065, 0.085], pron: [0.21, 0.12, 0.19], ely: [-0.15, 0.33, 0.13],
    headPaint: BLACK,
    pronPaint: (_u, v) => {
      const a = Math.abs(v);
      return a < 0.13 || (a > 0.42 && a < 0.56) || a > 0.86 ? BLACK : [228, 224, 210];
    },
    elyPaint: (u, v) => (v > 0.68 && u > -0.5) || (u < -0.72 && v > 0) ? [228, 222, 206] : [122, 62, 40],
    under: [60, 40, 30], leg: [120, 100, 90], gloss: 0.25, antenna: "club",
    horns: (out) => {
      out.push(seg(0.38, 0, 0.44, 0, 0.022, 0.015, BLACK, 0.6));
      for (const side of SIDES) out.push(seg(0.44, 0, 0.48, side * 0.032, 0.015, 0.006, BLACK, 0.6));
    },
  },
  // Stag beetle: a wide head carrying antler-like jaws, chestnut wing cases.
  stag: {
    scale: 1.1, speed: 0.22,
    head: [0.27, 0.085, 0.15], pron: [0.12, 0.095, 0.16], ely: [-0.22, 0.3, 0.11],
    headPaint: [62, 36, 28], pronPaint: [58, 34, 28], elyPaint: () => [128, 60, 36],
    under: [50, 30, 24], leg: [110, 70, 50], gloss: 0.5, antenna: "elbow",
    horns: (out, b, t) => {
      const open = 0.12 + 0.08 * Math.sin(b.feel);
      const jaw: RGB = [146, 66, 36];
      for (const side of SIDES) {
        const a = side * open * 0.35;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        // Points relative to the jaw hinge, opened outward by a.
        const P = (px: number, py: number): [number, number] => [0.33 + px * ca - py * side * sa, side * 0.075 + px * sa + py * side * ca];
        const [x0, y0] = P(0, 0);
        const [x1, y1] = P(0.2, 0.07);
        const [x2, y2] = P(0.36, 0.05);
        const [x3, y3] = P(0.45, -0.03);
        const [tx0, ty0] = P(0.23, 0.06);
        const [tx1, ty1] = P(0.27, 0);
        const [fx, fy] = P(0.43, 0.08);
        out.push(
          seg(x0, y0, x1, y1, 0.034, 0.026, jaw, 0.6),
          seg(x1, y1, x2, y2, 0.026, 0.017, jaw, 0.6),
          seg(x2, y2, x3, y3, 0.017, 0.007, jaw, 0.6),
          seg(tx0, ty0, tx1, ty1, 0.013, 0.004, jaw, 0.6), // inner tooth
          seg(x2, y2, fx, fy, 0.012, 0.004, jaw, 0.6), // forked tip
        );
      }
    },
  },
  // Japanese rhinoceros beetle: one long head horn forked at the tip, a nub on the pronotum.
  rhino: {
    scale: 1, speed: 0.2,
    head: [0.3, 0.065, 0.09], pron: [0.17, 0.13, 0.2], ely: [-0.17, 0.33, 0.13],
    headPaint: [92, 44, 30], pronPaint: [96, 46, 30], elyPaint: () => [116, 58, 36],
    under: [60, 32, 24], leg: [120, 66, 44], gloss: 0.8, antenna: "club",
    horns: (out) => {
      const c: RGB = [88, 42, 28];
      out.push(seg(0.22, 0, 0.29, 0, 0.03, 0.008, c, 0.8));
      out.push(seg(0.33, 0, 0.58, 0, 0.045, 0.028, c, 0.8), seg(0.58, 0, 0.7, 0, 0.028, 0.022, c, 0.8));
      for (const side of SIDES) out.push(seg(0.7, 0, 0.79, side * 0.05, 0.022, 0.008, c, 0.8));
    },
  },
  // Hercules beetle: glossy black front, a huge pronotal horn with a golden-haired underside,
  // and olive wing cases with black spots.
  hercules: {
    scale: 1.25, speed: 0.18,
    head: [0.28, 0.055, 0.08], pron: [0.17, 0.13, 0.19], ely: [-0.18, 0.34, 0.135],
    headPaint: BLACK, pronPaint: [40, 38, 40],
    elyPaint: (u, v) => (dotted(u, v, 0.34, 0.42, 3, 0.32) ? [44, 38, 30] : [188, 168, 98]),
    under: [40, 34, 30], leg: [80, 72, 66], gloss: 1.1, antenna: "club",
    horns: (out) => {
      const horn = (u: number, v: number): RGB => (Math.abs(v) > 0.6 && u > 0.15 ? GOLD_HAIR : [36, 34, 36]);
      out.push(
        seg(0.24, 0, 0.5, 0, 0.05, 0.036, horn, 1.1),
        seg(0.5, 0, 0.78, 0, 0.036, 0.022, horn, 1.1),
        seg(0.78, 0, 0.9, 0, 0.022, 0.006, horn, 1.1),
      );
      for (const side of SIDES) out.push(seg(0.42, side * 0.03, 0.46, side * 0.065, 0.013, 0.004, BLACK, 1));
    },
  },
  // Jewel beetle: slim and bullet-shaped, iridescent green running to copper, a red stripe.
  jewel: {
    scale: 0.75, speed: 0.35,
    head: [0.33, 0.045, 0.07], pron: [0.24, 0.08, 0.11], ely: [-0.15, 0.37, 0.085],
    headPaint: [40, 150, 110], pronPaint: (u) => mix([30, 160, 120], [200, 120, 50], (1 - u) * 0.3),
    elyPaint: (u, v) => {
      const base = mix([40, 170, 90], [210, 110, 50], (1 - u) / 2);
      return Math.abs(v - 0.1) < 0.2 ? mix(base, [210, 40, 70], 0.6) : base;
    },
    under: [40, 90, 70], leg: [70, 150, 120], gloss: 1, shimmer: 0.16, antenna: "club",
  },
  // Seven-spot ladybird.
  ladybug: {
    scale: 0.6, speed: 0.42,
    head: [0.25, 0.05, 0.09], pron: [0.18, 0.07, 0.17], ely: [-0.06, 0.27, 0.2],
    headPaint: BLACK, pronPaint: (u, v) => (Math.abs(v) > 0.55 && u > -0.3 ? [232, 230, 222] : BLACK),
    elyPaint: (u, v) => {
      for (const [su, sv] of [[0.3, 0.45], [-0.15, 0.05], [-0.55, 0.5], [0.7, -0.6]]) {
        if ((u - su) ** 2 + (v - sv) ** 2 < 0.09) return BLACK;
      }
      return [218, 40, 32];
    },
    under: BLACK, leg: [60, 56, 56], gloss: 1.3, antenna: "club",
  },
};

const ALL_KINDS = Object.keys(LOOKS) as BeetleKind[];

function beetleFigure(b: Beetle, t: number): Figure {
  const k = b.look;
  const [hx, hrx, hry] = k.head;
  const [px, prx, pry] = k.pron;
  const [ex, erx, ery] = k.ely;
  const parts: Part[] = [];
  const strokes: Stroke[] = [];
  const walking = clamp(b.speed / (b.L * 0.05), 0, 1);
  const tuck = b.lift;

  const hips: [number, number][] = [[px, pry * 0.55], [ex + erx * 0.72, ery * 0.85], [ex + erx * 0.35, ery * 0.9]];
  for (let i = 0; i < 3; i++) {
    for (const side of SIDES) {
      const [swing, lift] = tripod(b.gait, i, side);
      const leg = LEGS[i];
      limb(strokes, hips[i][0], hips[i][1], side, leg.a + swing * 0.3 * walking, leg.len, leg.bend, k.leg, undefined,
        (1 - 0.1 * lift * walking) * (1 - 0.4 * tuck));
    }
  }
  for (const side of SIDES) {
    const sway = 0.15 * Math.sin(b.feel + side + b.id);
    if (k.antenna === "elbow") limb(strokes, hx + hrx * 0.5, hry * 0.7, side, 0.6 + sway, [0.09, 0.07, 0.03], [0, 1, 0.2], k.leg, "%");
    else limb(strokes, hx + hrx * 0.7, hry * 0.55, side, 0.9 + sway, [0.07, 0.035], [0, 0.4], k.leg, "%");
  }

  if (b.open > 0.02) parts.push({ k: "ell", x: ex - 0.02, y: 0, rx: erx * 0.85, ry: ery * 1.5, paint: k.under, gloss: 0.3 });
  if (b.open > 0.3) {
    const beat = 0.25 + 0.75 * Math.abs(Math.cos(b.flap));
    for (const side of SIDES) {
      parts.push({
        k: "wing", poly: HINDWING, x: ex + erx * 0.75, side,
        sweep: 1.45 - 1.3 * smoothstep(0.3, 1, b.open), flap: 1 - (1 - beat) * b.lift,
        paint: membrane, ramp: ".:-=+",
      });
    }
  }
  // Wing cases hinge open at their front inner corners.
  const hingeX = ex + erx * 0.92;
  for (const side of SIDES) {
    const a = -side * b.open * 0.45;
    const ox = ex - hingeX;
    const oy = side * ery;
    parts.push({
      k: "ell", x: hingeX + ox * Math.cos(a) - oy * Math.sin(a), y: ox * Math.sin(a) + oy * Math.cos(a),
      rx: erx, ry: ery, a, paint: (u, v) => k.elyPaint(u, v * side), gloss: k.gloss,
    });
  }
  parts.push({ k: "ell", x: hx, y: 0, rx: hrx, ry: hry, paint: k.headPaint, gloss: k.gloss });
  for (const side of SIDES) parts.push({ k: "ell", x: hx + hrx * 0.1, y: side * hry * 0.8, rx: 0.025, ry: 0.02, paint: BLACK, gloss: 1.2 });
  parts.push({ k: "ell", x: px, y: 0, rx: prx, ry: pry, paint: k.pronPaint, gloss: k.gloss });
  k.horns?.(parts, b, t);
  return { parts, strokes };
}

export class BeetleScene implements Scene {
  time = 0;
  pointer = { x: 0, y: 0, active: false };
  beetles: Beetle[] = [];
  gnats = new Gnats();
  private W = 0;
  private H = 0;
  private cw = 10;
  private ch = 14;

  constructor(private kinds: BeetleKind[] = ALL_KINDS) {
    this.kinds = kinds.filter((k) => k in LOOKS);
    if (!this.kinds.length) this.kinds = ALL_KINDS;
  }

  resize(width: number, height: number, cw: number, ch: number) {
    const first = this.W === 0;
    this.W = width;
    this.H = height;
    this.cw = cw;
    this.ch = ch;
    if (first) {
      this.seed();
      this.gnats.seed(width, height);
    }
  }

  private seed() {
    const { W, H } = this;
    const baseL = clamp(Math.min(W, H) * 0.28, 120, 280);
    this.beetles = [];
    this.kinds.forEach((kind, i) => {
      const look = LOOKS[kind];
      const L = baseL * look.scale;
      // Scatter without overlaps where there's room.
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 40; tries++) {
        x = rand(L * 0.5, Math.max(L * 0.5, W - L * 0.5));
        y = rand(L * 0.5, Math.max(L * 0.5, H - L * 0.5));
        if (this.beetles.every((o) => Math.hypot(o.x - x, o.y - y) > (o.L + L) * 0.45)) break;
      }
      const b: Beetle = {
        id: i + 1, kind, look, x, y, heading: rand(0, TAU), speed: 0, L,
        gait: rand(0, TAU), wander: 0, feel: rand(0, TAU),
        orbitR: 0, orbitDir: i % 2 ? -1 : 1, open: 0, lift: 0, flap: 0, flyUntil: 0,
      };
      b.orbitR = this.pickOrbit();
      this.beetles.push(b);
    });
  }

  /** Loops from well inside the scene to well beyond its edges. */
  private pickOrbit() {
    return rand(0.25, 0.62) * Math.min(this.W, this.H);
  }

  click(x: number, y: number) {
    this.gnats.scatter(x, y);
    let best: Beetle | null = null;
    let bd = Infinity;
    for (const b of this.beetles) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < b.L * 0.6 && d < bd) {
        bd = d;
        best = b;
      }
    }
    if (!best) return;
    best.flyUntil = this.time + rand(1.8, 2.6);
    best.heading = Math.atan2(best.y - y, best.x - x) + rand(-0.5, 0.5);
  }

  step(dt: number) {
    this.time += dt;
    const { time, W, H } = this;
    for (const b of this.beetles) {
      const L = b.L;
      const flying = time < b.flyUntil;
      b.open = clamp(b.open + (flying ? dt * 3 : -dt * 2), 0, 1);
      b.lift = clamp(b.lift + (flying && b.open > 0.8 ? dt * 1.8 : -dt * 1.2), 0, 1);
      b.flap += dt * 26 * (b.open > 0.8 ? 1 : 0);
      b.feel += dt * 3;

      let dx = Math.cos(b.heading);
      let dy = Math.sin(b.heading);
      let target: number;
      let turn: number;
      if (b.lift > 0.05 || flying) {
        // Airborne: a clumsy, wobbling beeline.
        b.wander = clamp(b.wander + (Math.random() - 0.5) * dt * 6, -0.6, 0.6);
        dx += Math.cos(b.heading + b.wander) * 0.6;
        dy += Math.sin(b.heading + b.wander) * 0.6;
        target = L * 1.1 * b.lift;
        turn = 2.5;
      } else {
        // Like the sharks: always on the move, a drifting wander on top of a lazy
        // loop round the scene that carries it out past the edges and back.
        b.wander = clamp(b.wander + (Math.random() - 0.5) * dt * 3, -1.1, 1.1);
        dx += Math.cos(b.heading + b.wander) * 0.45;
        dy += Math.sin(b.heading + b.wander) * 0.45;
        const radius = b.orbitR * (1 + 0.15 * Math.sin(time * 0.05 + b.id));
        const [px, py] = patrol(b.x, b.y, W, H, radius, b.orbitDir);
        dx += px * 0.55;
        dy += py * 0.55;
        if (Math.random() < dt / 40) b.orbitR = this.pickOrbit();
        // Give way to each other, like the sharks.
        for (const o of this.beetles) {
          if (o === b || o.lift > 0.05) continue;
          const ox = o.x - b.x;
          const oy = o.y - b.y;
          const d = Math.hypot(ox, oy) || 1;
          const range = (L + o.L) * 0.45;
          if (d < range) {
            dx -= (ox / d) * (1 - d / range) * 3;
            dy -= (oy / d) * (1 - d / range) * 3;
          }
        }
        target = b.look.speed * L * (0.85 + 0.15 * Math.sin(time * 0.7 + b.id));
        // Turning circle grows with speed, so it walks arcs instead of spinning on the spot.
        turn = Math.min(1.2, Math.abs(b.speed) / (L * 0.35));
      }

      b.heading = steer(b.heading, Math.atan2(dy, dx), turn * dt);
      b.speed += (target - b.speed) * Math.min(1, dt * 3);
      b.x += Math.cos(b.heading) * b.speed * dt;
      b.y += Math.sin(b.heading) * b.speed * dt;
      b.gait += ((Math.abs(b.speed) * dt) / (L * 0.28)) * Math.PI * (b.lift > 0.1 ? 0 : 1);
      if (reenter(b, W, H, 1.8)) b.orbitR = this.pickOrbit();
    }
    this.collide();
    this.gnats.step(dt, W, H, time, this.pointer);
  }

  /** Push grounded bodies apart. */
  private collide() {
    const { beetles } = this;
    for (let i = 0; i < beetles.length; i++) {
      for (let j = i + 1; j < beetles.length; j++) {
        const a = beetles[i];
        const b = beetles[j];
        if (a.lift > 0.05 || b.lift > 0.05) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-3;
        const min = (a.L + b.L) * 0.3;
        if (d < min) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }
    }
  }

  draw(r: Renderer) {
    // Fliers on top, then bigger beetles over smaller ones.
    const order = [...this.beetles].sort((p, q) => p.lift - q.lift || p.L - q.L);
    for (const b of order) {
      r.bug(beetleFigure(b, this.time), {
        x: b.x, y: b.y, heading: b.heading, L: b.L * (1 + 0.12 * b.lift), id: b.id, lift: b.lift, shimmer: b.look.shimmer,
      });
    }
    // Gnats fly over everything.
    this.gnats.draw(r, this.cw, this.ch);
  }

  /** Leaf litter. */
  ground(col: number, row: number): [string, RGB] | null {
    const h = hash3(col, row, 202);
    if (h > 0.08) return null;
    const tone = hash3(col, row, 203);
    return [".,'`~"[Math.floor(h * 62) % 5], tone < 0.5 ? [64, 74, 44] : [80, 60, 40]];
  }
}
