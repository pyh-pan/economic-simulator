import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceSimulationTurn,
  createSimulationSession,
  getSimulationSnapshot,
} from "../src/index.js";

test("interactive session starts at turn zero with current tribe inventories", () => {
  const session = createSimulationSession({
    seed: "interactive-001",
    turnLimit: 3,
    globalTrust: 0.8,
    proposalStrategy: "auto",
    enableReputation: true,
  });

  const snapshot = getSimulationSnapshot(session);

  assert.equal(snapshot.turn, 0);
  assert.equal(snapshot.finished, false);
  assert.equal(snapshot.currentProposal, null);
  assert.equal(snapshot.currentDecision, null);
  assert.equal(snapshot.tribes.length, 5);
  assert.equal(snapshot.tribes.find((tribe) => tribe.tribe_id === "fishers").inventory.fish, 10);
  assert.equal(snapshot.metrics.completed_trades, 0);
});

test("advanceSimulationTurn performs one proposal decision and settlement", async () => {
  const session = createSimulationSession({
    seed: "interactive-002",
    turnLimit: 2,
    globalTrust: 1,
    proposalStrategy: "auto",
    enableReputation: true,
  });

  const snapshot = await advanceSimulationTurn(session);

  assert.equal(snapshot.turn, 1);
  assert.equal(snapshot.finished, false);
  assert.equal(snapshot.currentProposal.proposal_id, "proposal-1");
  assert.equal(snapshot.currentProposal.from_tribe, "fishers");
  assert.equal(snapshot.currentDecision.type, "accept_trade");
  assert.equal(snapshot.currentDecisionContext.utility.recommendation, "accept");
  assert.equal(snapshot.currentDecisionAgreement, true);
  assert.equal(snapshot.metrics.recommendation_agreement_rate, 1);
  assert.equal(snapshot.currentDecisionContext.utility.net_utility > 0, true);
  assert.match(snapshot.currentDecision.reason, /trustworthy|helps|needed/i);
  assert.equal(snapshot.metrics.completed_trades, 1);
  assert.equal(snapshot.turnEvents.some((event) => event.type === "proposal_created"), true);
  assert.equal(snapshot.turnEvents.some((event) => event.type === "trade_settled"), true);
});

test("interactive session reports finished after turn limit", async () => {
  const session = createSimulationSession({
    seed: "interactive-003",
    turnLimit: 1,
    globalTrust: 1,
    proposalStrategy: "auto",
  });

  const first = await advanceSimulationTurn(session);
  const second = await advanceSimulationTurn(session);

  assert.equal(first.finished, true);
  assert.equal(second.finished, true);
  assert.equal(second.turn, 1);
  assert.equal(second.turnEvents.at(-1).type, "run_finished");
});
