import { build } from "esbuild";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  lstatSync,
  renameSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const LICENSE_SEPARATOR = "\n\n--------------------\n\n";
const CHUNK_PATH = /^chunks\/[^/]+\.js(?:\.LEGAL\.txt)?$/;
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function walk(p: string): string[] {
  return existsSync(p)
    ? readdirSync(p, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(p, e.name)) : [path.join(p, e.name)],
      )
    : [];
}

function mergeLicenses(current: string, previous: string): string {
  const blocks = [current, previous].flatMap((text) => text.split(LICENSE_SEPARATOR));
  return [...new Set(blocks.filter((block) => block.trim()))].join(LICENSE_SEPARATOR);
}

export function retainPreviousReaderChunks(stage: string, dest: string): void {
  const manifestFile = path.join(dest, "manifest.json");
  if (!existsSync(manifestFile)) {
    if (walk(dest).length) throw new Error("Reader distribution has no manifest; recover it before rebuilding");
    return;
  }
  const previous = JSON.parse(readFileSync(manifestFile, "utf8")) as {
    schemaVersion?: unknown;
    files?: Record<string, unknown>;
  };
  if (previous.schemaVersion !== 1 || !previous.files || typeof previous.files !== "object" || Array.isArray(previous.files))
    throw new Error("Reader distribution manifest is invalid");

  const oldChunks = Object.entries(previous.files).filter(([relative]) => CHUNK_PATH.test(relative));
  for (const [relative, expected] of oldChunks) {
    if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) throw new Error(`Invalid reader chunk hash: ${relative}`);
    const oldFile = path.join(dest, relative);
    if (!existsSync(oldFile) || !lstatSync(oldFile).isFile() || digest(readFileSync(oldFile)) !== expected)
      throw new Error(`Reader chunk changed or missing: ${relative}`);
    const stagedFile = path.join(stage, relative);
    if (existsSync(stagedFile)) {
      if (digest(readFileSync(stagedFile)) !== expected) throw new Error(`Reader chunk name collision: ${relative}`);
    } else {
      mkdirSync(path.dirname(stagedFile), { recursive: true });
      copyFileSync(oldFile, stagedFile);
    }
  }

  const oldLicenses = path.join(dest, "THIRD-PARTY-LICENSES.txt");
  if (oldChunks.length && !existsSync(oldLicenses)) throw new Error("Reader chunk licenses are missing");
  const currentLicenses = path.join(stage, "THIRD-PARTY-LICENSES.txt");
  writeFileSync(currentLicenses, mergeLicenses(
    readFileSync(currentLicenses, "utf8"),
    existsSync(oldLicenses) ? readFileSync(oldLicenses, "utf8") : "",
  ));
}

function atomicCopy(from: string, to: string): void {
  if (existsSync(to) && readFileSync(from).equals(readFileSync(to))) return;
  mkdirSync(path.dirname(to), { recursive: true });
  const temporary = path.join(path.dirname(to), `.${path.basename(to)}.${randomUUID()}.tmp`);
  try {
    copyFileSync(from, temporary);
    renameSync(temporary, to);
  } finally {
    if (existsSync(temporary)) rmSync(temporary);
  }
}

export function publishReaderAssets(stage: string, dest: string): void {
  const staged = walk(stage).map((file) => path.relative(stage, file).split(path.sep).join("/")).sort();
  if (!staged.includes("reader.js") || !staged.includes("manifest.json")) throw new Error("Reader entry or manifest missing");
  mkdirSync(dest, { recursive: true });
  // All new dependencies are in place while the old entry and its retained chunks remain readable.
  for (const relative of staged.filter((file) => file !== "reader.js" && file !== "manifest.json"))
    atomicCopy(path.join(stage, relative), path.join(dest, relative));
  for (const file of walk(dest)) {
    const relative = path.relative(dest, file).split(path.sep).join("/");
    if (staged.includes(relative)) continue;
    if (CHUNK_PATH.test(relative)) throw new Error(`Unregistered reader chunk: ${relative}`);
    rmSync(file);
  }
  atomicCopy(path.join(stage, "reader.js"), path.join(dest, "reader.js"));
  // The manifest records the completed asset set, after the executable entry has switched.
  atomicCopy(path.join(stage, "manifest.json"), path.join(dest, "manifest.json"));
}

async function main(): Promise<void> {
  const root = process.cwd(),
    src = path.join(root, "skills/lumine-harness/src/browser"),
    dest = path.join(root, "skills/lumine-harness/assets/wiki-reader");
  const stage = mkdtempSync(path.join(os.tmpdir(), "lumine-reader-"));
  try {
    const result = await build({
      entryPoints: [path.join(src, "reader.tsx")],
      outdir: stage,
      bundle: true,
      splitting: true,
      format: "esm",
      platform: "browser",
      target: ["es2020"],
      minify: true,
      sourcemap: false,
      metafile: true,
      legalComments: "external",
      chunkNames: "chunks/[name]-[hash]",
    });
    for (const f of ["index.html", "styles.css"])
      copyFileSync(path.join(src, f), path.join(stage, f));
    const seen = new Set<string>(),
      licenses: string[] = [];
    for (const file of Object.keys(result.metafile!.inputs)) {
      let p = path.dirname(path.resolve(file));
      while (p !== path.dirname(p) && p !== root) {
        if (existsSync(path.join(p, "package.json"))) {
          try {
            const pkg = JSON.parse(
              readFileSync(path.join(p, "package.json"), "utf8"),
            );
            const key = pkg.name + "@" + pkg.version;
            if (!seen.has(key)) {
              seen.add(key);
              const names = readdirSync(p).filter((x) =>
                /^(license|licence|copying|notice)(\.|$)/i.test(x),
              );
              licenses.push(
                key +
                  " (" +
                  (pkg.license ?? "see package") +
                  ")\n" +
                  names
                    .map((n) => readFileSync(path.join(p, n), "utf8"))
                    .join("\n"),
              );
            }
            break;
          } catch {}
        }
        p = path.dirname(p);
      }
    }
    writeFileSync(
      path.join(stage, "THIRD-PARTY-LICENSES.txt"),
      licenses.join(LICENSE_SEPARATOR),
    );
    retainPreviousReaderChunks(stage, dest);
    const manifest = Object.fromEntries(
      walk(stage).sort().map((f) => [
        path.relative(stage, f).split(path.sep).join("/"),
        digest(readFileSync(f)),
      ]),
    );
    writeFileSync(
      path.join(stage, "manifest.json"),
      JSON.stringify({ schemaVersion: 1, files: manifest }, null, 2) + "\n",
    );
    if (process.argv.includes("--check")) {
      const a = walk(stage)
          .map((f) => path.relative(stage, f))
          .sort(),
        b = walk(dest)
          .map((f) => path.relative(dest, f))
          .sort();
      if (
        JSON.stringify(a) !== JSON.stringify(b) ||
        a.some(
          (f) =>
            !readFileSync(path.join(stage, f)).equals(
              readFileSync(path.join(dest, f)),
            ),
        )
      )
        throw new Error("Reader distribution is stale; run pnpm runtime:build");
    } else {
      publishReaderAssets(stage, dest);
    }
    process.stdout.write("Reader bundle and offline assets verified\n");
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
