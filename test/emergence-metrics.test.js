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

test("average search cost reports rejected proposals per agent without clamping", () => {
  const run = {
    events: [
      ...Array.from({ length: 7 }, (_, index) => ({
        type: "proposal_created",
        turn: index + 1,
        proposal_id: `p${index + 1}`,
        from_agent: "agent_01",
        to_agent: "agent_02",
        offered_resource: "fish",
        requested_resource: "water",
      })),
      ...Array.from({ length: 7 }, (_, index) => ({
        type: "proposal_rejected",
        turn: index + 1,
        proposal_id: `p${index + 1}`,
      })),
    ],
    world: {
      config: { resources: ["fish", "water"] },
      agents: [
        createMetricAgent("agent_01", "fish"),
        createMetricAgent("agent_02", "water"),
      ],
    },
  };

  const metrics = buildEmergenceMetrics(run);

  assert.equal(metrics.macro.average_search_cost, 3.5);
  assert.equal(metrics.macro.average_search_cost > 1, true);
});

test("bounded macro and resource metrics stay within zero and one", () => {
  const run = runEmergenceSimulation({ seed: "metrics-bounded", turnLimit: 25, extraResources: ["beads"] });
  const metrics = buildEmergenceMetrics(run);
  const boundedMacroFields = [
    "trade_completion_rate",
    "unmet_need_rate",
    "network_density",
    "network_centralization",
    "resource_inequality",
    "welfare_proxy",
  ];
  const boundedResourceFields = [
    "acceptance_breadth",
    "acceptance_context_diversity",
    "pass_through_rate",
    "non_consumption_holding",
    "search_cost_reduction_after_acceptance",
    "repeat_acceptance_stability",
  ];

  for (const field of boundedMacroFields) {
    assert.equal(metrics.macro[field] >= 0 && metrics.macro[field] <= 1, true, field);
  }

  for (const resourceMetrics of Object.values(metrics.resources)) {
    for (const field of boundedResourceFields) {
      assert.equal(resourceMetrics[field] >= 0 && resourceMetrics[field] <= 1, true, field);
    }
  }
});

test("simulations with no counterparties return metrics without proposals", () => {
  for (const agentCount of [0, 1]) {
    const run = runEmergenceSimulation({ seed: `metrics-counterparty-${agentCount}`, turnLimit: 3, agentCount });

    assert.equal(run.events.some((event) => event.type === "proposal_created"), false);
    assert.equal(typeof run.metrics.macro.trade_completion_rate, "number");
    assert.equal(run.metrics.agents.length, agentCount);
  }
});

test("no-proposal metrics are finite", () => {
  const run = runEmergenceSimulation({ seed: "metrics-no-proposals", turnLimit: 0 });
  const metrics = buildEmergenceMetrics(run);

  for (const value of Object.values(metrics.macro)) {
    assert.equal(Number.isFinite(value), true);
  }

  for (const resourceMetrics of Object.values(metrics.resources)) {
    for (const value of Object.values(resourceMetrics)) {
      assert.equal(Number.isFinite(value), true);
    }
  }
});

function createMetricAgent(id, productionType) {
  return {
    id,
    archetype: "trader",
    production_type: productionType,
    inventory: { fish: productionType === "fish" ? 3 : 0, water: productionType === "water" ? 3 : 0 },
    needs: { fish: productionType === "fish" ? 0 : 1, water: productionType === "water" ? 0 : 1 },
    unmet_need: 0,
  };
}
