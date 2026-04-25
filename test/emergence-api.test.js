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

test("emergence API stringifies and trims normal mixed extra resources", async () => {
  const app = createApiApp({ useVite: false });
  const server = await app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const result = await postJson(`${baseUrl}/api/emergence/runs`, {
      seeds: ["mixed-extra"],
      turnLimit: 1,
      extraResources: [" beads ", 42, true],
    });
    const resources = result.runs[0].world.config.resources;

    assert.equal(resources.includes("beads"), true);
    assert.equal(resources.includes("42"), true);
    assert.equal(resources.includes("true"), true);
    assert.equal(resources.includes(" beads "), false);
  } finally {
    await app.close();
  }
});

test("emergence API rejects too many extra resources before running", async () => {
  const app = createApiApp({ useVite: false });
  const server = await app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await postJsonExpectingClientError(`${baseUrl}/api/emergence/runs`, {
      seeds: ["too-many-extra"],
      turnLimit: 1,
      extraResources: Array.from({ length: 11 }, (_, index) => `resource-${index}`),
    });

    assert.equal(response.status, 413);
    assert.match(response.body.error, /extraResources/i);
  } finally {
    await app.close();
  }
});

test("emergence API rejects overlong extra resource names", async () => {
  const app = createApiApp({ useVite: false });
  const server = await app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await postJsonExpectingClientError(`${baseUrl}/api/emergence/runs`, {
      seeds: ["overlong-extra"],
      turnLimit: 1,
      extraResources: ["x".repeat(33)],
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /extraResources/i);
  } finally {
    await app.close();
  }
});

test("emergence API rejects excessive turn limits before running", async () => {
  const app = createApiApp({ useVite: false });
  const server = await app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await postJsonExpectingClientError(`${baseUrl}/api/emergence/runs`, {
      seeds: ["too-long"],
      turnLimit: 201,
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /turnLimit/i);
  } finally {
    await app.close();
  }
});

test("emergence API rejects too many seeds before running", async () => {
  const app = createApiApp({ useVite: false });
  const server = await app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await postJsonExpectingClientError(`${baseUrl}/api/emergence/runs`, {
      seeds: Array.from({ length: 11 }, (_, index) => `seed-${index}`),
      turnLimit: 1,
    });

    assert.equal(response.status, 413);
    assert.match(response.body.error, /seeds/i);
  } finally {
    await app.close();
  }
});

test("emergence API rejects out-of-range numeric controls", async () => {
  const app = createApiApp({ useVite: false });
  const server = await app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const cases = [
      ["randomEncounterRate", 2.1],
      ["searchBudget", 0],
      ["marketSignalWindow", 0],
    ];

    for (const [field, value] of cases) {
      const response = await postJsonExpectingClientError(`${baseUrl}/api/emergence/runs`, {
        seeds: ["bounded"],
        turnLimit: 1,
        [field]: value,
      });

      assert.equal(response.status, 400);
      assert.match(response.body.error, new RegExp(field, "i"));
    }
  } finally {
    await app.close();
  }
});

test("emergence API returns 400 for malformed JSON", async () => {
  const app = createApiApp({ useVite: false });
  const server = await app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await postRaw(`${baseUrl}/api/emergence/runs`, "{");

    assert.equal(response.status, 400);
    assert.match(response.body.error, /json/i);
  } finally {
    await app.close();
  }
});

test("emergence API returns 400 for null JSON bodies", async () => {
  const app = createApiApp({ useVite: false });
  const server = await app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await postRaw(`${baseUrl}/api/emergence/runs`, "null");

    assert.equal(response.status, 400);
    assert.match(response.body.error, /object/i);
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

async function postJsonExpectingClientError(url, body) {
  const response = await postRaw(url, JSON.stringify(body));
  assert.equal(response.status >= 400 && response.status < 500, true);
  return response;
}

async function postRaw(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return { status: response.status, body: await response.json() };
}

function assertHasNoForbiddenTerms(value) {
  const serialized = JSON.stringify(value);
  for (const term of FORBIDDEN_TERMS) {
    assert.equal(serialized.includes(term), false);
  }
}
