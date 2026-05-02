# Economic Simulator Roadmap

Status: initial visual economic sandbox roadmap completed; future work is product expansion.
Last updated: 2026-05-02.

## 1. Product North Star

Build a visual economic sandbox where users can observe how local decisions, trust, resource constraints, and repeated exchange produce macro-level economic patterns.

The product should not be a generic chatbot demo or a research-only dashboard. It should be an explorable sandbox:

- The world engine owns truth, invariants, resource settlement, and metrics.
- Agents make local decisions under constrained visibility.
- The UI makes the world understandable: users should see who has what, who needs what, what trade is proposed, why it succeeds or fails, and how repeated exchanges change the system.
- Parameter changes should remain visible and comparable, but the first experience should feel like watching an economic world operate, not filling out a benchmark form.
- LLM-backed agents should reason from structured economic context instead of inventing hidden assumptions.

The near-term product question is:

> How do trust and local resource incentives affect barter completion?

The longer-term product question is:

> Under what local conditions do exchange norms, proto-currency behavior, and market-like structures emerge?

## 2. Current Baseline

The repository already has a working MVP foundation:

- A deterministic Node ESM simulation engine in `src/index.js`.
- A React/Vite UI served by `server.mjs`.
- Local and LongCat-backed agents through OpenAI-compatible chat completions.
- Trust scanning, low/high trust comparison, replay data, saved run persistence, and experiment metrics.
- A simulation contract that enforces local visibility, structured actions, inventory conservation, and seeded replay.
- Tests covering agent prompt construction, simulation invariants, API behavior, experiments, storage, and emergence metrics.

The current MVP contract is intentionally narrow:

> `trust -> barter completion`

That remains the baseline experiment, but recent LongCat testing shows that prompt-only trust guidance is not strong enough. The agent needs a structured economic basis for decisions.

## 3. Product Principles

### 3.1 Engine Truth Over Agent Claims

Agents can choose actions and explain reasoning, but they cannot mutate state directly. The engine must remain the source of truth for:

- inventories
- proposal status
- settlement
- event logs
- metrics
- invariants

### 3.2 Local Information Only

Agents should not act like global planners. Each agent should see:

- its own inventory
- its own needs or targets
- its own production role
- local trade history
- current proposal
- local reputation if enabled
- structured decision context computed from visible local state

Agents should not see:

- full-island inventory totals
- other tribes' hidden needs
- global optimal strategy
- hard-coded future economic trajectories

### 3.3 Structured Economics Before LLM Reasoning

The LLM should not be expected to invent an economic utility function from raw inventory numbers.

The engine should compute a `decision_context` before calling the agent. The agent can then use that context to decide and explain.

### 3.4 Trust Is A Continuous Risk Modifier

Trust should not be a hard accept/reject switch.

Trust should reduce or increase perceived uncertainty:

```text
trust_adjusted_risk = base_trade_risk * (1 - trustLevel)
```

Higher trust should make acceptance more likely for the same proposal and visible state, but it should not erase resource constraints.

### 3.5 Emergence Must Not Be Declared In Advance

If proto-currency, norms, or market structures appear later, they should arise from repeated local behavior and metrics, not from hidden rules that declare a resource to be money.

## 4. Confirmed Direction

These are directions that appear clearly aligned with the current project and recent discussion.

### 4.1 Keep The Simulation Contract

Continue enforcing:

- structured agent actions
- local visibility
- immutable engine-owned world state
- inventory conservation
- deterministic replay for same seed and config
- invalid output repair and fallback logging

### 4.2 Move From Prompt-Only Trust To Decision Context

Add an engine-computed `decision_context` that turns each proposal into a local economic ledger.

The agent should receive:

- current local resource position
- trade effect
- before/after need gaps
- benefit of received resource
- opportunity cost of paid resource
- reserve penalty
- trust-adjusted risk
- net utility
- engine recommendation

### 4.3 Make Resources Goal-Oriented

