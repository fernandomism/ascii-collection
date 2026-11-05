// Headless sanity check of the three sims (no canvas): npm run check
import { AntScene } from "./src/ants";
import { BeetleScene } from "./src/beetles";
import { MothScene } from "./src/moths";

const ok = (cond: unknown, what: string) => {
  if (!cond) throw new Error(`check failed: ${what}`);
};

const W = 1440;
const H = 900;
const dt = 1 / 60;
const run = (s: { step(dt: number): void }, seconds: number, after?: () => void) => {
  for (let i = 0; i < seconds / dt; i++) {
    s.step(dt);
    after?.();
  }
};
// How far (in body lengths) any bug strays past the screen edge, and how often one
// leaves the scene and comes back in somewhere else (a jump of half a body length in one step).
type Bug = { x: number; y: number; L: number };
let stray = 0;
let returns = 0;
const last = new Map<Bug, [number, number]>();
const track = (bugs: Bug[]) => () => {
  for (const g of bugs) {
    stray = Math.max(stray, Math.max(-g.x, g.x - W, -g.y, g.y - H) / g.L);
    const p = last.get(g);
    if (p && Math.hypot(g.x - p[0], g.y - p[1]) > g.L * 0.5) returns++;
    last.set(g, [g.x, g.y]);
  }
};

// Ants: food dropped near the nest gets carried home, and stored crumbs hatch new workers.
// Foragers also head off-screen and come back in.
const ants = new AntScene();
ants.resize(W, H, 10, 15);
const colony = ants.ants.length;
ants.click(W / 2 + 250, H / 2);
ants.click(W / 2 - 250, H / 2);
run(ants, 90, track(ants.ants));
ok(ants.foods.reduce((n, f) => n + f.amount, 0) < 16, "ants carried food away");
ok(ants.ants.length > colony, "colony grew from stored food");
run(ants, 90, track(ants.ants));
ok(returns > 0, "ants left the scene and came back");

// Beetles: horned males lock horns sooner or later; they wander out and back in;
// a click sends one flying and it lands again.
const beetles = new BeetleScene();
beetles.resize(W, H);
returns = 0;
let fought = false;
for (let i = 0; i < 180 / dt && !fought; i++) {
  beetles.step(dt);
  track(beetles.beetles)();
  fought = beetles.beetles.some((b) => b.rival);
}
ok(fought, "two beetles locked horns");
run(beetles, 120, track(beetles.beetles));
ok(returns > 0, "beetles left the scene and came back");
const b = beetles.beetles[0];
beetles.click(b.x, b.y);
run(beetles, 1);
ok(b.lift > 0.5, "startled beetle took off");
run(beetles, 5);
ok(b.lift === 0, "beetle landed");

// Moths: with the lamp on they keep circling it; with no light they roam in and out of the scene;
// switched to crawl they all land, and a clicked one flashes its wings.
const moths = new MothScene();
moths.resize(W, H, 10, 15);
run(moths, 30, track(moths.moths));
for (const m of moths.moths) ok(Math.hypot(m.x - W / 2, m.y - H * 0.45) < Math.max(W, H) * 1.2, "moth stays round the lamp");
moths.lampOn = false;
returns = 0;
run(moths, 30, track(moths.moths));
ok(returns > 0, "moths with no lamp roamed out and back in");
moths.setMode("crawl");
for (let i = 0; i < 20 / dt && !moths.moths.every((m) => m.lift === 0); i++) moths.step(dt);
ok(moths.moths.every((m) => m.lift === 0), "moths landed");
const perched = moths.moths[0];
moths.click(perched.x, perched.y);
run(moths, 0.5);
ok(perched.flash > 0.9, "clicked moth flashed its wings open");
run(moths, 60, track(moths.moths));

ok(stray < 2, `bugs that wander off-screen come back (strayed ${stray.toFixed(2)} L)`);
console.log(`ok (furthest off-screen: ${stray.toFixed(2)} body lengths)`);
