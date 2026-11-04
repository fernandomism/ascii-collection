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
const run = (s: { step(dt: number): void }, seconds: number) => {
  for (let i = 0; i < seconds / dt; i++) s.step(dt);
};

// Ants: food dropped near the nest gets carried home, and stored crumbs hatch new workers.
const ants = new AntScene();
ants.resize(W, H, 10, 15);
const colony = ants.ants.length;
ants.click(W / 2 + 250, H / 2);
ants.click(W / 2 - 250, H / 2);
run(ants, 90);
ok(ants.foods.reduce((n, f) => n + f.amount, 0) < 16, "ants carried food away");
ok(ants.ants.length > colony, "colony grew from stored food");

// Beetles: horned males lock horns sooner or later; a click sends one flying and it lands again.
const beetles = new BeetleScene();
beetles.resize(W, H);
let fought = false;
for (let i = 0; i < 180 / dt && !fought; i++) {
  beetles.step(dt);
  fought = beetles.beetles.some((b) => b.rival);
}
ok(fought, "two beetles locked horns");
const b = beetles.beetles[0];
beetles.click(b.x, b.y);
run(beetles, 1);
ok(b.lift > 0.5, "startled beetle took off");
run(beetles, 5);
ok(b.lift === 0, "beetle landed");

// Moths: in flight they keep circling the lamp; switched to crawl, they all land.
const moths = new MothScene();
moths.resize(W, H, 10, 15);
run(moths, 30);
for (const m of moths.moths) ok(Math.hypot(m.x - W / 2, m.y - H * 0.45) < W * 0.6, "moth stays round the lamp");
moths.setMode("crawl");
run(moths, 3);
ok(moths.moths.every((m) => m.lift === 0), "moths landed");
const perched = moths.moths[0];
moths.click(perched.x, perched.y);
run(moths, 0.5);
ok(perched.flash > 0.9, "clicked moth flashed its wings open");

console.log("ok");
