// Adapted from ascii-sharks' OceanEngine (MIT, © 2026 drewdi).
import { Renderer, type RGB } from "./render";

/** A bug sim the engine can run: moths, beetles or ants. */
export interface Scene {
  time: number;
  pointer: { x: number; y: number; active: boolean };
  resize(width: number, height: number, cellW: number, cellH: number): void;
  step(dt: number): void;
  /** Put this frame's cells and bugs on the renderer. */
  draw(r: Renderer): void;
  click?(x: number, y: number): void;
  /** Static ground glyph for a cell, baked once per resize. */
  ground?(col: number, row: number): [string, RGB] | null;
}

const STEP = 1 / 60;
const MAX_STEPS = 4;

/**
 * Wires a Scene + Renderer to a canvas: fixed-timestep loop, resize,
 * pointer input, pausing off-screen, and prefers-reduced-motion.
 */
export class BugEngine {
  private renderer: Renderer;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private visible = true;
  private reducedMotion: MediaQueryList;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement, private scene: Scene) {
    this.renderer = new Renderer(canvas);
    this.renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.intersectionObserver.observe(canvas);

    this.reducedMotion.addEventListener("change", this.onMotionPreference);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("blur", this.onPointerLeave);

    this.resize();
    // Canvas text can't trigger a webfont load; once the mono face is in, re-bake the ground.
    document.fonts?.load(`600 16px ${getComputedStyle(canvas).fontFamily}`).then(() => {
      if (this.disposed) return;
      this.renderer.paintGround(this.scene.ground?.bind(this.scene));
      if (this.reducedMotion.matches) this.drawStill();
    });
    this.schedule();
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.reducedMotion.removeEventListener("change", this.onMotionPreference);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerDown);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("blur", this.onPointerLeave);
  }

  /** Switch between colour and the sharks' grey. */
  setGrey(on: boolean) {
    this.renderer.setGrey(on);
    this.renderer.paintGround(this.scene.ground?.bind(this.scene));
    this.refresh();
  }

  /** Redraw one frame now (e.g. after a setting changes under reduced motion). */
  refresh() {
    if (this.reducedMotion.matches) this.drawStill();
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(rect.width, rect.height, dpr);
    this.scene.resize(rect.width, rect.height, this.renderer.cellWidth, this.renderer.cellHeight);
    this.renderer.paintGround(this.scene.ground?.bind(this.scene));
    if (this.reducedMotion.matches) this.drawStill();
  }

  private schedule() {
    cancelAnimationFrame(this.raf);
    if (this.disposed || !this.visible || this.reducedMotion.matches) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private render() {
    this.renderer.begin(this.scene.time);
    this.scene.draw(this.renderer);
    this.renderer.flush();
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.scene.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Reduced motion: let the scene settle, then show a single frame. */
  private drawStill() {
    if (this.scene.time < 4) {
      for (let i = 0; i < 240; i++) this.scene.step(STEP);
    }
    this.render();
  }

  private onMotionPreference = () => {
    if (this.reducedMotion.matches) {
      cancelAnimationFrame(this.raf);
      this.drawStill();
    } else {
      this.schedule();
    }
  };

  private toLocal(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    return { x, y, inside };
  }

  private onPointerMove = (e: PointerEvent) => {
    const { x, y, inside } = this.toLocal(e);
    const p = this.scene.pointer;
    p.x = x;
    p.y = y;
    p.active = inside && e.pointerType !== "touch";
  };

  private onPointerDown = (e: PointerEvent) => {
    // Clicks on the page's own controls aren't meant for the bugs.
    if ((e.target as Element | null)?.closest?.("a, button, input, label, nav")) return;
    const { x, y, inside } = this.toLocal(e);
    if (!inside) return;
    this.scene.click?.(x, y);
    this.refresh();
  };

  private onPointerLeave = () => {
    this.scene.pointer.active = false;
  };
}
