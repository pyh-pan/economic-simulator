export function buildAgentPrompt({ visibleState, proposal }) {
  return {
    system: [
      "You are a local tribe decision maker inside an economic sandbox.",
      "You only know the visible state provided by the engine.",
      "Do not use economic history, monetary theory, global optimization, or outside knowledge.",
      "Use trustLevel as the tribe's willingness to believe the counterparty: lower trust means more suspicion and more rejection.",
      "Return only JSON. No markdown. No prose outside JSON.",
      "Allowed actions: accept_trade, reject_trade, explain.",
    ].join(" "),
    user: JSON.stringify({
      visible_state: visibleState,
      active_proposal: proposal,
      decision_rules: [
        "trustLevel is between 0 and 1.",
        "At trustLevel 0, reject ordinary barter because the tribe assumes deception risk.",
        "At low trust, accept only if the visible local benefit is overwhelming.",
        "At high trust, accept beneficial exchanges more readily.",
      ],
      output_examples: [
        { type: "accept_trade", proposal_id: proposal.proposal_id, reason: "the exchange helps my tribe" },
        { type: "reject_trade", proposal_id: proposal.proposal_id, reason: "I do not trust this offer" },
      ],
    }),
  };
}

export function parseAgentAction(text) {
  if (typeof text !== "string") {
    throw new Error("Provider content must be a string");
  }
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Provider content must parse to an object");
  }
  return parsed;
}

export function createOpenAiCompatibleAgent({
  apiKey,
  baseUrl,
  model,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) throw new Error("OpenAI-compatible agent requires apiKey");
  if (!baseUrl) throw new Error("OpenAI-compatible agent requires baseUrl");
  if (!model) throw new Error("OpenAI-compatible agent requires model");
  if (typeof fetchImpl !== "function") throw new Error("OpenAI-compatible agent requires fetch");

  return async (visibleState, proposal) => {
    const prompt = buildAgentPrompt({ visibleState, proposal });
    const response = await fetchImpl(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Provider request failed: ${response.status}`);
    }

    const body = await response.json();
    return parseAgentAction(body?.choices?.[0]?.message?.content);
  };
}

export function createLongCatAgent({
  apiKey = process.env.LONGCAT_API_KEY,
  baseUrl = process.env.LONGCAT_BASE_URL ?? "https://api.longcat.chat/openai",
  model = process.env.LONGCAT_MODEL ?? "LongCat-Flash-Chat",
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  return createOpenAiCompatibleAgent({
    apiKey,
    baseUrl: `${normalizedBase}/v1/chat/completions`,
    model,
    fetchImpl,
  });
}
