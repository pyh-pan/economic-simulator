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
