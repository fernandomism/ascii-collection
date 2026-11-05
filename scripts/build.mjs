// Builds every page in insects/ and nature/ into dist/ as one self-contained
// HTML file each (script inlined), so a page opens with a double-click.
import { build } from "esbuild";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const { outputFiles } = await build({ entryPoints: ["src/main.ts"], bundle: true, format: "iife", minify: true, write: false });
const js = outputFiles[0].text.replaceAll("</script", "<\\/script");
for (const dir of ["insects", "nature"]) {
  mkdirSync(`dist/${dir}`, { recursive: true });
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".html"))) {
    const html = readFileSync(`${dir}/${file}`, "utf8").replace(/<script type="module" src="[^"]*"><\/script>/, () => `<script>${js}</script>`);
    if (!html.includes(js)) throw new Error(`${dir}/${file}: no module script to inline`);
    writeFileSync(`dist/${dir}/${file}`, html);
    console.log(`dist/${dir}/${file}`);
  }
}
