# Agent-Based Economic Emergence Lab v1 Design

Status: current design background. The v1 emergence lab exists and now reports neutral `exchange_role_score` behavior signals. Use `ROADMAP.md` and `SIMULATION_CONTRACT.md` for current product direction and constraints.

## Goal

Build a configurable, reproducible, evidence-driven economic emergence lab. The system should let users define objective economic constraints and heterogeneous agent traits, run repeatable experiments, and observe whether macro-level exchange structures emerge from micro-level decisions.

The product must not script a target outcome. It should support outcomes such as stable reciprocal networks, broad acceptance of an unexpected resource, no meaningful structure, or economic breakdown under certain parameters.

## Product Trajectory

v1 establishes a credible mechanism core:
- individual economic agents,
- objective resource constraints,
- local information,
- heterogeneous behavior profiles,
- replayable event logs,
- multi-seed comparison,
- evidence-linked reports.

Later versions can add richer market mechanisms, social memory, and decision-sandbox scenarios, but v1 deliberately avoids political governance, full social simulation, and real-world prediction.

## World Model

The world contains 15 individual economic agents by default. There are 5 production types, with 3 agents per type:
- fish producer,
- water producer,
- fruit producer,
- animal producer,
- wood producer.

Each agent has independent state:
- `id`,
- `production_type`,
- `inventory`,
- `needs`,
- `profile`,
- `memory`,
- `relationships`.

Resources are configurable. The default preset includes five directly useful resources plus optional extra resources. Extra resources are treated exactly like other resources by the engine unless a world rule gives them direct utility. No resource may be marked or described to agents as a special exchange target.

Each turn follows:

```text
produce -> consume/check needs -> observe -> match/search -> propose -> accept/reject -> settle -> record memory -> update metrics
```

v1 includes three economic frictions:
- difficulty of matching complementary wants,
- search cost,
- trust and reputation risk.

## Agent Profiles

Agents are heterogeneous economic subjects, not copies of one prompt. v1 uses seven profile dimensions:

```json
{
  "time_horizon": 0.8,
  "risk_tolerance": 0.6,
  "trust_baseline": 0.5,
  "reputation_sensitivity": 0.7,
  "liquidity_awareness": 0.4,
  "fairness_preference": 0.5,
  "opportunity_seeking": 0.3
}
```

Default archetypes generate distributions:
- Steward: long-term, reputation-sensitive,
- Trader: exploratory, sensitive to broad acceptance signals,
- Hoarder: conservative, inventory-safe,
- Opportunist: short-term, advantage-seeking,
- Reciprocator: fair, cooperative, quick to adjust trust.

Users can configure archetype proportions and then fine-tune individual agents.

## Agent Context Boundary

Agent context may include:
- the agent's own inventory and needs,
- production type,
- private transaction memory,
- relationship scores,
- received proposals,
- low-resolution market signals.

Agent context must not include:
- global full-state access,
- hidden experiment goals,
- instructions that any resource is special,
- terms or framing that imply a target exchange role for a resource.

Market signals must be generic across all resources, such as recent acceptance counts or aggregate completion rates. They must not single out one resource unless that resource is simply part of a uniform table containing every resource.

## Action Model

v1 allows:
- `propose_trade`,
- `accept_trade`,
- `reject_trade`,
- `hold_resource`,
- `explain_strategy`.

v1 does not allow:
- counter-offers,
- direct inventory edits,
- global state mutation,
- agent-declared system facts,
- unstructured state changes.

The engine decides what is legal and settles trades. Agents choose among legal actions and provide explanations. Explanations are audit text, not proof of emergence.

## Memory And Information

Each agent keeps lightweight memory:
- transaction memory: who traded, what changed hands, success or failure,
- acceptance memory: which resources were accepted or rejected in direct experience,
- relationship memory: trust or reputation by counterparty.

Agents also see limited market signals:
- recent resource acceptance counts,
- recent completion rate,
- recent search difficulty,
- optionally grouped summaries by production type.

The signal is intentionally low-resolution: agents can sense economic conditions without seeing the full world.

## Metrics And Reports

Reports must judge behavior, not agent narration.

Macro metrics:
- `trade_completion_rate`,
- `unmet_need_rate`,
- `average_search_cost`,
- `network_density`,
- `network_centralization`,
- `resource_inequality`,
- `welfare_proxy`.

Resource-level exchange-bridge metrics are computed uniformly for every resource:
- `acceptance_breadth`,
- `acceptance_context_diversity`,
- `pass_through_rate`,
- `non_consumption_holding`,
- `trade_bridge_count`,
- `search_cost_reduction_after_acceptance`,
- `repeat_acceptance_stability`.

Agent metrics:
- need satisfaction,
- trade success rate,
- rejection rate,
- trade-network centrality,
- inventory changes,
- relationship changes,
- profile-to-outcome correlations.

The report should label findings by evidence strength:
- single-run observation,
- multi-seed pattern,
- counterfactual-supported finding,
- inconclusive result.

Every claim must link to supporting metrics and events. The report must be able to say that no meaningful emergent structure appeared.

## Experiment Controls

Users can configure:
- seed and turn limit,
- agent count,
- production-type distribution,
- resource list and initial distribution,
- production rates,
- consumption pressure,
- search budget,
- random encounter rate,
- market signal strength,
- archetype proportions,
- individual agent profiles.

v1 should support multi-seed runs and counterfactual comparison. Useful comparisons include:
- different profile distributions,
- lower or higher search cost,
- weaker or stronger market signals,
- memory enabled vs disabled,
- extra resources present vs absent.

## MVP Boundaries

v1 excludes:
- bargaining and counter-offers,
- prices,
- debt and credit,
- default and enforcement,
- multi-region trade,
- tribe or organization governance,
- political decision-making,
- full daily-life simulation,
- real-world policy prediction.

These exclusions protect interpretability. The first milestone is to understand whether heterogeneous agents under economic constraints produce measurable structures, not to simulate all social behavior.

## Verification Criteria

The design is successful when:
- runs are deterministic for the same seed and configuration,
- resources remain conserved under settlement,
- agent prompts do not leak hidden experiment goals,
- all resource-level exchange-bridge metrics are computed uniformly,
- reports cite events and metrics for every conclusion,
- failed or inconclusive experiments are represented honestly.
