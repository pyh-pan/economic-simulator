import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReplaySummary,
  createLlmAgent,
  createDefaultWorld,
  computeDecisionContext,
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
  assert.deepEqual(visible.targets, world.tribes.fishers.targets);
  assert.deepEqual(visible.reserves, world.tribes.fishers.reserves);
  assert.equal(visible.productionRates.fish, 1);
  assert.equal(visible.productionRates.water, 0);
  assert.equal(visible.priorities.fish, 1);
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

test("action validation allows counter trade negotiation", () => {
  const result = validateAction({
    type: "counter_trade",
    proposal_id: "proposal-1",
    offered_resource: "fish",
    offered_quantity: 2,
    requested_resource: "water",
    requested_quantity: 1,
    reason: "I need a better ratio.",
  });

  assert.equal(result.ok, true);
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

test("decision context computes a trust-adjusted local utility ledger", () => {
  const context = computeDecisionContext(
    {
      tribeId: "fruiters",
      dominantResource: "fruit",
      trustLevel: 0.8,
      inventory: { fish: 1, fruit: 10 },
      needs: { fish: 3, fruit: 0 },
    },
    {
      proposal_id: "proposal-1",
      offered_resource: "fish",
      offered_quantity: 1,
      requested_resource: "fruit",
      requested_quantity: 1,
    },
  );

  assert.equal(context.objective, "reduce unmet resource targets while preserving reserves");
  assert.deepEqual(context.receive, {
    resource: "fish",
    quantity: 1,
    target: 3,
    inventory_before: 1,
    inventory_after: 2,
    gap_before: 2,
    gap_after: 1,
    target_gap_benefit: 1,
  });
  assert.deepEqual(context.pay, {
    resource: "fruit",
    quantity: 1,
    target: 0,
    reserve: 1,
    production_rate: 1,
    inventory_before: 10,
    inventory_after: 9,
    gap_before: 0,
    gap_after: 0,
    payment_opportunity_cost: 0,
    reserve_penalty: 0,
  });
  assert.deepEqual(context.trust, {
    trustLevel: 0.8,
    base_trade_risk: 0.25,
    trust_adjusted_risk: 0.05,
  });
  assert.deepEqual(context.exchange, {
    offered_per_requested: 1,
    requested_per_offered: 1,
  });
  assert.deepEqual(context.utility, {
    gross_benefit: 1,
    total_cost: 0.05,
    net_utility: 0.95,
    recommendation: "accept",
  });
});

test("decision context rejects trades that deepen scarcity even with high trust", () => {
  const context = computeDecisionContext(
    {
      tribeId: "waterkeepers",
      dominantResource: "water",
      trustLevel: 1,
      inventory: { fish: 5, water: 1 },
      needs: { fish: 0, water: 3 },
    },
    {
      proposal_id: "proposal-1",
      offered_resource: "fish",
      offered_quantity: 1,
      requested_resource: "water",
      requested_quantity: 1,
    },
  );

  assert.equal(context.receive.target_gap_benefit, 0);
  assert.equal(context.pay.payment_opportunity_cost, 0.5);
  assert.equal(context.pay.reserve_penalty, 1);
  assert.equal(context.trust.trust_adjusted_risk, 0);
  assert.equal(context.utility.net_utility, -1.5);
  assert.equal(context.utility.recommendation, "reject");
});

test("decision context discounts opportunity cost for replenishable resources", () => {
  const scarcePayment = computeDecisionContext(
    {
      tribeId: "waterkeepers",
      dominantResource: "water",
      trustLevel: 1,
      inventory: { fish: 1, wood: 5 },
      targets: { fish: 3, wood: 0 },
      productionRates: { fish: 0, wood: 0 },
    },
    {
      proposal_id: "proposal-1",
      offered_resource: "wood",
      offered_quantity: 1,
      requested_resource: "fish",
      requested_quantity: 1,
    },
  );
  const replenishablePayment = computeDecisionContext(
    {
      tribeId: "waterkeepers",
      dominantResource: "water",
      trustLevel: 1,
      inventory: { fish: 1, wood: 5 },
      targets: { fish: 3, wood: 0 },
      productionRates: { fish: 1, wood: 0 },
    },
    {
      proposal_id: "proposal-1",
      offered_resource: "wood",
      offered_quantity: 1,
      requested_resource: "fish",
      requested_quantity: 1,
    },
  );

  assert.equal(scarcePayment.pay.payment_opportunity_cost, 1);
  assert.equal(replenishablePayment.pay.payment_opportunity_cost, 0.5);
});

test("decision context caps receive benefit after target is reached", () => {
  const context = computeDecisionContext(
    {
      tribeId: "fruiters",
      dominantResource: "fruit",
      trustLevel: 1,
      inventory: { fish: 2, fruit: 10 },
      targets: { fish: 3, fruit: 0 },
    },
    {
      proposal_id: "proposal-1",
      offered_resource: "fish",
      offered_quantity: 3,
      requested_resource: "fruit",
      requested_quantity: 1,
    },
  );

  assert.equal(context.receive.gap_before, 1);
  assert.equal(context.receive.gap_after, 0);
  assert.equal(context.receive.target_gap_benefit, 1);
});

test("decision context exposes exchange ratios for unequal quantities", () => {
  const context = computeDecisionContext(
    {
      tribeId: "fruiters",
      dominantResource: "fruit",
      trustLevel: 1,
      inventory: { fish: 1, fruit: 10 },
      targets: { fish: 3, fruit: 0 },
    },
    {
      proposal_id: "proposal-1",
      offered_resource: "fish",
      offered_quantity: 2,
      requested_resource: "fruit",
      requested_quantity: 1,
    },
  );

  assert.deepEqual(context.exchange, {
    offered_per_requested: 2,
    requested_per_offered: 0.5,
  });
});

test("production shocks alter visible production rates and payment cost", () => {
  const world = createDefaultWorld({
    seed: "shock",
    turnLimit: 2,
    productionShocks: [{ turn: 1, tribe_id: "fishers", resource: "fish", production_rate: 0 }],
  });
  world.turn = 1;
  world.tribes.fishers.inventory.fish = 1;
  world.tribes.fishers.targets.fish = 3;
  const visible = getVisibleState(world, "fishers");
  const context = computeDecisionContext(
    visible,
    {
      proposal_id: "proposal-1",
      offered_resource: "water",
      offered_quantity: 1,
      requested_resource: "fish",
      requested_quantity: 1,
    },
  );

  assert.equal(visible.productionRates.fish, 0);
  assert.equal(context.pay.payment_opportunity_cost, 1);
});

test("institution norms can require a minimum net utility", () => {
  const world = createDefaultWorld({
    seed: "norms",
    turnLimit: 1,
    globalTrust: 0,
    norms: { minimum_net_utility: 1.2 },
  });
  world.turn = 1;
  const visible = getVisibleState(world, "fruiters");
  const context = computeDecisionContext(
    visible,
    {
      proposal_id: "proposal-1",
      offered_resource: "fish",
      offered_quantity: 1,
      requested_resource: "fruit",
      requested_quantity: 1,
    },
  );

  assert.equal(context.norms.minimum_net_utility, 1.2);
  assert.equal(context.utility.net_utility, 0.75);
  assert.equal(context.utility.recommendation, "reject");
});

test("decision context raises net utility as trust increases for the same proposal", () => {
  const visibleState = {
    tribeId: "fruiters",
    dominantResource: "fruit",
    inventory: { fish: 1, fruit: 10 },
    needs: { fish: 3, fruit: 0 },
  };
  const proposal = {
    proposal_id: "proposal-1",
    offered_resource: "fish",
    offered_quantity: 1,
    requested_resource: "fruit",
    requested_quantity: 1,
  };

  const lowTrust = computeDecisionContext({ ...visibleState, trustLevel: 0.2 }, proposal);
  const highTrust = computeDecisionContext({ ...visibleState, trustLevel: 0.8 }, proposal);

  assert.ok(highTrust.trust.trust_adjusted_risk < lowTrust.trust.trust_adjusted_risk);
  assert.ok(highTrust.utility.net_utility > lowTrust.utility.net_utility);
});

test("simulation metrics track agent agreement with engine recommendation", () => {
  const disagreeingAgent = (_visibleState, proposal) => ({
    type: "reject_trade",
    proposal_id: proposal.proposal_id,
    reason: "I disagree with the ledger.",
  });

  const run = runSimulation({
    seed: "recommendation-disagreement",
    turnLimit: 1,
    globalTrust: 1,
    agents: { fruiters: disagreeingAgent },
  });

  assert.equal(run.metrics.recommendation_decisions, 1);
  assert.equal(run.metrics.recommendation_agreements, 0);
  assert.equal(run.metrics.recommendation_agreement_rate, 0);
});

test("simulation metrics separate acceptance rates by positive and negative utility", () => {
  const rejectingAgent = (_visibleState, proposal) => ({
    type: "reject_trade",
    proposal_id: proposal.proposal_id,
    reason: "I reject despite the ledger.",
  });
  const acceptingAgent = (_visibleState, proposal) => ({
    type: "accept_trade",
    proposal_id: proposal.proposal_id,
    reason: "I accept despite the cost.",
  });

  const positiveUtility = runSimulation({
    seed: "positive-utility-rejected",
    turnLimit: 1,
    globalTrust: 1,
    agents: { fruiters: rejectingAgent },
  });
  const negativeUtility = runSimulation({
    seed: "negative-utility-accepted",
    turnLimit: 1,
    globalTrust: 1,
    proposals: [
      {
        from_tribe: "fishers",
        to_tribe: "waterkeepers",
        offered_resource: "water",
        offered_quantity: 1,
        requested_resource: "fish",
        requested_quantity: 1,
      },
    ],
    agents: { waterkeepers: acceptingAgent },
  });

  assert.equal(positiveUtility.metrics.positive_utility_decisions, 1);
  assert.equal(positiveUtility.metrics.positive_utility_acceptance_rate, 0);
  assert.equal(negativeUtility.metrics.negative_utility_decisions, 1);
  assert.equal(negativeUtility.metrics.negative_utility_acceptance_rate, 1);
});

test("simulation metrics flag vague distrust rejections under high trust", () => {
  const vagueDistrustAgent = (_visibleState, proposal) => ({
    type: "reject_trade",
    proposal_id: proposal.proposal_id,
    reason: "I do not trust this offer.",
  });

  const run = runSimulation({
    seed: "high-trust-vague-distrust",
    turnLimit: 1,
    globalTrust: 0.9,
    agents: { fruiters: vagueDistrustAgent },
  });

  assert.equal(run.metrics.high_trust_vague_distrust_rejections, 1);
});

test("counter trade records a negotiation event without settling resources", () => {
  const counterAgent = (_visibleState, proposal) => ({
    type: "counter_trade",
    proposal_id: proposal.proposal_id,
    offered_resource: "fish",
    offered_quantity: 2,
    requested_resource: "water",
    requested_quantity: 1,
    reason: "I want a better exchange ratio.",
  });

  const run = runSimulation({
    seed: "counter-trade",
    turnLimit: 1,
    globalTrust: 1,
    agents: { fruiters: counterAgent },
  });

  assert.equal(run.events.some((event) => event.type === "counter_proposed"), true);
  assert.equal(run.metrics.counter_proposals, 1);
  assert.equal(run.metrics.completed_trades, 0);
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
    provider: async ({ visibleState, proposal, decisionContext }) => {
      seen.push({ visibleState, proposal, decisionContext });
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
  assert.equal(seen[0].decisionContext.utility.recommendation, "accept");
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
