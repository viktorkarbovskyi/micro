# Reflection: AI vs Specs

## How it was done

1. **Understanding the task.** The AI wrote a walkthrough of the assignment (`docs/explainer.md`) so I could see the domain, the contract and what is left open.
2. **Specs by interview.** The AI asked me questions one by one; I made every product decision, the AI turned my answers into text. Result: four specs — domain, state machine, HTTP API, UI.
3. **Plan.** The AI split the specs into 16 implementation tasks with the tests each task must pass.
4. **Implementation by agents.** Every task went to a fresh AI agent that got only the task text and the specs, no chat history. A separate AI reviewer checked every task against the specs before the next one started. At the end — a review of the whole branch and a check that docs and code say the same thing.
5. **My check.** I clicked through the running app as every role and asked for changes.

Result: about two working days, ~330 automated tests (API, UI, shared rules).

## Takeaways

**1. The Q&A session made the specs.** The assignment fits on one page and looks complete. A structured "grill-me" session — the AI asking one question at a time and not moving on until I gave a decision — showed about twenty things the contract leaves open: who sees which reports, whether admin may edit, whether edits are audited, whether a manager may approve their own report, what an error looks like. It also found problems I would not have thought about: the test clock freezes time, so every demo timestamp would be identical; the contract lets admin perform any transition, but drafts were visible only to their owner. In a normal chat the AI would have answered these questions itself, quietly and plausibly. In the Q&A each of them became my decision.

**2. The spec replaces the conversation.** The agents that wrote the code never saw our discussions. Everything they knew about the product came from the specs. So the quality of the code was set by the quality of the specs, not by how a prompt was worded.

**3. The cost moved.** Writing code became almost free: 16 tasks in one day. The time went into two other things — deciding how the system must behave, and checking that this is what was built. The whole first day was specs.

**4. A review needs clear criteria.** An AI reviewer is useful only when it compares the code with something written. Without fixed criteria every agent checks something of its own: the implementer reports "done" because the tests it wrote itself pass, one reviewer probes edge cases, another looks at code style, a third trusts the plan. Each answer sounds confident, but they are not comparable, and the gaps fall between them. That is what happened here: the per-task reviewers checked against the plan, so a rule the plan had dropped and a timestamp format the plan had narrowed passed every task review. Both were found only when the specs themselves were used as the criteria — by re-reading them during the work and in the final review. The criteria have to be stated up front: which spec sections the task covers, and what exactly counts as done.

**5. If a change matters, the spec changes too.** During the work I made changes that differed from the specs: how Save behaves with no changes, what is hidden in edit mode, how admin buttons are grouped. If such a change lives only in the code, the next agent reads the old spec and "fixes" the code back, and the reviewer flags correct code as wrong. So every important change went into the spec as well, and at the end a separate check of docs against code found 11 places where they disagreed. The specs stay the single source of truth only if they are kept current.

**6. A spec does not replace looking at the product.** Several UI decisions appeared only after I opened the running app: who sees the Edit button, hiding actions while editing, grouping admin buttons by stage. A spec records decisions, but some decisions are made only after you see the result.

**7. The AI acts at once, so thinking aloud is risky.** When I was thinking aloud about showing Edit to every role, the AI took it as a decision and updated the spec and the code straight away. When I changed my mind, everything had to be reverted. I learned to finish the discussion first and only then ask for changes.
