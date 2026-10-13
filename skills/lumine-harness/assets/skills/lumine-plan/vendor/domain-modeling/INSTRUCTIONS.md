# Domain Modeling

Actively build and sharpen the project's domain model as you design. This is the *active* discipline: challenging terms, inventing edge-case scenarios, and writing the glossary and decisions down the moment they crystallise. (Merely *reading* `GLOSSARY.md` for vocabulary is not this skill: that's a one-line habit any skill can do. This skill is for when you're changing the model, not just consuming it.)

## Document locations

Use the project's existing authoritative domain-language and decision material. In a Lumine project the default home is Repo Wiki: a domain-language topic (or stable section) for each real context, a context map when there is more than one, and important enduring decision topics or sections. Create these lazily only when there is content. Use readable filenames in the project language and stable document/section identities. Do not create root `GLOSSARY.md`, `GLOSSARY-MAP.md`, `docs/domain/`, `docs/decisions/`, or `docs/adr/` merely because this module is used. Existing equivalent files may remain the source of truth; link and reuse them instead of creating a competing copy.

The language topic is a glossary, not a product specification or implementation description. Product goals, behavior, scope, acceptance and ordinary answered product questions belong in the current Product Spec. This implementation's technical approach and ordinary technical decisions belong in its Exec Plan. During the product stage, record product-relevant technical constraints in the Spec without prematurely creating a Plan. Wiki holds resolved shared language and the important decisions that need a durable explanation; implementation topics describe verified current code separately.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing authoritative domain language, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account': do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. Code establishes the current implementation, not automatic authority over a newly agreed target requirement. If you find a contradiction, distinguish current and intended behavior and surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible. Which is right?"

### Update the domain-language topic inline

When a term is resolved, update the authoritative domain-language topic right there, before the next question round. Don't batch these up: capture them as they happen. Use the format in [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md).

The domain-language topic should be totally devoid of implementation details. Do not treat it as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).


### Preserve context and decision meaning

When the same term has different meanings in different bounded contexts, keep separate language topics and a map of their boundaries and relationships. Infer the relevant context from evidence; ask only when the intended context is still ambiguous. Do not force distinct contexts into one universal definition.

Once an important enduring decision meeting all three gates is agreed, write its context, chosen option and reasons immediately, with relevant alternatives and consequences only where useful. Link the original Spec/Plan evidence and give the decision a stable identity. Ordinary answered questions still go into Spec/Plan even if they do not qualify for an ADR.

Follow the Wiki's document metadata and sources contract. A `current` language or decision record means the convention or decision is currently valid, not that its implementation has shipped. Label proposed directions and actual implementation separately. Keep superseded decisions traceable, mark them historical, and link their replacement rather than rewriting history as though the old decision never existed.

Link Spec/Plan to the authoritative language and decision material instead of copying whole bodies. If a changed definition, boundary or decision changes product behavior or acceptance meaning, update the affected Spec/AC text and assess only the affected approval scope; changing a linked page alone does not update the Spec's acceptance baseline. Formatting or a synonym change without semantic impact does not invalidate approval. Explicitly read-only requests propose these writebacks without mutating files.
