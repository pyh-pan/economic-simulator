import assert from "node:assert/strict";
import test from "node:test";

import { buildEmergenceReport, runEmergenceExperimentSet } from "../src/index.js";

test("experiment set runs multiple deterministic seeds", () => {
  const first = runEmergenceExperimentSet({ seeds: ["a", "b"], turnLimit: 8, extraResources: ["beads"] });
  const second = runEmergenceExperimentSet({ seeds: ["a", "b"], turnLimit: 8, extraResources: ["beads"] });

  assert.deepEqual(Object.keys(first).sort(), ["runs", "seeds", "summary"]);
  assert.deepEqual(first.seeds, ["a", "b"]);
  assert.equal(first.runs.length, 2);
  assert.deepEqual(second.summary, first.summary);
});

test("report uses evidence-linked findings and neutral resource labels", () => {
  const experiment = runEmergenceExperimentSet({
    seeds: ["report-a", "report-b"],
    turnLimit: 10,
    extraResources: ["beads"],
  });
  const report = buildEmergenceReport(experiment);
  const serialized = JSON.stringify(report);

  assert.equal(Array.isArray(report.findings), true);
  assert.equal(report.findings.every((finding) => finding.evidence && finding.confidence), true);
  assert.equal(serialized.includes("money"), false);
  assert.equal(serialized.includes("currency"), false);
  assert.equal(serialized.includes("medium of exchange"), false);
  assert.equal(serialized.includes("candidate medium"), false);
});

test("resource findings include compact linked event references", () => {
  const report = buildEmergenceReport({
    runs: [
      {
        world: { config: { seed: "linked-seed", resources: ["fish", "ore"] } },
        events: [
          {
            type: "proposal_created",
            turn: 2,
            proposal_id: "proposal-2-1",
            from_agent: "agent_01",
            to_agent: "agent_02",
            offered_resource: "fish",
            requested_resource: "ore",
          },
          {
            type: "proposal_accepted",
            turn: 2,
            proposal_id: "proposal-2-1",
            from_agent: "agent_01",
            to_agent: "agent_02",
          },
        ],
      },
    ],
    summary: {
      run_count: 1,
      average_trade_completion_rate: 1,
      average_unmet_need_rate: 0,
      resources: {
        fish: {
          average_acceptance_breadth: 0.5,
          average_pass_through_rate: 0,
          seed_presence_rate: 1,
        },
        ore: {
          average_acceptance_breadth: 0,
          average_pass_through_rate: 0,
          seed_presence_rate: 0,
        },
      },
    },
  });
  const fishFinding = report.findings.find((finding) => finding.resource === "fish");

  assert.ok(fishFinding);
  assert.deepEqual(fishFinding.linked_events, [
    {
      seed: "linked-seed",
      turn: 2,
      proposal_id: "proposal-2-1",
      offered_resource: "fish",
      requested_resource: "ore",
    },
  ]);
});

test("custom resources are summarized uniformly without named-resource requirements", () => {
  const options = { seeds: ["uniform-a", "uniform-b"], turnLimit: 8 };
  const beadsExperiment = runEmergenceExperimentSet({ ...options, extraResources: ["beads"] });
  const tokensExperiment = runEmergenceExperimentSet({ ...options, extraResources: ["tokens"] });
  const beadsKeys = Object.keys(beadsExperiment.summary.resources.beads).sort();
  const tokensKeys = Object.keys(tokensExperiment.summary.resources.tokens).sort();

  assert.equal(Object.hasOwn(beadsExperiment.summary.resources, "beads"), true);
  assert.equal(Object.hasOwn(tokensExperiment.summary.resources, "tokens"), true);
  assert.deepEqual(tokensKeys, beadsKeys);
});

test("empty experiment set returns finite summary and explanatory finding", () => {
  const experiment = runEmergenceExperimentSet({ seeds: [] });
  const report = buildEmergenceReport(experiment);

  assert.equal(experiment.summary.run_count, 0);
  assert.equal(experiment.summary.average_trade_completion_rate, 0);
  assert.equal(experiment.summary.average_unmet_need_rate, 0);
  assert.deepEqual(experiment.summary.resources, {});
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].evidence.runs, 0);
  assert.equal(report.findings[0].title.includes("No runs were available"), true);
});
