# AI Turn Simulation Design

Status: current design background. The turn simulation design is implemented and has been extended with decision ledger context, agreement metrics, and richer resource constraints. Use `ROADMAP.md` and `SIMULATION_CONTRACT.md` for current product direction and constraints.

## Product Behavior

The simulator should stop recomputing final results while the user drags parameters. Parameters define a run configuration only. A run starts when the user clicks `Run`.

After a run starts, the page shows the current turn state:
- current tribe inventories and reputation,
- active trade proposal,
- NPC accept/reject decision and reason,
- event log for the current turn,
- aggregate metrics so far,
- completed/rejected trade network so far.

The user can choose manual progression with `Next turn`, or automatic progression with `Auto` until the turn limit is reached. `Pause` stops automatic progression without resetting the current session.

## Architecture

The browser cannot safely hold the LongCat API key. The implementation uses a local Node server as an API boundary:
- React UI calls local `/api/simulations` and `/api/simulations/:id/step`.
- The server stores in-memory simulation sessions.
- The server reads `.env`, creates LongCat agents when requested, and falls back to a local NPC policy when `agentProvider` is `local`.

The deterministic engine gains a step API so both the server and existing full-run helpers share one simulation state transition path. Existing full-run tests must keep passing.

## Agent Modes

`longcat`: the receiving tribe decision is requested from LongCat through the OpenAI-compatible API. The prompt still forbids outside economic history and exposes only visible local state.

`local`: a deterministic NPC policy uses trust, needs, and reputation to make an accept/reject decision with an explanatory reason. This is useful for fast testing and for environments where the LongCat request fails or should not be paid for.

## UI Direction

Keep the current Lab Console visual language. Add a run status strip and make the center of the screen current-turn oriented rather than final-summary oriented. The left rail remains configuration and controls. The right panel becomes the current proposal and NPC decision area.

## Testing

Use TDD for the step engine and API server. Browser QA must verify:
- page is not blank,
- clicking `Run` creates turn 0/current inventories,
- clicking `Next turn` advances to turn 1,
- current proposal and NPC reason appear,
- automatic mode can be toggled without console errors.
