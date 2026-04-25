import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReplaySummary,
  createLlmAgent,
  createDefaultWorld,
  getVisibleState,
  runSimulation,
  runSimulationAsync,
  validateAction,
} from "../src/index.js";

test("tribes only observe local state", () => {
  const world = createDefaultWorld({ seed: "visibility", turnLimit: 4, globalTrust: 0.5 });
  const visible = getVisibleState(world, "fishers");

  assert.equal(visible.tribeId, "fishers");
  assert.deepEqual(visible.inventory, world.tribes.fishers.inventory);
  assert.equal(visible.tribes, undefined);
  assert.equal(visible.globalInventory, undefined);
  assert.equal(visible.otherTribeNeeds, undefined);
});

test("action validation rejects state mutation attempts", () => {
  const result = validateAction({
    type: "accept_trade",
    proposal_id: "proposal-1",
    reason: "I trust this offer.",
    inventory: { fish: 999 },
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /unknown field/i);
});

test("same seed and config replay the same event trace", () => {
  const first = runSimulation({ seed: "replay", turnLimit: 8, globalTrust: 0.8 });
  const second = runSimulation({ seed: "replay", turnLimit: 8, globalTrust: 0.8 });

  assert.deepEqual(second.events, first.events);
  assert.deepEqual(second.metrics, first.metrics);
});

test("higher trust increases barter completion for the same seed", () => {
  const lowTrust = runSimulation({ seed: "trust-effect", turnLimit: 12, globalTrust: 0.1 });
  const highTrust = runSimulation({ seed: "trust-effect", turnLimit: 12, globalTrust: 0.9 });

  assert.ok(highTrust.metrics.trade_completion_rate > lowTrust.metrics.trade_completion_rate);
  assert.ok(highTrust.metrics.acceptance_rate > lowTrust.metrics.acceptance_rate);
});

test("zero trust overrides an accepting agent in batch simulation", () => {
  const acceptingAgent = (_visibleState, proposal) => ({
    type: "accept_trade",
    proposal_id: proposal.proposal_id,
    reason: "I accept everything.",
  });

  const run = runSimulation({
    seed: "zero-trust-agent",
    turnLimit: 3,
    globalTrust: 0,
    proposalStrategy: "auto",
    agents: {
      fishers: acceptingAgent,
      waterkeepers: acceptingAgent,
      fruiters: acceptingAgent,
      herders: acceptingAgent,
      woodcutters: acceptingAgent,
    },
  });

  assert.equal(run.metrics.accepted_proposals, 0);
  assert.equal(run.metrics.rejected_proposals, 3);
  assert.equal(run.metrics.completed_trades, 0);
  assert.equal(run.events.some((event) => event.type === "trade_settled"), false);
});

test("zero trust overrides an accepting agent in async simulation", async () => {
  const acceptingAgent = async (_visibleState, proposal) => ({
    type: "accept_trade",
    proposal_id: proposal.proposal_id,
    reason: "I accept everything.",
  });

  const run = await runSimulationAsync({
    seed: "zero-trust-async-agent",
    turnLimit: 3,
    globalTrust: 0,
    proposalStrategy: "auto",
    agents: {
      fishers: acceptingAgent,
      waterkeepers: acceptingAgent,
      fruiters: acceptingAgent,
      herders: acceptingAgent,
      woodcutters: acceptingAgent,
    },
  });

  assert.equal(run.metrics.accepted_proposals, 0);
  assert.equal(run.metrics.rejected_proposals, 3);
  assert.equal(run.metrics.completed_trades, 0);
  assert.equal(run.events.some((event) => event.type === "trade_settled"), false);
});

test("invalid agent output is repaired once before deterministic fallback", () => {
  let attempts = 0;
  const agent = () => {
    attempts += 1;
    if (attempts === 1) {
      return { type: "accept_trade", reason: "missing proposal id" };
    }
    return { type: "accept_trade", proposal_id: "proposal-1", reason: "repaired" };
  };

  const run = runSimulation({
    seed: "repair",
    turnLimit: 1,
    globalTrust: 1,
    agents: { fruiters: agent },
  });

  assert.equal(run.events.some((event) => event.type === "agent_output_invalid"), true);
  assert.equal(run.events.some((event) => event.type === "agent_output_repaired"), true);
  assert.equal(run.metrics.invalid_output_rate > 0, true);
});

test("fallback failures are not counted as economic rejections", () => {
  const brokenAgent = () => ({ type: "accept_trade", reason: "still missing proposal id" });

  const run = runSimulation({
    seed: "fallback",
    turnLimit: 1,
    globalTrust: 1,
    agents: { fruiters: brokenAgent },
  });

  assert.equal(run.events.some((event) => event.type === "fallback_applied"), true);
  assert.equal(run.metrics.rejected_proposals, 0);
  assert.equal(run.metrics.completed_trades, 0);
});

test("settlement preserves total resources and prevents negative inventory", () => {
  const run = runSimulation({ seed: "invariants", turnLimit: 10, globalTrust: 1 });

  assert.deepEqual(run.invariants.violations, []);
  assert.deepEqual(run.initialTotals, run.finalTotals);
});

test("run configuration can provide a proposal plan", () => {
  const run = runSimulation({
    seed: "proposal-plan",
    turnLimit: 2,
    globalTrust: 1,
    proposals: [
      {
        from_tribe: "waterkeepers",
        to_tribe: "herders",
        offered_resource: "water",
        offered_quantity: 2,
        requested_resource: "animals",
        requested_quantity: 1,
      },
      {
        from_tribe: "woodcutters",
        to_tribe: "fishers",
        offered_resource: "wood",
        offered_quantity: 1,
        requested_resource: "fish",
        requested_quantity: 2,
      },
    ],
  });

  const created = run.events.filter((event) => event.type === "proposal_created");

  assert.deepEqual(
    created.map((event) => [event.from_tribe, event.to_tribe]),
    [
      ["waterkeepers", "herders"],
      ["woodcutters", "fishers"],
    ],
  );
  assert.equal(run.metrics.completed_trades, 2);
  assert.equal(run.world.tribes.waterkeepers.inventory.animals, 2);
  assert.equal(run.world.tribes.woodcutters.inventory.fish, 3);
});

test("invalid proposal plans are logged without becoming economic rejections", () => {
  const run = runSimulation({
    seed: "invalid-proposal",
    turnLimit: 1,
    globalTrust: 1,
    proposals: [
      {
        from_tribe: "waterkeepers",
        to_tribe: "herders",
        offered_resource: "water",
        offered_quantity: 999,
        requested_resource: "animals",
        requested_quantity: 1,
      },
    ],
  });

  assert.equal(run.events.some((event) => event.type === "proposal_invalid"), true);
  assert.equal(run.metrics.valid_trade_proposals, 0);
  assert.equal(run.metrics.rejected_proposals, 0);
  assert.equal(run.metrics.completed_trades, 0);
});

test("automatic proposal generation creates valid barter attempts", () => {
  const run = runSimulation({
    seed: "auto-proposals",
    turnLimit: 5,
    globalTrust: 1,
    proposalStrategy: "auto",
  });

  const created = run.events.filter((event) => event.type === "proposal_created");

  assert.equal(created.length, 5);
  assert.equal(created.every((event) => event.from_tribe !== event.to_tribe), true);
  assert.equal(created.every((event) => event.offered_resource !== event.requested_resource), true);
  assert.ok(new Set(created.map((event) => `${event.from_tribe}->${event.to_tribe}`)).size > 1);
  assert.equal(run.metrics.completed_trades, 5);
  assert.deepEqual(run.invariants.violations, []);
});

test("async simulation supports provider-backed LLM agents", async () => {
  const seen = [];
  const agent = createLlmAgent({
    provider: async ({ visibleState, proposal }) => {
      seen.push({ visibleState, proposal });
      return { type: "accept_trade", proposal_id: proposal.proposal_id, reason: "provider accepted" };
    },
  });

  const run = await runSimulationAsync({
    seed: "llm-agent",
    turnLimit: 1,
    globalTrust: 1,
    agents: { fruiters: agent },
  });

  assert.equal(run.metrics.completed_trades, 1);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].visibleState.tribes, undefined);
  assert.equal(seen[0].proposal.proposal_id, "proposal-1");
});

