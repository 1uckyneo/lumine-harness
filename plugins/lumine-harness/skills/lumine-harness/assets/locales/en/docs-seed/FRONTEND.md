# Interface implementation conventions

Interfaces explain the objects, actions, states, and next steps users need. Rewrite chat notes, requirements commentary, and generated content into product copy before displaying it. Do not expose implementation variables, enums, API paths, stack traces, or internal demo/review language.

- Distinguish saving, publishing, exporting, refreshing, regenerating, and continuing.
- Provide understandable feedback for applicable loading, empty, signed-out, unauthorized, failed, cancelled, and retry states; keep technical causes in logs.
- Verify keyboard operation, focus, accessible names, long content, and narrow layouts. Do not communicate state through color alone.
- Reuse existing visuals, components, and behavior boundaries without merging different state or permission models merely to share presentation.
- Verify real pages and relevant tests. A design preview or static screenshot cannot prove backend, persistence, authorization, or deployment success.
