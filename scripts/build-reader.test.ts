import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { publishReaderAssets, retainPreviousReaderChunks } from "./build-reader.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "lumine-reader-build-test-"));
  const dest = path.join(root, "published"), stage = path.join(root, "stage");
  mkdirSync(path.join(dest, "chunks"), { recursive: true });
  mkdirSync(path.join(stage, "chunks"), { recursive: true });
  const oldChunk = "export const version = 'old';\n";
  const oldChunkLegal = "Old chunk legal notice\n";
  const oldReader = "import { version } from './chunks/chunk-OLD00000.js';\n";
  const oldLicenses = "shared@1 (MIT)\nShared notice\n\n--------------------\n\nold@1 (MIT)\nOld notice";
  writeFileSync(path.join(dest, "chunks/chunk-OLD00000.js"), oldChunk);
  writeFileSync(path.join(dest, "chunks/chunk-OLD00000.js.LEGAL.txt"), oldChunkLegal);
  writeFileSync(path.join(dest, "reader.js"), oldReader);
  writeFileSync(path.join(dest, "THIRD-PARTY-LICENSES.txt"), oldLicenses);
  writeFileSync(path.join(dest, "manifest.json"), JSON.stringify({ schemaVersion: 1, files: {
    "chunks/chunk-OLD00000.js": hash(oldChunk),
    "chunks/chunk-OLD00000.js.LEGAL.txt": hash(oldChunkLegal),
    "reader.js": hash(oldReader),
    "THIRD-PARTY-LICENSES.txt": hash(oldLicenses),
  } }));
  writeFileSync(path.join(stage, "chunks/chunk-NEW00000.js"), "export const version = 'new';\n");
  writeFileSync(path.join(stage, "reader.js"), "import { version } from './chunks/chunk-NEW00000.js';\n");
  writeFileSync(path.join(stage, "THIRD-PARTY-LICENSES.txt"), "shared@1 (MIT)\nShared notice\n\n--------------------\n\nnew@1 (MIT)\nNew notice");
  return { root, stage, dest, oldChunk, oldChunkLegal, oldReader, close: () => rmSync(root, { recursive: true, force: true }) };
}

test("reader publication retains manifest-verified old chunks and their license notices", () => {
  const data = fixture();
  try {
    retainPreviousReaderChunks(data.stage, data.dest);
    assert.equal(readFileSync(path.join(data.stage, "chunks/chunk-OLD00000.js"), "utf8"), data.oldChunk);
    assert.equal(readFileSync(path.join(data.stage, "chunks/chunk-OLD00000.js.LEGAL.txt"), "utf8"), data.oldChunkLegal);
    const licenses = readFileSync(path.join(data.stage, "THIRD-PARTY-LICENSES.txt"), "utf8");
    assert.match(licenses, /old@1 \(MIT\)/);
    assert.match(licenses, /new@1 \(MIT\)/);
    assert.equal(licenses.match(/shared@1 \(MIT\)/g)?.length, 1);
    writeFileSync(path.join(data.stage, "manifest.json"), JSON.stringify({ schemaVersion: 1, files: {
      "reader.js": hash(readFileSync(path.join(data.stage, "reader.js"), "utf8")),
      "chunks/chunk-OLD00000.js": hash(data.oldChunk),
      "chunks/chunk-OLD00000.js.LEGAL.txt": hash(data.oldChunkLegal),
      "THIRD-PARTY-LICENSES.txt": hash(licenses),
    } }));
    publishReaderAssets(data.stage, data.dest);
    assert.equal(readFileSync(path.join(data.dest, "chunks/chunk-OLD00000.js"), "utf8"), data.oldChunk);
    assert.equal(readFileSync(path.join(data.dest, "chunks/chunk-OLD00000.js.LEGAL.txt"), "utf8"), data.oldChunkLegal);
    assert.ok(existsSync(path.join(data.dest, "chunks/chunk-NEW00000.js")));
    assert.equal(readFileSync(path.join(data.dest, "reader.js"), "utf8"), readFileSync(path.join(data.stage, "reader.js"), "utf8"));
    assert.equal(readFileSync(path.join(data.dest, "manifest.json"), "utf8"), readFileSync(path.join(data.stage, "manifest.json"), "utf8"));
    // A browser holding the previous entry can still resolve its old relative import.
    assert.ok(existsSync(path.join(data.dest, "chunks/chunk-OLD00000.js")));
    // The next --check reconstructs the same stage and must not append duplicate notices.
    retainPreviousReaderChunks(data.stage, data.dest);
    assert.equal(readFileSync(path.join(data.stage, "THIRD-PARTY-LICENSES.txt"), "utf8"), licenses);
  } finally { data.close(); }
});

test("a changed old chunk aborts before publication", () => {
  const data = fixture();
  try {
    writeFileSync(path.join(data.dest, "chunks/chunk-OLD00000.js"), "tampered\n");
    assert.throws(() => retainPreviousReaderChunks(data.stage, data.dest), /Reader chunk changed or missing/);
    assert.equal(readFileSync(path.join(data.dest, "reader.js"), "utf8"), data.oldReader);
  } finally { data.close(); }
});

test("publication failures leave the old entry readable", () => {
  const data = fixture();
  try {
    retainPreviousReaderChunks(data.stage, data.dest);
    writeFileSync(path.join(data.stage, "manifest.json"), "{}");
    writeFileSync(path.join(data.dest, "chunks/chunk-ROGUE000.js"), "unknown\n");
    assert.throws(() => publishReaderAssets(data.stage, data.dest), /Unregistered reader chunk/);
    assert.equal(readFileSync(path.join(data.dest, "reader.js"), "utf8"), data.oldReader);
    assert.equal(readFileSync(path.join(data.dest, "chunks/chunk-OLD00000.js"), "utf8"), data.oldChunk);
    assert.ok(existsSync(path.join(data.dest, "chunks/chunk-NEW00000.js")), "new dependencies are installed before the entry switch");
  } finally { data.close(); }
});
