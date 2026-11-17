import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import typescript from 'shiki/langs/typescript.mjs';
import javascript from 'shiki/langs/javascript.mjs';
import go from 'shiki/langs/go.mjs';
import json from 'shiki/langs/json.mjs';
import yaml from 'shiki/langs/yaml.mjs';
import bash from 'shiki/langs/bash.mjs';
import sql from 'shiki/langs/sql.mjs';
import css from 'shiki/langs/css.mjs';
import html from 'shiki/langs/html.mjs';
import markdown from 'shiki/langs/markdown.mjs';
import diff from 'shiki/langs/diff.mjs';
import theme from 'shiki/themes/vitesse-dark.mjs';

// A deliberately small server-side bundle. No language downloads at read time.
export const createCodeHighlighter = () => createHighlighterCore({
  engine: createJavaScriptRegexEngine(), themes: [theme],
  langs: [typescript, javascript, go, json, yaml, bash, sql, css, html, markdown, diff],
});
