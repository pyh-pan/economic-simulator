# Agent-Based Economic Emergence Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 economic emergence engine: 15 heterogeneous individual agents, configurable resource constraints, neutral resource analysis, multi-seed experiments, and evidence-linked reports.

**Architecture:** Add a new `src/emergence/` engine beside the existing tribe/barter MVP. Keep the current app working while the new engine gains tests and API/UI integration. The new engine treats every resource uniformly; no resource is described to agents as special or as an intended exchange target.

**Tech Stack:** Node 22 ESM, `node:test`, `node:assert/strict`, existing React/Vite UI and local Node server.

---

## File Structure

- Create `src/emergence/profiles.js`: archetype presets, profile validation, deterministic individual profile generation.
- Create `src/emergence/world.js`: configurable resources, agents, inventories, needs, relationships, market signals, seeded RNG.
- Create `src/emergence/simulation.js`: turn loop, production, consumption checks, mixed matching/search, proposals, decisions, settlement, memory updates.
- Create `src/emergence/metrics.js`: macro metrics, resource-level exchange-bridge metrics, agent-level summaries.
- Create `src/emergence/reports.js`: evidence-linked finding generation from metrics and events.
- Create `src/emergence/index.js`: public exports for the new engine.
- Modify `src/index.js`: re-export the emergence API without removing legacy exports.
- Modify `server.mjs`: add `/api/emergence/runs` endpoint after engine tests pass.
- Modify `src/ui/App.jsx` later: add an Emergence view after API integration is stable.
- Modify legacy UI labels when touched: use neutral extra-resource language, not a named resource-as-target framing.
- Add tests under `test/emergence-*.test.js`.

## Task 1: Profile Presets And Deterministic Agent Generation

**Files:**
- Create: `src/emergence/profiles.js`
- Create: `test/emergence-profiles.test.js`
- Modify: `src/index.js`

- [ ] **Step 1: Write the failing test**

Create `test/emergence-profiles.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { ARCHETYPES, generateAgentProfiles, normalizeDistribution } from "../src/index.js";

test("archetypes expose bounded economic profile dimensions", () => {
  assert.deepEqual(Object.keys(ARCHETYPES).sort(), ["hoarder", "opportunist", "reciprocator", "steward", "trader"]);

  for (const profile of Object.values(ARCHETYPES)) {
    for (const key of ["time_horizon", "risk_tolerance", "trust_baseline", "reputation_sensitivity", "liquidity_awareness", "fairness_preference", "opportunity_seeking"]) {
      assert.equal(typeof profile[key], "number");
      assert.ok(profile[key] >= 0 && profile[key] <= 1, `${key} must be bounded`);
    }
  }
});

test("profile distributions normalize and generate deterministic agents", () => {
  const distribution = normalizeDistribution({ steward: 3, trader: 2, hoarder: 1 });
  assert.deepEqual(distribution, { steward: 0.5, trader: 1 / 3, hoarder: 1 / 6 });

  const first = generateAgentProfiles({ seed: "profiles-001", count: 6, distribution });
  const second = generateAgentProfiles({ seed: "profiles-001", count: 6, distribution });

  assert.deepEqual(second, first);
  assert.equal(first.length, 6);
  assert.equal(first.every((agent) => agent.id.startsWith("agent_")), true);
  assert.equal(first.every((agent) => agent.archetype && agent.profile), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/emergence-profiles.test.js
```

Expected: FAIL because `ARCHETYPES` is not exported.

- [ ] **Step 3: Implement profile module**

Create `src/emergence/profiles.js`:

```js
export const PROFILE_KEYS = [
  "time_horizon",
  "risk_tolerance",
  "trust_baseline",
  "reputation_sensitivity",
  "liquidity_awareness",
  "fairness_preference",
  "opportunity_seeking",
];

export const ARCHETYPES = {
  steward: {
    time_horizon: 0.9,
    risk_tolerance: 0.35,
    trust_baseline: 0.65,
    reputation_sensitivity: 0.9,
    liquidity_awareness: 0.45,
    fairness_preference: 0.7,
    opportunity_seeking: 0.15,
  },
  trader: {
    time_horizon: 0.65,
    risk_tolerance: 0.75,
    trust_baseline: 0.55,
    reputation_sensitivity: 0.55,
    liquidity_awareness: 0.85,
    fairness_preference: 0.45,
    opportunity_seeking: 0.45,
  },
  hoarder: {
    time_horizon: 0.55,
    risk_tolerance: 0.2,
    trust_baseline: 0.35,
    reputation_sensitivity: 0.65,
    liquidity_awareness: 0.25,
    fairness_preference: 0.55,
    opportunity_seeking: 0.2,
  },
  opportunist: {
    time_horizon: 0.2,
    risk_tolerance: 0.65,
    trust_baseline: 0.45,
    reputation_sensitivity: 0.25,
    liquidity_awareness: 0.55,
    fairness_preference: 0.2,
    opportunity_seeking: 0.9,
  },
  reciprocator: {
    time_horizon: 0.75,
    risk_tolerance: 0.45,
    trust_baseline: 0.75,
    reputation_sensitivity: 0.8,
    liquidity_awareness: 0.4,
    fairness_preference: 0.9,
    opportunity_seeking: 0.2,
  },
};

export function normalizeDistribution(distribution = { steward: 0.25, trader: 0.25, hoarder: 0.2, reciprocator: 0.2, opportunist: 0.1 }) {
  const entries = Object.entries(distribution).filter(([, value]) => Number(value) > 0);
  const total = entries.reduce((sum, [, value]) => sum + Number(value), 0);
  if (total <= 0) throw new Error("Profile distribution must have positive weight");
  return Object.fromEntries(entries.map(([key, value]) => [key, Number(value) / total]));
}

export function generateAgentProfiles({ seed = "default", count = 15, distribution } = {}) {
  const normalized = normalizeDistribution(distribution);
  const weighted = Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b));
  const rng = createRng(seed);

  return Array.from({ length: count }, (_, index) => {
    const archetype = pickWeighted(weighted, rng());
    return {
      id: `agent_${String(index + 1).padStart(2, "0")}`,
      archetype,
      profile: jitterProfile(ARCHETYPES[archetype], rng),
    };
  });
}

function pickWeighted(weighted, roll) {
  let cumulative = 0;
  for (const [key, weight] of weighted) {
    cumulative += weight;
    if (roll <= cumulative) return key;
  }
  return weighted.at(-1)[0];
}

function jitterProfile(profile, rng) {
  return Object.fromEntries(PROFILE_KEYS.map((key) => {
    const jitter = (rng() - 0.5) * 0.08;
    return [key, clamp(Number((profile[key] + jitter).toFixed(3)))];
  }));
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function createRng(seed) {
  let state = hashSeed(seed);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function hashSeed(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
```

