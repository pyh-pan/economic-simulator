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

test("visible state includes proposals involving the agent", () => {
  const world = createEmergenceWorld({ seed: "proposal-visible" });
  world.proposals.p1 = { proposal_id: "p1", from_agent: "agent_01", to_agent: "agent_02" };

  assert.deepEqual(getEmergenceVisibleState(world, "agent_01").proposals.p1, world.proposals.p1);
  assert.deepEqual(getEmergenceVisibleState(world, "agent_02").proposals.p1, world.proposals.p1);
  assert.equal(getEmergenceVisibleState(world, "agent_03").proposals.p1, undefined);
});

test("visible market signals are cloned from world state", () => {
  const world = createEmergenceWorld({ seed: "market-signal-clone" });
  const visible = getEmergenceVisibleState(world, "agent_01");

  visible.marketSignals.resource_acceptance_counts.fish = 12;

  assert.equal(world.marketSignals.resource_acceptance_counts.fish, 0);
});
