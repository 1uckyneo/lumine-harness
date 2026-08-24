import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { requireHarnessRoot } from "./root-resolver.mjs";
import { buildSharedSkillCatalog } from "./skill-catalog.mjs";

function activePlans(root) {
  const dir = path.join(root, "docs", "exec-plans", "active");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .filter((entry) => {
      const source = readFileSync(path.join(dir, entry.name), "utf8");
      const yaml = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
      const status = yaml.match(/^status:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1] ?? "";
      return /^(active|in-progress|ready|awaiting_user_review|awaiting_product_runtime_verification)$/.test(status);
    })
    .map((entry) => `docs/exec-plans/active/${entry.name}`)
    .sort();
}

function shellArg(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

export function buildSessionStartContext(input = {}) {
  const root = input.root ?? requireHarnessRoot(input);
  const lines = [
    "Workspace harness context:",
    `- Harness root: ${root}`,
    "- Read the root AGENTS.md as the only shared engineering instruction entry.",
    "- Canonical shared Skill content lives only under .agents/skills. Use ./.harness/cli skills search <query> to discover a relevant Skill.",
    "- Before a phase, read the exact Skill: draft=lumine-harness-draft, design=lumine-harness-design, spec/plan=lumine-harness-plan, run=lumine-harness-run, generated=lumine-harness-generated, check=lumine-harness-check, navigation=lumine-harness-navigate.",
    "- Draft, optional Design, Product Spec, Exec Plan, and Run use the human gates declared in AGENTS.md.",
    "- Validation must distinguish tool evidence, runtime evidence, and human acceptance.",
    "- Finish or pause with exactly one WORK_STATUS line."
  ];
  if (input.prompt) lines.push(buildSharedSkillCatalog(root, { query: input.prompt, limit: 3 }));
  if (["kimi", "codebuddy", "deepseek-harness"].includes(input.product)) {
    lines.push(`- This host does not expose the final assistant message reliably. Before stopping, run ./.harness/cli work-status <status> --product ${shellArg(input.product)} --session-id ${shellArg(input.sessionId)}.`);
  }
  const plans = activePlans(root);
  if (plans.length) {
    lines.push("- Active Exec Plans:");
    for (const plan of plans) lines.push(`  - ${plan}`);
  }
  return lines.join("\n");
}
