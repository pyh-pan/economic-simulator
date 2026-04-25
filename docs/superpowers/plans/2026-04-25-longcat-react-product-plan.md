# LongCat React Product Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add LongCat-backed structured agents and migrate the static UI to a clear React experiment workbench with trust scanning, comparison, replay controls, saved runs, and browser QA.

**Architecture:** Keep `src/index.js` as the deterministic simulation engine. Add provider-specific agent helpers in `src/agents.js`, experiment helpers in `src/experiments.js`, local persistence in `src/storage.js`, and a React/Vite UI under `src/ui/`. The React app consumes simulation summaries; it does not mutate world state directly.

**Tech Stack:** Node 22 ESM, `node:test`, React + Vite, browser `localStorage`, LongCat OpenAI-compatible API at `https://api.longcat.chat/openai`.

**Implementation Status:** Completed on 2026-04-25. Verification commands: `npm test`, `npm run build`, and `npm run qa:http`.

---

## Decisions Already Made

- LLM provider: LongCat OpenAI-compatible API.
- Model default: `LongCat-Flash-Chat`.
- Secrets: real key lives in `.env`; `.env.example` uses placeholders only.
- Persistence: browser `localStorage` first; backend database later.
- Parameter scanning: scan `trust` only in this phase.
- UI: migrate to React now.
- Frontend style target: simple, clear, orderly.

## File Structure

- Modify `.gitignore`: ensure `.env` stays ignored.
- Modify `.env.example`: LongCat OpenAI-compatible example variables.
- Create `src/agents.js`: prompt contract, action parsing, `createLongCatAgent`, `createOpenAiCompatibleAgent`.
- Create `src/experiments.js`: `scanTrustLevels`, `compareTrustRuns`, `buildTradeNetwork`.
- Create `src/storage.js`: local run record serialization and browser storage adapter.
- Modify `src/index.js`: re-export new helper modules.
- Create `test/agents.test.js`: LongCat prompt/provider tests.
- Create `test/experiments.test.js`: trust scan, comparison, network tests.
- Create `test/storage.test.js`: saved-run persistence tests.
- Modify `package.json`: add React/Vite dependencies and scripts.
- Create `index.html`: Vite root.
- Create `src/ui/main.jsx`: React mount.
- Create `src/ui/App.jsx`: app state and views.
- Create `src/ui/App.css`: selected frontend design system.
- Remove after migration: `public/app.js`, `public/index.html`, `public/styles.css`, and `server.mjs`.

## Task 0: Confirm Frontend Direction

**Files:**
- Modify: `docs/superpowers/plans/2026-04-25-longcat-react-product-plan.md`

- [x] **Step 1: Ask user to pick one UI direction**

Present these options:

```text
A. Lab Console (recommended)
   Quiet, dense, clear. Left controls, top metrics, center comparison, right replay/log.
   Best for repeated experiments and parameter scanning.

B. Island Systems Map
   A visual island/network is central, with controls and metrics around it.
   Best for making the world feel alive, but harder to keep simple.

C. Split Comparison Workbench
   First screen is low-trust vs high-trust comparison. Single-run detail is secondary.
   Best for proving "change parameter -> see consequence" immediately.
```

Recommendation: choose A for the first React version because the user explicitly asked for "简洁清晰有条理".

- [x] **Step 2: Record choice**

After the user chooses, update this section:

```markdown
Selected frontend direction: Lab Console
Reason: prioritizes repeated experiments, clear controls, and fast interpretation.
```

Do not implement React UI until this choice is recorded.

Selected frontend direction: Lab Console
Reason: prioritizes repeated experiments, clear controls, and fast interpretation. This matches the requested "简洁清晰有条理" product direction.

## Task 1: LongCat Agent Prompt Contract

**Files:**
- Create: `src/agents.js`
- Create: `test/agents.test.js`
- Modify: `src/index.js`
- Already created: `.env.example`, `.env`, `.gitignore`

- [x] **Step 1: Write the failing test**

