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
