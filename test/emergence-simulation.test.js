import assert from "node:assert/strict";
import test from "node:test";

import { runEmergenceSimulation } from "../src/index.js";

test("emergence simulation is deterministic and conserves resources", () => {
  const options = { seed: "sim-001", turnLimit: 12, extraResources: ["beads"] };
  const first = runEmergenceSimulation(options);
  const second = runEmergenceSimulation(options);
  const producedTotals = totalsFromEvents(first.world.config.resources, first.events, "agent_produced", "resource");
  const consumedTotals = totalsFromEvents(first.world.config.resources, first.events, "needs_checked", "consumed_resources");

  assert.deepEqual(second.events, first.events);
  assert.deepEqual(second.finalTotals, first.finalTotals);
  assert.deepEqual(first.invariants.violations, []);

  for (const resource of first.world.config.resources) {
    assert.equal(first.finalTotals[resource] + consumedTotals[resource], first.initialTotals[resource] + producedTotals[resource]);
  }
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
  assert.deepEqual(Object.keys(run.world.marketSignals.resource_acceptance_counts).sort(), run.world.config.resources.toSorted());
});

test("simulation rejects unknown production types", () => {
  assert.throws(() => runEmergenceSimulation({ productionTypes: ["unknown"] }), /Unknown production type/i);
});

function totalsFromEvents(resources, events, eventType, resourceField) {
  const totals = Object.fromEntries(resources.map((resource) => [resource, 0]));

  for (const event of events) {
    if (event.type !== eventType) {
      continue;
    }

    if (resourceField === "consumed_resources") {
      for (const [resource, quantity] of Object.entries(event.consumed_resources)) {
        totals[resource] += quantity;
      }
    } else {
      totals[event[resourceField]] += event.quantity;
    }
  }

  return totals;
}
