# Engineering And Product Next Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing engineering and product layers that make the sandbox useful: real provider-backed agents, parameter scanning, persisted experiments, comparison views, replay controls, network visualization, and browser QA.

**Architecture:** Keep the simulation engine deterministic and provider-agnostic. Add small focused modules around it: agent prompt/schema helpers, experiment scanning, browser storage, and UI renderers. The engine remains the source of truth; UI and persistence only consume run summaries.

**Tech Stack:** Node 22 ESM, `node:test`, vanilla HTML/CSS/JS, browser `localStorage`, optional OpenAI-compatible HTTP provider.

---

## Scope

This plan covers the next engineering and product layer only:

- Real LLM/provider configuration and prompt contract.
- Parameter scanning across trust values.
- Local persistence for experiment runs.
- Compare view for low trust vs high trust on the same seed.
- Replay controls with step-through timeline.
- Trade network visualization.
- Tribe detail panel.
- Browser-level QA once gstack `/browse` works.

This plan does not cover:

- Full C-route agent society.
- Institutions, alliances, price formation, production, consumption, or endogenous money adoption.
- Backend database or hosted multi-user service.
- Auth, accounts, cloud sync, or deployment.

## File Structure

- Create `src/agents.js`: prompt contract, provider config validation, OpenAI-compatible agent factory.
- Create `src/experiments.js`: trust scan and side-by-side comparison helpers.
- Create `src/storage.js`: local run serialization, browser storage adapter, import/export helpers.
- Modify `src/index.js`: export `createOpenAiCompatibleAgent` from `src/agents.js` and `scanTrustLevels`/`compareTrustRuns` from `src/experiments.js`.
- Modify `test/simulation-contract.test.js`: keep existing engine tests; add focused tests for exported integration points if needed.
- Create `test/agents.test.js`: tests provider contract, prompt contents, schema-only action parsing.
- Create `test/experiments.test.js`: tests parameter scan and low/high comparison.
- Create `test/storage.test.js`: tests serialization and local storage adapter using an in-memory storage object.
- Modify `public/index.html`: add tabs for Run, Compare, Replay, Saved.
- Modify `public/app.js`: add compare rendering, replay stepping, saved runs, and network rendering.
- Modify `public/styles.css`: add product UI states for comparison, network, replay controls, saved runs.
- Modify `package.json`: add `qa:http` script that smoke-checks static routes with `curl`.

Current directory has no `.git` metadata. Commit steps below assume a repository is initialized. If not, run the verification command and leave commit steps for the first real git workspace.

---

### Task 1: Agent Prompt Contract And Provider Adapter

**Files:**
- Create: `src/agents.js`
- Create: `test/agents.test.js`
- Modify: `src/index.js`

- [ ] **Step 1: Write the failing test**

Add `test/agents.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentPrompt,
  createOpenAiCompatibleAgent,
  parseAgentAction,
} from "../src/agents.js";

test("agent prompt forbids global economic knowledge and exposes only local state", () => {
  const prompt = buildAgentPrompt({
    visibleState: {
      tribeId: "fruiters",
      inventory: { fruit: 10, fish: 1 },
      needs: { fish: 3 },
      proposals: [{ proposal_id: "proposal-1", from_tribe: "fishers" }],
    },
    proposal: {
      proposal_id: "proposal-1",
      offered_resource: "fish",
      requested_resource: "fruit",
    },
  });

  assert.match(prompt.system, /local tribe decision maker/i);
  assert.match(prompt.system, /do not use economic history/i);
  assert.match(prompt.system, /return only json/i);
  assert.doesNotMatch(prompt.user, /full-island inventory/i);
  assert.match(prompt.user, /fruiters/);
  assert.match(prompt.user, /proposal-1/);
});

test("parseAgentAction extracts strict JSON action from provider text", () => {
  const action = parseAgentAction('{"type":"accept_trade","proposal_id":"proposal-1","reason":"fish is needed"}');

  assert.deepEqual(action, {
    type: "accept_trade",
    proposal_id: "proposal-1",
    reason: "fish is needed",
  });
});

test("OpenAI-compatible agent sends prompt and parses returned action", async () => {
  const calls = [];
  const agent = createOpenAiCompatibleAgent({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async (url, request) => {
      calls.push({ url, request: JSON.parse(request.body) });
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: '{"type":"reject_trade","proposal_id":"proposal-1","reason":"trust is too low"}',
                },
              },
            ],
          };
        },
      };
    },
  });

  const action = await agent(
    { tribeId: "fruiters", inventory: { fruit: 10 }, needs: { fish: 3 }, proposals: [] },
    { proposal_id: "proposal-1", offered_resource: "fish", requested_resource: "fruit" },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].request.model, "test-model");
  assert.equal(action.type, "reject_trade");
  assert.equal(action.proposal_id, "proposal-1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/agents.test.js
```

