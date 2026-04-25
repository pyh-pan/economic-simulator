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