Create `test/agents.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentPrompt,
  createLongCatAgent,
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

test("LongCat agent uses OpenAI-compatible chat completions", async () => {
  const calls = [];
  const agent = createLongCatAgent({
    apiKey: "test-key",
    fetchImpl: async (url, request) => {
      calls.push({ url, request: JSON.parse(request.body), headers: request.headers });
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
  assert.equal(calls[0].url, "https://api.longcat.chat/openai/v1/chat/completions");
  assert.equal(calls[0].request.model, "LongCat-Flash-Chat");
  assert.equal(calls[0].headers.authorization, "Bearer test-key");
  assert.equal(action.type, "reject_trade");
  assert.equal(action.proposal_id, "proposal-1");
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/agents.test.js
```

Expected: FAIL with `Cannot find module '../src/agents.js'`.

- [x] **Step 3: Implement LongCat provider helpers**

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
  apiKey,
  baseUrl,
  model,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) throw new Error("OpenAI-compatible agent requires apiKey");
  if (!baseUrl) throw new Error("OpenAI-compatible agent requires baseUrl");
  if (!model) throw new Error("OpenAI-compatible agent requires model");
  if (typeof fetchImpl !== "function") throw new Error("OpenAI-compatible agent requires fetch");

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
    return parseAgentAction(body?.choices?.[0]?.message?.content);
  };
}

