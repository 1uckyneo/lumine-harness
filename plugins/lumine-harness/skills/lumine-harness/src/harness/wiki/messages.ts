import type { Locale } from './types.ts';

const diagnostics: Record<string, [string, string]> = {
  DOCUMENT_NOT_FOUND: ['未找到文档。请使用知识 ID、路径或无歧义标题。', 'Document not found. Use its ID, path or an unambiguous title.'],
  DOCUMENT_AMBIGUOUS: ['名称对应多个文档。请从候选中选择明确的文档 ID。', 'The name matches multiple documents. Select an explicit document ID.'],
  OPTION_VALUE_REQUIRED: ['选项缺少参数。请查看 wiki --help。', 'An option needs a value. See wiki --help.'],
  QUERY_BUDGET_INVALID: ['检索条数和文本预算必须为正整数。', 'Card count and text budget must be positive integers.'],
  UPDATE_PACKET_AND_CANDIDATE_REQUIRED: ['请提供工作包 ID 和 --candidate 文本候选文件。', 'Provide the packet ID and a --candidate text candidate file.'],
  UPDATE_DECISION_ARGUMENTS_REQUIRED: ['请提供工作包、文档 ID、处理方式及说明。', 'Provide the packet, document ID, decision and reason.'],
  UPDATE_ACTION_REQUIRED: ['请选择 prepare、apply、decide 或 recover。', 'Choose prepare, apply, decide or recover.'],
  UPDATE_NOT_FOUND: ['未找到更新工作包。请先准备工作包或核实 ID。', 'Update packet not found. Prepare a packet or verify its ID.'],
  UPDATE_DOCUMENT_NOT_FOUND: ['工作包未包含该文档。请核实工作包和文档 ID。', 'The packet does not contain this document. Verify both IDs.'],
  UPDATE_OUTSIDE_SCOPE: ['候选文档不在工作包范围内，请重新准备。', 'The candidate is outside the packet scope. Prepare another packet.'],
  WIKI_WRITE_LOCKED: ['另一项维护操作仍持有锁。请核实进程后再处理本地写锁。', 'A maintenance operation still holds the lock. Inspect its process before handling the local write lock.'],
  WIKI_READER_ASSETS_MISSING: ['阅读器资源不完整，请重新安装正式分发包。', 'Reader assets are incomplete. Reinstall the distribution package.'],
  REPOSITORY_NOT_REGISTERED: ['来源仓库未登记，请核实项目配置。', 'The source repository is not registered. Check project configuration.'],
  REPOSITORY_MISSING: ['来源仓库暂不可用，请先取得对应仓库。', 'The source repository is unavailable. Obtain the repository first.'],
  SOURCE_EXCLUDED: ['来源被排除规则保护，不能通过知识库读取。', 'The source is protected by exclusion rules and cannot be read through the Wiki.'],
  SOURCE_GITIGNORED: ['来源被 Git 忽略，不能通过知识库读取。', 'The source is ignored by Git and cannot be read through the Wiki.'],
  SOURCE_SCAN_LIMIT_EXCEEDED: ['监控范围超过扫描上限，请缩小范围。', 'The watch scope exceeds the scan limit. Narrow the scope.'],
  PATH_OUTSIDE_ROOT: ['路径超出允许范围，请使用已登记目录内的相对路径。', 'The path is outside the allowed root. Use a relative path inside a registered directory.'],
  SYMLINK_OUTSIDE_ROOT: ['符号链接指向允许范围之外，已拒绝读取。', 'The symbolic link leaves the allowed root; reading was refused.'],
  PATH_NOT_RELATIVE: ['请使用允许目录内的相对路径。', 'Use a relative path inside an allowed directory.'],
  PATH_NOT_FOUND: ['路径不存在，请核实文档或来源是否已取得。', 'The path does not exist. Check that the document or source is available.'],
  TRANSACTION_DOCUMENT_CONFLICT: ['恢复材料与当前正文冲突，已保留人工修改。请核实后继续恢复。', 'Recovery material conflicts with current text. Human changes are preserved; review before recovering.'],
  TRANSACTION_STATE_CONFLICT: ['恢复材料与当前知识状态冲突，请核实后继续恢复。', 'Recovery material conflicts with current knowledge state. Review before recovering.'],
  DOCUMENT_METADATA_INVALID: ['文档元数据无效，请检查 YAML 格式。', 'Document metadata is invalid. Check its YAML syntax.'],
  UNKNOWN_COMMAND: ['未知知识命令，请查看 wiki --help。', 'Unknown Wiki command. See wiki --help.'],
  WIKI_FAILED: ['操作未完成，请核实参数、来源与维护状态后重试。', 'The operation did not complete. Check arguments, sources and maintenance state before retrying.'],
};
export function wikiDiagnostic(error: unknown, locale: Locale): { code: string; message: string; candidates?: string[] } {
  const raw = error instanceof Error ? error.message : String(error);
  const code = raw.match(/^[A-Z][A-Z0-9_]+(?=:|$)/)?.[0] ?? (error && typeof error === 'object' && 'code' in error ? String(error.code) : 'WIKI_FAILED');
  const message = (diagnostics[code] ?? diagnostics.WIKI_FAILED)[locale === 'zh-CN' ? 0 : 1];
  // Ambiguous names are useful to resolve; only return stable candidate IDs, never absolute paths.
  const candidates = code.includes('AMBIGUOUS') ? raw.slice(raw.indexOf(':') + 1).split(',').map((value) => value.trim()).filter((value) => /^[\p{L}\p{N}_.:-]+$/u.test(value)) : [];
  return { code, message, ...(candidates.length ? { candidates } : {}) };
}
export function wikiStatus(value: string, locale: Locale): string {
  const labels: Record<string, string> = { current:'已核实',stale:'待更新',unverified:'待核实','missing-source':'来源缺失',conflict:'待处理冲突',applied:'已应用',partial:'部分完成',prepared:'已准备',protected:'原文已保护','source-drift':'来源已变化','config-drift':'配置已变化',invalid:'无效',passed:'通过',failed:'未通过',error:'错误',warning:'提醒',pending:'待处理' };
  return locale === 'zh-CN' ? labels[value] ?? value : value;
}
