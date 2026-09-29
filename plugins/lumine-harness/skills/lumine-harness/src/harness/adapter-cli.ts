#!/usr/bin/env node
import path from "node:path";
import { readFileSync } from "node:fs";
import { adapterHelp, formatAdapterResult, formatSkillResult, runAdapterCommand, runSkillCommand, setCliWorkStatus, setCliWorkReport } from "./adapter-manager.ts";
import { commandLocale } from "./core/messages.ts";

const argv = process.argv.slice(2);
const locale = commandLocale(argv);
try {
  const rootIndex = argv.indexOf("--root");
  if (rootIndex >= 0 && (!argv[rootIndex + 1] || argv[rootIndex + 1].startsWith("--"))) throw new Error("--root requires a project directory.");
  const root = rootIndex >= 0 ? path.resolve(argv[rootIndex + 1]) : undefined;
  const filtered = argv.filter((_value, index) => rootIndex < 0 || (index !== rootIndex && index !== rootIndex + 1));
  const [command, ...args] = filtered;
  const options = { locale, ...(root ? { root, cwd: root } : {}) };
  if (!command || ["help", "--help", "-h"].includes(command) || (command === "adapter" && (!args.length || args.some((arg) => ["help", "--help", "-h"].includes(arg))))) {
    process.stdout.write(`${adapterHelp(locale)}\n`);
  } else if (command === "adapter") {
    const json = args.includes("--json");
    const details = args.includes("--details");
    const result = runAdapterCommand(args.filter((item) => !["--json", "--details"].includes(item)), { ...options, details });
    process.stdout.write(`${json ? JSON.stringify(result, null, 2) : formatAdapterResult(result)}\n`);
  } else if (command === "skills") {
    const result = runSkillCommand(args, options);
    process.stdout.write(`${formatSkillResult(result)}\n`);
  } else if (command === "work-status") {
    const value = (name: string): string | undefined => {
      const index = args.indexOf(name);
      if (index < 0) return undefined;
      if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${name} requires a value.`);
      return args[index + 1];
    };
    const reportFile = value("--report");
    const expected = value("--expect-turn");
    const reportOptions = { ...options, product: value("--product"), sessionId: value("--session-id"), reason: value("--reason"), nextStep: value("--next-step"), emissionId: value("--emission-id"), ...(expected !== undefined ? { expectedUserTurnRevision: Number(expected) } : {}) };
    if (reportFile && (reportOptions.reason || reportOptions.nextStep || (args[0] && !args[0].startsWith("--")))) throw new Error("Use one structured report or status flags, not conflicting input forms.");
    const state = reportFile
      ? setCliWorkReport(JSON.parse(readFileSync(reportFile === "-" ? 0 : path.resolve(reportFile), "utf8")), reportOptions)
      : setCliWorkStatus(args[0], reportOptions);
    process.stdout.write(args.includes("--json") ? `${JSON.stringify({ workReport: state.workReport, revision: state.workStatusRevision, userTurnRevision: state.userTurnRevision })}\n` : locale === "en"
      ? `WORK_STATUS recorded: ${state.workStatus} (revision ${state.workStatusRevision})\n`
      : `WORK_STATUS 已记录：${state.workStatus}（版本 ${state.workStatusRevision}）\n`);
  } else {
    throw new Error("Usage: adapter help | skills <list|search|inspect> ... | work-status <status> --product <product> --session-id <id>");
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${locale === "en" ? "Command failed" : "命令未完成"}: ${detail}\n`);
  process.exitCode = 2;
}
