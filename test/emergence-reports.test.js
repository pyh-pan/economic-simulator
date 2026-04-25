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
