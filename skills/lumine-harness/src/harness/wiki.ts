import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireHarnessRoot } from './core/root-resolver.ts';
import { applyUpdate, checkWiki, loadWikiConfig, prepareUpdate, queryKnowledge, recordUpdateDecision, recoverWiki, scanWiki, showKnowledge } from './wiki/engine.ts';
import { serveWiki } from './wiki/server.ts';
import { wikiDiagnostic, wikiStatus } from './wiki/messages.ts';
import type { Candidate, Collection, Freshness } from './wiki/types.ts';

async function runWikiCommand(argv: string[]): Promise<void> {
  const args = [...argv];
  const option = (name: string): string | undefined => { const index = args.indexOf(name); if (index < 0) return undefined; const value = args[index + 1]; if (!value || value.startsWith('--')) throw new Error(`OPTION_VALUE_REQUIRED:${name}`); args.splice(index, 2); return value; };
  const rootArg = option('--root'), limit = option('--limit'), maxChars = option('--max-chars'), repoId = option('--repo'), type = option('--type'), freshness = option('--freshness'), collection = option('--collection'), port = option('--port'), candidate = option('--candidate'), decision = option('--decision'), reason = option('--reason');
  const jsonIndex = args.indexOf('--json'); if (jsonIndex >= 0) args.splice(jsonIndex, 1);
  const root = requireHarnessRoot({ cwd: rootArg ?? process.cwd() }), config = loadWikiConfig(root);
  const output = (value: unknown): void => {
    if (jsonIndex >= 0 || !value || typeof value !== 'object') { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); return; }
    const data = value as Record<string, unknown>, zh = config.locale === 'zh-CN';
    let lines: string[];
    if (typeof data.markdown === 'string') lines = [data.markdown];
    else if (Array.isArray(data.cards)) lines = [(zh ? '相关知识' : 'Related knowledge') + ` (${data.cards.length}/${data.total})`, ...data.cards.flatMap((card: { id: string; title: string; summary: string; freshness: string; sources: { repoId: string; path: string }[] }) => [`\n${card.title} · ${card.id} [${wikiStatus(card.freshness, config.locale)}]`, card.summary, ...card.sources.map((source) => `  ${source.repoId}:${source.path}`)])];
    else if (Array.isArray(data.units)) lines = [zh ? '更新工作包已保存；核实来源后提交文本候选。' : 'Update packet saved. Verify sources before submitting text candidates.', `.lumine/wiki-state/updates/${data.id}/packet.json`, ...data.units.map((unit: { id: string; path: string }) => `${unit.id} · ${unit.path}`)];
    else if (Array.isArray(data.results)) lines = [`${zh ? '更新状态' : 'Update status'}: ${wikiStatus(String(data.status), config.locale)}`, ...data.results.map((result: { id: string; status: string; reason: string }) => `${result.id} [${wikiStatus(result.status, config.locale)}] ${result.reason}`)];
    else if (Array.isArray(data.documents)) lines = [zh ? '知识扫描' : 'Knowledge scan', ...data.documents.map((document: { id: string; freshness: string }) => `${document.id} [${wikiStatus(document.freshness, config.locale)}]`), `${zh ? '待分类文件' : 'Unclassified files'}: ${(data.unclassifiedFiles as string[]).length}`];
    else if (Array.isArray(data.issues)) lines = [`${zh ? '结构与来源检查' : 'Structure and source check'}: ${wikiStatus(String(data.status), config.locale)}`, ...data.issues.map((issue: { severity: string; code: string; document?: string; message: string }) => `[${wikiStatus(issue.severity, config.locale)}] ${issue.document ?? ''} ${issue.code}: ${issue.message}`), zh ? '本检查不证明语义准确、实际运行或人类接受。' : 'This check does not establish semantic accuracy, runtime behavior or human acceptance.'];
    else if (typeof data.url === 'string') lines = [`${zh ? '本地只读阅读器' : 'Local read-only reader'}: ${data.url}`];
    else if (Array.isArray(data.commands)) lines = [String(data.description), ...data.commands.map(String), ...(data.options as string[] ?? [])];
    else lines = [JSON.stringify(value, null, 2)];
    process.stdout.write(`${lines.join('\n')}\n`);
  };
  switch (args[0]) {
    case 'scan': output(scanWiki(root)); break;
    case 'query': output(queryKnowledge(root, args.slice(1).join(' '), { limit: limit ? Number(limit) : undefined, maxChars: maxChars ? Number(maxChars) : undefined, repoId, type, freshness: freshness as Freshness | undefined, collection: collection as Collection | undefined })); break;
    case 'show': output(showKnowledge(root, args.slice(1).join(' '))); break;
    case 'check': { const result = checkWiki(root); output(result); if (result.status === 'failed') process.exitCode = 1; break; }
    case 'update':
      if (args[1] === 'prepare') output(prepareUpdate(root, args.slice(2)));
      else if (args[1] === 'decide') {
        if (!args[2] || !args[3] || !['keep-current', 'defer'].includes(decision ?? '') || !reason) throw new Error('UPDATE_DECISION_ARGUMENTS_REQUIRED');
        output(recordUpdateDecision(root, args[2], args[3], decision as 'keep-current' | 'defer', reason));
      }
      else if (args[1] === 'recover') output(recoverWiki(root));
      else if (args[1] === 'apply') {
        if (!args[2] || !candidate) throw new Error('UPDATE_PACKET_AND_CANDIDATE_REQUIRED');
        const value = JSON.parse(readFileSync(path.resolve(candidate), 'utf8')) as { candidates: Candidate[] } | Candidate[];
        const result = applyUpdate(root, args[2], Array.isArray(value) ? value : value.candidates); output(result);
        if (result.results.some((item) => item.status !== 'applied')) process.exitCode = 1;
      } else throw new Error('UPDATE_ACTION_REQUIRED');
      break;
    case 'serve': {
      const result = await serveWiki(root, { port: port ? Number(port) : undefined });
      output({ url: result.url, locale: config.locale, readOnly: true });
      for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void result.close().then(() => process.exit(0)); });
      break;
    }
    default: if (args[0] && !['help', '--help', '-h'].includes(args[0])) throw new Error('UNKNOWN_COMMAND'); output({ description: config.locale === 'zh-CN' ? '文本知识库：检索、核实、更新和阅读。' : 'Text knowledge: query, verify, update and read.', commands: ['wiki scan', 'wiki query <text> [--limit 6] [--repo id] [--collection wiki|spec|plan]', 'wiki show <id|path|title>', 'wiki check', 'wiki update prepare [document-id...]', 'wiki update apply <packet-id> --candidate <json-file>', 'wiki update decide <packet-id> <document-id> --decision keep-current|defer --reason <text>', 'wiki update recover', 'wiki serve [--port 4318]'], options: ['--root <harness-root>', '--json'] });
  }
}
export async function runWikiCli(argv = process.argv.slice(2)): Promise<void> {
  try { await runWikiCommand(argv); }
  catch (error) {
    let locale: 'zh-CN' | 'en' = 'en';
    try { const rootIndex = argv.indexOf('--root'); locale = loadWikiConfig(requireHarnessRoot({ cwd: rootIndex >= 0 ? argv[rootIndex + 1] : process.cwd() })).locale; } catch { /* Root errors still have a stable diagnostic. */ }
    const diagnostic = wikiDiagnostic(error, locale);
    process.stderr.write(argv.includes('--json') ? `${JSON.stringify(diagnostic)}\n` : `[${diagnostic.code}] ${diagnostic.message}${diagnostic.candidates?.length ? `\n${diagnostic.candidates.join('\n')}` : ''}\n`);
    process.exitCode = 1;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) void runWikiCli();
