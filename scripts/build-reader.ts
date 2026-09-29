import { build } from "esbuild";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
const root = process.cwd(),
  src = path.join(root, "skills/lumine-harness/src/browser"),
  dest = path.join(root, "skills/lumine-harness/assets/wiki-reader");
const stage = mkdtempSync(path.join(os.tmpdir(), "lumine-reader-"));
function walk(p: string): string[] {
  return existsSync(p)
    ? readdirSync(p, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(p, e.name)) : [path.join(p, e.name)],
      )
    : [];
}
try {
  const result = await build({
    entryPoints: [path.join(src, "reader.ts")],
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
    licenses.join("\n\n--------------------\n\n"),
  );
  const manifest = Object.fromEntries(
    walk(stage).map((f) => [
      path.relative(stage, f).split(path.sep).join("/"),
      createHash("sha256").update(readFileSync(f)).digest("hex"),
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
    mkdirSync(dest, { recursive: true });
    for (const f of walk(dest))
      if (!existsSync(path.join(stage, path.relative(dest, f)))) rmSync(f);
    for (const f of walk(stage)) {
      const to = path.join(dest, path.relative(stage, f));
      mkdirSync(path.dirname(to), { recursive: true });
      copyFileSync(f, to);
    }
  }
  process.stdout.write("Reader bundle and offline assets verified\n");
} finally {
  rmSync(stage, { recursive: true, force: true });
}