Create `src/emergence/index.js`:

```js
export { ARCHETYPES, PROFILE_KEYS, generateAgentProfiles, normalizeDistribution } from "./profiles.js";
```

Modify `src/index.js` near the existing exports:

```js
export * from "./emergence/index.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/emergence-profiles.test.js
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/index.js src/emergence/index.js src/emergence/profiles.js test/emergence-profiles.test.js
git commit -m "feat: add heterogeneous agent profiles"
```

## Task 2: Individual-Agent World Builder

**Files:**
- Create: `src/emergence/world.js`
- Modify: `src/emergence/index.js`
- Create: `test/emergence-world.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/emergence-world.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { createEmergenceWorld, getEmergenceVisibleState } from "../src/index.js";

test("world creates 15 individual agents across five production types", () => {
  const world = createEmergenceWorld({ seed: "world-001" });

  assert.equal(world.agents.length, 15);
  assert.deepEqual([...new Set(world.agents.map((agent) => agent.production_type))].sort(), ["animals", "fish", "fruit", "water", "wood"]);
  assert.equal(world.agents.every((agent) => agent.inventory && agent.needs && agent.profile && agent.relationships), true);
  assert.equal(world.config.resources.includes("shells"), false);
});

test("extra resources are ordinary configurable resources", () => {
  const world = createEmergenceWorld({ seed: "world-extra", extraResources: ["beads"] });

  assert.equal(world.config.resources.includes("beads"), true);
  assert.equal(world.config.resources.includes("shells"), false);
  assert.equal(world.agents.every((agent) => Object.hasOwn(agent.inventory, "beads")), true);
  assert.equal(world.agents.every((agent) => Object.hasOwn(agent.needs, "beads")), true);
});

test("visible state excludes global world and hidden experiment targets", () => {
  const world = createEmergenceWorld({ seed: "visible", extraResources: ["beads"] });
  const visible = getEmergenceVisibleState(world, "agent_01");

  assert.equal(visible.agentId, "agent_01");
  assert.equal(visible.world, undefined);
  assert.equal(visible.agents, undefined);
  assert.equal(visible.hiddenGoal, undefined);
  assert.deepEqual(Object.keys(visible.marketSignals.resource_acceptance_counts).sort(), world.config.resources.toSorted());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/emergence-world.test.js
```

Expected: FAIL because `createEmergenceWorld` is not exported.

- [ ] **Step 3: Implement world builder**

Create `src/emergence/world.js`:

```js
import { generateAgentProfiles } from "./profiles.js";

export const BASE_RESOURCES = ["fish", "water", "fruit", "animals", "wood"];
export const DEFAULT_PRODUCTION_TYPES = ["fish", "water", "fruit", "animals", "wood"];

export function createEmergenceWorld({
  seed = "default",
  turnLimit = 60,
  agentCount = 15,
  extraResources = [],
  productionTypes = DEFAULT_PRODUCTION_TYPES,
  initialDominantInventory = 8,
  initialOtherInventory = 2,
  initialExtraInventory = 1,
  baseNeed = 3,
  profileDistribution,
  randomEncounterRate = 0.45,
  searchBudget = 2,
  marketSignalWindow = 8,
} = {}) {
  const resources = [...BASE_RESOURCES, ...extraResources.filter((resource) => !BASE_RESOURCES.includes(resource))];
  const profiles = generateAgentProfiles({ seed: `${seed}:profiles`, count: agentCount, distribution: profileDistribution });
  const rng = createRng(seed);

  const agents = profiles.map((profileEntry, index) => {
    const productionType = productionTypes[index % productionTypes.length];
    const inventory = Object.fromEntries(resources.map((resource) => {
      if (resource === productionType) return [resource, initialDominantInventory];
      if (extraResources.includes(resource)) return [resource, initialExtraInventory];
      return [resource, initialOtherInventory];
    }));
    const needs = Object.fromEntries(resources.map((resource) => [resource, BASE_RESOURCES.includes(resource) && resource !== productionType ? baseNeed : 0]));
    const relationships = Object.fromEntries(profiles.filter((other) => other.id !== profileEntry.id).map((other) => [other.id, 0]));

    return {
      id: profileEntry.id,
      archetype: profileEntry.archetype,
      production_type: productionType,
      inventory,
      needs,
      profile: profileEntry.profile,
      memory: {
        transactions: [],
        acceptances: [],
      },
      relationships,
      unmet_need: 0,
      search_cost: 0,
    };
  });

  return {
    config: {
      seed,
      turn_limit: turnLimit,
      resources,
      extra_resources: [...extraResources],
      production_types: [...productionTypes],
      random_encounter_rate: randomEncounterRate,
      search_budget: searchBudget,
      market_signal_window: marketSignalWindow,
    },
    turn: 0,
    agents,
    proposals: {},
    events: [],
    marketSignals: emptyMarketSignals(resources),
    rng,
  };
}

export function getEmergenceVisibleState(world, agentId) {
  const agent = world.agents.find((candidate) => candidate.id === agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  const proposals = Object.values(world.proposals)
    .filter((proposal) => proposal.to_agent === agentId || proposal.from_agent === agentId)
    .map((proposal) => ({ ...proposal }));

  return {
    agentId,
    productionType: agent.production_type,
    turn: world.turn,
    inventory: { ...agent.inventory },
    needs: { ...agent.needs },
    profile: { ...agent.profile },
    relationships: { ...agent.relationships },
    memory: {
      transactions: agent.memory.transactions.slice(-10).map((event) => ({ ...event })),
      acceptances: agent.memory.acceptances.slice(-10).map((event) => ({ ...event })),
    },
    proposals,
    marketSignals: cloneMarketSignals(world.marketSignals),
  };
}

export function emptyMarketSignals(resources) {
  return {
    resource_acceptance_counts: Object.fromEntries(resources.map((resource) => [resource, 0])),
    recent_completion_rate: 0,
    recent_search_difficulty: 0,
  };
}

export function createRng(seed) {
  let state = hashSeed(seed);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function cloneMarketSignals(signals) {
  return {
    resource_acceptance_counts: { ...signals.resource_acceptance_counts },
    recent_completion_rate: signals.recent_completion_rate,
    recent_search_difficulty: signals.recent_search_difficulty,
  };
}

function hashSeed(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
```

