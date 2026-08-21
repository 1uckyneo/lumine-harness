import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { requireHarnessRoot } from "./root-resolver.mjs";

function activePlans(root) {
  const dir = path.join(root, "docs", "exec-plans", "active");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => `docs/exec-plans/active/${entry.name}`)
    .sort();
}

export function buildSessionStartContext(input = {}) {
  const root = input.root ?? requireHarnessRoot(input);
  const lines = [
    "Workspace harness context:",
    `- Harness root: ${root}`,
    "- Read the root AGENTS.md as the only shared engineering instruction entry.",
    "- Shared Skills live only under .agents/skills; do not look for product-specific copies.",
    "- Before a phase, read the exact Skill: draft=lumine-harness-draft, design=lumine-harness-design, spec/plan=lumine-harness-plan, run=lumine-harness-run, generated=lumine-harness-generated, check=lumine-harness-check, navigation=lumine-harness-navigate.",
    "- Draft, optional Design, Product Spec, Exec Plan, and Run use the human gates declared in AGENTS.md.",
    "- Validation must distinguish tool evidence, runtime evidence, and human acceptance.",
    "- Finish or pause with exactly one WORK_STATUS line."
  ];
  if (["kimi", "deepseek-harness"].includes(input.product)) {
    lines.push(`- This host does not expose the final assistant message reliably. Before stopping, run ./.harness/cli work-status <status> --product ${input.product}.`);
  }
  const plans = activePlans(root);
  if (plans.length) {
    lines.push("- Active Exec Plans:");
    for (const plan of plans) lines.push(`  - ${plan}`);
  }
  return lines.join("\n");
}