Expected: FAIL with `Cannot find module '../src/agents.js'`.

- [ ] **Step 3: Implement the minimal provider module**

Create `src/agents.js`:

```js
export function buildAgentPrompt({ visibleState, proposal }) {
  return {
    system: [
      "You are a local tribe decision maker inside an economic sandbox.",
      "You only know the visible state provided by the engine.",
      "Do not use economic history, monetary theory, global optimization, or outside knowledge.",
      "Return only JSON. No markdown. No prose outside JSON.",
      "Allowed actions: accept_trade, reject_trade, explain.",
    ].join(" "),
    user: JSON.stringify({
      visible_state: visibleState,
      active_proposal: proposal,
      output_examples: [
        { type: "accept_trade", proposal_id: proposal.proposal_id, reason: "the exchange helps my tribe" },
        { type: "reject_trade", proposal_id: proposal.proposal_id, reason: "I do not trust this offer" },
      ],
    }),
  };
}

export function parseAgentAction(text) {
  if (typeof text !== "string") {
    throw new Error("Provider content must be a string");
  }
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Provider content must parse to an object");
  }
  return parsed;
}

export function createOpenAiCompatibleAgent({
  apiKey = process.env.OPENAI_API_KEY,
  baseUrl = "https://api.openai.com/v1/chat/completions",
  model = "gpt-4.1-mini",
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) {
    throw new Error("OpenAI-compatible agent requires apiKey or OPENAI_API_KEY");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("OpenAI-compatible agent requires fetch");
  }

  return async (visibleState, proposal) => {
    const prompt = buildAgentPrompt({ visibleState, proposal });
    const response = await fetchImpl(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Provider request failed: ${response.status}`);
    }

    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    return parseAgentAction(content);
  };
}
```

Modify `src/index.js` near the top:

```js
export { createOpenAiCompatibleAgent } from "./agents.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/agents.test.js
```

Expected: PASS all tests in `test/agents.test.js`.

- [ ] **Step 5: Commit**

If this directory has git initialized:

```bash
git add src/agents.js src/index.js test/agents.test.js
git commit -m "feat: add provider-backed agent prompt contract"
```

---

### Task 2: Trust Parameter Scan And Comparison Helpers

**Files:**
- Create: `src/experiments.js`
- Create: `test/experiments.test.js`
- Modify: `src/index.js`

- [ ] **Step 1: Write the failing test**

Add `test/experiments.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { compareTrustRuns, scanTrustLevels } from "../src/experiments.js";

test("scanTrustLevels runs one seeded simulation per trust value", () => {
  const scan = scanTrustLevels({
    seed: "scan-001",
    turnLimit: 10,
    trustLevels: [0, 0.5, 1],
  });

  assert.deepEqual(scan.map((row) => row.trust), [0, 0.5, 1]);
  assert.equal(scan.length, 3);
  assert.equal(scan[0].metrics.trade_completion_rate <= scan[2].metrics.trade_completion_rate, true);
});

