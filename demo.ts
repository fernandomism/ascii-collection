import { AntScene, BeetleScene, BugEngine, MothScene, type BeetleKind, type MothKind, type MothMode, type Scene } from "./src";

// #moths | #beetles | #ants  ·  ?kinds=stag,hercules (beetles or moths)  ·  ?mode=crawl (moths start perched)
// The bug lives in the hash so the page also works where query strings don't reach it (embedded frames).
const params = new URLSearchParams(location.search);
const kinds = params.get("kinds")?.split(",").filter(Boolean);
const canvas = document.querySelector("canvas")!;
const hint = document.getElementById("hint")!;
const modes = document.getElementById("modes")!;
const modeButtons = modes.querySelectorAll<HTMLButtonElement>("button");

let engine: BugEngine | undefined;
let moths: MothScene | undefined;
let ticker = 0;

function setMode(mode: MothMode) {
  if (!moths) return;
  moths.setMode(mode);
  hint.textContent = mode === "fly" ? "click to move the lamp" : "click a moth to startle it";
  for (const b of modeButtons) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  engine?.refresh();
}

function show() {
  const bug = location.hash.slice(1) || "moths";
  engine?.destroy();
  clearInterval(ticker);
  moths = undefined;
  for (const a of document.querySelectorAll("nav a")) {
    if (a.getAttribute("href") === `#${bug}`) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }

  let scene: Scene;
  if (bug === "ants") {
    const ants = new AntScene();
    scene = ants;
    const status = () => (hint.textContent = `click to drop food · ${ants.status()}`);
    status();
    ticker = window.setInterval(status, 500);
  } else if (bug === "beetles") {
    scene = new BeetleScene(kinds as BeetleKind[] | undefined);
    hint.textContent = "click a beetle to startle it";
  } else {
    scene = moths = new MothScene(kinds as MothKind[] | undefined, params.get("mode") === "crawl" ? "crawl" : "fly");
  }
  modes.hidden = !moths;
  engine = new BugEngine(canvas, scene);
  if (moths) setMode(moths.mode);
}

for (const b of modeButtons) b.addEventListener("click", () => setMode(b.dataset.mode as MothMode));
window.addEventListener("hashchange", show);
show();