test("optional reputation tracks local trade experience", () => {
  const highTrust = runSimulation({
    seed: "reputation-success",
    turnLimit: 1,
    globalTrust: 1,
    enableReputation: true,
  });
  const lowTrust = runSimulation({
    seed: "reputation-reject",
    turnLimit: 1,
    globalTrust: 0,
    enableReputation: true,
  });

  assert.equal(highTrust.world.tribes.fishers.reputation.fruiters, 1);
  assert.equal(highTrust.world.tribes.fruiters.reputation.fishers, 1);
  assert.equal(lowTrust.world.tribes.fishers.reputation.fruiters, -1);
  assert.equal(lowTrust.world.tribes.fruiters.reputation.fishers, -1);
});

test("proto-currency candidates can exist without being designated as money", () => {
  const run = runSimulation({
    seed: "shells",
    turnLimit: 4,
    globalTrust: 1,
    proposalStrategy: "auto",
    protoCurrencyCandidates: ["shells"],
  });

  assert.equal(run.world.resources.includes("shells"), true);
  assert.equal(run.world.moneyResource, undefined);
  assert.equal(run.initialTotals.shells, run.finalTotals.shells);
  assert.deepEqual(run.invariants.violations, []);
});

test("replay summary groups timeline and final tribe state for UI", () => {
  const run = runSimulation({
    seed: "summary",
    turnLimit: 3,
    globalTrust: 1,
    proposalStrategy: "auto",
    enableReputation: true,
  });

  const summary = buildReplaySummary(run);

  assert.equal(summary.metrics.completed_trades, 3);
  assert.equal(summary.turns.length, 3);
  assert.equal(summary.turns[0].events.some((event) => event.type === "proposal_created"), true);
  assert.equal(summary.tribes.length, 5);
  assert.equal(summary.tribes.every((tribe) => tribe.inventory && tribe.needs), true);
});
