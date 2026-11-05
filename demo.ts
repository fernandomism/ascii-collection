import { AntScene, BeetleScene, BugEngine, MothScene, type BeetleKind, type MothKind, type MothMode, type Scene } from "./src";

// #moths | #beetles | #ants  ·  ?kinds=stag,hercules (beetles or moths)  ·  ?mode=crawl (moths start perched)
// The bug lives in the hash so the page also works where query strings don't reach it (embedded frames).
const params = new URLSearchParams(location.search);
const kinds = params.get("kinds")?.split(",").filter(Boolean);
const canvas = document.querySelector("canvas")!;
const hint = document.getElementById("hint")!;
const modes = document.getElementById("modes")!;
const modeButtons = modes.querySelectorAll<HTMLButtonElement>("button");

const lookButtons = document.querySelectorAll<HTMLButtonElement>("#looks button");
const lights = document.getElementById("lights")!;
const lightButtons = lights.querySelectorAll<HTMLButtonElement>("button");

let engine: BugEngine | undefined;
let moths: MothScene | undefined;
let ticker = 0;
let grey = false;
const lit = { lamp: true, cursor: true };

function setLook(on: boolean) {
  grey = on;
  for (const b of lookButtons) b.setAttribute("aria-pressed", String((b.dataset.look === "grey") === on));
  engine?.setGrey(on);
}

function setMode(mode: MothMode) {
  if (!moths) return;
  moths.setMode(mode);
  for (const b of modeButtons) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  setLights();
}

/** Apply the lamp / cursor-light switches to the moths and the buttons. */
function setLights() {
  if (!moths) return;
  moths.lampOn = lit.lamp;
  moths.cursorLight = lit.cursor;
  for (const b of lightButtons) {
    const on = lit[b.dataset.light as keyof typeof lit];
    b.setAttribute("aria-pressed", String(on));
    b.textContent = `[${on ? "x" : " "}] ${b.dataset.light === "lamp" ? "lamp" : "cursor light"}`;
  }
  hint.textContent =
    moths.mode === "crawl"
      ? "click a moth to startle it"
      : lit.lamp
        ? "click to move the lamp"
        : lit.cursor
          ? "your cursor is the lamp"
          : "no light: the moths roam";
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
  modes.hidden = lights.hidden = !moths;
  engine = new BugEngine(canvas, scene);
  if (grey) engine.setGrey(true);
  if (moths) setMode(moths.mode);
}

for (const b of modeButtons) b.addEventListener("click", () => setMode(b.dataset.mode as MothMode));
for (const b of lookButtons) b.addEventListener("click", () => setLook(b.dataset.look === "grey"));
for (const b of lightButtons) {
  b.addEventListener("click", () => {
    const k = b.dataset.light as keyof typeof lit;
    lit[k] = !lit[k];
    setLights();
  });
}
window.addEventListener("hashchange", show);
show();