test("compareTrustRuns returns low and high summaries with deltas", () => {
  const comparison = compareTrustRuns({
    seed: "compare-001",
    turnLimit: 10,
    lowTrust: 0,
    highTrust: 1,
  });

  assert.equal(comparison.low.config.global_trust, 0);
  assert.equal(comparison.high.config.global_trust, 1);
  assert.equal(comparison.delta.completed_trades > 0, true);
  assert.equal(comparison.delta.acceptance_rate > 0, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/experiments.test.js
```

Expected: FAIL with `Cannot find module '../src/experiments.js'`.

- [ ] **Step 3: Implement scan and comparison helpers**

Create `src/experiments.js`:

```js
import { buildReplaySummary, runSimulation } from "./index.js";

export function scanTrustLevels({
  seed,
  turnLimit,
  trustLevels = [0, 0.25, 0.5, 0.75, 1],
  proposalStrategy = "auto",
  enableReputation = true,
  protoCurrencyCandidates = [],
} = {}) {
  return trustLevels.map((trust) => {
    const run = runSimulation({
      seed,
      turnLimit,
      globalTrust: trust,
      proposalStrategy,
      enableReputation,
      protoCurrencyCandidates,
    });
    return {
      trust,
      metrics: run.metrics,
      summary: buildReplaySummary(run),
    };
  });
}

export function compareTrustRuns({
  seed,
  turnLimit,
  lowTrust = 0.15,
  highTrust = 0.85,
  proposalStrategy = "auto",
  enableReputation = true,
  protoCurrencyCandidates = [],
} = {}) {
  const lowRun = runSimulation({
    seed,
    turnLimit,
    globalTrust: lowTrust,
    proposalStrategy,
    enableReputation,
    protoCurrencyCandidates,
  });
  const highRun = runSimulation({
    seed,
    turnLimit,
    globalTrust: highTrust,
    proposalStrategy,
    enableReputation,
    protoCurrencyCandidates,
  });
  const low = buildReplaySummary(lowRun);
  const high = buildReplaySummary(highRun);

  return {
    low,
    high,
    delta: {
      completed_trades: high.metrics.completed_trades - low.metrics.completed_trades,
      acceptance_rate: high.metrics.acceptance_rate - low.metrics.acceptance_rate,
      trade_completion_rate: high.metrics.trade_completion_rate - low.metrics.trade_completion_rate,
    },
  };
}
```

Modify `src/index.js` near the top:

```js
export { compareTrustRuns, scanTrustLevels } from "./experiments.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/experiments.test.js
```

Expected: PASS all tests in `test/experiments.test.js`.

- [ ] **Step 5: Commit**

If git is initialized:

```bash
git add src/experiments.js src/index.js test/experiments.test.js
git commit -m "feat: add trust scan and comparison helpers"
```

---

### Task 3: Local Persistence For Experiment Runs

**Files:**
- Create: `src/storage.js`
- Create: `test/storage.test.js`
- Modify: `src/index.js`

- [ ] **Step 1: Write the failing test**

Add `test/storage.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { createRunStore, serializeRunRecord } from "../src/storage.js";
import { runSimulation } from "../src/index.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

test("serializeRunRecord creates stable saved-run payload", () => {
  const run = runSimulation({ seed: "persist-001", turnLimit: 3, globalTrust: 0.7, proposalStrategy: "auto" });
  const record = serializeRunRecord({ id: "run-1", label: "Trust 0.7", run });

  assert.equal(record.id, "run-1");
  assert.equal(record.label, "Trust 0.7");
  assert.equal(record.summary.metrics.valid_trade_proposals, 3);
  assert.equal(typeof record.createdAt, "string");
});

test("run store saves, lists, loads, and deletes records", () => {
  const store = createRunStore({ storage: memoryStorage(), key: "runs" });
  const run = runSimulation({ seed: "persist-002", turnLimit: 2, globalTrust: 1, proposalStrategy: "auto" });
  const record = serializeRunRecord({ id: "run-2", label: "High trust", run });

  store.save(record);

  assert.equal(store.list().length, 1);
  assert.equal(store.load("run-2").label, "High trust");

  store.remove("run-2");

  assert.deepEqual(store.list(), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/storage.test.js
```

Expected: FAIL with `Cannot find module '../src/storage.js'`.

- [ ] **Step 3: Implement local storage module**

Create `src/storage.js`:

```js
import { buildReplaySummary } from "./index.js";

export function serializeRunRecord({ id, label, run, createdAt = new Date().toISOString() }) {
  return {
    id,
    label,
    createdAt,
    summary: buildReplaySummary(run),
  };
}

export function createRunStore({ storage = globalThis.localStorage, key = "economic-simulator:runs" } = {}) {
  if (!storage) {
    throw new Error("createRunStore requires a storage object");
  }

  const readAll = () => JSON.parse(storage.getItem(key) ?? "[]");
  const writeAll = (records) => storage.setItem(key, JSON.stringify(records));

  return {
    save(record) {
      const records = readAll().filter((existing) => existing.id !== record.id);
      records.unshift(record);
      writeAll(records);
    },
    list() {
      return readAll();
    },
    load(id) {
      return readAll().find((record) => record.id === id) ?? null;
    },
    remove(id) {
      writeAll(readAll().filter((record) => record.id !== id));
    },
  };
}
```

Modify `src/index.js` near the top:

```js
export { createRunStore, serializeRunRecord } from "./storage.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/storage.test.js
```

Expected: PASS all tests in `test/storage.test.js`.

- [ ] **Step 5: Commit**

If git is initialized:

```bash
git add src/storage.js src/index.js test/storage.test.js
git commit -m "feat: persist local experiment runs"
```

---

### Task 4: Compare View And Parameter Scan UI

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Add compare controls to HTML**

Modify the controls section in `public/index.html` by adding this after the `switches` block:

```html
<div class="toolbar" role="tablist" aria-label="Views">
  <button class="view-tab active" data-view="run" type="button">Run</button>
  <button class="view-tab" data-view="compare" type="button">Compare</button>
  <button class="view-tab" data-view="saved" type="button">Saved</button>
</div>
```

Modify the results panel by adding these containers inside `.results-panel`:

```html
<section id="run-view" class="view active"></section>
<section id="compare-view" class="view"></section>
<section id="saved-view" class="view"></section>
```

Move the existing metric, tribe, and replay markup into `#run-view`.

- [ ] **Step 2: Implement compare rendering**

Modify the import in `public/app.js`:

```js
import {
  buildReplaySummary,
  compareTrustRuns,
  createRunStore,
  runSimulation,
  scanTrustLevels,
  serializeRunRecord,
} from "/src/index.js";
```

Add this function:

```js
function renderCompare() {
  const comparison = compareTrustRuns({
    seed: seedInput.value || "island-001",
    turnLimit: Number(turnsInput.value || 12),
    lowTrust: 0.15,
    highTrust: Number(trustInput.value),
    proposalStrategy: "auto",
    enableReputation: reputationInput.checked,
    protoCurrencyCandidates: shellsInput.checked ? ["shells"] : [],
  });
  const scan = scanTrustLevels({
    seed: seedInput.value || "island-001",
    turnLimit: Number(turnsInput.value || 12),
    trustLevels: [0, 0.25, 0.5, 0.75, 1],
    proposalStrategy: "auto",
    enableReputation: reputationInput.checked,
    protoCurrencyCandidates: shellsInput.checked ? ["shells"] : [],
  });

  compareView.innerHTML = `
    <div class="compare-grid">
      ${compareCard("Low trust", comparison.low)}
      ${compareCard("High trust", comparison.high)}
    </div>
    <div class="scan-bars">
      ${scan.map((row) => `
        <div class="scan-row">
          <span>${row.trust.toFixed(2)}</span>
          <div class="bar"><i style="width:${Math.round(row.metrics.trade_completion_rate * 100)}%"></i></div>
          <strong>${Math.round(row.metrics.trade_completion_rate * 100)}%</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function compareCard(title, summary) {
  return `
    <article class="compare-card">
      <h2>${title}</h2>
      <p class="big-number">${Math.round(summary.metrics.trade_completion_rate * 100)}%</p>
      <p>${summary.metrics.completed_trades} completed trades from ${summary.metrics.valid_trade_proposals} proposals</p>
    </article>
  `;
}
```

- [ ] **Step 3: Add view switching**

Add this near the top of `public/app.js`:

```js
const tabs = [...document.querySelectorAll(".view-tab")];
const views = [...document.querySelectorAll(".view")];
const compareView = document.querySelector("#compare-view");
const savedView = document.querySelector("#saved-view");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    views.forEach((view) => view.classList.toggle("active", view.id === `${tab.dataset.view}-view`));
    if (tab.dataset.view === "compare") renderCompare();
    if (tab.dataset.view === "saved") renderSaved();
  });
});
```

- [ ] **Step 4: Add CSS**

Append to `public/styles.css`:

```css
.toolbar {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.view-tab {
  border: 1px solid var(--line);
  min-height: 36px;
  background: white;
  color: var(--ink);
  cursor: pointer;
}

.view-tab.active {
  background: var(--ink);
  color: white;
}

.view {
  display: none;
}

.view.active {
  display: block;
}

.compare-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.compare-card {
  border: 1px solid var(--line);
  background: white;
  padding: 14px;
}

.big-number {
  margin: 10px 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 44px;
}

.scan-bars {
  display: grid;
  gap: 8px;
}

.scan-row {
  display: grid;
  grid-template-columns: 46px 1fr 44px;
  gap: 8px;
  align-items: center;
}

.bar {
  height: 12px;
  border: 1px solid var(--line);
  background: white;
}

.bar i {
  display: block;
  height: 100%;
  background: var(--green);
}
```

- [ ] **Step 5: Verify static page still serves**

Run:

```bash
npm test && curl -I http://localhost:4173/
```

Expected: tests pass and HTTP `200 OK` from the local server.

- [ ] **Step 6: Commit**

If git is initialized:

```bash
git add public/index.html public/app.js public/styles.css
git commit -m "feat: add trust comparison view"
```

---

### Task 5: Replay Stepper And Tribe Detail Panel

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Add replay controls**

Add this above the timeline container in `public/index.html`:

```html
<div class="replay-controls">
  <button id="prev-turn" type="button">Prev</button>
  <output id="turn-output">Turn 1</output>
  <button id="next-turn" type="button">Next</button>
</div>
```

- [ ] **Step 2: Add selected-turn state**

Add these variables in `public/app.js`:

```js
let currentSummary = null;
let selectedTurnIndex = 0;
const prevTurnButton = document.querySelector("#prev-turn");
const nextTurnButton = document.querySelector("#next-turn");
const turnOutput = document.querySelector("#turn-output");

prevTurnButton.addEventListener("click", () => {
  selectedTurnIndex = Math.max(0, selectedTurnIndex - 1);
  renderSelectedTurn();
});

nextTurnButton.addEventListener("click", () => {
  if (!currentSummary) return;
  selectedTurnIndex = Math.min(currentSummary.turns.length - 1, selectedTurnIndex + 1);
  renderSelectedTurn();
});
```

Modify `renderRun` so it stores summary and resets the selected turn:

```js
currentSummary = summary;
selectedTurnIndex = 0;
renderSelectedTurn();
```

- [ ] **Step 3: Render one selected turn**

Add:

```js
function renderSelectedTurn() {
  if (!currentSummary) return;
  const selected = currentSummary.turns[selectedTurnIndex] ?? currentSummary.turns[0];
  turnOutput.value = selected ? `Turn ${selected.turn}` : "No turns";
  timelineEl.innerHTML = selected ? `
    <article class="turn selected">
      <h3>Turn ${selected.turn}</h3>
      ${selected.events.map((event) => `<p class="event">${describeEvent(event)}</p>`).join("")}
    </article>
  ` : "";
}
```

- [ ] **Step 4: Add tribe detail on click**

Add to `public/index.html` near the tribe section:

```html
<aside class="detail-panel" id="detail-panel">Select a tribe</aside>
```

In `renderTribes`, add `data-tribe-id="${tribe.tribe_id}"` to each `article`.

Add:

```js
const detailPanel = document.querySelector("#detail-panel");

tribesEl.addEventListener("click", (event) => {
  const card = event.target.closest("[data-tribe-id]");
  if (!card || !currentSummary) return;
  const tribe = currentSummary.tribes.find((item) => item.tribe_id === card.dataset.tribeId);
  renderTribeDetail(tribe);
});

function renderTribeDetail(tribe) {
  detailPanel.innerHTML = `
    <h2>${label(tribe.tribe_id)}</h2>
    <p>Dominant resource: ${tribe.dominant_resource}</p>
    <div class="resources">
      ${Object.entries(tribe.inventory).map(([resource, quantity]) => `<span class="pill">${resource}: ${quantity}</span>`).join("")}
    </div>
  `;
}
```

- [ ] **Step 5: Add CSS**

Append:

```css
.replay-controls {
  display: grid;
  grid-template-columns: 70px 1fr 70px;
  gap: 8px;
  margin-bottom: 10px;
}

.replay-controls button {
  border: 1px solid var(--line);
  background: white;
  min-height: 34px;
}

.replay-controls output,
.detail-panel {
  border: 1px solid var(--line);
  background: white;
  padding: 8px 10px;
}

.detail-panel {
  margin-top: 10px;
}

.tribe {
  cursor: pointer;
}

.tribe:hover {
  border-color: var(--green);
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

If git is initialized:

```bash
git add public/index.html public/app.js public/styles.css
git commit -m "feat: add replay controls and tribe detail panel"
```

---

### Task 6: Trade Network Visualization

**Files:**
- Modify: `src/experiments.js`
- Create: `test/network.test.js`
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Write failing network test**

Add `test/network.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { buildTradeNetwork } from "../src/experiments.js";
import { runSimulation } from "../src/index.js";

test("buildTradeNetwork summarizes completed and rejected edges", () => {
  const run = runSimulation({ seed: "network", turnLimit: 5, globalTrust: 1, proposalStrategy: "auto" });
  const network = buildTradeNetwork(run.events);

  assert.equal(network.nodes.length, 5);
  assert.equal(network.edges.length > 0, true);
  assert.equal(network.edges.some((edge) => edge.completed > 0), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/network.test.js
```

Expected: FAIL with `buildTradeNetwork is not a function`.

- [ ] **Step 3: Implement network helper**

Append to `src/experiments.js`:

```js
const TRIBES = ["fishers", "waterkeepers", "fruiters", "herders", "woodcutters"];

export function buildTradeNetwork(events) {
  const proposals = new Map();
  for (const event of events) {
    if (event.type === "proposal_created") {
      proposals.set(event.proposal_id, event);
    }
  }

  const edgeMap = new Map();
  for (const event of events) {
    if (event.type !== "trade_settled" && event.type !== "proposal_rejected") continue;
    const proposal = proposals.get(event.proposal_id);
    if (!proposal) continue;
    const key = `${proposal.from_tribe}->${proposal.to_tribe}`;
    const current = edgeMap.get(key) ?? {
      from: proposal.from_tribe,
      to: proposal.to_tribe,
      completed: 0,
      rejected: 0,
    };
    if (event.type === "trade_settled") current.completed += 1;
    if (event.type === "proposal_rejected") current.rejected += 1;
    edgeMap.set(key, current);
  }

  return {
    nodes: TRIBES.map((id) => ({ id })),
    edges: [...edgeMap.values()],
  };
}
```

- [ ] **Step 4: Render network in UI**

Import `buildTradeNetwork` from `/src/experiments.js` in `public/app.js`.

Add this container to `public/index.html` inside `#run-view`:

```html
<section>
  <h2>Network</h2>
  <div class="network" id="network"></div>
</section>
```

Add:

```js
const networkEl = document.querySelector("#network");

function renderNetwork(run) {
  const network = buildTradeNetwork(run.events);
  networkEl.innerHTML = network.edges.map((edge) => `
    <div class="edge">
      <span>${edge.from} -> ${edge.to}</span>
      <strong>${edge.completed} / ${edge.rejected}</strong>
    </div>
  `).join("") || "<p class='event'>No trades yet</p>";
}
```

Call `renderNetwork(run)` inside `renderRun`.

- [ ] **Step 5: Add CSS**

Append:

```css
.network {
  display: grid;
  gap: 6px;
}

.edge {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--line);
  background: white;
  padding: 8px 10px;
  font-size: 12px;
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

If git is initialized:

```bash
git add src/experiments.js test/network.test.js public/index.html public/app.js public/styles.css
git commit -m "feat: visualize trade network"
```

---

### Task 7: Saved Runs UI

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Add save button**

Add beside the Run button in `public/index.html`:

```html
<button id="save-button" type="button">Save</button>
```

- [ ] **Step 2: Wire store in app**

In `public/app.js`, add:

```js
const saveButton = document.querySelector("#save-button");
const store = createRunStore();
let lastRun = null;

saveButton.addEventListener("click", () => {
  if (!lastRun) return;
  const id = `${Date.now()}`;
  store.save(serializeRunRecord({
    id,
    label: `${seedInput.value || "island-001"} / trust ${Number(trustInput.value).toFixed(2)}`,
    run: lastRun,
  }));
  renderSaved();
});
```

Modify `renderRun`:

```js
lastRun = run;
```

Add:

```js
function renderSaved() {
  const records = store.list();
  savedView.innerHTML = records.map((record) => `
    <article class="saved-run" data-run-id="${record.id}">
      <h2>${record.label}</h2>
      <p>${new Date(record.createdAt).toLocaleString()}</p>
      <p>${record.summary.metrics.completed_trades} completed trades</p>
    </article>
  `).join("") || "<p class='event'>No saved runs</p>";
}

savedView.addEventListener("click", (event) => {
  const card = event.target.closest("[data-run-id]");
  if (!card) return;
  const record = store.load(card.dataset.runId);
  if (!record) return;
  currentSummary = record.summary;
  renderMetrics(record.summary.metrics);
  renderTribes(record.summary.tribes, record.summary.resources);
  renderSelectedTurn();
});
```

- [ ] **Step 3: Add CSS**

Append:

```css
.saved-run {
  border: 1px solid var(--line);
  background: white;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
}

.saved-run:hover {
  border-color: var(--green);
}
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

If git is initialized:

```bash
git add public/index.html public/app.js public/styles.css
git commit -m "feat: add saved experiment runs"
```

---

### Task 8: Static QA Script And Browser QA Gate

**Files:**
- Modify: `package.json`
- Create: `scripts/smoke-http.mjs`
- Modify: `docs/superpowers/plans/2026-04-25-engineering-and-product-next.md`

- [ ] **Step 1: Add smoke script**

Create `scripts/smoke-http.mjs`:

```js
const baseUrl = process.env.BASE_URL ?? "http://localhost:4173";
const paths = ["/", "/public/app.js", "/public/styles.css", "/src/index.js"];

for (const path of paths) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  console.log(`${path} ${response.status}`);
}
```

Modify `package.json` scripts:

```json
{
  "start": "node server.mjs",
  "test": "node --test",
  "qa:http": "node scripts/smoke-http.mjs"
}
```

- [ ] **Step 2: Run test and HTTP smoke**

Run:

```bash
npm test
```

Expected: all tests pass.

Start server in another terminal:

```bash
npm start
```

Then run:

```bash
npm run qa:http
```

Expected output includes:

```text
/ 200
/public/app.js 200
/public/styles.css 200
/src/index.js 200
```

- [ ] **Step 3: Run gstack `/browse` when available**

Current blocker observed earlier:

```text
[browse] Executable not found in $PATH: "bun"
```

Once `bun` is available, run:

```bash
B="$HOME/.gstack/repos/gstack/.agents/skills/gstack/browse/dist/browse"
"$B" goto http://localhost:4173/
"$B" text
"$B" screenshot /tmp/economic-simulator.png
```

Expected:

```text
Economic Simulator
Run
Completion
Tribes
Replay
```

- [ ] **Step 4: Commit**

If git is initialized:

```bash
git add package.json scripts/smoke-http.mjs docs/superpowers/plans/2026-04-25-engineering-and-product-next.md
git commit -m "chore: add static QA smoke checks"
```

---

## Self-Review

Spec coverage:
- Real LLM/provider config: Task 1.
- Agent prompt contract: Task 1.
- Parameter scanning: Task 2.
- Persistence/export baseline: Task 3 and Task 7.
- Compare view: Task 4.
- Replay controls: Task 5.
- Trade network: Task 6.
- Tribe detail: Task 5.
- Browser QA: Task 8.

Placeholder scan:
- No undefined function names are introduced without a task that creates them.
- No task says to add generic validation without concrete code.
- No task asks the implementer to decide UI structure from scratch.

Type consistency:
- `scanTrustLevels`, `compareTrustRuns`, and `buildTradeNetwork` live in `src/experiments.js`.
- `serializeRunRecord` and `createRunStore` live in `src/storage.js`.
- `buildAgentPrompt`, `parseAgentAction`, and `createOpenAiCompatibleAgent` live in `src/agents.js`.
- UI imports from `/src/index.js` for public exports and `/src/experiments.js` only for `buildTradeNetwork` if it is not re-exported.
