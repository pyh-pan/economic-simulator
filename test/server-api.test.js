import assert from "node:assert/strict";
import test from "node:test";

import { createApiApp } from "../server.mjs";

test("simulation API creates and advances a local NPC session", async () => {
  const app = createApiApp({ useVite: false });
  const server = await app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const created = await postJson(`${baseUrl}/api/simulations`, {
      seed: "api-001",
      turnLimit: 2,
      trust: 1,
      agentProvider: "local",
      enableReputation: true,
      enableShells: false,
    });

    assert.equal(created.snapshot.turn, 0);
    assert.equal(created.snapshot.finished, false);
    assert.equal(created.snapshot.tribes.length, 5);

    const stepped = await postJson(`${baseUrl}/api/simulations/${created.id}/step`, {});

    assert.equal(stepped.snapshot.turn, 1);
    assert.equal(stepped.snapshot.currentProposal.proposal_id, "proposal-1");
    assert.equal(stepped.snapshot.currentDecision.type, "accept_trade");
    assert.match(stepped.snapshot.currentDecision.reason, /trust|need|exchange/i);
    assert.equal(stepped.snapshot.turnEvents.some((event) => event.type === "proposal_created"), true);
  } finally {
    await app.close();
  }
});

test("local NPC rejects normal barter when trust is zero", async () => {
  const app = createApiApp({ useVite: false });
  const server = await app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const created = await postJson(`${baseUrl}/api/simulations`, {
      seed: "api-low-trust",
      turnLimit: 1,
      trust: 0,
      agentProvider: "local",
      enableReputation: true,
    });

    const stepped = await postJson(`${baseUrl}/api/simulations/${created.id}/step`, {});

    assert.equal(stepped.snapshot.currentDecision.type, "reject_trade");
    assert.match(stepped.snapshot.currentDecision.reason, /trust/i);
    assert.equal(stepped.snapshot.metrics.completed_trades, 0);
  } finally {
    await app.close();
  }
});

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    assert.fail(await response.text());
  }
  return response.json();
}