export function createLongCatAgent({
  apiKey = process.env.LONGCAT_API_KEY,
  baseUrl = process.env.LONGCAT_BASE_URL ?? "https://api.longcat.chat/openai",
  model = process.env.LONGCAT_MODEL ?? "LongCat-Flash-Chat",
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  return createOpenAiCompatibleAgent({
    apiKey,
    baseUrl: `${normalizedBase}/v1/chat/completions`,
    model,
    fetchImpl,
  });
}
```

Modify `src/index.js` near the top:

```js
export { createLongCatAgent, createOpenAiCompatibleAgent } from "./agents.js";
```

- [x] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/agents.test.js
```

Expected: PASS all tests in `test/agents.test.js`.

## Task 2: Trust Scan, Comparison, And Network Helpers

**Files:**
- Create: `src/experiments.js`
- Create: `test/experiments.test.js`
- Modify: `src/index.js`

- [x] **Step 1: Write failing tests**

Create `test/experiments.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { buildTradeNetwork, compareTrustRuns, scanTrustLevels } from "../src/experiments.js";

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

test("buildTradeNetwork summarizes completed and rejected edges", () => {
  const comparison = compareTrustRuns({
    seed: "network-001",
    turnLimit: 10,
    lowTrust: 0,
    highTrust: 1,
  });

  const network = buildTradeNetwork(comparison.high.turns.flatMap((turn) => turn.events));

  assert.equal(network.nodes.length, 5);
  assert.equal(network.edges.length > 0, true);
  assert.equal(network.edges.some((edge) => edge.completed > 0), true);
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/experiments.test.js
```

Expected: FAIL with `Cannot find module '../src/experiments.js'`.

- [x] **Step 3: Implement experiment helpers**

Create `src/experiments.js`:

```js
import { buildReplaySummary, runSimulation } from "./index.js";

const TRIBES = ["fishers", "waterkeepers", "fruiters", "herders", "woodcutters"];

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
    return { trust, metrics: run.metrics, summary: buildReplaySummary(run) };
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
  const lowRun = runSimulation({ seed, turnLimit, globalTrust: lowTrust, proposalStrategy, enableReputation, protoCurrencyCandidates });
  const highRun = runSimulation({ seed, turnLimit, globalTrust: highTrust, proposalStrategy, enableReputation, protoCurrencyCandidates });
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

export function buildTradeNetwork(events) {
  const proposals = new Map();
  for (const event of events) {
    if (event.type === "proposal_created") proposals.set(event.proposal_id, event);
  }

  const edges = new Map();
  for (const event of events) {
    if (event.type !== "trade_settled" && event.type !== "proposal_rejected") continue;
    const proposal = proposals.get(event.proposal_id);
    if (!proposal) continue;
    const key = `${proposal.from_tribe}->${proposal.to_tribe}`;
    const edge = edges.get(key) ?? { from: proposal.from_tribe, to: proposal.to_tribe, completed: 0, rejected: 0 };
    if (event.type === "trade_settled") edge.completed += 1;
    if (event.type === "proposal_rejected") edge.rejected += 1;
    edges.set(key, edge);
  }

  return {
    nodes: TRIBES.map((id) => ({ id })),
    edges: [...edges.values()],
  };
}
```

Modify `src/index.js` near the top:

```js
export { buildTradeNetwork, compareTrustRuns, scanTrustLevels } from "./experiments.js";
```

- [x] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/experiments.test.js
```

Expected: PASS all tests in `test/experiments.test.js`.

## Task 3: Local Persistence

**Files:**
- Create: `src/storage.js`
- Create: `test/storage.test.js`
- Modify: `src/index.js`

- [x] **Step 1: Write failing tests**

Create `test/storage.test.js`:

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
  const record = serializeRunRecord({ id: "run-1", label: "Trust 0.7", run, createdAt: "2026-04-25T00:00:00.000Z" });

  assert.equal(record.id, "run-1");
  assert.equal(record.label, "Trust 0.7");
  assert.equal(record.summary.metrics.valid_trade_proposals, 3);
  assert.equal(record.createdAt, "2026-04-25T00:00:00.000Z");
});

test("run store saves, lists, loads, and deletes records", () => {
  const store = createRunStore({ storage: memoryStorage(), key: "runs" });
  const run = runSimulation({ seed: "persist-002", turnLimit: 2, globalTrust: 1, proposalStrategy: "auto" });
  const record = serializeRunRecord({ id: "run-2", label: "High trust", run, createdAt: "2026-04-25T00:00:00.000Z" });

  store.save(record);

  assert.equal(store.list().length, 1);
  assert.equal(store.load("run-2").label, "High trust");

  store.remove("run-2");

  assert.deepEqual(store.list(), []);
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/storage.test.js
```

Expected: FAIL with `Cannot find module '../src/storage.js'`.

- [x] **Step 3: Implement local run storage**

Create `src/storage.js`:

```js
import { buildReplaySummary } from "./index.js";

export function serializeRunRecord({ id, label, run, createdAt = new Date().toISOString() }) {
  return { id, label, createdAt, summary: buildReplaySummary(run) };
}

export function createRunStore({ storage = globalThis.localStorage, key = "economic-simulator:runs" } = {}) {
  if (!storage) throw new Error("createRunStore requires a storage object");

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

- [x] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/storage.test.js
```

Expected: PASS all tests in `test/storage.test.js`.

## Task 4: React Migration With Selected Design Direction

**Files:**
- Modify: `package.json`
- Create: `index.html`
- Create: `src/ui/main.jsx`
- Create: `src/ui/App.jsx`
- Create: `src/ui/App.css`
- Remove after verification: `public/index.html`, `public/app.js`, `public/styles.css`, `server.mjs`

- [x] **Step 1: Add React/Vite dependencies and scripts**

Modify `package.json`:

```json
{
  "name": "economic-simulator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "start": "vite --host 0.0.0.0",
    "test": "node --test",
    "qa:http": "node scripts/smoke-http.mjs"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "vite": "^7.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "lucide-react": "^0.468.0"
  },
  "devDependencies": {}
}
```

- [x] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: creates `package-lock.json` and installs dependencies.

- [x] **Step 3: Create Vite entry**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Economic Simulator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/ui/main.jsx"></script>
  </body>
</html>
```

Create `src/ui/main.jsx`:

```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./App.css";

createRoot(document.querySelector("#root")).render(<App />);
```

- [x] **Step 4: Create React app**

Create `src/ui/App.jsx` with this initial Lab Console implementation if Task 0 selected A:

```jsx
import { Activity, Database, GitCompare, Play, Save } from "lucide-react";
import { useState } from "react";
import {
  buildReplaySummary,
  buildTradeNetwork,
  compareTrustRuns,
  createRunStore,
  runSimulation,
  scanTrustLevels,
  serializeRunRecord,
} from "../index.js";

const store = createRunStore();

export function App() {
  const [seed, setSeed] = useState("island-001");
  const [trust, setTrust] = useState(0.65);
  const [turnLimit, setTurnLimit] = useState(12);
  const [enableReputation, setEnableReputation] = useState(true);
  const [enableShells, setEnableShells] = useState(false);
  const [view, setView] = useState("run");
  const [selectedTurn, setSelectedTurn] = useState(0);
  const [savedRuns, setSavedRuns] = useState(() => store.list());

  const options = {
    seed,
    turnLimit,
    globalTrust: trust,
    proposalStrategy: "auto",
    enableReputation,
    protoCurrencyCandidates: enableShells ? ["shells"] : [],
  };
  const run = runSimulation(options);
  const summary = buildReplaySummary(run);
  const comparison = compareTrustRuns({ ...options, lowTrust: 0.15, highTrust: trust });
  const scan = scanTrustLevels({ ...options, trustLevels: [0, 0.25, 0.5, 0.75, 1] });
  const network = buildTradeNetwork(run.events);

  const saveRun = () => {
    const record = serializeRunRecord({
      id: `${Date.now()}`,
      label: `${seed} / trust ${trust.toFixed(2)}`,
      run,
    });
    store.save(record);
    setSavedRuns(store.list());
  };

  return (
    <main className="app-shell">
      <aside className="control-rail">
        <div className="title-block">
          <span>Island barter lab</span>
          <h1>Economic Simulator</h1>
        </div>

        <label className="field">
          <span>Seed</span>
          <input value={seed} onChange={(event) => setSeed(event.target.value)} />
        </label>

        <label className="field">
          <span>Trust {trust.toFixed(2)}</span>
          <input type="range" min="0" max="1" step="0.05" value={trust} onChange={(event) => setTrust(Number(event.target.value))} />
        </label>

        <label className="field">
          <span>Turns</span>
          <input type="number" min="1" max="50" value={turnLimit} onChange={(event) => setTurnLimit(Number(event.target.value))} />
        </label>

        <div className="checks">
          <label><input type="checkbox" checked={enableReputation} onChange={(event) => setEnableReputation(event.target.checked)} /> Reputation</label>
          <label><input type="checkbox" checked={enableShells} onChange={(event) => setEnableShells(event.target.checked)} /> Shells</label>
        </div>

        <button className="primary" onClick={() => setSelectedTurn(0)}><Play size={16} /> Run</button>
        <button className="secondary" onClick={saveRun}><Save size={16} /> Save</button>
      </aside>

      <section className="workspace">
        <nav className="tabs">
          <button className={view === "run" ? "active" : ""} onClick={() => setView("run")}><Activity size={16} /> Run</button>
          <button className={view === "compare" ? "active" : ""} onClick={() => setView("compare")}><GitCompare size={16} /> Compare</button>
          <button className={view === "saved" ? "active" : ""} onClick={() => setView("saved")}><Database size={16} /> Saved</button>
        </nav>

        {view === "run" && <RunView summary={summary} network={network} selectedTurn={selectedTurn} setSelectedTurn={setSelectedTurn} />}
        {view === "compare" && <CompareView comparison={comparison} scan={scan} />}
        {view === "saved" && <SavedView records={savedRuns} />}
      </section>
    </main>
  );
}

function RunView({ summary, network, selectedTurn, setSelectedTurn }) {
  const turn = summary.turns[selectedTurn] ?? summary.turns[0];
  return (
    <div className="run-grid">
      <Metrics metrics={summary.metrics} />
      <section className="panel tribes-panel">
        <h2>Tribes</h2>
        <div className="tribe-grid">
          {summary.tribes.map((tribe) => <TribeCard key={tribe.tribe_id} tribe={tribe} resources={summary.resources} />)}
        </div>
      </section>
      <section className="panel">
        <h2>Replay</h2>
        <div className="replay-controls">
          <button onClick={() => setSelectedTurn(Math.max(0, selectedTurn - 1))}>Prev</button>
          <strong>{turn ? `Turn ${turn.turn}` : "No turns"}</strong>
          <button onClick={() => setSelectedTurn(Math.min(summary.turns.length - 1, selectedTurn + 1))}>Next</button>
        </div>
        {(turn?.events ?? []).map((event) => <p className="event-line" key={`${event.type}-${event.proposal_id ?? event.turn}`}>{describeEvent(event)}</p>)}
      </section>
      <section className="panel">
        <h2>Network</h2>
        {network.edges.map((edge) => <p className="event-line" key={`${edge.from}-${edge.to}`}>{edge.from} -> {edge.to}: {edge.completed} completed / {edge.rejected} rejected</p>)}
      </section>
    </div>
  );
}

function Metrics({ metrics }) {
  return (
    <section className="metrics">
      <Metric label="Completion" value={`${Math.round(metrics.trade_completion_rate * 100)}%`} />
      <Metric label="Acceptance" value={`${Math.round(metrics.acceptance_rate * 100)}%`} />
      <Metric label="Completed" value={metrics.completed_trades} />
      <Metric label="Invalid output" value={`${Math.round(metrics.invalid_output_rate * 100)}%`} />
    </section>
  );
}

function Metric({ label, value }) {
  return <article className="metric"><strong>{value}</strong><span>{label}</span></article>;
}

function TribeCard({ tribe, resources }) {
  return (
    <article className="tribe-card">
      <h3>{tribe.tribe_id} / {tribe.dominant_resource}</h3>
      <div className="resource-list">
        {resources.map((resource) => <span key={resource}>{resource}: {tribe.inventory[resource] ?? 0}</span>)}
      </div>
    </article>
  );
}

function CompareView({ comparison, scan }) {
  return (
    <div className="compare-layout">
      <article className="panel compare-card"><h2>Low trust</h2><p className="huge">{Math.round(comparison.low.metrics.trade_completion_rate * 100)}%</p></article>
      <article className="panel compare-card"><h2>High trust</h2><p className="huge">{Math.round(comparison.high.metrics.trade_completion_rate * 100)}%</p></article>
      <section className="panel scan-panel">
        <h2>Trust scan</h2>
        {scan.map((row) => <div className="scan-row" key={row.trust}><span>{row.trust.toFixed(2)}</span><i style={{ width: `${Math.round(row.metrics.trade_completion_rate * 100)}%` }} /><strong>{Math.round(row.metrics.trade_completion_rate * 100)}%</strong></div>)}
      </section>
    </div>
  );
}

function SavedView({ records }) {
  return <section className="panel">{records.map((record) => <article className="saved-card" key={record.id}><h2>{record.label}</h2><p>{record.summary.metrics.completed_trades} completed trades</p></article>)}</section>;
}

function describeEvent(event) {
  if (event.type === "proposal_created") return `${event.from_tribe} offered ${event.offered_quantity} ${event.offered_resource} to ${event.to_tribe} for ${event.requested_quantity} ${event.requested_resource}.`;
  if (event.type === "proposal_accepted") return `Accepted: ${event.reason}`;
  if (event.type === "proposal_rejected") return `Rejected: ${event.reason}`;
  if (event.type === "trade_settled") return "Trade settled.";
  return event.type.replaceAll("_", " ");
}
```

- [x] **Step 5: Create CSS for selected direction**

Create `src/ui/App.css` with a Lab Console visual system:

```css
:root {
  --ink: #17211c;
  --muted: #66736b;
  --paper: #f5f2e9;
  --panel: #fffaf0;
  --line: #c7bda4;
  --green: #1d7657;
  --red: #96392e;
  --blue: #226b8c;
}

* { box-sizing: border-box; }
body { margin: 0; color: var(--ink); background: var(--paper); font-family: "Avenir Next", "Segoe UI", Verdana, sans-serif; }
button, input { font: inherit; }
.app-shell { min-height: 100vh; display: grid; grid-template-columns: 340px 1fr; gap: 16px; padding: 16px; }
.control-rail, .panel, .metric { border: 1px solid var(--line); background: var(--panel); }
.control-rail { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.title-block span { color: var(--green); font-size: 12px; font-weight: 800; text-transform: uppercase; }
h1, h2, h3 { margin: 0; letter-spacing: 0; }
h1 { font-family: Georgia, "Times New Roman", serif; font-size: 34px; line-height: 0.95; }
.field { display: grid; gap: 6px; font-size: 13px; font-weight: 700; color: var(--muted); }
.field input { min-height: 38px; border: 1px solid var(--line); padding: 0 10px; background: white; color: var(--ink); }
.checks { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.checks label { border: 1px solid var(--line); background: white; padding: 9px; }
.primary, .secondary, .tabs button, .replay-controls button { min-height: 38px; border: 1px solid var(--line); display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
.primary { color: white; background: var(--ink); }
.secondary, .tabs button, .replay-controls button { color: var(--ink); background: white; }
.workspace { display: grid; gap: 14px; min-width: 0; }
.tabs { display: flex; gap: 8px; }
.tabs button.active { color: white; background: var(--ink); }
.run-grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 14px; }
.metrics { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 10px; }
.metric { padding: 14px; }
.metric strong, .huge { display: block; font-family: Georgia, "Times New Roman", serif; font-size: 36px; }
.metric span { color: var(--muted); font-size: 12px; font-weight: 800; text-transform: uppercase; }
.panel { padding: 14px; }
.tribe-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.tribe-card { border: 1px solid var(--line); background: white; padding: 10px; }
.resource-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.resource-list span { border: 1px solid var(--line); background: #fbf5e6; padding: 4px 7px; font-size: 12px; }
.replay-controls { display: grid; grid-template-columns: 70px 1fr 70px; gap: 8px; align-items: center; margin: 12px 0; }
.replay-controls strong { text-align: center; }
.event-line { margin: 7px 0; color: var(--muted); font-size: 13px; line-height: 1.35; }
.compare-layout { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.scan-panel { grid-column: 1 / -1; }
.scan-row { display: grid; grid-template-columns: 46px 1fr 48px; gap: 8px; align-items: center; margin: 8px 0; }
.scan-row i { display: block; height: 12px; background: var(--green); border: 1px solid var(--line); }
.saved-card { border: 1px solid var(--line); background: white; padding: 12px; margin-top: 10px; }
@media (max-width: 900px) {
  .app-shell, .run-grid, .compare-layout { grid-template-columns: 1fr; }
  .metrics, .tribe-grid { grid-template-columns: 1fr; }
}
```

- [x] **Step 6: Remove old static UI after React works**

Run React app first. If it loads, remove:

```bash
rm public/index.html public/app.js public/styles.css server.mjs
```

- [x] **Step 7: Verify**

Run:

```bash
npm test
npm start
```

Expected: tests pass and Vite prints a local URL.

## Task 5: Static QA Script

**Files:**
- Create: `scripts/smoke-http.mjs`
- Modify: `package.json`

- [x] **Step 1: Create HTTP smoke test**

Create `scripts/smoke-http.mjs`:

```js
const baseUrl = process.env.BASE_URL ?? "http://localhost:5173";
const paths = ["/", "/src/ui/main.jsx", "/src/index.js"];

for (const path of paths) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  console.log(`${path} ${response.status}`);
}
```

- [x] **Step 2: Verify**

With Vite running, run:

```bash
npm run qa:http
```

Expected:

```text
/ 200
/src/ui/main.jsx 200
/src/index.js 200
```

## Self-Review

Spec coverage:
- LongCat API: Task 1.
- `.env.example` and local `.env`: Task 1, files already created.
- Browser storage: Task 3.
- Trust-only parameter scan: Task 2.
- React migration: Task 4.
- Frontend design confirmation: Task 0.
- Simple, clear, orderly UI: Task 0 and Task 4.

Known constraints:
- This plan uses LongCat's OpenAI-compatible Chat Completions style endpoint.
- This plan does not run browser `/browse` until `bun` is available.
- This plan does not add backend storage or scan non-trust parameters.
