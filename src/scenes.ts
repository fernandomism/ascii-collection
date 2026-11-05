import type { Scene } from "./core/engine";
import { AntScene } from "./insects/ants";
import { BeetleScene } from "./insects/beetles";
import { MothScene } from "./insects/moths";
import { LeavesScene } from "./nature/leaves";
import { PondScene } from "./nature/pond";

/** A fresh scene by name (moths | beetles | ants | leaves | pond); mode is the moths' fly | crawl. */
export function makeScene(name = "moths", mode?: string): Scene {
  if (name === "beetles") return new BeetleScene();
  if (name === "ants") return new AntScene();
  if (name === "leaves") return new LeavesScene();
  if (name === "pond") return new PondScene();
  return new MothScene(undefined, mode === "crawl" ? "crawl" : "fly");
}