Update `src/emergence/index.js`:

```js
export { ARCHETYPES, PROFILE_KEYS, generateAgentProfiles, normalizeDistribution } from "./profiles.js";
export { BASE_RESOURCES, DEFAULT_PRODUCTION_TYPES, createEmergenceWorld, getEmergenceVisibleState } from "./world.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/emergence-world.test.js test/emergence-profiles.test.js
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/emergence/index.js src/emergence/world.js test/emergence-world.test.js
git commit -m "feat: add individual-agent emergence world"
```

## Task 3: Turn Simulation And Neutral Agent Decisions

**Files:**
- Create: `src/emergence/simulation.js`
- Modify: `src/emergence/index.js`
- Create: `test/emergence-simulation.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/emergence-simulation.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { runEmergenceSimulation } from "../src/index.js";

test("emergence simulation is deterministic and conserves resources", () => {
  const options = { seed: "sim-001", turnLimit: 12, extraResources: ["beads"] };
  const first = runEmergenceSimulation(options);
  const second = runEmergenceSimulation(options);

  assert.deepEqual(second.events, first.events);
  assert.deepEqual(second.finalTotals, first.finalTotals);
  assert.deepEqual(first.invariants.violations, []);
});

test("simulation uses individual agents rather than tribes", () => {
  const run = runEmergenceSimulation({ seed: "sim-agents", turnLimit: 5 });

  assert.equal(run.world.agents.length, 15);
  assert.equal(run.world.tribes, undefined);
  assert.equal(run.events.some((event) => event.from_agent && event.to_agent), true);
});

test("resources are analyzed uniformly with no named-resource privilege", () => {
  const run = runEmergenceSimulation({ seed: "sim-neutral", turnLimit: 8, extraResources: ["beads"] });
  const proposalEvents = run.events.filter((event) => event.type === "proposal_created");

  assert.equal(proposalEvents.every((event) => event.offered_resource !== "shells" && event.requested_resource !== "shells"), true);
  assert.equal(run.world.config.extra_resources.includes("beads"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/emergence-simulation.test.js
```

Expected: FAIL because `runEmergenceSimulation` is not exported.

- [ ] **Step 3: Implement minimal deterministic simulation**

Create `src/emergence/simulation.js`:

