/**
 * Falling leaves on an autumn grid: maple, oak, birch and ginkgo leaves in reds,
 * oranges, golds and browns. Each one falls on its own path like a real leaf: a
 * swinging zigzag, dropping fastest mid-swing, rocking and turning over as it
 * goes, carried along by a gusting breeze. Leaves that fall out of the bottom
 * drift back in from the top. Smaller leaves are farther off: dimmer and slower.
 */
import { mix, scale } from "../core/anatomy";
import type { Scene } from "../core/engine";
import { clamp, rand, TAU } from "../core/math";
import { WING, type Backdrop, type Figure, type Paint, type Renderer, type RGB } from "../core/render";

// Half-leaf outlines: u along the midrib (stem end negative, tip positive), v out to one side.
const MAPLE = [0.5, 0, 0.3, 0.07, 0.32, 0.14, 0.16, 0.14, 0.2, 0.3, 0.18, 0.42, 0.06, 0.32, 0.02, 0.36, -0.06, 0.2, -0.14, 0.34, -0.28, 0.4, -0.24, 0.24, -0.32, 0.18, -0.3, 0.06, -0.36, 0];
const OAK = [0.5, 0, 0.42, 0.1, 0.34, 0.08, 0.3, 0.2, 0.18, 0.16, 0.12, 0.26, 0, 0.18, -0.06, 0.26, -0.18, 0.16, -0.24, 0.22, -0.36, 0.1, -0.44, 0.04, -0.46, 0];
const BIRCH = [0.5, 0, 0.38, 0.12, 0.2, 0.22, 0, 0.26, -0.2, 0.24, -0.34, 0.16, -0.42, 0.06, -0.44, 0];
const GINKGO = [0.32, 0, 0.4, 0.12, 0.36, 0.3, 0.2, 0.44, 0, 0.3, -0.2, 0.12, -0.36, 0.03, -0.4, 0];

/** Leaf shapes: outline, relative size, where the stem joins, and whether the veins fan out from the base. */
const KINDS = [
  { poly: MAPLE, size: 1, base: -0.36, palmate: true },
  { poly: OAK, size: 1, base: -0.46, palmate: false },
  { poly: BIRCH, size: 0.7, base: -0.44, palmate: false },
  { poly: GINKGO, size: 0.8, base: -0.4, palmate: true },
];

// [centre colour, edge colour]
const COLORS: [RGB, RGB][] = [
  [[234, 122, 34], [196, 40, 30]],
  [[244, 192, 62], [228, 122, 32]],
  [[216, 66, 34], [150, 26, 24]],
  [[188, 114, 54], [120, 66, 34]],
  [[238, 202, 72], [202, 152, 42]],
  [[200, 152, 54], [142, 92, 36]],
  [[192, 172, 72], [216, 102, 40]],
];
const VEIN: RGB = [246, 214, 150];
const STEM: RGB = [150, 96, 52];

interface Leaf {
  id: number;
  x: number;
  y: number;
  L: number;
  kind: (typeof KINDS)[number];
  paint: Paint;
  stem: RGB;
  /** 0.5 far → 1 near. */
  depth: number;
  /** Side-to-side swing: phase, rate (rad/s) and width (px/s). */
  phase: number;
  omega: number;
  amp: number;
  fall: number;
  angle: number;
  spin: number;
  flip: number;
  flipRate: number;
}

function leafPaint(kind: (typeof KINDS)[number], [centre, edge]: [RGB, RGB], k: number): Paint {
  return (u, v) => {
    let col = mix(centre, edge, clamp(v / 0.4 + Math.abs(u) * 0.4, 0, 1) ** 2);
    const vein = kind.palmate
      ? Math.abs(Math.sin(Math.atan2(v, u - kind.base) * 5)) < 0.12
      : ((u - v * 1.2) * 9 + 100) % 1 < 0.12;
    if (v < 0.025) col = mix(col, VEIN, 0.45);
    else if (vein) col = mix(col, VEIN, 0.25);
    return scale(col, k);
  };
}

