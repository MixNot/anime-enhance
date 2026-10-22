import { build } from "esbuild";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const output = process.env.ANIME_ENHANCE_OUTPUT ? path.resolve(process.env.ANIME_ENHANCE_OUTPUT) : path.resolve(root, "extension");
await mkdir(output, { recursive: true });
await build({
  entryPoints: [path.join(root, "src/content.js"), path.join(root, "src/popup.js")],
  outdir: output, bundle: true, minify: true, format: "iife", target: "chrome113",
  legalComments: "eof", metafile: true,
}).then(async result => writeFile(path.join(root, "build-meta.json"), JSON.stringify(result.metafile, null, 2)));
for (const file of ["manifest.json", "popup.html", "popup.css", "README.md", "CHANGELOG.md"]) {
  await copyFile(path.join(root, file), path.join(output, file));
}
await mkdir(path.join(output, "icons"), { recursive: true });
for (const size of [16, 32, 48, 128]) await copyFile(path.join(root, `icons/${size}.png`), path.join(output, `icons/${size}.png`));
const license = await readFile(path.join(root, "node_modules/anime4k-webgpu-async/LICENSE.md"), "utf8");
await writeFile(path.join(output, "THIRD-PARTY-NOTICES.txt"), "Anime Enhance includes anime4k-webgpu-async 3.2.0.\nhttps://github.com/daika7ana/Anime4K-WebGPU-Async\nBased on Anime4K by bloc97.\nhttps://github.com/bloc97/Anime4K\n\n" + license);
console.log(output);
