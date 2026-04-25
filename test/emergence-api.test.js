import assert from "node:assert/strict";
import test from "node:test";

import { createApiApp } from "../server.mjs";

const FORBIDDEN_TERMS = ["money", "currency", "medium of exchange", "candidate medium"];

test("emergence API runs a neutral multi-seed experiment", async () => {
  const app = createApiApp({ useVite: false });
  const server = await app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const result = await postJson(`${baseUrl}/api/emergence/runs`, {
      seeds: ["api-a", "api-b"],
      turnLimit: 6,
      extraResources: ["beads"],
    });

    assert.equal(result.runs.length, 2);
    assert.equal(result.report.findings.every((finding) => finding.evidence), true);
    assertHasNoForbiddenTerms(result);
  } finally {
    await app.close();
  }
});

test("emergence API applies conservative defaults and stringifies array inputs", async () => {
  const app = createApiApp({ useVite: false });
  const server = await app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const result = await postJson(`${baseUrl}/api/emergence/runs`, {
      seeds: [],
      extraResources: ["beads", 42],
    });

    assert.deepEqual(result.seeds, ["seed-1", "seed-2", "seed-3"]);
    assert.equal(result.runs.length, 3);
    assert.equal(result.runs.every((run) => run.world.config.resources.includes("42")), true);
    assertHasNoForbiddenTerms(result);
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
  if (!response.ok) assert.fail(await response.text());
  return response.json();
}

function assertHasNoForbiddenTerms(value) {
  const serialized = JSON.stringify(value);
  for (const term of FORBIDDEN_TERMS) {
    assert.equal(serialized.includes(term), false);
  }
}