```js
import { createEmergenceWorld } from "./world.js";

export function runEmergenceSimulation(options = {}) {
  const world = createEmergenceWorld(options);
  const initialTotals = resourceTotals(world);

  for (let turn = 1; turn <= world.config.turn_limit; turn += 1) {
    world.turn = turn;
    appendEvent(world, { type: "turn_started", turn });
    produce(world);
    checkNeeds(world);
    const proposals = createTurnProposals(world);
    for (const proposal of proposals) {
      resolveProposal(world, proposal);
    }
    updateMarketSignals(world);
  }

  appendEvent(world, { type: "run_finished", turn: world.turn });
  const finalTotals = resourceTotals(world);
  return {
    events: world.events.map((event) => ({ ...event })),
    initialTotals,
    finalTotals,
    invariants: checkInvariants(world, initialTotals, finalTotals),
    world: sanitizeWorld(world),
  };
}

function produce(world) {
  for (const agent of world.agents) {
    agent.inventory[agent.production_type] += 1;
    appendEvent(world, { type: "agent_produced", turn: world.turn, agent_id: agent.id, resource: agent.production_type, quantity: 1 });
  }
}

function checkNeeds(world) {
  for (const agent of world.agents) {
    let unmet = 0;
    for (const [resource, target] of Object.entries(agent.needs)) {
      if (target <= 0) continue;
      const consumed = Math.min(agent.inventory[resource], 1);
      agent.inventory[resource] -= consumed;
      if (consumed < 1) unmet += 1;
    }
    agent.unmet_need += unmet;
    appendEvent(world, { type: "needs_checked", turn: world.turn, agent_id: agent.id, unmet });
  }
}

function createTurnProposals(world) {
  const proposals = [];
  const attempts = Math.max(1, Math.round(world.agents.length * world.config.random_encounter_rate));
  for (let index = 0; index < attempts; index += 1) {
    const from = world.agents[Math.floor(world.rng() * world.agents.length)];
    const to = pickCounterparty(world, from);
    if (!to) continue;
    const proposal = buildProposal(world, from, to);
    if (!proposal) continue;
    world.proposals[proposal.proposal_id] = proposal;
    proposals.push(proposal);
    appendEvent(world, {
      type: "proposal_created",
      turn: world.turn,
      proposal_id: proposal.proposal_id,
      from_agent: proposal.from_agent,
      to_agent: proposal.to_agent,
      offered_resource: proposal.offered_resource,
      offered_quantity: proposal.offered_quantity,
      requested_resource: proposal.requested_resource,
      requested_quantity: proposal.requested_quantity,
    });
  }
  return proposals;
}

function pickCounterparty(world, from) {
  const candidates = world.agents.filter((agent) => agent.id !== from.id);
  return candidates[Math.floor(world.rng() * candidates.length)];
}

function buildProposal(world, from, to) {
  const requested = mostNeededResource(from);
  const offered = mostAbundantTradableResource(from, requested);
  if (!requested || !offered || (to.inventory[requested] ?? 0) <= 0 || (from.inventory[offered] ?? 0) <= 0) return null;
  return {
    proposal_id: `proposal-${world.turn}-${Object.keys(world.proposals).length + 1}`,
    turn: world.turn,
    from_agent: from.id,
    to_agent: to.id,
    offered_resource: offered,
    offered_quantity: 1,
    requested_resource: requested,
    requested_quantity: 1,
    status: "pending",
    resolution_reason: "",
  };
}

function mostNeededResource(agent) {
  return Object.entries(agent.needs)
    .filter(([, target]) => target > 0)
    .sort(([aResource, aTarget], [bResource, bTarget]) => (bTarget - (agent.inventory[bResource] ?? 0)) - (aTarget - (agent.inventory[aResource] ?? 0)))
    .at(0)?.[0];
}

function mostAbundantTradableResource(agent, excludeResource) {
  return Object.entries(agent.inventory)
    .filter(([resource, quantity]) => resource !== excludeResource && quantity > 0)
    .sort(([, a], [, b]) => b - a)
    .at(0)?.[0];
}

function resolveProposal(world, proposal) {
  const from = world.agents.find((agent) => agent.id === proposal.from_agent);
  const to = world.agents.find((agent) => agent.id === proposal.to_agent);
  const decision = decideTrade(to, from, proposal);
  if (decision.type === "accept_trade" && canSettle(from, to, proposal)) {
    settleTrade(world, from, to, proposal, decision.reason);
    return;
  }
  proposal.status = "rejected";
  proposal.resolution_reason = decision.reason;
  updateRelationship(to, from.id, -1);
  appendEvent(world, { type: "proposal_rejected", turn: world.turn, proposal_id: proposal.proposal_id, from_agent: proposal.from_agent, to_agent: proposal.to_agent, reason: decision.reason });
  remember(from, proposal, "rejected");
  remember(to, proposal, "rejected");
}

function decideTrade(receiver, proposer, proposal) {
  const needsOffered = (receiver.needs[proposal.offered_resource] ?? 0) > (receiver.inventory[proposal.offered_resource] ?? 0);
  const hasRequested = (receiver.inventory[proposal.requested_resource] ?? 0) >= proposal.requested_quantity;
  const relationship = receiver.relationships[proposer.id] ?? 0;
  const trust = receiver.profile.trust_baseline + relationship * receiver.profile.reputation_sensitivity * 0.1;
  const acceptsExploration = receiver.profile.risk_tolerance * 0.35 + receiver.profile.liquidity_awareness * 0.35;
  const accepted = hasRequested && (needsOffered || trust + acceptsExploration >= 0.7);
  return accepted
    ? { type: "accept_trade", proposal_id: proposal.proposal_id, reason: "accepted under local needs and relationship assessment" }
    : { type: "reject_trade", proposal_id: proposal.proposal_id, reason: "rejected under local needs and relationship assessment" };
}

function canSettle(from, to, proposal) {
  return from.inventory[proposal.offered_resource] >= proposal.offered_quantity && to.inventory[proposal.requested_resource] >= proposal.requested_quantity;
}

function settleTrade(world, from, to, proposal, reason) {
  from.inventory[proposal.offered_resource] -= proposal.offered_quantity;
  to.inventory[proposal.offered_resource] += proposal.offered_quantity;
  to.inventory[proposal.requested_resource] -= proposal.requested_quantity;
  from.inventory[proposal.requested_resource] += proposal.requested_quantity;
  proposal.status = "accepted";
  proposal.resolution_reason = reason;
  updateRelationship(from, to.id, 1);
  updateRelationship(to, from.id, 1);
  appendEvent(world, { type: "proposal_accepted", turn: world.turn, proposal_id: proposal.proposal_id, from_agent: proposal.from_agent, to_agent: proposal.to_agent, reason });
  appendEvent(world, { type: "trade_settled", turn: world.turn, proposal_id: proposal.proposal_id, from_agent: proposal.from_agent, to_agent: proposal.to_agent });
  remember(from, proposal, "accepted");
  remember(to, proposal, "accepted");
}

function updateRelationship(agent, otherId, delta) {
  agent.relationships[otherId] = (agent.relationships[otherId] ?? 0) + delta;
}

function remember(agent, proposal, outcome) {
  agent.memory.transactions.push({ turn: proposal.turn, proposal_id: proposal.proposal_id, counterparty: agent.id === proposal.from_agent ? proposal.to_agent : proposal.from_agent, outcome });
  agent.memory.acceptances.push({ turn: proposal.turn, resource: proposal.offered_resource, outcome });
}

function updateMarketSignals(world) {
  const windowStart = Math.max(0, world.turn - world.config.market_signal_window + 1);
  const recent = world.events.filter((event) => (event.turn ?? 0) >= windowStart);
  const accepted = recent.filter((event) => event.type === "proposal_accepted");
  const created = recent.filter((event) => event.type === "proposal_created");
  const counts = Object.fromEntries(world.config.resources.map((resource) => [resource, 0]));
  for (const event of accepted) {
    const proposal = world.proposals[event.proposal_id];
    if (proposal) counts[proposal.offered_resource] += 1;
  }
  world.marketSignals = {
    resource_acceptance_counts: counts,
    recent_completion_rate: created.length === 0 ? 0 : accepted.length / created.length,
    recent_search_difficulty: Math.max(0, created.length - accepted.length),
  };
}

function appendEvent(world, event) {
  world.events.push(JSON.parse(JSON.stringify(event)));
}

function resourceTotals(world) {
  const totals = Object.fromEntries(world.config.resources.map((resource) => [resource, 0]));
  for (const agent of world.agents) {
    for (const resource of world.config.resources) totals[resource] += agent.inventory[resource] ?? 0;
  }
  return totals;
}

function checkInvariants(world, initialTotals, finalTotals) {
  const violations = [];
  for (const agent of world.agents) {
    for (const [resource, quantity] of Object.entries(agent.inventory)) {
      if (quantity < 0) violations.push(`${agent.id}.${resource} inventory below zero`);
    }
  }
  for (const resource of world.config.resources) {
    const produced = world.events.filter((event) => event.type === "agent_produced" && event.resource === resource).reduce((sum, event) => sum + event.quantity, 0);
    const consumed = world.events.filter((event) => event.type === "needs_checked").length;
    if (finalTotals[resource] > initialTotals[resource] + produced) violations.push(`${resource} total exceeds possible production`);
  }
  return { violations };
}

function sanitizeWorld(world) {
  return {
    config: { ...world.config, resources: [...world.config.resources], extra_resources: [...world.config.extra_resources] },
    turn: world.turn,
    agents: world.agents.map((agent) => ({
      id: agent.id,
      archetype: agent.archetype,
      production_type: agent.production_type,
      inventory: { ...agent.inventory },
      needs: { ...agent.needs },
      profile: { ...agent.profile },
      relationships: { ...agent.relationships },
      unmet_need: agent.unmet_need,
      search_cost: agent.search_cost,
    })),
  };
}
```

