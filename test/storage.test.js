import assert from "node:assert/strict";
import test from "node:test";

import { createRunStore, serializeRunRecord } from "../src/storage.js";
import { runSimulation } from "../src/index.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

test("serializeRunRecord creates stable saved-run payload", () => {
  const run = runSimulation({ seed: "persist-001", turnLimit: 3, globalTrust: 0.7, proposalStrategy: "auto" });
  const record = serializeRunRecord({ id: "run-1", label: "Trust 0.7", run, createdAt: "2026-04-25T00:00:00.000Z" });

  assert.equal(record.id, "run-1");
  assert.equal(record.label, "Trust 0.7");
  assert.equal(record.summary.metrics.valid_trade_proposals, 3);
  assert.equal(record.createdAt, "2026-04-25T00:00:00.000Z");
});

test("run store saves, lists, loads, and deletes records", () => {
  const store = createRunStore({ storage: memoryStorage(), key: "runs" });
  const run = runSimulation({ seed: "persist-002", turnLimit: 2, globalTrust: 1, proposalStrategy: "auto" });
  const record = serializeRunRecord({ id: "run-2", label: "High trust", run, createdAt: "2026-04-25T00:00:00.000Z" });

  store.save(record);

  assert.equal(store.list().length, 1);
  assert.equal(store.load("run-2").label, "High trust");

  store.remove("run-2");

  assert.deepEqual(store.list(), []);
});
