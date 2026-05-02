# Economic Simulator

A local visual economic sandbox for exploring how trust, resource constraints, and repeated exchange shape barter completion and early market-like behavior.

The engine owns world truth: inventories, proposals, settlement, event logs, metrics, and invariants. Agents only receive local visible state plus an engine-computed decision ledger, then return structured actions.

## Current Product

- React/Vite workbench served by a local Node API.
- Deterministic tribe-based barter simulation with seeded replay.
- Local NPC agents and LongCat/OpenAI-compatible agent adapters.
- Trust as a continuous decision weight, not a hard-coded accept/reject switch.
- Engine-computed `decision_context` for each proposal:
  - target gap benefit
  - payment opportunity cost
  - reserve penalty
  - trust-adjusted risk
  - net utility and recommendation
- UI decision ledger showing receive/pay effects, exchange ratio, recommendation, and whether the agent aligned with the ledger.
- Resource model with targets, reserves, production rates, priorities, production shocks, and norms.
- Optional reputation, counter-trade negotiation events, saved runs, comparison helpers, replay summaries, and trade network summaries.
- Emergence engine and reports for neutral extra-resource/proto-currency behavior without declaring any resource to be money.

The roadmap baseline is complete. See [ROADMAP.md](./ROADMAP.md) for the product direction and follow-up expansion decisions.

## Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

`npm start` is equivalent to `npm run dev`.

## LongCat Configuration

LongCat uses an OpenAI-compatible chat-completions API. Keep secrets in `.env`.

```bash
LONGCAT_API_KEY=...
LONGCAT_BASE_URL=https://api.longcat.chat/openai
LONGCAT_MODEL=LongCat-Flash-Chat
```

The local NPC provider works without API keys and is the stable regression-test baseline.

## Verification

```bash
npm test
npm run build
npm run qa:http
npm run qa:browser
```

`npm run qa:browser` expects the app to be reachable at `http://127.0.0.1:5173`.

## Main Files

- [src/index.js](./src/index.js): simulation engine, world state, turn advancement, metrics, invariants.
- [src/agents.js](./src/agents.js): prompt construction and LongCat/OpenAI-compatible adapters.
- [src/emergence/](./src/emergence): individual-agent emergence engine, metrics, and evidence-linked reports.
- [src/ui/](./src/ui): React application.
- [server.mjs](./server.mjs): local API and Vite middleware server.
- [SIMULATION_CONTRACT.md](./SIMULATION_CONTRACT.md): engine/agent contract.
- [ROADMAP.md](./ROADMAP.md): completed baseline roadmap and future expansion directions.
