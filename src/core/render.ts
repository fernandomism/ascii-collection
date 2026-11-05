/**
 * Draws bugs as a grid of ASCII cells, in the style of ascii-sharks:
 *   1. a black cell grid with a ground texture baked once per resize
 *   2. overlay cells the scene puts down each frame (trails, food, lamplight)
 *   3. bugs: filled body parts supersampled cell-by-cell into lit, shaded
 *      blocks with dense glyphs in shadow; thin limbs as slope glyphs (- \ | /)
 */
import { clamp, hash3 } from "./math";

export type RGB = [number, number, number];
/** A colour, or a pattern over the part's own (u, v) coordinates. */
export type Paint = RGB | ((u: number, v: number) => RGB);

type Shape =
  /** Ellipse dome; paint gets u, v in [-1, 1] along / across it. */
  | { k: "ell"; x: number; y: number; rx: number; ry: number; a?: number }
  /** Tapered capsule (horns, jaws); paint gets u 0 → 1 base to tip, v -1..1 across. */
  | { k: "seg"; x0: number; y0: number; x1: number; y1: number; r0: number; r1: number }
  /**
   * Flat wing polygon in wing space (u toward the head, v outward) hinged at (x, 0).
   * sweep folds it back (radians); flap < 1 foreshortens it mid-stroke.
   */
  | { k: "wing"; poly: readonly number[]; x: number; side: 1 | -1; sweep: number; flap: number };

/** A filled part, in body units (fractions of L): +x toward the head, +y the bug's right. */
export type Part = Shape & { paint: Paint; gloss?: number; ramp?: string };
/** A thin limb drawn as a run of slope glyphs. */
export interface Stroke { x0: number; y0: number; x1: number; y1: number; rgb: RGB; glyph?: string }
export interface Figure { parts: Part[]; strokes: Stroke[] }
export interface Placement {
  x: number;
  y: number;
  heading: number;
  /** Body length in px; figures are drawn in units of it. */
  L: number;
  id: number;
  /** 0 on the ground → 1 airborne; pushes the shadow out. */
  lift?: number;
  /** Odds a skin glyph flashes an iridescent accent. */
  shimmer?: number;
  /** Vertical squash for a figure lying on a surface seen at an angle (1 = seen from straight above). */
  squash?: number;
}

const SUB = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];
/** Sparse glyphs on bright skin, dense in shadow, so texture follows the shading. */
export const RAMP = ":;t%SX8#@";
export const FUZZ = "'~*%#&";
export const WING = ".:-=+*%#";
const EDGE_HEAVY = ":;";
const EDGE_LIGHT = ".',`";
const ACCENTS: RGB[] = [[90, 235, 150], [80, 200, 255], [255, 214, 90], [225, 100, 255]];
// The sharks' rainbow: glyphs that flash these colours on the grey hide.
const RAINBOW: RGB[] = [[224, 137, 44], [224, 58, 50], [180, 74, 224], [51, 200, 204], [60, 181, 74], [49, 80, 232], [217, 193, 74]];
/** Low bit on a packed colour: keep it in colour even in grey mode (pack() always clears it). */
const KEEP = 1;
// Key light from the top-left, a little above; H is the specular half-vector.
const LX = -0.45;
const LY = -0.6;
const LZ = 0.66;
const HN = Math.hypot(LX, LY, LZ + 1);
const HX = LX / HN;
const HY = LY / HN;
const HZ = (LZ + 1) / HN;

const pack = (r: number, g: number, b: number) =>
  ((clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255)) & 0xfcfcfc;

const CHARS: string[] = [];
const char = (code: number) => (CHARS[code] ??= String.fromCharCode(code));

function inPoly(p: readonly number[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const yi = p[i + 1];
    const yj = p[j + 1];
    if (yi > y !== yj > y && x < ((p[j] - p[i]) * (y - yi)) / (yj - yi) + p[i]) inside = !inside;
  }
  return inside;
}

/** Glyph for a line running (dx, dy) in cell units. */
export function slope(dx: number, dy: number) {
  let a = Math.atan2(dy, dx);
  if (a < 0) a += Math.PI;
  if (a < Math.PI / 8 || a > (Math.PI * 7) / 8) return "-";
  if (a < (Math.PI * 3) / 8) return "\\";
  if (a < (Math.PI * 5) / 8) return "|";
  return "/";
}

