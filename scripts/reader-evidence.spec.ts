import { expect, test, type Locator } from '@playwright/test';

const baseURL = process.env.READER_TEST_URL ?? 'http://127.0.0.1:4320';
test.use({ baseURL, launchOptions: { executablePath: process.env.READER_BROWSER_EXECUTABLE }, viewport: { width: 1440, height: 1000 } });
const article = '/?doc=flow-engine';

function firstVisibleLine(body: Locator) {
  return body.evaluate((element) => {
    const top = element.getBoundingClientRect().top;
    const line = [...element.querySelectorAll<HTMLElement>('[data-reading-line]')].find((row) => row.getClientRects().length && row.getBoundingClientRect().bottom > top);
    return Number(line?.dataset.readingLine);
  });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 1280, height: 900 }, { width: 1024, height: 768 }, { width: 640, height: 450 }]) {
  test(`wide source, code reflow and focus at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto(article);
    const step = page.locator('#flow-version-steps-publish');
    const trigger = step.getByRole('button', { name: '查看来源', exact: true });
    await expect(trigger).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    await trigger.scrollIntoViewIfNeeded();
    const originalOffset = await trigger.evaluate((element) => element.getBoundingClientRect().top);
    await trigger.click();
    const dialog = page.getByRole('dialog');
    const body = dialog.locator('.evidence-body');
    const code = dialog.locator('.source-lines');
    await expect(code).toBeVisible();
    await expect(code).toHaveAttribute('data-wrap', 'true');
    await expect.poll(async () => (await dialog.boundingBox())!.width).toBeGreaterThanOrEqual(viewport.width - 65);
    await expect.poll(() => body.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.evaluate(() => document.fonts.ready);
    await body.locator('[data-source-line="85"]').evaluate((row) => row.scrollIntoView({ block: 'start', behavior: 'instant' }));
    const anchor = await firstVisibleLine(body);
    const codeRequests: string[] = [];
    page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/source') codeRequests.push(request.url()); });
    const sourceUrl = page.url();
    await dialog.getByRole('button', { name: '全窗口查看', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '还原大小', exact: true })).toBeVisible();
    await expect.poll(async () => (await dialog.boundingBox())!.width).toBeGreaterThanOrEqual(viewport.width - 20);
    expect(await firstVisibleLine(body)).toEqual(anchor);
    await dialog.getByRole('button', { name: '保留原行', exact: true }).click();
    await expect(code).toHaveAttribute('data-wrap', 'false');
    expect(await firstVisibleLine(body)).toEqual(anchor);
    await dialog.getByRole('button', { name: '还原大小', exact: true }).click();
    await expect(code).toHaveCSS('max-height', 'none');
    await expect.poll(() => body.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await expect(page).toHaveURL(sourceUrl);
    expect(codeRequests).toEqual([]);
    await page.screenshot({ path: info.outputPath(`wide-source-${viewport.width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect.poll(async () => Math.abs(await trigger.evaluate((element) => element.getBoundingClientRect().top) - originalOffset)).toBeLessThan(2);
  });
}

test('source deep links keep focused lines and failed requests can retry', async ({ page }) => {
  let fail = true;
  await page.route('**/api/source?*', (route) => {
    if (!fail) return route.continue();
    fail = false;
    return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } });
  });
  await page.goto(`${article}&source=s4&sourceStart=85&sourceEnd=87`);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('来源暂时不可读取');
  await dialog.getByRole('button', { name: '重试', exact: true }).click();
  await expect(dialog.locator('[data-source-line="85"]')).toBeInViewport();
  await expect(dialog.locator('.source-line-target')).toHaveCount(3);
  await dialog.getByRole('button', { name: '全窗口查看', exact: true }).click();
  await expect(page).toHaveURL(/sourceStart=85&sourceEnd=87/);
  await page.reload();
  await expect(dialog.locator('[data-source-line="85"]')).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\?doc=flow-engine$/);
  await expect(dialog).toBeHidden();
});

