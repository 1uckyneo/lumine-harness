import { writeFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Point this suite at a disposable reader using a real project corpus.
// Screenshots are review artifacts; passing these checks does not establish human acceptance.
const baseURL = process.env.READER_TEST_URL ?? 'http://127.0.0.1:4320';
const documentId = process.env.READER_TEST_DOCUMENT ?? 'flow-engine';
test.use({ baseURL, launchOptions: { executablePath: process.env.READER_BROWSER_EXECUTABLE }, viewport: { width: 1440, height: 1000 } });
test.describe.configure({ mode: 'default' });
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const errors: string[] = []; runtimeErrors.set(page, errors); page.on('pageerror', (error) => errors.push(error.message)); });
test.afterEach(({ page }) => { expect(runtimeErrors.get(page) ?? []).toEqual([]); });

async function article(page: Page) {
  await page.goto(`/?doc=${encodeURIComponent(documentId)}`);
  await expect(page.locator('.document .prose')).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; });
}

function assertNoDocumentOverflow(page: Page) {
  return expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test('article typography, keyboard navigation and same-page anchors', async ({ page }) => {
  await article(page);
  const typography = await page.locator('.prose').evaluate((element) => {
    const css = getComputedStyle(element);
    return { size: css.fontSize, lineHeight: css.lineHeight, family: css.fontFamily, width: element.getBoundingClientRect().width };
  });
  expect(typography.size).toBe('18px');
  expect(typography.lineHeight).toBe('31.5px');
  expect(typography.family).toContain('Noto Sans SC');
  const loadedFonts = await page.evaluate(() => [...document.fonts].filter((font) => font.status === 'loaded').map((font) => font.family));
  expect(loadedFonts.some((family) => family.includes('Noto Sans SC'))).toBe(true);
  expect(loadedFonts.some((family) => family.includes('Noto Serif SC'))).toBe(true);
  expect(typography.width).toBeGreaterThanOrEqual(680);
  expect(typography.width).toBeLessThanOrEqual(760);
  await expect(page.locator('.doc-header h1')).toHaveCSS('font-size', '34px');
  expect(await page.locator('.doc-header h1').evaluate((element) => getComputedStyle(element).fontFamily)).toContain('Noto Serif SC');
  const requests: string[] = [];
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/document') requests.push(request.url()); });
  const link = page.locator('.doc-aside a').nth(1);
  const fragment = await link.getAttribute('href');
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${fragment!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(requests).toHaveLength(0);
  await page.goBack();
  await expect(page.locator('.document .prose')).toBeVisible();
  expect(requests).toHaveLength(0);
  await assertNoDocumentOverflow(page);
});

test('focus reading preserves content and source dialog restores focus', async ({ page }, info) => {
  await article(page);
  const title = await page.locator('.doc-header h1').textContent();
  await page.getByRole('button', { name: '专注阅读', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.doc-aside')).toBeHidden();
  await expect(page.locator('.doc-header h1')).toHaveText(title!);
  await page.getByRole('button', { name: '本页导航', exact: true }).click();
  await expect(page.locator('.contents-popover')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.contents-popover')).toBeHidden();
  await page.getByRole('button', { name: '退出专注阅读', exact: true }).click();
  const sources = page.locator('#document-evidence details').first();
  await sources.locator('summary').click();
  const sourceLink = sources.locator('.page-source-list a').first();
  await sourceLink.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.source-lines, .reference-prose')).toBeVisible();
  const code = dialog.locator('.source-lines');
  if (await code.count()) {
    await expect(code).toHaveCSS('background-color', 'rgb(23, 23, 21)');
    await expect(dialog.getByRole('button', { name: '复制源码', exact: true })).toBeVisible();
  }
  await page.screenshot({ path: info.outputPath('source-code-expanded.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(sourceLink).toBeFocused();
});

test('search keeps excerpts compact and exposes more matches on demand', async ({ page }) => {
  await page.goto('/?search=1&q=flow');
  await expect(page.locator('.result-card').first()).toBeVisible();
  const excerpts = page.locator('.result-excerpt');
  expect(await excerpts.count()).toBeGreaterThan(0);
  for (const element of await excerpts.all()) await expect(element).toHaveCSS('-webkit-line-clamp', '3');
  const more = page.getByRole('button', { name: /查看其余/ }).first();
  if (await more.count()) {
    await more.click();
    await expect(page.getByRole('button', { name: '收起匹配' }).first()).toHaveAttribute('aria-expanded', 'true');
  }
  await page.getByRole('tab', { name: '全体文档', exact: true }).click();
  await expect(page.getByRole('tab', { name: '全体文档', exact: true })).toHaveAttribute('aria-selected', 'true');
  await assertNoDocumentOverflow(page);
});

test('diagram keeps natural text size and offers keyboard zoom', async ({ page }, info) => {
  await article(page);
  const figure = page.locator('.diagram').first();
  await figure.scrollIntoViewIfNeeded();
  const svg = figure.locator('.diagram-canvas svg');
  await expect(svg).toBeVisible({ timeout: 30000 });
  const sizing = await svg.evaluate((element) => ({ natural: (element as SVGSVGElement).viewBox.baseVal.width, rendered: element.getBoundingClientRect().width }));
  expect(sizing.rendered).toBeGreaterThanOrEqual(sizing.natural - 1);
  await figure.getByRole('button').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.diagram-zoom-content svg')).toBeVisible();
  const viewport = dialog.locator('.diagram-viewport');
  await expect(viewport).toHaveAttribute('data-ready', 'true');
  const originalScale = await dialog.locator('.zoom-level').textContent();
  await viewport.focus();
  await expect(viewport).toBeFocused();
  await page.keyboard.press('+');
  await expect(dialog.locator('.zoom-level')).not.toHaveText(originalScale!);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('0');
  await page.screenshot({ path: info.outputPath('diagram-viewer.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

for (const width of [1024, 1280, 1440]) {
  test(`reading review artifacts at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await article(page);
    await assertNoDocumentOverflow(page);
    await page.screenshot({ path: info.outputPath(`article-${width}.png`) });
    const resources = await page.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map((entry) => ({ path: new URL(entry.name).pathname, duration: entry.duration, transferredBytes: entry.transferSize, encodedBytes: entry.encodedBodySize })));
    await writeFile(info.outputPath('resource-loads.json'), JSON.stringify(resources, null, 2));
    await info.attach('resource-loads.json', { path: info.outputPath('resource-loads.json'), contentType: 'application/json' });
    await page.locator('.prose h2').nth(1).evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.screenshot({ path: info.outputPath(`article-middle-${width}.png`) });
    if (width < 1280) { await expect(page.locator('.doc-aside')).toBeHidden(); await expect(page.locator('.compact-contents')).toBeVisible(); }
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    await writeFile(info.outputPath('accessibility.json'), JSON.stringify(results.violations, null, 2));
    await info.attach('accessibility.json', { path: info.outputPath('accessibility.json'), contentType: 'application/json' });
    expect(results.violations).toEqual([]);
  });
}

test('200% layout equivalent retains text size and navigation', async ({ browser }, info) => {
  // A 1280px desktop at 200% has a 640px CSS viewport. This checks reflow,
  // not the host browser's zoom menu; record actual host zoom separately.
  const context = await browser.newContext({ baseURL, viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await article(page);
  await expect(page.locator('.prose')).toHaveCSS('font-size', '18px');
  await assertNoDocumentOverflow(page);
  await page.getByRole('button', { name: '打开知识目录', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.main')).toHaveAttribute('inert', '');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('.sidebar') !== null)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.screenshot({ path: info.outputPath('article-200-percent-layout.png') });
  await context.close();
});

test('linked steps and isolated explainer explain a real maintenance mechanism', async ({ page }, info) => {
  test.skip(!process.env.READER_SOURCE_URL, 'READER_SOURCE_URL points to the upstream knowledge example');
  await page.goto(`${process.env.READER_SOURCE_URL}/?doc=reader-explanation`);
  await expect(page.locator('.document .prose')).toBeVisible();
  const figure = page.locator('#impact-path');
  await figure.scrollIntoViewIfNeeded();
  await expect(figure.locator('svg')).toBeVisible();
  const step = page.locator('#impact-walkthrough-connect');
  await step.getByRole('button', { name: '在图中查看这一步', exact: true }).click();
  await expect(figure.locator('[data-node-id="related"]')).toHaveClass(/is-explained/);
  await expect(step).toHaveAttribute('data-selected', 'true');
  await expect(figure.locator('[data-node-id="changed"]')).toHaveAttribute('data-explanation-muted', 'true');
  await page.screenshot({ path: info.outputPath('linked-steps.png') });
  const explanation = page.locator('#impact-experiment');
  await expect(explanation.locator('iframe')).toHaveCount(0);
  await explanation.getByRole('button', { name: '打开交互示例', exact: true }).click();
  const frameElement = explanation.locator('iframe');
  await expect(frameElement).toHaveAttribute('sandbox', 'allow-scripts');
  const frame = page.frameLocator('#impact-experiment iframe');
  await expect(frame.locator('#mechanism')).toHaveAttribute('data-state', 'direct');
  const frameFonts = await frame.locator('body').evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((font) => font.status === 'loaded').map((font) => font.family); });
  expect(frameFonts.some((family) => family.includes('Noto Sans SC'))).toBe(true);
  expect(frameFonts.some((family) => family.includes('Noto Serif SC'))).toBe(true);
  await writeFile(info.outputPath('explainer-fonts.json'), JSON.stringify(frameFonts, null, 2));
  await expect(frame.locator('#guide')).toHaveAttribute('data-state', 'related');
  await expect(frame.locator('#topic')).toHaveAttribute('data-state', 'none');
  await frame.locator('#change').selectOption('guide');
  await expect(frame.locator('#guide')).toHaveAttribute('data-state', 'direct');
  await expect(frame.locator('#topic')).toHaveAttribute('data-state', 'related');
  await frame.locator('#relation').uncheck();
  await expect(frame.locator('#mechanism')).toHaveAttribute('data-state', 'none');
  await frame.locator('#change').selectOption('unknown');
  await expect(frame.locator('#results')).toContainText('没有命中');
  expect(await frame.locator('body').evaluate(() => { try { void parent.document.body; return false; } catch (error) { return error instanceof DOMException && error.name === 'SecurityError'; } })).toBe(true);
  await explanation.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('interactive-explanation.png') });
  const accessibility = await new AxeBuilder({ page }).analyze();
  await writeFile(info.outputPath('source-sample-accessibility.json'), JSON.stringify(accessibility.violations, null, 2));
  expect(accessibility.violations).toEqual([]);
  await explanation.getByRole('button', { name: '收起交互示例', exact: true }).click();
  await page.route('**/api/explainer?*', (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Unavailable' }));
  await explanation.getByRole('button', { name: '打开交互示例', exact: true }).click();
  await expect(explanation).toContainText('交互示例暂时无法显示，上方说明仍可完整阅读');
  await expect(page.locator('#keep-meaning-complete')).toBeAttached();
  await expect(explanation.locator('iframe')).toHaveCount(0);
});