Update `src/emergence/index.js`:

```js
export { ARCHETYPES, PROFILE_KEYS, generateAgentProfiles, normalizeDistribution } from "./profiles.js";
export { BASE_RESOURCES, DEFAULT_PRODUCTION_TYPES, createEmergenceWorld, getEmergenceVisibleState } from "./world.js";
export { runEmergenceSimulation } from "./simulation.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/emergence-simulation.test.js test/emergence-world.test.js test/emergence-profiles.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/emergence/index.js src/emergence/simulation.js test/emergence-simulation.test.js
git commit -m "feat: add emergence turn simulation"
```

## Task 4: Macro And Resource-Level Metrics

**Files:**
- Create: `src/emergence/metrics.js`
- Modify: `src/emergence/simulation.js`
- Modify: `src/emergence/index.js`
- Create: `test/emergence-metrics.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/emergence-metrics.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { buildEmergenceMetrics, runEmergenceSimulation } from "../src/index.js";

test("metrics include macro, resource, and agent summaries", () => {
  const run = runEmergenceSimulation({ seed: "metrics-001", turnLimit: 20, extraResources: ["beads"] });
  const metrics = buildEmergenceMetrics(run);

  assert.equal(typeof metrics.macro.trade_completion_rate, "number");
  assert.equal(typeof metrics.macro.unmet_need_rate, "number");
  assert.equal(typeof metrics.macro.network_density, "number");
  assert.equal(Object.keys(metrics.resources).sort().join(","), run.world.config.resources.toSorted().join(","));
  assert.equal(metrics.agents.length, 15);
});

test("resource exchange-bridge metrics are uniform for every resource", () => {
  const run = runEmergenceSimulation({ seed: "metrics-uniform", turnLimit: 10, extraResources: ["beads"] });
  const metrics = buildEmergenceMetrics(run);
  const keys = Object.keys(metrics.resources.fish).sort();

  for (const resourceMetrics of Object.values(metrics.resources)) {
    assert.deepEqual(Object.keys(resourceMetrics).sort(), keys);
  }

  assert.equal(Object.hasOwn(metrics.resources, "beads"), true);
  assert.equal(Object.hasOwn(metrics.resources, "shells"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/emergence-metrics.test.js
```

Expected: FAIL because `buildEmergenceMetrics` is not exported.

- [ ] **Step 3: Implement metrics**

Create `src/emergence/metrics.js`:

```js
export function buildEmergenceMetrics(run) {
  const events = run.events;
  const resources = run.world.config.resources;
  const agents = run.world.agents;
  const proposalEvents = events.filter((event) => event.type === "proposal_created");
  const acceptedEvents = events.filter((event) => event.type === "proposal_accepted");
  const settledEvents = events.filter((event) => event.type === "trade_settled");

  return {
    macro: {
      trade_completion_rate: rate(settledEvents.length, proposalEvents.length),
      unmet_need_rate: rate(agents.reduce((sum, agent) => sum + agent.unmet_need, 0), agents.length * Math.max(1, run.world.turn)),
      average_search_cost: rate(agents.reduce((sum, agent) => sum + agent.search_cost, 0), agents.length),
      network_density: networkDensity(settledEvents, agents.length),
      network_centralization: networkCentralization(settledEvents, agents.map((agent) => agent.id)),
      resource_inequality: averageResourceInequality(agents, resources),
      welfare_proxy: 1 - rate(agents.reduce((sum, agent) => sum + agent.unmet_need, 0), agents.length * Math.max(1, run.world.turn)),
    },
    resources: Object.fromEntries(resources.map((resource) => [resource, resourceMetrics(resource, events, run.world)])),
    agents: agents.map((agent) => agentMetrics(agent, events)),
  };
}

function resourceMetrics(resource, events, world) {
  const proposals = new Map(events.filter((event) => event.type === "proposal_created").map((event) => [event.proposal_id, event]));
  const accepted = events.filter((event) => event.type === "proposal_accepted").map((event) => proposals.get(event.proposal_id)).filter(Boolean);
  const acceptedForResource = accepted.filter((proposal) => proposal.offered_resource === resource || proposal.requested_resource === resource);
  const acceptedAgents = new Set(acceptedForResource.flatMap((proposal) => [proposal.from_agent, proposal.to_agent]));
  const contexts = new Set(acceptedForResource.flatMap((proposal) => {
    const from = world.agents.find((agent) => agent.id === proposal.from_agent);
    const to = world.agents.find((agent) => agent.id === proposal.to_agent);
    return [from?.production_type, to?.production_type].filter(Boolean);
  }));
  const heldByNonConsumers = world.agents.filter((agent) => (agent.needs[resource] ?? 0) === 0 && (agent.inventory[resource] ?? 0) > 0).length;

  return {
    acceptance_breadth: acceptedAgents.size,
    acceptance_context_diversity: contexts.size,
    pass_through_rate: passThroughRate(resource, accepted),
    non_consumption_holding: heldByNonConsumers,
    trade_bridge_count: acceptedForResource.filter((proposal) => proposal.offered_resource !== proposal.requested_resource).length,
    search_cost_reduction_after_acceptance: 0,
    repeat_acceptance_stability: repeatAcceptanceStability(resource, accepted),
  };
}

function agentMetrics(agent, events) {
  const settled = events.filter((event) => event.type === "trade_settled" && (event.from_agent === agent.id || event.to_agent === agent.id));
  const rejected = events.filter((event) => event.type === "proposal_rejected" && (event.from_agent === agent.id || event.to_agent === agent.id));
  return {
    agent_id: agent.id,
    archetype: agent.archetype,
    production_type: agent.production_type,
    unmet_need: agent.unmet_need,
    trade_success_count: settled.length,
    rejection_count: rejected.length,
    centrality: settled.length,
  };
}

function passThroughRate(resource, acceptedProposals) {
  const received = acceptedProposals.filter((proposal) => proposal.offered_resource === resource || proposal.requested_resource === resource).length;
  if (received === 0) return 0;
  return rate(Math.max(0, received - 1), received);
}

function repeatAcceptanceStability(resource, acceptedProposals) {
  const turns = new Set(acceptedProposals.filter((proposal) => proposal.offered_resource === resource || proposal.requested_resource === resource).map((proposal) => proposal.turn));
  return turns.size;
}

function networkDensity(settledEvents, agentCount) {
  const edges = new Set(settledEvents.map((event) => `${event.from_agent}->${event.to_agent}`));
  return rate(edges.size, agentCount * Math.max(1, agentCount - 1));
}

function networkCentralization(settledEvents, agentIds) {
  const counts = Object.fromEntries(agentIds.map((id) => [id, 0]));
  for (const event of settledEvents) {
    counts[event.from_agent] += 1;
    counts[event.to_agent] += 1;
  }
  return Math.max(0, ...Object.values(counts));
}

function averageResourceInequality(agents, resources) {
  const values = resources.map((resource) => {
    const quantities = agents.map((agent) => agent.inventory[resource] ?? 0);
    const max = Math.max(...quantities);
    const min = Math.min(...quantities);
    return max - min;
  });
  return rate(values.reduce((sum, value) => sum + value, 0), values.length);
}

function rate(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}
```

Update `src/emergence/simulation.js` to import and include metrics:

```js
import { buildEmergenceMetrics } from "./metrics.js";
```

Then in the returned object:

```js
const result = {
  events: world.events.map((event) => ({ ...event })),
  initialTotals,
  finalTotals,
  invariants: checkInvariants(world, initialTotals, finalTotals),
  world: sanitizeWorld(world),
};
return { ...result, metrics: buildEmergenceMetrics(result) };
```

Update `src/emergence/index.js`:

```js
export { buildEmergenceMetrics } from "./metrics.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/emergence-metrics.test.js test/emergence-simulation.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/emergence/index.js src/emergence/metrics.js src/emergence/simulation.js test/emergence-metrics.test.js
git commit -m "feat: add emergence metrics"
```

## Task 5: Multi-Seed Experiments And Evidence Reports

**Files:**
- Create: `src/emergence/reports.js`
- Modify: `src/emergence/index.js`
- Create: `test/emergence-reports.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/emergence-reports.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { buildEmergenceReport, runEmergenceExperimentSet } from "../src/index.js";

test("experiment set runs multiple deterministic seeds", () => {
  const first = runEmergenceExperimentSet({ seeds: ["a", "b"], turnLimit: 8, extraResources: ["beads"] });
  const second = runEmergenceExperimentSet({ seeds: ["a", "b"], turnLimit: 8, extraResources: ["beads"] });

  assert.equal(first.runs.length, 2);
  assert.deepEqual(second.summary, first.summary);
});

test("report uses evidence-linked findings and neutral resource labels", () => {
  const experiment = runEmergenceExperimentSet({ seeds: ["report-a", "report-b"], turnLimit: 10, extraResources: ["beads"] });
  const report = buildEmergenceReport(experiment);

  assert.equal(Array.isArray(report.findings), true);
  assert.equal(report.findings.every((finding) => finding.evidence && finding.confidence), true);
  assert.equal(JSON.stringify(report).includes("money"), false);
  assert.equal(JSON.stringify(report).includes("currency"), false);
  assert.equal(JSON.stringify(report).includes("medium of exchange"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/emergence-reports.test.js
```