test('Markdown fences and lumine-view code share enlargement and lossless copying', async ({ page, context }) => {
  // Inject two deterministic examples into the actual reader response without editing the served corpus.
  const line = `  // 中文注释 ${'veryLongUnbrokenPath'.repeat(24)}`;
  const plain = `${line}\n  return 1`;
  const structured = '  // 下方空格和缩进属于原文\n  return 2  ';
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/document?*', async (route) => {
    const response = await route.fetch(), doc = await response.json();
    doc.body += [
      '', '## 宽屏源码夹具', '', '```ts', plain, '```', '', '```lumine-view',
      JSON.stringify({ version: 1, type: 'code', id: 'expanded-code-fixture', caption: '声明式代码', code: structured, language: 'ts' }),
      '```', '',
    ].join('\n');
    await route.fulfill({ response, json: doc });
  });
  await page.goto(article);
  const buttons = page.locator('.article-code').getByRole('button', { name: '放大阅读', exact: true });
  await expect(buttons).toHaveCount(2);
  const dialog = page.getByRole('dialog');
  await buttons.first().click();
  await expect(dialog.locator('.source-lines code').first()).toHaveText(line);
  await expect.poll(() => dialog.locator('.source-lines').evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await dialog.getByRole('button', { name: '保留原行', exact: true }).click();
  await expect.poll(() => dialog.locator('.source-lines').evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(100);
  await dialog.getByRole('button', { name: '复制代码', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(plain);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(buttons.first()).toBeFocused();
  await buttons.last().click();
  await expect(dialog.getByRole('heading', { name: '声明式代码' })).toBeVisible();
  await dialog.getByRole('button', { name: '复制代码', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(structured);
  await page.keyboard.press('Escape');
  await expect(buttons.last()).toBeFocused();
  await expect(page).toHaveURL(/\?doc=flow-engine$/);
});

test('Markdown source keeps location between reading and original modes', async ({ page }) => {
  test.skip(!process.env.READER_SOURCE_URL, 'READER_SOURCE_URL points to the upstream knowledge example');
  await page.goto(`${process.env.READER_SOURCE_URL}/?doc=reader-explanation&source=maintenance-skill`);
  const dialog = page.getByRole('dialog');
  const body = dialog.locator('.evidence-body');
  const prose = dialog.locator('.reference-prose');
  await expect(prose).toBeVisible();
  const block = prose.locator('[data-reading-line]').nth(8);
  await block.evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  const line = await firstVisibleLine(body);
  expect(line).toBeGreaterThan(8);
  await dialog.getByRole('button', { name: '查看原文', exact: true }).click();
  await expect(dialog.locator(`[data-source-line="${line}"]`)).toBeInViewport();
  await dialog.getByRole('button', { name: '阅读文档', exact: true }).click();
  await expect(prose.locator(`[data-reading-line="${line}"]`)).toBeInViewport();
});

test('browser Back clears enlarged code and copy feedback from the newer source', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/reference?*', (route) => route.fulfill({
    json: { kind: 'source', path: 'evidence-b.md', documentId: 'flow-engine', sourceId: 's4' },
  }));
  await page.route('**/api/source?*', (route) => {
    const id = new URL(route.request().url()).searchParams.get('id');
    const first = id === 's3';
    const title = first ? '较早的来源' : '较新的来源';
    const path = first ? 'evidence-a.md' : 'evidence-b.md';
    const body = first
      ? '# 较早的来源\n\n[打开较新的来源](evidence-b.md)'
      : '# 较新的来源\n\n```ts\nconst onlyInSecondSource = true\n```';
    return route.fulfill({
      json: {
        source: { id, repoId: 'project', path }, title, text: body,
        startLine: 1, endLine: body.split('\n').length, totalLines: body.split('\n').length,
        fingerprint: 'fixture', baselineFingerprint: null,
        markdown: { body, title, path, sections: [], referenceFrom: `flow-engine#source:${id}` },
      },
    });
  });
  await page.goto(`${article}&source=s3`);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('link', { name: '打开较新的来源', exact: true }).click();
  await expect(page).toHaveURL(/source=s4$/);
  const enlarge = dialog.getByRole('button', { name: '放大阅读', exact: true });
  await enlarge.click();
  await expect(dialog.locator('.source-lines')).toContainText('onlyInSecondSource');
  await dialog.getByRole('button', { name: '全窗口查看', exact: true }).click();
  await dialog.getByRole('button', { name: '还原大小', exact: true }).click();
  await expect(dialog.locator('.source-lines')).toContainText('onlyInSecondSource');
  await dialog.getByRole('button', { name: '复制代码', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('已复制');

  await page.goBack();
  await expect(page).toHaveURL(/source=s3$/);
  await expect(dialog.getByRole('link', { name: '打开较新的来源', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeFocused();
  await expect(dialog.locator('.source-lines')).toHaveCount(0);
  await expect(dialog.getByRole('status')).toBeEmpty();

  await page.goForward();
  await expect(page).toHaveURL(/source=s4$/);
  await expect(enlarge).toBeVisible();
  await expect(dialog.locator('.source-lines')).toHaveCount(0);
});
