/**
 * Starts the scene a page asks for on its canvas:
 *   <canvas data-scene="moths" data-mode="crawl" data-look="grey">
 * scene: moths | moth-swarm | beetles | ants | leaves | pond · mode (moths): fly | crawl · look: color | grey
 */
import { BugEngine } from "./core/engine";
import { makeScene } from "./scenes";

const canvas = document.querySelector("canvas")!;
const { scene, mode, look } = canvas.dataset;
const engine = new BugEngine(canvas, makeScene(scene, mode));
if (look === "grey") engine.setGrey(true);
