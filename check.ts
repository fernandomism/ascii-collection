// Headless sanity check of the three sims (no canvas): npm run check
import { AntScene } from "./src/insects/ants";
import { BeetleScene } from "./src/insects/beetles";
import { MothScene } from "./src/insects/moths";
import { LeavesScene } from "./src/nature/leaves";
import { PondScene } from "./src/nature/pond";

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
ok(ants.foods.reduce((n, f) => n + f.amount, 0) < 24, "ants carried food away");
ok(ants.ants.length === colony, "the colony stays the same size");
run(ants, 90, track(ants.ants));
ok(returns > 0, "ants left the scene and came back");

// Beetles: always walking, never standing still; they wander out and back in;
// gnats stay with their swarms; a click sends a beetle flying and it lands again.
const beetles = new BeetleScene();
beetles.resize(W, H, 10, 15);
let still = 0;
let scattered = 0;
const away = new Set<object>();
let cameBack = 0;
run(beetles, 240, () => {
  track(beetles.beetles)();
  for (const b of beetles.beetles) {
    if (Math.abs(b.speed) < b.L * 0.02) still++;
    // Like the sharks: fully out of sight, then back in view.
    const out = Math.max(-b.x, b.x - W, -b.y, b.y - H);
    if (out > b.L * 0.6) away.add(b);
    else if (out < 0 && away.delete(b)) cameBack++;
  }
  for (const s of beetles.gnats.groups) for (const g of s.members) if (Math.hypot(g.x - s.x, g.y - s.y) > 400) scattered++;
});
ok(still < 60, "beetles keep walking");
ok(cameBack > 0, "beetles walked out of the scene and came back");
ok(scattered < 60, "gnats stay with their swarm");
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

// Leaves: they keep falling, and each one that drops out the bottom comes back in at the top.
const leaves = new LeavesScene();
leaves.resize(W, H);
const fallen = new Map<object, number>();
let refilled = 0;
run(leaves, 60, () => {
  for (const l of leaves.leaves) {
    if (l.y < (fallen.get(l) ?? -Infinity) - H * 0.5) refilled++;
    fallen.set(l, l.y);
  }
});
ok(refilled > leaves.leaves.length, "leaves keep falling and come back in at the top");
ok(leaves.leaves.every((l) => l.y < H + l.L * 2 && l.x > -l.L * 2 && l.x < W + l.L * 2), "leaves stay in or near the scene");

// Pond: a click ripples the water and drops food the koi eat; petals land with a ripple, never
// crowd the scene, and sink; a dragonfly comes by; koi that swim out of view come back.
const pond = new PondScene();
pond.resize(W, H, 12, 17);
pond.click(W / 2, H / 2);
ok(pond.ripples.length === 1 && pond.food.length === 6, "a click ripples the water and drops food");
ok(pond.koi.length >= 3 && pond.koi.length <= 4, "three or four koi");
let landings = 0;
let sank = 0;
let visited = false;
let crowded = 0;
let afloat = new Set(pond.petals.filter((p) => p.alt === 0));
run(pond, 30, () => {
  const now = new Set(pond.petals.filter((p) => p.alt === 0));
  for (const p of now) if (!afloat.has(p)) landings++;
  for (const p of afloat) if (!pond.petals.includes(p)) sank++;
  afloat = now;
  if (pond.petals.length > 14) crowded++;
  visited ||= pond.dragonfly.state !== "away";
});
ok(pond.food.length < 6, "koi ate some of the food");
ok(landings > 0 && sank > 0, "petals land on the water and later sink");
ok(crowded === 0, "petals never crowd the scene");
ok(visited, "a dragonfly came by");
const { Wp, D } = pond.view;
ok(pond.koi.every((k) => k.x > -2 * k.L && k.x < Wp + 2 * k.L && k.y > -2 * k.L && k.y < D + 2 * k.L), "koi stay in or near the pond");
const [ux, uy] = pond.view.unproject(300, 400);
const [sx, sy] = pond.view.project(ux, uy);
ok(Math.abs(sx - 300) < 0.01 && Math.abs(sy - 400) < 0.01, "a click lands where it was made on the angled water");

ok(stray < 2, `bugs that wander off-screen come back (strayed ${stray.toFixed(2)} L)`);
console.log(`ok (furthest off-screen: ${stray.toFixed(2)} body lengths)`);