/** Faint cell grid, snapped to device pixels. */
function paintGrid(g: CanvasRenderingContext2D, W: number, H: number, cw: number, ch: number, dpr: number, color: string) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.beginPath();
  for (let c = 0; c <= Math.ceil(W / cw); c++) {
    const x = Math.round(c * cw * dpr) + 0.5;
    g.moveTo(x, 0);
    g.lineTo(x, H * dpr);
  }
  for (let r = 0; r <= Math.ceil(H / ch); r++) {
    const y = Math.round(r * ch * dpr) + 0.5;
    g.moveTo(0, y);
    g.lineTo(W * dpr, y);
  }
  g.stroke();
}

/** A scene's own page colour and grid-line colour, whether to use the sharks' bigger cells, and drop shadows. */
export interface Backdrop {
  bg: string;
  grid: string;
  big?: boolean;
  /** Off on a coloured page, where shadow cells read as dark boxes. */
  shadows?: boolean;
}

export class Renderer {
  time = 0;
  backdrop: Backdrop = { bg: "#000", grid: "rgba(255,255,255,0.055)" };
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private cw = 12;
  private ch = 18;
  private cols = 0;
  private rows = 0;
  private fontFamily = "ui-monospace, Menlo, monospace";
  /** Per cell: 0 empty, 1 block + glyph, 2 glyph only. */
  private mode = new Uint8Array(0);
  private fill = new Uint32Array(0);
  private ink = new Uint32Array(0);
  private glyph = new Uint16Array(0);
  private shadow = new Uint8Array(0);
  private styles = new Map<number, string>();
  private grey = false;
  // The bug being rasterised: its parts, their bounds (cx, cy, r, cos, sin) and the light in body space.
  private parts: Part[] = [];
  private box = new Float32Array(64);
  private lbx = 0;
  private lby = 0;
  private hbx = 0;
  private hby = 0;
  // sample() outputs, kept in fields to avoid allocating per sample.
  private hr = 0;
  private hg = 0;
  private hb = 0;
  private hspec = 0;
  private hshade = 0;
  private hramp = RAMP;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.bg = document.createElement("canvas");
  }

  get cellWidth() {
    return this.cw;
  }

  get cellHeight() {
    return this.ch;
  }

  setFontFamily(family: string) {
    if (family) this.fontFamily = family;
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    // Big cells never drop below the sharks' typical size, even in a narrow window.
    this.cw = this.backdrop.big ? clamp(Math.round(width / 110), 12, 14) : clamp(Math.round(width / 150), 7, 11);
    this.ch = Math.round(this.cw * 1.45);
    this.cols = Math.ceil(width / this.cw);
    this.rows = Math.ceil(height / this.ch);
    this.canvas.width = this.bg.width = Math.round(width * dpr);
    this.canvas.height = this.bg.height = Math.round(height * dpr);
    const n = this.cols * this.rows;
    if (this.mode.length !== n) {
      this.mode = new Uint8Array(n);
      this.fill = new Uint32Array(n);
      this.ink = new Uint32Array(n);
      this.glyph = new Uint16Array(n);
      this.shadow = new Uint8Array(n);
    }
  }

  /** Bake the grid and the scene's static ground glyphs into the backdrop. */
  paintGround(ground?: (col: number, row: number) => [string, RGB] | null) {
    const g = this.bg.getContext("2d");
    if (!g) return;
    const { width: W, height: H, dpr, cw, ch } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = this.backdrop.bg;
    g.fillRect(0, 0, W, H);
    paintGrid(g, W, H, cw, ch, dpr, this.backdrop.grid);
    if (!ground) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.setFont(g);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = ground(c, r);
        if (!cell) continue;
        g.fillStyle = this.style(pack(cell[1][0], cell[1][1], cell[1][2]));
        g.fillText(cell[0], c * cw + cw / 2, r * ch + ch / 2 + 1);
      }
    }
  }

  begin(t: number) {
    this.time = t;
    this.mode.fill(0);
    this.shadow.fill(0);
  }

  /** Put a glyph in a cell; with a fill it gets a solid block behind it. */
  putCell(col: number, row: number, g: string, ink: RGB, fill?: RGB) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    const i = row * this.cols + col;
    this.mode[i] = fill ? 1 : 2;
    this.ink[i] = pack(ink[0], ink[1], ink[2]);
    if (fill) this.fill[i] = pack(fill[0], fill[1], fill[2]);
    this.glyph[i] = g.charCodeAt(0);
  }

  /** Draw a glyph over whatever is in a cell, keeping any block behind it (a ripple passing over a koi). */
  overlay(col: number, row: number, g: string, ink: RGB) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    const i = row * this.cols + col;
    if (!this.mode[i]) this.mode[i] = 2;
    this.ink[i] = pack(ink[0], ink[1], ink[2]);
    this.glyph[i] = g.charCodeAt(0);
  }

  private cellAt(x: number, y: number) {
    const c = Math.floor(x / this.cw);
    const r = Math.floor(y / this.ch);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  /** Rasterise one bug on top of everything drawn so far this frame. */
  bug(fig: Figure, p: Placement) {
    const { cw, ch, cols, rows, mode, fill, ink, glyph, shadow } = this;
    const L = p.L;
    const cos = Math.cos(p.heading);
    const sin = Math.sin(p.heading);
    this.lbx = LX * cos + LY * sin;
    this.lby = -LX * sin + LY * cos;
    this.hbx = HX * cos + HY * sin;
    this.hby = -HX * sin + HY * cos;

    const parts = (this.parts = fig.parts);
    if (this.box.length < parts.length * 5) this.box = new Float32Array(parts.length * 10);
    const box = this.box;
    let reach = 0;
    for (let i = 0; i < parts.length; i++) {
      const q = parts[i];
      let cx: number;
      let cy: number;
      let r: number;
      let a = 0;
      if (q.k === "ell") {
        cx = q.x;
        cy = q.y;
        r = Math.max(q.rx, q.ry);
        a = q.a ?? 0;
      } else if (q.k === "seg") {
        cx = (q.x0 + q.x1) / 2;
        cy = (q.y0 + q.y1) / 2;
        r = Math.hypot(q.x1 - q.x0, q.y1 - q.y0) / 2 + Math.max(q.r0, q.r1);
      } else {
        // Sweep and flap only rotate and shrink the wing about its hinge.
        cx = q.x;
        cy = 0;
        r = 0;
        for (let k = 0; k < q.poly.length; k += 2) r = Math.max(r, Math.hypot(q.poly[k], q.poly[k + 1]));
        a = q.sweep;
      }
      const o = i * 5;
      box[o] = cx;
      box[o + 1] = cy;
      box[o + 2] = r;
      box[o + 3] = Math.cos(a);
      box[o + 4] = Math.sin(a);
      reach = Math.max(reach, Math.hypot(cx, cy) + r);
    }

    // Limbs first: the body paints over their roots.
    for (const s of fig.strokes) this.stroke(s, p, cos, sin);

    const R = reach * L + Math.hypot(cw, ch);
    const R2 = R * R;
    // Screen offsets un-squash back onto the figure's surface before going into body space.
    const unsquash = 1 / (p.squash ?? 1);
    const c0 = Math.max(0, Math.floor((p.x - R) / cw));
    const c1 = Math.min(cols - 1, Math.floor((p.x + R) / cw));
    const r0 = Math.max(0, Math.floor((p.y - R) / ch));
    const r1 = Math.min(rows - 1, Math.floor((p.y + R) / ch));
    const lift = p.lift ?? 0;
    const sdc = Math.round((L * 0.02 + lift * L * 0.2) / cw) + 1;
    const sdr = Math.round((L * 0.015 + lift * L * 0.14) / ch) + 1;
    const inv = 1 / L;
    const tick = this.time * 2.4;

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x = c * cw - p.x;
        const y = r * ch - p.y;
        let dx = x + cw / 2;
        let dy = (y + ch / 2) * unsquash;
        if (dx * dx + dy * dy > R2) continue;
        const bx = (dx * cos + dy * sin) * inv;
        const by = (-dx * sin + dy * cos) * inv;
        const center = this.sample(bx, by);
        let cr = this.hr;
        let cg = this.hg;
        let cb = this.hb;
        const spec = this.hspec;
        const shade = this.hshade;
        const ramp = this.hramp;
        let hits = center ? 1 : 0;
        for (let k = 0; k < SUB.length; k += 2) {
          dx = x + SUB[k] * cw;
          dy = (y + SUB[k + 1] * ch) * unsquash;
          if (this.sample((dx * cos + dy * sin) * inv, (-dx * sin + dy * cos) * inv)) {
            if (!hits) {
              cr = this.hr;
              cg = this.hg;
              cb = this.hb;
            }
            hits++;
          }
        }
        if (!hits) continue;

        const i = r * cols + c;
        // Body-anchored key so each glyph rides along with the skin.
        const key = (hash3(Math.round((bx * L) / (cw * 0.9)), Math.round((by * L) / (cw * 0.9)), p.id) * 4294967295) >>> 0;
        if (center && hits >= 3) {
          const lum = (0.3 * cr + 0.59 * cg + 0.11 * cb) / 255;
          const jitter = ((key >>> 4) % 3) - 1;
          mode[i] = 1;
          fill[i] = pack(cr, cg, cb);
          // Glyph density follows the lighting, not the paint, so spots and stripes stay clean.
          glyph[i] = ramp.charCodeAt(clamp(Math.floor((1 - shade) * (ramp.length - 0.01)) + jitter, 0, ramp.length - 1));
          // Colours re-roll on a staggered clock so the hide shimmers.
          const roll = hash3(key, Math.floor(tick + (key % 997) / 97), 7);
          if (spec > 0.35) {
            ink[i] = pack(255, 255, 248);
          } else if (this.grey && roll < 0.13) {
            const a = roll < 0.09 ? RAINBOW[key % RAINBOW.length] : ([255, 255, 255] as RGB);
            ink[i] = pack(a[0], a[1], a[2]) | KEEP;
          } else if (p.shimmer && hash3(key, Math.floor(tick + (key % 997) / 97), 7) < p.shimmer) {
            const a = ACCENTS[key % ACCENTS.length];
            ink[i] = pack(a[0], a[1], a[2]);
          } else if (lum < 0.22) {
            // Dark skin gets light texture, or it would vanish into the block.
            ink[i] = pack(cr * 1.6 + 30, cg * 1.6 + 28, cb * 1.6 + 28);
          } else {
            ink[i] = pack(cr * 0.3, cg * 0.3, cb * 0.3);
          }
          const sc = c + sdc;
          const sr = r + sdr;
          if (sc < cols && sr < rows) shadow[sr * cols + sc] = 1;
        } else {
          // Soft, anti-aliased silhouette: no block, just a light glyph.
          const set = hits >= 3 ? EDGE_HEAVY : EDGE_LIGHT;
          mode[i] = 2;
          const roll = hash3(key, Math.floor(tick + (key % 997) / 97), 7);
          const a = RAINBOW[key % RAINBOW.length];
          ink[i] = this.grey && roll < 0.07 ? pack(a[0], a[1], a[2]) | KEEP : pack(cr * 0.9 + 10, cg * 0.9 + 10, cb * 0.9 + 10);
          glyph[i] = set.charCodeAt((key >>> 8) % set.length);
        }
      }
    }
  }

  /**
   * Find the topmost part under body point (x, y). Writes the lit colour,
   * specular strength and glyph ramp to the h* fields.
   */
  private sample(x: number, y: number) {
    const { parts, box } = this;
    for (let i = parts.length - 1; i >= 0; i--) {
      const o = i * 5;
      const ex = x - box[o];
      const ey = y - box[o + 1];
      if (ex * ex + ey * ey > box[o + 2] * box[o + 2]) continue;
      const q = parts[i];
      let u: number;
      let v: number;
      let nx = 0;
      let ny = 0;
      let nz = 1;
      if (q.k === "ell") {
        const ca = box[o + 3];
        const sa = box[o + 4];
        u = (ex * ca + ey * sa) / q.rx;
        v = (-ex * sa + ey * ca) / q.ry;
        const r2 = u * u + v * v;
        if (r2 > 1) continue;
        nz = Math.sqrt(1 - r2);
        nx = u * ca - v * sa;
        ny = u * sa + v * ca;
      } else if (q.k === "seg") {
        const sx = q.x1 - q.x0;
        const sy = q.y1 - q.y0;
        const t = clamp(((x - q.x0) * sx + (y - q.y0) * sy) / (sx * sx + sy * sy || 1e-9), 0, 1);
        const qx = x - q.x0 - sx * t;
        const qy = y - q.y0 - sy * t;
        const rad = q.r0 + (q.r1 - q.r0) * t;
        const d = Math.hypot(qx, qy);
        if (d > rad) continue;
        const k = d / (rad || 1e-9);
        u = t;
        v = sx * qy - sy * qx >= 0 ? k : -k;
        nz = Math.sqrt(1 - k * k);
        if (d > 1e-9) {
          nx = (qx / d) * k;
          ny = (qy / d) * k;
        }
      } else {
        if (y * q.side < 0 || q.flap < 0.06) continue;
        const qx = x - q.x;
        const qy = (y * q.side) / q.flap;
        const cs = box[o + 3];
        const ss = box[o + 4];
        u = qx * cs + qy * ss;
        v = -qx * ss + qy * cs;
        if (!inPoly(q.poly, u, v)) continue;
        // Wings tilt toward or away from the light through the stroke.
        ny = q.side * Math.sqrt(1 - q.flap * q.flap) * 0.4;
        nz = Math.sqrt(1 - ny * ny);
      }
      const lit = nx * this.lbx + ny * this.lby + nz * LZ;
      const shade = 0.32 + 0.68 * Math.max(0, lit);
      const col = typeof q.paint === "function" ? q.paint(u, v) : q.paint;
      const spec = q.gloss ? q.gloss * Math.max(0, nx * this.hbx + ny * this.hby + nz * HZ) ** 24 : 0;
      this.hr = col[0] * shade + spec * 230;
      this.hg = col[1] * shade + spec * 230;
      this.hb = col[2] * shade + spec * 230;
      this.hspec = spec;
      this.hshade = (shade - 0.32) / 0.68;
      this.hramp = q.ramp ?? RAMP;
      return true;
    }
    return false;
  }

  private stroke(s: Stroke, p: Placement, cos: number, sin: number) {
    const { L } = p;
    const x0 = p.x + (s.x0 * cos - s.y0 * sin) * L;
    const q = p.squash ?? 1;
    const y0 = p.y + (s.x0 * sin + s.y0 * cos) * L * q;
    const dx = p.x + (s.x1 * cos - s.y1 * sin) * L - x0;
    const dy = p.y + (s.x1 * sin + s.y1 * cos) * L * q - y0;
    const g = (s.glyph ?? slope(dx / this.cw, dy / this.ch)).charCodeAt(0);
    const ink = pack(s.rgb[0], s.rgb[1], s.rgb[2]);
    const n = Math.max(1, Math.ceil(Math.hypot(dx / this.cw, dy / this.ch) * 2));
    for (let k = 0; k <= n; k++) {
      const i = this.cellAt(x0 + (dx * k) / n, y0 + (dy * k) / n);
      if (i < 0) continue;
      this.mode[i] = 2;
      this.ink[i] = ink;
      this.glyph[i] = g;
    }
  }

  flush() {
    const { ctx, dpr, cols, cw, ch, mode, fill, ink, glyph, shadow } = this;
    if (!cols) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    const shadows = this.backdrop.shadows !== false;
    for (let i = 0; i < mode.length; i++) {
      if (shadows && shadow[i] && !mode[i]) ctx.fillRect((i % cols) * cw, ((i / cols) | 0) * ch, cw, ch);
    }
    this.setFont(ctx);
    for (let i = 0; i < mode.length; i++) {
      const m = mode[i];
      if (!m) continue;
      const x = (i % cols) * cw;
      const y = ((i / cols) | 0) * ch;
      if (m === 1) {
        ctx.fillStyle = this.style(fill[i]);
        ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
      }
      ctx.fillStyle = this.style(ink[i]);
      ctx.fillText(char(glyph[i]), x + cw / 2, y + ch / 2 + 1);
    }
  }

  private setFont(g: CanvasRenderingContext2D) {
    g.font = `600 ${Math.round(this.ch * 0.74)}px ${this.fontFamily}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
  }

  /** Draw everything in the sharks' cool blue-grey instead of colour. Repaint the ground after. */
  setGrey(on: boolean) {
    this.grey = on;
    this.styles.clear();
  }

  private style(p: number) {
    let s = this.styles.get(p);
    if (!s) {
      let q = p;
      if (this.grey && !(p & KEEP)) {
        // Lift the darks (brown ants would otherwise sink into the black), keep the lights.
        const l = 255 * ((0.3 * (p >> 16) + 0.59 * ((p >> 8) & 255) + 0.11 * (p & 255)) / 255) ** 0.7;
        q = pack(l * 0.94, l * 0.98, l * 1.05 + 4);
      }
      s = "#" + (q & ~KEEP).toString(16).padStart(6, "0");
      this.styles.set(p, s);
    }
    return s;
  }
}
