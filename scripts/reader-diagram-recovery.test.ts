import test from 'node:test';
import assert from 'node:assert/strict';
import { drawMermaid } from '../skills/lumine-harness/src/browser/reader-diagrams.tsx';
import type { Diagram } from '../skills/lumine-harness/src/harness/wiki/types.ts';

class FakeElement {
  readonly classList = {
    values: new Set<string>(),
    add: (value: string) => { this.classList.values.add(value); },
    remove: (value: string) => { this.classList.values.delete(value); },
  };
  children: FakeElement[] = [];
  textContent = '';
  type = '';
  onclick: (() => void) | null = null;
  attributes = new Map<string, string>();

  constructor(readonly ownerDocument: FakeDocument, readonly tagName: string) {}
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  replaceChildren(...children: FakeElement[]) { this.children = children; this.textContent = ''; }
  click() { this.onclick?.(); }
}

class FakeDocument {
  reloads = 0;
  readonly defaultView = { location: { reload: () => { this.reloads++; } } };
  createElement(tagName: string) { return new FakeElement(this, tagName); }
}

const diagram: Diagram = {
  id: 'flow', title: 'Flow', caption: 'Flow explanation', sources: [], code: 'flowchart LR\n  A --> B',
};

test('a missing Mermaid module leaves a readable diagram fallback with a full-page reload action', async () => {
  for (const locale of ['zh-CN', 'en'] as const) {
    const document = new FakeDocument();
    const target = document.createElement('div');
    const rendered = await drawMermaid(target as unknown as Element, diagram, locale, async () => {
      throw new Error('dynamic chunk is unavailable');
    });
    assert.equal(rendered, null);
    assert.equal(target.classList.values.has('diagram-error'), true);
    assert.equal(target.children[0]?.attributes.get('role'), 'alert');
    assert.match(target.children[0]?.textContent ?? '', locale === 'zh-CN' ? /Mermaid 源码仍可阅读/ : /Mermaid text remain readable/);
    assert.equal(target.children[1]?.type, 'button');
    assert.equal(target.children[1]?.textContent, locale === 'zh-CN' ? '重新载入阅读器' : 'Reload reader');
    target.children[1]?.click();
    assert.equal(document.reloads, 1);
  }
});

test('a rejected diagram does not suggest reloading a missing resource', async () => {
  const document = new FakeDocument();
  const target = document.createElement('div');
  const rendered = await drawMermaid(target as unknown as Element, { ...diagram, code: '<script>unsafe</script>' }, 'en', async () => {
    throw new Error('loader should not run');
  });
  assert.equal(rendered, null);
  assert.equal(target.children.length, 0);
  assert.match(target.textContent, /diagram could not be displayed/);
});

test('a later Mermaid diagram module failure also offers a reader reload', async () => {
  const document = new FakeDocument();
  const target = document.createElement('div');
  const rendered = await drawMermaid(target as unknown as Element, diagram, 'en', async () => ({
    default: {
      initialize() {},
      async render() { throw new TypeError('Failed to fetch dynamically imported module: /chunks/flow.js'); },
    },
  }) as unknown as typeof import('mermaid'));
  assert.equal(rendered, null);
  assert.match(target.children[0]?.textContent ?? '', /resource could not load/);
  target.children[1]?.click();
  assert.equal(document.reloads, 1);
});
