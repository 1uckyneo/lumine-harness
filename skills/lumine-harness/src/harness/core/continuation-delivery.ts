import type { ContinuationDelivery, HarnessHookDecision, HarnessProduct } from "./contracts.ts";

const AUTOMATIC_PRODUCTS = new Set<HarnessProduct>([
  "codex",
  "qoder",
  "trae",
  "kimi",
  "cursor",
  "zcode",
  "codebuddy",
  "deepseek-harness"
]);

export function continuationDeliveryFor(
  product: HarnessProduct,
  decision: Pick<HarnessHookDecision, "disposition"> | null | undefined
): ContinuationDelivery | null {
  if (!decision || !["request_continuation", "reject_completion"].includes(decision.disposition)) return null;
  if (product === "opencode") {
    return decision.disposition === "request_continuation" ? "manual_required" : "unsupported";
  }
  return AUTOMATIC_PRODUCTS.has(product) ? "automatic" : "unsupported";
}