Replace the implicit meaning of `needs` with clearer resource mechanics.

Each tribe-resource relationship should eventually include:

- `inventory`: current amount
- `target`: desired stock level
- `reserve`: safety floor
- `production_rate`: expected replenishment per turn
- `priority`: importance weight

The first version can derive these from existing fields instead of rewriting the entire world model at once.

### 4.4 Preserve Agent Autonomy, But Bound It

The agent should still output `accept_trade` or `reject_trade`, but its reason should cite the economic ledger:

- benefit
- cost
- reserve impact
- trust-adjusted risk
- net utility

It should not reject with vague distrust when the ledger shows a clearly positive, affordable trade under high trust.

### 4.5 Keep The UI As A Visual Sandbox

The UI should make the economic world legible first:

- a visual overview of tribes, resources, and trade links
- current proposal and decision
- resource changes before and after trade
- decision ledger and explanation
- event timeline
- controls for seed, trust, turn count, provider, reputation, extra resources
- metrics
- saved runs
- comparison and scan views

Metrics and experiment controls remain available, but they should support the sandbox story rather than dominate the default experience.

## 5. Product Decisions

These decisions were confirmed on 2026-05-02.

### 5.1 What Is The Product's Primary User?

Confirmed direction:

The primary user is a demo/exploration user who wants to quickly understand trust, barter, resources, and eventually proto-currency through a visual economic sandbox.

Implications:

- Prioritize visual clarity, world legibility, and fast cause/effect understanding.
- Keep rigorous metrics and reproducibility, but make them supporting evidence rather than the first thing users must parse.
- Favor concrete visual explanations over abstract tables where possible.
- Make each agent's motives inspectable through resource needs, trade ledgers, and local history.
- Avoid turning the product into a dense research dashboard unless the user chooses an advanced view.

### 5.2 How Deterministic Should LLM Agent Behavior Be?

Confirmed direction:

- The engine stays deterministic.
- Local NPCs are deterministic under seed.
- LongCat agents are primarily intelligent residents in the world, not the main regression-test target.
- LongCat inputs, outputs, and decision context should be recorded and inspectable.
- Exact LongCat output does not need to be deterministic in the first version.
- Later, recorded LongCat outputs can support replay of specific runs.

### 5.3 Should The Engine Recommendation Be Advisory Or Binding?

Confirmed direction: advisory first.

- The engine computes `net_utility` and recommendation.
- The agent can disagree, but must explain using visible context.
- The system records whether the agent agrees with the recommendation.
- A future strict mode can make the engine recommendation binding if LongCat behavior remains too unstable.

### 5.4 How Rich Should Resources Become?

Confirmed direction: Level 1.5 first.

First resource model:

- `inventory`
- `target`
- `reserve`
- `production_rate`
- `priority`

First utility ledger:

```text
target_gap_benefit
- payment_opportunity_cost
- reserve_penalty
- trust_adjusted_risk
= net_utility
```

Defer:

- prices
- money
- seasons
- spoilage
- substitution
- complex production chains
- market order books

### 5.5 When Should Proto-Currency Return?

Proto-currency work was gated behind trust stability and decision-context visibility. That gate is now satisfied for the initial sandbox.

Confirmed gate:

- trust-only runs are reproducible
- resource decision context is inspectable
- trade completion changes as expected across trust values
- disagreement metrics are available

After that, introduce candidate resources such as shells without declaring them money.

### 5.6 What Should The Default UI Prioritize?

Confirmed direction:

The default UI should prioritize world visualization and trade explanation.

The first experience should show:

- each tribe's resource state
- current trade direction
- proposer and responder
- why the trade was accepted or rejected
- how resources change after settlement
- how trust and net utility influenced the decision

Metrics remain important, but they should support the world story rather than dominate the first screen.

### 5.7 Should There Be A Map Or Network View?

Confirmed direction:

Use a network/node view first, not a complex geographic map.

