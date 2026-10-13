# Domain-language topic format — Lumine adaptation

## Structure

```md
# {Context Name}

{One or two sentence description of what this context is and why it exists.}

## Language

**Order**:
{A one or two sentence description of the term}
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places orders.
_Avoid_: Client, buyer, account
```

## Rules

- **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others under `_Avoid_`.
- **Keep definitions tight.** One or two sentences max. Define what it IS, not what it does.
- **Only include terms specific to this project's context.** General programming concepts (timeouts, error types, utility patterns) don't belong even if the project uses them extensively. Before adding a term, ask: is this a concept unique to this context, or a general programming concept? Only the former belongs.
- **Group terms under subheadings** when natural clusters emerge. If all terms belong to a single cohesive area, a flat list is fine.

## Single vs multi-context projects

**Single context:** Use one Repo Wiki domain-language topic or an existing equivalent glossary. Create it lazily when the first term is resolved.

**Multiple contexts:** Maintain a Wiki context-map topic or stable section that links separate language topics and explains how they relate:

```md
# Context map

## Contexts

- [Ordering](./ordering-language.md): receives and tracks customer orders
- [Billing](./billing-language.md): generates invoices and processes payments
- [Fulfillment](./fulfillment-language.md): manages warehouse picking and shipping

## Relationships

- **Ordering → Fulfillment**: Ordering emits `OrderPlaced` events; Fulfillment consumes them to start picking
- **Fulfillment → Billing**: Fulfillment emits `ShipmentDispatched` events; Billing consumes them to generate invoices
- **Ordering ↔ Billing**: Shared types for `CustomerId` and `Money`
```

Infer which structure applies from the existing material and the actual domain. Read an existing context map to find each context; reuse a single authoritative glossary when only one exists. If none exists, create the language topic only when the first term is resolved. Infer the relevant context from the discussion; ask when it remains unclear. Paths above are examples, not required filenames. Do not create duplicate root glossaries or extra domain directories.

For Repo Wiki, add the metadata, sources and relations required by its existing contract. A source for an agreed term may be its Product Spec or Exec Plan; separately identify verified code evidence when discussing actual implementation. Keep provenance outside the tight term definitions. `current` means the shared language is valid, not that every corresponding feature is implemented.
