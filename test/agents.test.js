import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgentPrompt,
  createLongCatAgent,
  parseAgentAction,
} from "../src/agents.js";

test("agent prompt forbids global economic knowledge and exposes only local state", () => {
  const prompt = buildAgentPrompt({
    visibleState: {
      tribeId: "fruiters",
      trustLevel: 0.1,
      inventory: { fruit: 10, fish: 1 },
      needs: { fish: 3 },
      proposals: [{ proposal_id: "proposal-1", from_tribe: "fishers" }],
    },
    proposal: {
      proposal_id: "proposal-1",
      offered_resource: "fish",
      requested_resource: "fruit",
    },
  });

  assert.match(prompt.system, /local tribe decision maker/i);
  assert.match(prompt.system, /do not use economic history/i);
  assert.match(prompt.system, /return only json/i);
  assert.doesNotMatch(prompt.user, /full-island inventory/i);
  assert.match(prompt.user, /trustLevel/);
  assert.match(prompt.system, /lower trust/i);
  assert.match(prompt.user, /fruiters/);
  assert.match(prompt.user, /proposal-1/);
});

test("agent prompt teaches trust as a continuous monotonic decision weight", () => {
  const prompt = buildAgentPrompt({
    visibleState: {
      tribeId: "fruiters",
      trustLevel: 0.8,
      inventory: { fruit: 10, fish: 1 },
      needs: { fish: 3, fruit: 0 },
      proposals: [{ proposal_id: "proposal-1", from_tribe: "fishers" }],
    },
    proposal: {
      proposal_id: "proposal-1",
      offered_resource: "fish",
      requested_resource: "fruit",
    },
  });

  const user = JSON.parse(prompt.user);

  assert.match(prompt.system, /continuous confidence weight/i);
  assert.match(prompt.system, /higher trustLevel must make acceptance more likely, never less likely/i);
  assert.match(prompt.system, /do not reject merely because of generic distrust/i);
  assert.match(user.decision_rules.join("\n"), /trustLevel is continuous/i);
  assert.match(user.decision_rules.join("\n"), /As trustLevel increases, uncertainty should matter less/i);
  assert.doesNotMatch(prompt.user, /I do not trust this offer/);
});

test("agent prompt includes the engine-computed decision context", () => {
  const prompt = buildAgentPrompt({
    visibleState: {
      tribeId: "fruiters",
      trustLevel: 0.8,
      inventory: { fruit: 10, fish: 1 },
      needs: { fish: 3, fruit: 0 },
      proposals: [{ proposal_id: "proposal-1", from_tribe: "fishers" }],
    },
    proposal: {
      proposal_id: "proposal-1",
      offered_resource: "fish",
      requested_resource: "fruit",
    },
    decisionContext: {
      utility: {
        net_utility: 0.95,
        recommendation: "accept",
      },
      trust: {
        trust_adjusted_risk: 0.05,
      },
    },
  });

  const user = JSON.parse(prompt.user);

  assert.deepEqual(user.decision_context.utility, {
    net_utility: 0.95,
    recommendation: "accept",
  });
  assert.match(user.decision_rules.join("\n"), /Use decision_context as the economic ledger/i);
  assert.match(user.decision_rules.join("\n"), /reason must cite/i);
});

test("parseAgentAction extracts strict JSON action from provider text", () => {
  const action = parseAgentAction('{"type":"accept_trade","proposal_id":"proposal-1","reason":"fish is needed"}');

  assert.deepEqual(action, {
    type: "accept_trade",
    proposal_id: "proposal-1",
    reason: "fish is needed",
  });
});

test("LongCat agent uses OpenAI-compatible chat completions", async () => {
  const calls = [];
  const agent = createLongCatAgent({
    apiKey: "test-key",
    fetchImpl: async (url, request) => {
      calls.push({ url, request: JSON.parse(request.body), headers: request.headers });
      return {
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: '{"type":"reject_trade","proposal_id":"proposal-1","reason":"trust is too low"}',
                },
              },
            ],
          };
        },
      };
    },
  });

  const action = await agent(
    { tribeId: "fruiters", inventory: { fruit: 10 }, needs: { fish: 3 }, proposals: [] },
    { proposal_id: "proposal-1", offered_resource: "fish", requested_resource: "fruit" },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.longcat.chat/openai/v1/chat/completions");
  assert.equal(calls[0].request.model, "LongCat-Flash-Chat");
  assert.equal(calls[0].headers.authorization, "Bearer test-key");
  assert.equal(action.type, "reject_trade");
  assert.equal(action.proposal_id, "proposal-1");
});