- Nodes represent tribes.
- Edges represent accepted trades, rejected proposals, and repeated exchange relationships.
- Resource inventory can be shown with compact bars, badges, or matrices.
- A richer map can come later if it helps the sandbox feel more alive.

### 5.8 How Should Proto-Currency Be Detected?

Confirmed direction:

Proto-currency should be identified through behavior metrics, not hard labels.

Signals:

- a candidate resource is accepted by multiple tribes
- it is accepted even when not directly consumed
- it bridges more trade pairs
- it appears repeatedly in exchange paths
- holders later use it in further trades
- acceptance breadth, bridge count, and repeat acceptance rise

The engine must not declare any resource to be money in advance.

### 5.9 What Is The Relationship Between Local NPC And LongCat?

Confirmed direction:

- Local NPC is the baseline and engine sanity check.
- LongCat is the richer behavior layer for natural explanations and more varied local choices.
- Comparisons should show when LongCat follows or diverges from the economic ledger.

### 5.10 Should Advanced/Debug Views Exist?

Confirmed direction:

Yes, but they should be secondary.

Advanced/debug views can expose:

- raw prompt context
- `decision_context` JSON
- model output
- validation result
- agreement with engine recommendation
- metrics tables

The default sandbox should remain visual and understandable without requiring users to inspect raw JSON.

## 6. Iteration Plan

### Phase 0: Stabilize The Trust Experiment

Goal: make `trust -> barter completion` credible and inspectable.

Work:

- Keep current simulation contract passing.
- Keep LongCat provider working through the existing OpenAI-compatible adapter.
- Ensure trust value is visible in agent context and UI.
- Keep seeded local NPC trust scan as a stable baseline.

Done when:

- low/high trust comparison works reliably for local agents
- LongCat prompt includes trust as a continuous risk modifier
- tests cover prompt semantics and engine invariants

Status: completed as the baseline layer. LongCat now receives structured decision context for trust/resource decisions.

### Phase 1: Add Resource Decision Context

Goal: give agents a structured local economic ledger for each proposal.

Status: backend foundation implemented on 2026-05-02 and surfaced through the Phase 2 ledger UI.

Work:

- [x] Add a pure helper to compute `decision_context` from visible state and proposal.
- [x] Derive target gaps from current `needs`.
- [x] Add reserve and production assumptions in a backwards-compatible way.
- [x] Compute:
  - receive benefit
  - payment opportunity cost
  - reserve penalty
  - trust-adjusted risk
  - net utility
  - recommendation
- [x] Include `decision_context` in the agent prompt.
- [x] Pass `decision_context` to provider-backed LLM agents.
- [x] Expose current `decision_context` in interactive snapshots.
- [x] Update tests for positive, negative, and trust-sensitive trades.

Done when:

- [x] prompt contains a clear economic ledger
- [x] the same proposal has higher net utility as trust increases
- [x] the agent is instructed to cite ledger terms in reasons
- [x] UI/API snapshots can expose the decision context for debugging

### Phase 2: Show The Ledger In The UI

Goal: make agent decisions auditable by users.

Status: initial ledger panel implemented on 2026-05-02.

Work:

- [x] Add a compact decision ledger panel to the Run view.
- [x] Show before/after gaps for received and paid resources.
- [x] Show gross benefit, costs, reserve impact, risk, and net utility.
- [x] Show the engine recommendation.
- [x] Show whether the agent agreed with the engine recommendation.

Done when:

- [x] a user can see the trade ledger behind a proposal without reading logs
- [x] LongCat disagreement and failure diagnosis is visible directly in the UI

### Phase 3: Measure Agent-Economics Alignment

Goal: quantify whether LLM agents follow the economic context.

Status: initial alignment metrics implemented on 2026-05-02.

Work:

- [x] Track `agent_agreed_with_recommendation`.
- [x] Track acceptance rate by positive vs negative net utility.
- [x] Track vague distrust reasons under high trust.
- [x] Track invalid outputs through existing invalid output metrics.

Done when:

