import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const corpus = process.env.READER_CORPUS;
const baseURL = process.env.READER_TEST_URL ?? 'http://127.0.0.1:4320';
const first = process.env.READER_FIRST_DOCUMENT ?? 'workflow-projects';
const second = process.env.READER_SECOND_DOCUMENT ?? 'workflow-my-work';
test.use({ viewport: { width: 1440, height: 1000 }, launchOptions: { executablePath: process.env.READER_BROWSER_EXECUTABLE } });
test('thirty warmed article transitions keep body independent of supplemental resources', async ({ page }, info) => {
  await page.goto(`${baseURL}/?doc=${first}`);
  await expect(page.locator('.document .prose')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const results: Array<{ document: string; readableMs: number }> = [];
  for (let i = 0; i < 30; i++) {
    const documentId = i % 2 ? first : second;
    const selector = `.sidebar a[href="?doc=${documentId}"]`;
    const before = performance.now();
    await page.locator(selector).click();
    await expect(page).toHaveURL(new RegExp(`doc=${documentId}`));
    await expect(page.locator('.document .prose')).toBeVisible();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    results.push({ document: documentId, readableMs: performance.now() - before });
  }
  const ordered = results.map((r) => r.readableMs).sort((a, b) => a - b);
  const p95 = ordered[Math.ceil(ordered.length * .95) - 1];
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => {
    const e = entry as PerformanceResourceTiming;
    return { path: new URL(e.name).pathname, duration: e.duration, transferSize: e.transferSize, encodedBodySize: e.encodedBodySize };
  }));
  await writeFile(info.outputPath('warmed-reading.json'), JSON.stringify({ transitions: results, p95, resources }, null, 2));
  expect(p95).toBeLessThanOrEqual(300);
});

test('a cold reader process serves the first readable body within its budget', async ({ browser }, info) => {
  test.skip(!corpus, 'READER_CORPUS points to a complete disposable project corpus');
  const context = await browser.newContext();
  const page = await context.newPage();
  const runtime = new URL('../skills/lumine-harness/assets/harness/wiki/server.mjs', import.meta.url).href;
  const assets = path.resolve('skills/lumine-harness/assets/wiki-reader');
  const before = performance.now();
  const child = spawn(process.execPath, ['--input-type=module', '-e', `const {serveWiki}=await import(process.env.READER_RUNTIME);const s=await serveWiki(process.env.READER_CORPUS,{port:0,assetsRoot:process.env.READER_ASSETS});console.log(s.url);`], {
    env: { ...process.env, READER_RUNTIME: runtime, READER_CORPUS: corpus!, READER_ASSETS: assets }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      let buffer = ''; const timer = setTimeout(() => reject(new Error('Reader did not start')), 5000);
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Reader exited ${code}`)); });
      child.stdout.on('data', (chunk) => { buffer += String(chunk); const match = /http:\/\/127\.0\.0\.1:\d+/.exec(buffer); if (match) { clearTimeout(timer); resolve(match[0]); } });
    });
    const serverReadyMs = performance.now() - before;
    await page.goto(`${url}/?doc=${first}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.document .prose')).toBeVisible();
    const readableMs = performance.now() - before;
    await page.evaluate(() => document.fonts.ready);
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => { const e = entry as PerformanceResourceTiming;return { path: new URL(e.name).pathname, duration: e.duration, transferSize: e.transferSize, encodedBodySize: e.encodedBodySize }; }));
    await writeFile(info.outputPath('cold-reading.json'), JSON.stringify({ serverReadyMs, readableMs, resources }, null, 2));
    expect(readableMs).toBeLessThanOrEqual(1500);
  } finally { child.kill('SIGTERM'); await context.close(); }
});
