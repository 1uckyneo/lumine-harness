# Important enduring decision format — Lumine adaptation

Important enduring decisions live in an existing authoritative decision record or a Repo Wiki decision topic/stable section. Create one only when the first qualifying decision exists; do not create a default `docs/adr/` or `docs/decisions/` tree. Keep ordinary implementation choices in the current Exec Plan and product choices in the current Product Spec.

## Template

```md
# {Short title of the decision}

{1-3 sentences: what's the context, what did we decide, and why.}
```

That's it. An ADR can be a single paragraph. The value is in recording *that* a decision was made and *why*, not in filling out sections.

## Optional sections

Only include these when they add genuine value. Most ADRs won't need them.

- **Decision lifecycle**: distinguish proposed, agreed, and superseded decisions in the body. Use the existing Wiki document statuses (`proposed | current | historical`), not extra invalid frontmatter status values. A current agreed decision does not mean implementation is complete; link a successor when superseded.
- **Considered Options**: only when the rejected alternatives are worth remembering
- **Consequences**: only when non-obvious downstream effects need to be called out

## Identity and evidence

Preserve existing IDs and numbering where equivalent decision records already exist. For a new Wiki topic use its stable document ID; for a section use a unique stable heading or decision ID, retaining it across title changes. Do not reuse retired IDs. New records do not need a parallel sequential ADR file tree.

Link the Spec/Plan where the decision was formed, record the agreed choice and why as soon as it crystallises, and retain replacement links when revisited. Link actual implementation/Validation evidence separately. Use the Wiki's ordinary metadata and sources contract. Most decisions need only the short paragraph above plus useful provenance; do not inflate them into a second Spec or Plan.

## When to offer an ADR

All three of these must be true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will look at the code and wonder "why on earth did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If a decision is easy to reverse, skip it: you'll just reverse it. If it's not surprising, nobody will wonder why. If there was no real alternative, there's nothing to record beyond "we did the obvious thing."

### What qualifies

- **Architectural shape.** "We're using a monorepo." "The write model is event-sourced, the read model is projected into Postgres."
- **Integration patterns between contexts.** "Ordering and Billing communicate via domain events, not synchronous HTTP."
- **Technology choices that carry lock-in.** Database, message bus, auth provider, deployment target. Not every library: just the ones that would take a quarter to swap out.
- **Boundary and scope decisions.** "Customer data is owned by the Customer context; other contexts reference it by ID only." The explicit no-s are as valuable as the yes-s.
- **Deliberate deviations from the obvious path.** "We're using manual SQL instead of an ORM because X." Anything where a reasonable reader would assume the opposite. These stop the next engineer from "fixing" something that was deliberate.
- **Constraints not visible in the code.** "We can't use AWS because of compliance requirements." "Response times must be under 200ms because of the partner API contract."
- **Rejected alternatives when the rejection is non-obvious.** If you considered GraphQL and picked REST for subtle reasons, record it; otherwise someone will suggest GraphQL again in six months.