- [x] LongCat behavior can be compared against local NPC baseline through shared metrics.
- [x] Prompt or model changes can be evaluated with metrics, not only anecdotes.

### Phase 4: Improve Resource Mechanics

Goal: make the resource world more economically meaningful without overbuilding.

Status: initial target/reserve/production/priority model implemented on 2026-05-02.

Work:

- [x] Promote `needs` into explicit `targets`.
- [x] Add reserves per tribe/resource.
- [x] Add production rates to visible state.
- [x] Add priority weights.
- [x] Discount opportunity cost for replenishable resources.
- [x] Add diminishing marginal utility after target is reached.

Done when:

- [x] resource value varies by scarcity and role
- [x] paying a dominant/reproducible resource is cheaper than paying a scarce resource
- [x] agents have clear reasons to accept, reject, or prefer certain trades

### Phase 5: Proto-Currency Emergence

Goal: test whether repeated exchange friction can make a candidate resource broadly accepted.

Status: behavior-based exchange role metrics implemented on 2026-05-02.

Work:

- [x] Introduce neutral candidate resources such as shells.
- [x] Ensure the engine never labels them as money.
- [x] Track acceptance breadth, repeat acceptance, bridge trades, and indirect exchange use.
- [x] Add a neutral `exchange_role_score` from behavior signals.
- [x] Compare environments with different trust and resource distributions through emergence experiment sets.

Done when:

- [x] the product can show whether a resource is becoming widely accepted through behavior
- [x] findings are linked to event evidence

### Phase 6: Richer Market Dynamics

Goal: move from barter completion toward market-like behavior.

Status: initial market-dynamics slice completed on 2026-05-02.

Possible work:

- [x] price hints or exchange ratios
- [x] bilateral negotiation
- [x] memory and reputation effects
- [x] production shocks
- [x] storage constraints through reserves
- [x] multi-agent proposal generation in the emergence simulator
- [x] institutions or norms

Implemented scope:

- exchange ratios appear in the decision ledger
- agents can return `counter_trade` when the direction is useful but terms are unattractive
- production shocks can override replenishment assumptions for a tribe/resource on a specific turn
- norms can impose local decision thresholds such as minimum net utility

## 7. What The Final Product Should Feel Like

The final product should feel like a visual economic sandbox with a serious simulation engine underneath:

- Start a seeded world and immediately see the resource landscape.
- Pick agent type and parameters.
- Watch local proposals and decisions unfold turn by turn.
- Inspect why each trade happened through needs, reserves, trust, and net utility.
- See aggregate metrics and network effects without losing the concrete world story.
- Compare runs side by side when the user wants to understand parameter effects.
- Identify emergent patterns with evidence-linked reports.

It should answer questions like:

- Why did this agent reject a seemingly good trade?
- Did higher trust actually improve completion?
- Did agents follow the economic incentives they were given?
- Which resources became exchange bridges?
- Did proto-currency behavior emerge, or did the system only complete direct barter?

## 8. Implemented Decision Context Formula

The Phase 1 resource mechanism is:

```text
target gap benefit
- payment opportunity cost
- reserve penalty
- trust-adjusted risk
= net utility
```

Implemented style:

- compute the ledger in the engine
- include it in the agent prompt
- expose it in snapshots
- keep engine recommendation advisory at first
- track agent agreement with the recommendation

## 9. Remaining Decisions

The current roadmap is complete as an initial visual economic sandbox. Further work should be treated as product expansion rather than unfinished baseline scope.

Likely expansion decisions:

- how deep negotiation should become beyond one-step counter proposals
- whether production shocks should become stochastic world events or authored experiment controls
- whether norms should be global, tribe-local, learned from repeated behavior, or configured by the user

## 10. Explicit Non-Goals For Now

Do not prioritize these until the roadmap gates above are met:

- cloud accounts or hosted collaboration
- database persistence
- full price formation
- complex macroeconomic policy
- multi-market order books
- hidden global optimizer
- declaring any resource to be money in advance
