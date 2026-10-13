# Grilling — Lumine adaptation

Interview the user thoroughly until you reach a shared understanding. Use this method for requested stress-testing or consequential uncertainty, conflict, or trade-offs; do not manufacture questions for already clear or settled work. Follow the project language and the user's requested interview pace. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Word each question so "yes" accepts your recommended answer.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it when delegation is available, or investigate it yourself; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

A partial reply settles only what the user actually answered. Retain the unanswered or ambiguous questions as unresolved; silence is not agreement with a recommendation. A clear “yes” accepts the recommendation for the question it unambiguously refers to. Do not interpret a bare “yes” as accepting several different recommendations when its scope is unclear.

After every reply round, write the answered direction into the current Product Spec or Exec Plan before asking the next round. Capture newly resolved domain terms and important enduring decisions immediately through the bundled domain-modeling module. Keep outstanding questions and their dependencies in the existing Spec/Plan when needed to resume; do not create a separate interview database. For an explicitly read-only session, present the proposed changes without writing.

The session is done when the frontier is empty and no pending factual exploration can open a downstream question: every relevant branch of the design tree visited, nothing left silently assumed. Do not silently narrow the user's scope to finish earlier. Present the resulting shared understanding and seek user confirmation before acting on it. This can be the existing Lumine stage-handoff confirmation of the concrete Spec/Plan and next step; do not introduce an extra approval gate or repeat a valid confirmation. Answering interview questions or accepting recommendations is not approval to cross a stage, implement, commit, push, or publish.
