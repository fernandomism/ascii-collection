/**
 * The demo home page: a card for every version with a preview rendered from the
 * real scene. A card opens its scene full-screen (#id in the address, so the back
 * button and Escape return to the cards).
 */
import { BugEngine } from "./core/engine";
import { Renderer } from "./core/render";
import { makeScene } from "./scenes";

interface Version {
  id: string;
  section: "insects" | "nature";
  title: string;
  look?: "color" | "grey";
  scene: string;
  mode?: string;
  about: string;
}

const ABOUT = {
  fly: "Five moths circle a lamp, and your cursor is a second lamp. Click to move the lamp.",
  crawl: "Perched moths walk and now and then flutter off. Click one to flash its eyespots.",
  beetles: "Seven beetles walk their loops in and out of view, gnats drifting over. Click one to make it fly.",
  ants: "Ants explore in and out of view. Click to drop food and watch them carry it home.",
};

/** A scene in colour and in grey, side by side. */
const pair = (id: string, v: Omit<Version, "id" | "look">): Version[] =>
  (["color", "grey"] as const).map((look) => ({ ...v, id: `${id}-${look}`, look }));

const VERSIONS: Version[] = [
  ...pair("moths-fly", { section: "insects", title: "moths · flying", scene: "moths", mode: "fly", about: ABOUT.fly }),
  ...pair("moths-crawl", { section: "insects", title: "moths · crawling", scene: "moths", mode: "crawl", about: ABOUT.crawl }),
  {
    id: "moths-swarm", section: "insects", title: "moth swarm", scene: "moth-swarm",
    about: "Dozens of small, plain moths spiral round a lamp; your cursor is a second light. Click to scatter them.",
  },
  ...pair("beetles", { section: "insects", title: "beetles", scene: "beetles", about: ABOUT.beetles }),
  ...pair("ants", { section: "insects", title: "ants", scene: "ants", about: ABOUT.ants }),
  { id: "leaves", section: "nature", title: "falling leaves", scene: "leaves", about: "Maple, oak, birch and ginkgo leaves tumbling down in autumn colours." },
  {
    id: "pond", section: "nature", title: "koi pond", scene: "pond",
    about: "A koi pond seen from a second-floor window: pink water lilies, red and blue dragonflies, a faint reflection drifting by. Click to feed the koi.",
  },
];

/** Render one still of a scene into a card's canvas, at a desktop-sized frame scaled down. */
function preview(canvas: HTMLCanvasElement, v: Version) {
  const W = 960;
  const H = 600;
  const scene = makeScene(v.scene, v.mode);
  const r = new Renderer(canvas);
  r.setFontFamily(getComputedStyle(canvas).fontFamily);
  if (scene.backdrop) r.backdrop = scene.backdrop;
  r.resize(W, H, (canvas.clientWidth / W) * Math.min(devicePixelRatio || 1, 2));
  if (v.look === "grey") r.setGrey(true);
  scene.resize(W, H, r.cellWidth, r.cellHeight);
  r.paintGround(scene.ground?.bind(scene));
  for (let i = 0; i < 240; i++) scene.step(1 / 60);
  // Show off the interaction: a ripple and food on the pond, food for the ants.
  if (v.scene === "pond" || v.scene === "ants") scene.click?.(W * 0.45, H * 0.5);
  for (let i = 0; i < 70; i++) scene.step(1 / 60);
  r.begin(scene.time);
  scene.draw(r);
  r.flush();
}

const home = document.getElementById("home")!;
const stage = document.getElementById("stage")!;
const stageCanvas = stage.querySelector("canvas")!;
const stageTitle = document.getElementById("stage-title")!;

const cards: [HTMLCanvasElement, Version][] = [];
for (const v of VERSIONS) {
  const a = document.createElement("a");
  a.className = "card";
  a.href = `#${v.id}`;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = v.title;
  const head = document.createElement("span");
  head.className = "head";
  head.append(name);
  if (v.look) {
    const chip = document.createElement("span");
    chip.className = `chip ${v.look}`;
    chip.textContent = v.look;
    head.append(chip);
  }
  const about = document.createElement("span");
  about.className = "about";
  about.textContent = v.about;
  a.append(canvas, head, about);
  document.getElementById(v.section)!.append(a);
  cards.push([canvas, v]);
}

// Previews wait for the mono font so their glyphs match the scenes, and for the cards to be on
// screen (a page opened straight onto a scene has them hidden, at zero size).
let fontsReady = false;
let previewed = false;
function drawPreviews() {
  if (previewed || !fontsReady || home.hidden) return;
  previewed = true;
  for (const [canvas, v] of cards) preview(canvas, v);
}
document.fonts.ready.then(() => {
  fontsReady = true;
  drawPreviews();
});

let engine: BugEngine | undefined;
function route() {
  engine?.destroy();
  engine = undefined;
  const v = VERSIONS.find((x) => x.id === location.hash.slice(1));
  stage.hidden = !v;
  home.hidden = !!v;
  if (!v) return drawPreviews();
  stageTitle.textContent = v.look ? `${v.title} · ${v.look}` : v.title;
  engine = new BugEngine(stageCanvas, makeScene(v.scene, v.mode));
  if (v.look === "grey") engine.setGrey(true);
}
addEventListener("hashchange", route);
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !stage.hidden) location.hash = "";
});
route();
