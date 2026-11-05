/**
 * Starts the scene a page asks for on its canvas:
 *   <canvas data-scene="moths" data-mode="crawl" data-look="grey">
 * scene: moths | beetles | ants | leaves | pond · mode (moths): fly | crawl · look: color | grey
 */
import { BugEngine, type Scene } from "./core/engine";
import { AntScene } from "./insects/ants";
import { BeetleScene } from "./insects/beetles";
import { MothScene } from "./insects/moths";
import { LeavesScene } from "./nature/leaves";
import { PondScene } from "./nature/pond";

const canvas = document.querySelector("canvas")!;
const { scene, mode, look } = canvas.dataset;
const SCENES: Record<string, () => Scene> = {
  moths: () => new MothScene(undefined, mode === "crawl" ? "crawl" : "fly"),
  beetles: () => new BeetleScene(),
  ants: () => new AntScene(),
  leaves: () => new LeavesScene(),
  pond: () => new PondScene(),
};
const engine = new BugEngine(canvas, (SCENES[scene ?? ""] ?? SCENES.moths)());
if (look === "grey") engine.setGrey(true);
