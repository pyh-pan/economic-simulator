# Economic Sandbox MVP Completion Implementation Plan

Status: historical implementation plan. The MVP completion work is done and the product has since expanded into the completed visual economic sandbox roadmap. Use `ROADMAP.md` and `SIMULATION_CONTRACT.md` for current product direction.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current simulation core into a usable first sandbox with automatic proposals, replay data, optional agent extension points, and a local browser UI.

**Architecture:** Keep `src/index.js` as the simulation engine for now, because the repo is still small. Add deterministic automatic proposal generation, optional async agent execution, local reputation, proto-currency candidates, and browser-friendly view-model helpers. Add `public/` as a static app that imports the same engine.

**Tech Stack:** Node 22 ESM, `node:test`, vanilla HTML/CSS/JS.

---

## File Structure

- Modify `src/index.js`: simulation state, proposal generation, async agent runner, reputation, proto-currency option, replay/view-model helpers.
- Modify `test/simulation-contract.test.js`: tests for automatic proposals, async agent provider, reputation, proto-currency candidate behavior, and replay summaries.
- Create `public/index.html`: usable sandbox surface.
- Create `public/styles.css`: dense experiment-console UI, responsive layout.
- Create `public/app.js`: browser controls, run execution, metrics rendering, replay timeline.
- Modify `package.json`: add `start` script for a local static server.

## Tasks

### Task 1: Automatic proposal generation

- [x] Write failing tests proving `proposalStrategy: "auto"` creates valid proposals without a manual proposal plan.
- [x] Run `npm test` and verify the new test fails.
- [x] Implement deterministic automatic proposals from local needs and counterpart inventories.
- [x] Run `npm test` and verify all tests pass.

### Task 2: Async/LLM agent interface

- [x] Write failing tests for `runSimulationAsync` and `createLlmAgent`.
- [x] Run `npm test` and verify the tests fail on missing exports.
- [x] Implement async agent calls and provider-based LLM action generation.
- [x] Run `npm test` and verify all tests pass.

### Task 3: Reputation and proto-currency experiment switches

- [x] Write failing tests for optional local reputation changes and proto-currency candidates.
- [x] Run `npm test` and verify the tests fail.
- [x] Implement local reputation bookkeeping and optional shell inventory/resource support.
- [x] Run `npm test` and verify all tests pass.

### Task 4: Replay summary and browser UI

- [x] Write failing tests for `buildReplaySummary`.
- [x] Run `npm test` and verify the tests fail.
- [x] Implement replay summary helper.
- [x] Create `public/index.html`, `public/styles.css`, and `public/app.js`.
- [x] Add `npm start` for local preview.
- [x] Run `npm test` and verify all tests pass.

### Task 5: Final verification

- [x] Run `npm test`.
- [x] Start the local server with `npm start`.
- [x] Report the local URL and remaining limitations.
