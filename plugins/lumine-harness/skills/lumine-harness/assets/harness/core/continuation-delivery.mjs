const AUTOMATIC_PRODUCTS = new Set([
  "codex",
  "qoder",
  "trae",
  "kimi",
  "cursor",
  "zcode",
  "codebuddy",
  "deepseek-harness"
]);

export function continuationDeliveryFor(product, decision) {
  if (!decision || !["request_continuation", "reject_completion"].includes(decision.disposition)) return null;
  if (product === "opencode") {
    return decision.disposition === "request_continuation" ? "manual_required" : "unsupported";
  }
  return AUTOMATIC_PRODUCTS.has(product) ? "automatic" : "unsupported";
}
