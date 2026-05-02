# Simulation Contract

This document defines the minimum contract for the first build of `economic-simulator`.

The baseline proves:
`trust + local resource incentives -> barter completion and early market-like behavior`

The original trust experiment remains the narrow regression baseline, but the current product also includes a structured decision ledger, resource constraints, counter-trade negotiation events, production shocks, institution-like norms, and neutral proto-currency emergence metrics.

## 1. World Truth

These fields are the only source of truth. Agents may describe the world, but they do not define it.

### Run configuration
- `seed`: deterministic run seed
- `turn_limit`: max number of turns in a run
- `global_trust`: experiment parameter, shared baseline trust level across tribes
- `production_shocks`: optional turn-scoped production-rate overrides
- `norms`: optional local institution constraints such as minimum net utility

### Tribe state
- `tribe_id`
- `dominant_resource`: one of `fish | water | fruit | animals | wood`
- `inventory`: map of resource -> quantity
- `needs`: map of resource -> target quantity
- `targets`: map of resource -> desired stock level, derived from needs in the current model
- `reserves`: map of resource -> safety floor
- `production_rates`: map of resource -> expected replenishment per turn
- `priorities`: map of resource -> local importance weight
- `local_history`: only events this tribe directly experienced

### Proposal state
- `proposal_id`
- `turn`
- `from_tribe`
- `to_tribe`
- `offered_resource`
- `offered_quantity`
- `requested_resource`
- `requested_quantity`
- `status`: `pending | accepted | rejected | invalid`
- `resolution_reason`

### Event log
- `turn_started`
- `proposal_created`
- `proposal_accepted`
- `proposal_rejected`
- `counter_proposed`
- `trade_settled`
- `agent_output_invalid`
- `agent_output_repaired`
- `fallback_applied`
- `run_finished`

### Hard invariants
- Inventory can never go below zero.
- Resources can never be created or destroyed by agent output.
- Only the world engine can mutate inventories or proposal status.
- Same `seed` + same config must produce the same event trace.

## 2. What Each Tribe Can Observe

Each tribe has local visibility only.

An agent may see:
- its own inventory
- its own needs
- its own dominant resource
- the current turn number
- proposals sent to it this turn
- proposals it sent earlier
- outcomes of trades it directly participated in

An agent may not see:
- full-island inventory totals
- other tribes' private needs
- hidden state from unrelated trades
- global optimization hints
- any "economic law" or "historical trajectory" metadata

Design rule:
the agent should make a local decision under incomplete information, not act like a global planner.

## 3. What Each Tribe Is Allowed To Do

Agents may only return structured actions.

### Allowed actions
- `propose_trade`
- `accept_trade`
- `reject_trade`
- `counter_trade`
- `explain`

### Action shapes

`propose_trade`
- `to_tribe`
- `offered_resource`
- `offered_quantity`
- `requested_resource`
- `requested_quantity`
- `reason`

`accept_trade`
- `proposal_id`
- `reason`

`reject_trade`
- `proposal_id`
- `reason`

`counter_trade`
- `proposal_id`
- `offered_resource`
- `offered_quantity`
- `requested_resource`
- `requested_quantity`
- `reason`

`counter_trade` rejects the active proposal and records alternative terms as `counter_proposed`. It does not settle resources by itself; settlement still requires a future accepted proposal.

`explain`
- `text`

### Enforcement rules
- All action payloads must pass schema validation.
- Invalid output gets one repair attempt.
- If repair fails, the engine applies a deterministic fallback.
- A fallback failure must be logged as model/output failure, not as economic rejection.
- Agents may never directly edit inventory, trust, needs, turn count, or proposal status.

## 4. What Metric Proves Trust Changed The Economy

Primary metric:
- `trade_completion_rate = completed_trades / valid_trade_proposals`

Supporting metrics:
- `acceptance_rate = accepted_proposals / valid_trade_proposals`
- `rejection_rate = rejected_proposals / valid_trade_proposals`
- `invalid_output_rate = invalid_agent_outputs / agent_calls`
- `counter_proposals`
- `recommendation_agreement_rate`

Experiment rule:
- Compare runs with the same world setup and the same seed.
- Change only `global_trust`.
- A valid result means trust changes acceptance and completion trends without violating replay or invariant checks.

Success condition for the baseline:
- low-trust runs show lower acceptance and lower barter completion
- higher-trust runs show higher acceptance and higher barter completion
- the difference is visible across repeated seeded runs
- individual decisions can be inspected through the decision ledger
- richer market-like signals remain evidence-linked and do not bypass engine invariants
