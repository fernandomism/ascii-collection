// Builds the home page and every page in insects/ and nature/ into dist/ as one
// self-contained HTML file each (script inlined), so a page opens with a double-click.
import { build } from "esbuild";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

async function inline(entry, pages) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: "iife", minify: true, write: false });
  const js = outputFiles[0].text.replaceAll("</script", "<\\/script");
  for (const page of pages) {
    const html = readFileSync(page, "utf8").replace(/<script type="module" src="[^"]*"><\/script>/, () => `<script>${js}</script>`);
    if (!html.includes(js)) throw new Error(`${page}: no module script to inline`);
    mkdirSync(dirname(`dist/${page}`), { recursive: true });
    writeFileSync(`dist/${page}`, html);
    console.log(`dist/${page}`);
  }
}

const scenes = ["insects", "nature"].flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith(".html")).map((f) => `${dir}/${f}`));
await inline("src/main.ts", scenes);
await inline("src/home.ts", ["index.html"]);
