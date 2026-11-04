import { AntScene, BeetleScene, BugEngine, MothScene, type BeetleKind, type MothKind, type MothMode, type Scene } from "./src";

// ?bug=moths|beetles|ants  ·  ?kinds=stag,hercules (beetles or moths)  ·  ?mode=fly|crawl (moths)
const params = new URLSearchParams(location.search);
const bug = params.get("bug") ?? "moths";
const kinds = params.get("kinds")?.split(",").filter(Boolean);
const hint = document.getElementById("hint")!;
document.querySelector(`nav a[href="?bug=${bug}"]`)?.setAttribute("aria-current", "page");

let scene: Scene;
let onMode: ((mode: MothMode) => void) | undefined;
if (bug === "ants") {
  const ants = new AntScene();
  scene = ants;
  const show = () => (hint.textContent = `click to drop food · ${ants.status()}`);
  show();
  setInterval(show, 500);
} else if (bug === "beetles") {
  scene = new BeetleScene(kinds as BeetleKind[] | undefined);
  hint.textContent = "click a beetle to startle it";
} else {
  const moths = new MothScene(kinds as MothKind[] | undefined, params.get("mode") === "crawl" ? "crawl" : "fly");
  scene = moths;
  onMode = (mode) => {
    moths.setMode(mode);
    hint.textContent = mode === "fly" ? "click to move the lamp" : "click a moth to startle it";
    for (const b of document.querySelectorAll<HTMLButtonElement>("#modes button")) {
      b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
    }
    params.set("mode", mode);
    history.replaceState(null, "", `?${params}`);
  };
}

const engine = new BugEngine(document.querySelector("canvas")!, scene);

if (onMode) {
  const setMode = onMode;
  const modes = document.getElementById("modes")!;
  modes.hidden = false;
  for (const b of modes.querySelectorAll<HTMLButtonElement>("button")) {
    b.addEventListener("click", () => {
      setMode(b.dataset.mode as MothMode);
      engine.refresh();
    });
  }
  setMode(params.get("mode") === "crawl" ? "crawl" : "fly");
}
