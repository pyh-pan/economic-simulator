# TODOs

## Observe Proto-Currency Emergence After The Trust MVP Stabilizes

What: Add a second-phase experiment layer that introduces visible proto-currency candidates, such as shells, and measures whether tribes begin accepting one broadly without the system declaring it money in advance.

Why: This is the strongest next-step phenomenon for the product after the trust-versus-barter MVP. It upgrades the sandbox from "trust changes exchange completion" to "shared exchange friction can create a commonly accepted medium."

Pros:
- Preserves the most compelling emergent moment in the long-term vision without polluting the first MVP.
- Builds directly on the same world engine, replay system, and constrained agent contract already planned for the trust experiment.
- Creates a natural bridge from barter dynamics toward richer later systems like price formation and market norms.

Cons:
- Adds a second causal layer, so debugging becomes harder unless the trust-only baseline is already stable.
- Risks accidental scope creep if introduced before replay tests and invariant checks are solid.

Context: The current approved plan intentionally narrows the MVP to one question: does trust change whether barter completes? Proto-currency was discussed and explicitly deferred during `/plan-eng-review`. It should only begin after the trust experiment is reproducible, replayable, and well-instrumented. The key design constraint is that candidate goods may exist in the environment, but the system must never hard-code one as money. Emergence has to come from repeated acceptance behavior, not from hidden rules.

Depends on / blocked by:
- A stable turn-based world engine
- Structured agent action contract
- Seeded replay and event log support
- Passing invariant tests for settlement and inventory conservation