Expected: FAIL because `runEmergenceExperimentSet` is not exported.

- [ ] **Step 3: Implement experiment and report helpers**

Create `src/emergence/reports.js`:

```js
import { runEmergenceSimulation } from "./simulation.js";

export function runEmergenceExperimentSet({ seeds = ["seed-1", "seed-2", "seed-3"], ...options } = {}) {
  const runs = seeds.map((seed) => runEmergenceSimulation({ ...options, seed }));
  return {
    seeds: [...seeds],
    runs,
    summary: summarizeRuns(runs),
  };
}

export function buildEmergenceReport(experiment) {
  const findings = [];
  const resourceNames = Object.keys(experiment.summary.resources);
  for (const resource of resourceNames) {
    const summary = experiment.summary.resources[resource];
    if (summary.average_acceptance_breadth > 0) {
      findings.push({
        title: `${resource} showed exchange-bridge behavior`,
        resource,
        confidence: confidenceFor(summary.seed_presence_rate),
        evidence: {
          average_acceptance_breadth: summary.average_acceptance_breadth,
          average_pass_through_rate: summary.average_pass_through_rate,
          seed_presence_rate: summary.seed_presence_rate,
        },
        linked_events: linkedEventsForResource(experiment.runs, resource).slice(0, 6),
        alternative_explanations: [
          "profile distribution may have increased exploration",
          "resource scarcity may have increased substitute acceptance",
        ],
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      title: "No strong exchange-bridge pattern appeared",
      confidence: "high",
      evidence: { runs: experiment.runs.length },
      linked_events: [],
      alternative_explanations: ["short turn limit may have limited repeated interactions"],
    });
  }

  return {
    summary: experiment.summary,
    findings,
  };
}

function summarizeRuns(runs) {
  const resources = Object.fromEntries(runs[0].world.config.resources.map((resource) => [resource, {
    average_acceptance_breadth: average(runs.map((run) => run.metrics.resources[resource].acceptance_breadth)),
    average_pass_through_rate: average(runs.map((run) => run.metrics.resources[resource].pass_through_rate)),
    seed_presence_rate: average(runs.map((run) => run.metrics.resources[resource].acceptance_breadth > 0 ? 1 : 0)),
  }]));

  return {
    run_count: runs.length,
    average_trade_completion_rate: average(runs.map((run) => run.metrics.macro.trade_completion_rate)),
    average_unmet_need_rate: average(runs.map((run) => run.metrics.macro.unmet_need_rate)),
    resources,
  };
}

function linkedEventsForResource(runs, resource) {
  return runs.flatMap((run) => {
    const proposals = new Map(run.events.filter((event) => event.type === "proposal_created").map((event) => [event.proposal_id, event]));
    return run.events
      .filter((event) => event.type === "proposal_accepted")
      .map((event) => proposals.get(event.proposal_id))
      .filter((proposal) => proposal && (proposal.offered_resource === resource || proposal.requested_resource === resource))
      .map((proposal) => ({ turn: proposal.turn, proposal_id: proposal.proposal_id, from_agent: proposal.from_agent, to_agent: proposal.to_agent }));
  });
}

function confidenceFor(seedPresenceRate) {
  if (seedPresenceRate >= 0.7) return "high";
  if (seedPresenceRate >= 0.35) return "medium";
  return "low";
}

function average(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
```

Update `src/emergence/index.js`:

```js
export { buildEmergenceReport, runEmergenceExperimentSet } from "./reports.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/emergence-reports.test.js test/emergence-metrics.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/emergence/index.js src/emergence/reports.js test/emergence-reports.test.js
git commit -m "feat: add emergence experiment reports"
```

## Task 6: API Endpoint For Emergence Runs

**Files:**
- Modify: `server.mjs`
- Create: `test/emergence-api.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/emergence-api.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { createApiApp } from "../server.mjs";

test("emergence API runs a neutral multi-seed experiment", async () => {
  const app = createApiApp({ useVite: false });
  const server = await app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const result = await postJson(`${baseUrl}/api/emergence/runs`, {
      seeds: ["api-a", "api-b"],
      turnLimit: 6,
      extraResources: ["beads"],
    });

    assert.equal(result.runs.length, 2);
    assert.equal(result.report.findings.every((finding) => finding.evidence), true);
    assert.equal(JSON.stringify(result).includes("money"), false);
    assert.equal(JSON.stringify(result).includes("currency"), false);
  } finally {
    await app.close();
  }
});

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) assert.fail(await response.text());
  return response.json();
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- test/emergence-api.test.js
```

Expected: FAIL with 404 or missing endpoint.

- [ ] **Step 3: Add endpoint**

Modify `server.mjs` imports:

```js
import { advanceSimulationTurn, buildEmergenceReport, createLongCatAgent, createSimulationSession, getSimulationSnapshot, runEmergenceExperimentSet } from "./src/index.js";
```

Inside the request handler before the legacy `/api/simulations` route:

