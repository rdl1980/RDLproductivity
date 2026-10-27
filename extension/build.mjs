// Writes the injected scripts from the app's sources and zips the extension
// for Chromium browsers and for Firefox into public/extension/.
// Run with: pnpm extension:build
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";

import { generatedScripts } from "./generate.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, "..", "public", "extension");

for (const [name, source] of Object.entries(generatedScripts())) {
  await writeFile(path.join(root, "scripts", name), source);
}

const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const firefox = {
  ...manifest,
  background: { scripts: ["background.js"] },
  browser_specific_settings: {
    gecko: { id: "rdl-kdp-sync@rdlproductivity.vercel.app", strict_min_version: "115.0" },
  },
};

async function zip(target, manifestJson) {
  const archive = new JSZip();
  archive.file("manifest.json", JSON.stringify(manifestJson, null, 2) + "\n");
  for (const file of ["background.js", "bridge.js"]) {
    archive.file(file, await readFile(path.join(root, file)));
  }
  for (const dir of ["scripts", "icons"]) {
    for (const file of await readdir(path.join(root, dir))) {
      archive.file(`${dir}/${file}`, await readFile(path.join(root, dir, file)));
    }
  }
  await mkdir(out, { recursive: true });
  const buffer = await archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await writeFile(path.join(out, target), buffer);
  console.log(`${target}: ${buffer.length} bytes`);
}

await zip("rdl-kdp-sync-chromium.zip", manifest);
await zip("rdl-kdp-sync-firefox.zip", firefox);
