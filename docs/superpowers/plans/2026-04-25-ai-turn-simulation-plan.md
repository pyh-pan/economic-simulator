# AI Turn Simulation Implementation Plan

Status: historical implementation plan. The turn-based simulation session API and React controls are implemented; current snapshots also expose proposal decision context and ledger agreement. Use `ROADMAP.md` and `SIMULATION_CONTRACT.md` for current product direction.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace immediate final-result recomputation with click-to-run AI/NPC-driven turn simulation that supports manual step and auto progression.

**Architecture:** Add a step-oriented simulation session API to the engine, then expose it through a local Node server so LongCat API keys remain server-side. React becomes a session controller: parameters are pending configuration until `Run`, then `Next turn` or `Auto` advances the active session and renders current inventories, proposal, decision reason, metrics, replay log, and network.

**Tech Stack:** Node 22 ESM, `node:test`, React 19, Vite middleware, Playwright browser smoke, LongCat OpenAI-compatible API via `.env`.

---

## File Structure

- Modify `src/index.js`: export `createSimulationSession`, `advanceSimulationTurn`, `getSimulationSnapshot`, and reuse them from `runSimulation` / `runSimulationAsync`.
- Create `test/interactive-simulation.test.js`: verifies initial snapshot, one-step advancement, current proposal, decision reason, metrics-so-far, and finished state.
- Create `server.mjs`: local API server with Vite middleware and in-memory simulation sessions.
- Create `test/server-api.test.js`: verifies API session creation and stepping with local NPC provider.
- Modify `package.json`: run `node server.mjs` for `dev`/`start`, keep `vite build`, add browser QA script unchanged.
- Modify `src/ui/App.jsx`: replace immediate recompute with session state, `Run`, `Next turn`, `Auto`, `Pause`, and status rendering.
- Modify `src/ui/App.css`: add status strip, proposal card, decision card, current-turn layout, disabled button styles.
- Modify `scripts/smoke-browser.mjs`: assert Run and Next turn interactions.

## Tasks

- [x] **Task 1: Engine step API**
  - Write failing tests for initial snapshot and one-turn advancement.
  - Implement `createSimulationSession`, `advanceSimulationTurn`, and `getSimulationSnapshot`.
  - Refactor `runSimulation` and `runSimulationAsync` to use the same step function.
  - Verify all engine tests pass.

- [x] **Task 2: Local API server**
  - Write failing API tests for create session and step.
  - Implement `server.mjs` API routes and `.env` loading.
  - Use `agentProvider: "longcat"` to call `createLongCatAgent`; use `agentProvider: "local"` for deterministic local NPC.
  - Verify API tests pass.

- [x] **Task 3: React session UI**
  - Remove render-time `runSimulation(...)` calls from `App.jsx`.
  - Add active session state, loading/error states, and controls for `Run`, `Next turn`, `Auto`, `Pause`, and `Reset`.
  - Render current-turn inventory, active proposal, NPC decision reason, event log, metrics-so-far, and network-so-far.
  - Preserve Compare and Saved tabs for deterministic analysis, but do not make parameter dragging mutate the active run.

- [x] **Task 4: Browser QA**
  - Update Playwright smoke to click `Run` and `Next turn`.
  - Verify no console errors or page runtime errors.
  - Run `npm test`, `npm run build`, `npm run qa:http`, and `npm run qa:browser`.

## Design Notes

- Default UI agent provider should be `local` for reliable development. A dropdown exposes `longcat` for real AI calls.
- Auto mode should step on a fixed interval and stop when the server reports `finished: true`.
- If a LongCat request fails, the API returns a structured error and the UI pauses instead of silently continuing.