export class LeavesScene implements Scene {
  time = 0;
  pointer = { x: 0, y: 0, active: false };
  backdrop: Backdrop = { bg: "#000", grid: "rgba(255,255,255,0.055)", big: true, shadows: false };
  leaves: Leaf[] = [];
  private W = 0;
  private H = 0;
  private nextId = 1;

  resize(width: number, height: number) {
    const first = this.W === 0;
    this.W = width;
    this.H = height;
    if (!first) return;
    const n = clamp(Math.round((width * height) / 60000), 12, 36);
    for (let i = 0; i < n; i++) this.leaves.push(this.makeLeaf(rand(0.5, 1), rand(0, width), rand(-height * 0.3, height)));
    // Far (small) leaves draw first so near ones pass in front.
    this.leaves.sort((a, b) => a.L - b.L);
  }

  private makeLeaf(depth: number, x: number, y: number, kind = KINDS[Math.floor(Math.random() * KINDS.length)], colors = COLORS[Math.floor(Math.random() * COLORS.length)]): Leaf {
    const k = 0.65 + 0.35 * depth;
    return {
      id: this.nextId++, x, y, kind, depth,
      L: Math.min(this.W, this.H) * 0.24 * depth ** 1.5 * kind.size,
      paint: leafPaint(kind, colors, k),
      stem: scale(STEM, k),
      phase: rand(0, TAU),
      omega: rand(1, 1.9),
      amp: rand(30, 80) * depth,
      fall: 40 + 80 * depth,
      angle: rand(0, TAU),
      spin: rand(-0.5, 0.5),
      flip: rand(0, TAU),
      flipRate: rand(0.8, 2.6),
    };
  }

  step(dt: number) {
    this.time += dt;
    const { W, H, time } = this;
    const wind = 18 * Math.sin(time * 0.13) + 10 * Math.sin(time * 0.37 + 1);
    for (const l of this.leaves) {
      l.phase += dt * l.omega;
      const c = Math.cos(l.phase);
      // Pendulum glide: sideways with the swing, dropping fastest mid-swing.
      l.x += (wind * l.depth + c * l.amp) * dt;
      l.y += l.fall * (0.45 + 0.9 * Math.abs(c)) * dt;
      l.angle += l.spin * dt;
      l.flip += l.flipRate * dt;
      if (l.y - l.L > H) {
        l.y = -l.L - rand(0, H * 0.3);
        l.x = rand(-0.1, 1.1) * W;
      }
      if (l.x < -l.L * 1.5) l.x += W + l.L * 3;
      else if (l.x > W + l.L * 1.5) l.x -= W + l.L * 3;
    }
  }

  private drawLeaf(r: Renderer, l: Leaf, x: number, y: number, L: number, flap: number, heading: number) {
    const fig: Figure = {
      parts: [
        { k: "wing", poly: l.kind.poly, x: 0, side: 1, sweep: 0, flap, paint: l.paint, ramp: WING },
        { k: "wing", poly: l.kind.poly, x: 0, side: -1, sweep: 0, flap, paint: l.paint, ramp: WING },
      ],
      strokes: [{ x0: l.kind.base, y0: 0, x1: l.kind.base - 0.2, y1: 0.03, rgb: l.stem }],
    };
    r.bug(fig, { x, y, heading, L, id: l.id });
  }

  draw(r: Renderer) {
    for (const l of this.leaves) {
      // Turning over foreshortens the leaf across its width; never quite edge-on, so it doesn't blink out.
      const flap = Math.max(0.15, Math.abs(Math.cos(l.flip)));
      // Rocks with the swing.
      this.drawLeaf(r, l, l.x, l.y, l.L, flap, l.angle + 0.5 * Math.sin(l.phase));
    }
  }
}
