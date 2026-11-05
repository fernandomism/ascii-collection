/**
 * A dragonfly that turns up now and then: it flies in from an edge, hovers,
 * darts to a new spot, hovers again, and after a few darts leaves the scene
 * until the next one comes by. Four long wings beat too fast to see, so they
 * shimmer; the long abdomen is ringed.
 */
import { SIDES } from "../core/anatomy";
import { beyondEdge, outside, rand, steer } from "../core/math";
import type { Figure, Part, Renderer, RGB } from "../core/render";

// Wing outlines in wing space: u toward the head, v out from the hinge. Long and narrow.
const FORE = [0.03, 0, 0.05, 0.12, 0.045, 0.3, 0.01, 0.45, -0.03, 0.46, -0.05, 0.3, -0.04, 0.1, -0.01, 0];
const HIND = [0.01, 0, 0.03, 0.12, 0.02, 0.3, -0.02, 0.44, -0.07, 0.44, -0.11, 0.28, -0.09, 0.08, -0.03, 0];

const THORAX: RGB = [58, 170, 196];
const EYE: RGB = [40, 150, 120];
const MEMBRANE: RGB = [204, 228, 236];
const VEIN: RGB = [150, 182, 194];
const SPOT: RGB = [54, 56, 66];

const wingPaint = (u: number, v: number): RGB =>
  v > 0.36 && v < 0.41 && u > -0.03 ? SPOT : Math.abs(Math.sin(v * 40)) < 0.15 ? VEIN : MEMBRANE;

type State = "away" | "dart" | "hover" | "leave";

export class Dragonfly {
  x = 0;
  y = 0;
  heading = 0;
  speed = 0;
  state: State = "away";
  private target: [number, number] = [0, 0];
  private until: number;
  private darts = 0;
  private flap = 0;

  constructor(public L: number, firstVisit = rand(4, 10), private body: RGB = THORAX) {
    this.until = firstVisit;
  }

  step(dt: number, time: number, W: number, H: number) {
    const { L } = this;
    const inside = (): [number, number] => [rand(0.15, 0.85) * W, rand(0.15, 0.85) * H];
    if (this.state === "away") {
      if (time < this.until) return;
      [this.x, this.y] = beyondEdge(W, H, L * 0.8);
      this.target = inside();
      this.heading = Math.atan2(this.target[1] - this.y, this.target[0] - this.x);
      this.darts = Math.floor(rand(3, 7));
      this.state = "dart";
    }
    this.flap += dt * 60;
    const [tx, ty] = this.target;
    const d = Math.hypot(tx - this.x, ty - this.y);
    if (this.state === "hover") {
      // Hold still, pivoting a little, then pick the next spot (or leave).
      this.speed *= Math.exp(-dt * 6);
      this.heading += Math.sin(time * 1.7) * 0.4 * dt;
      if (time > this.until) {
        if (--this.darts > 0) {
          this.target = inside();
          this.state = "dart";
        } else {
          this.target = beyondEdge(W, H, L * 1.5);
          this.state = "leave";
        }
      }
    } else {
      this.heading = steer(this.heading, Math.atan2(ty - this.y, tx - this.x), 7 * dt);
      this.speed += (L * 4 - this.speed) * Math.min(1, dt * 5);
      if (this.state === "dart" && d < L * 0.25) {
        this.state = "hover";
        this.until = time + rand(0.6, 2.2);
      }
      if (this.state === "leave" && outside(this.x, this.y, W, H) > L) {
        this.state = "away";
        this.until = time + rand(8, 20);
      }
    }
    this.x += Math.cos(this.heading) * this.speed * dt;
    this.y += Math.sin(this.heading) * this.speed * dt;
  }

  /**
   * `place` maps its position to the screen plus a size factor and how flat it looks there,
   * for scenes seen at an angle; by default it's drawn as seen from straight above.
   */
  draw(r: Renderer, id: number, place: (x: number, y: number) => [number, number, number, number] = (x, y) => [x, y, 1, 1]) {
    if (this.state === "away") return;
    // Wings beat too fast to follow: they shimmer between full and foreshortened.
    const flap = 0.35 + 0.65 * Math.abs(Math.cos(this.flap));
    // Wings first, then the body over their roots, so it stays solid while they beat.
    const parts: Part[] = [];
    for (const side of SIDES) {
      parts.push({ k: "wing", poly: HIND, x: 0.01, side, sweep: 0.18, flap, paint: wingPaint, ramp: ".:-=" });
      parts.push({ k: "wing", poly: FORE, x: 0.06, side, sweep: -0.1, flap, paint: wingPaint, ramp: ".:-=" });
    }
    const ring: RGB = [this.body[0] * 0.55, this.body[1] * 0.55, this.body[2] * 0.55];
    parts.push({ k: "seg", x0: -0.04, y0: 0, x1: -0.6, y1: 0, r0: 0.05, r1: 0.032, paint: (u) => ((u * 9) % 1 < 0.2 ? ring : this.body), gloss: 0.8 });
    parts.push({ k: "ell", x: 0.04, y: 0, rx: 0.09, ry: 0.065, paint: this.body, gloss: 0.9 });
    parts.push({ k: "ell", x: 0.14, y: 0, rx: 0.045, ry: 0.07, paint: this.body, gloss: 0.6 });
    for (const side of SIDES) parts.push({ k: "ell", x: 0.15, y: side * 0.045, rx: 0.042, ry: 0.042, paint: EYE, gloss: 1.2 });
    const fig: Figure = { parts, strokes: [] };
    const [x, y, s, squash] = place(this.x, this.y);
    r.bug(fig, { x, y, heading: this.heading, L: this.L * s, id, lift: 1, squash });
  }
}