```js
if (request.url === "/api/emergence/runs" && request.method === "POST") {
  const body = await readJson(request);
  const experiment = runEmergenceExperimentSet({
    seeds: Array.isArray(body.seeds) && body.seeds.length > 0 ? body.seeds.map(String) : ["seed-1", "seed-2", "seed-3"],
    turnLimit: Number(body.turnLimit ?? 30),
    extraResources: Array.isArray(body.extraResources) ? body.extraResources.map(String) : [],
    profileDistribution: body.profileDistribution,
    randomEncounterRate: Number(body.randomEncounterRate ?? 0.45),
    searchBudget: Number(body.searchBudget ?? 2),
    marketSignalWindow: Number(body.marketSignalWindow ?? 8),
  });
  return sendJson(response, 200, { ...experiment, report: buildEmergenceReport(experiment) });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- test/emergence-api.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server.mjs test/emergence-api.test.js
git commit -m "feat: add emergence experiment API"
```

## Task 7: Minimal UI Entry For Emergence Experiments

**Files:**
- Modify: `src/ui/App.jsx`
- Modify: `src/ui/App.css`
- Modify: `scripts/smoke-browser.mjs`

- [ ] **Step 1: Add browser smoke expectation first**

Modify `scripts/smoke-browser.mjs` after the existing result object fields:

```js
hasEmergence: document.body.innerText.includes("Emergence"),
```

Then update the failure condition:

```js
if (!result.hasShell || !result.hasMetrics || !result.hasTribes || !result.hasProposal || !result.hasDecision || !result.hasEmergence || result.rootChildren < 1) {
  throw new Error(`Browser smoke failed: ${JSON.stringify(result)}`);
}
```

- [ ] **Step 2: Run smoke to verify it fails**

Run the dev server in one terminal:

```bash
npm run dev
```

Then run:

```bash
npm run qa:browser
```

Expected: FAIL because the UI has no Emergence view.

- [ ] **Step 3: Add minimal Emergence tab**

In `src/ui/App.jsx`, add state:

```js
const [emergenceResult, setEmergenceResult] = useState(null);
const [enableExtraResource, setEnableExtraResource] = useState(false);
```

If the legacy UI still has `enableShells`, rename that state and checkbox to `enableExtraResource`. The checkbox label should be `Extra resource`, not a named resource. Legacy simulation calls can map it internally for backwards compatibility, but no visible UI label should single out one resource.

Add a runner:

```js
const runEmergence = async () => {
  setLoading(true);
  setError("");
  try {
    const data = await postJson("/api/emergence/runs", {
      seeds: [seed, `${seed}-b`, `${seed}-c`],
      turnLimit,
      extraResources: enableExtraResource ? ["beads"] : [],
    });
    setEmergenceResult(data);
    setView("emergence");
  } catch (requestError) {
    setError(requestError.message);
  } finally {
    setLoading(false);
  }
};
```

Add a sidebar button near `Run`:

```jsx
<button className="secondary" onClick={runEmergence} disabled={loading}><Icon name="compare" /> Run emergence</button>
```

Add tab:

```jsx
<button className={view === "emergence" ? "active" : ""} onClick={() => setView("emergence")}><Icon name="activity" /> Emergence</button>
```

Add view:

```jsx
{view === "emergence" && <EmergenceView result={emergenceResult} />}
```

Add component:

```jsx
function EmergenceView({ result }) {
  if (!result) {
    return (
      <section className="panel placeholder-panel">
        <h2>Emergence</h2>
        <p>Run a multi-seed experiment to compare macro outcomes, resource-level exchange-bridge signals, and evidence-linked findings.</p>
      </section>
    );
  }

  return (
    <div className="compare-layout">
      <article className="panel compare-card">
        <h2>Runs</h2>
        <p className="huge">{result.runs.length}</p>
      </article>
      <article className="panel compare-card">
        <h2>Completion</h2>
        <p className="huge">{Math.round(result.summary.average_trade_completion_rate * 100)}%</p>
      </article>
      <section className="panel scan-panel">
        <h2>Findings</h2>
        {result.report.findings.map((finding, index) => (
          <article className="saved-card" key={`${finding.title}-${index}`}>
            <h2>{finding.title}</h2>
            <p>Confidence: {finding.confidence}</p>
            <p>{Object.entries(finding.evidence).map(([key, value]) => `${key}: ${typeof value === "number" ? value.toFixed(2) : value}`).join(" · ")}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run browser smoke to verify it passes**

Run:

```bash
npm run qa:browser
```

Expected: PASS and screenshot generated.

- [ ] **Step 5: Commit**

```bash
git add src/ui/App.jsx src/ui/App.css scripts/smoke-browser.mjs
git commit -m "feat: add emergence experiment view"
```

## Final Verification

- [ ] Run all tests:

```bash
npm test
```

Expected: all tests pass.

- [ ] Build:

```bash
npm run build
```

Expected: Vite build succeeds.

- [ ] API smoke:

```bash
npm run qa:http
```

Expected: HTTP smoke passed.

- [ ] Browser smoke:

```bash
npm run qa:browser
```

Expected: Browser smoke passed.

- [ ] Push:

```bash
git push
```

Expected: `main` pushed to `origin/main`.

## Self-Review Checklist

- Spec coverage:
  - individual agents: Tasks 1-3,
  - configurable resources: Task 2,
  - objective economic constraints: Tasks 2-3,
  - heterogeneous profiles: Task 1,
  - local information and market signals: Task 2,
  - uniform resource metrics: Task 4,
  - evidence-linked reports: Task 5,
  - API/UI access: Tasks 6-7.
- No planned agent prompt contains a named resource hint.
- The plan uses `beads` in tests as an arbitrary extra resource and never gives it a special role.
- Old tribe/barter MVP remains intact until the new engine is verified.
