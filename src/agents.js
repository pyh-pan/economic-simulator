export function buildAgentPrompt({ visibleState, proposal, decisionContext = null }) {
  return {
    system: [
      "You are a local tribe decision maker inside an economic sandbox.",
      "You only know the visible state provided by the engine.",
      "Do not use economic history, monetary theory, global optimization, or outside knowledge.",
      "Use trustLevel as a continuous confidence weight for the counterparty, not as a fixed threshold.",
      "Evaluate local benefit and affordability first, then use trustLevel to scale uncertainty risk: higher trustLevel means uncertainty matters less, lower trustLevel means uncertainty matters more.",
      "For the same visible state and proposal, higher trustLevel must make acceptance more likely, never less likely.",
      "At high trustLevel, do not reject merely because of generic distrust; reject only when the visible exchange is unaffordable, locally harmful, or not beneficial enough after trust-adjusted risk.",
      "Return only JSON. No markdown. No prose outside JSON.",
      "Allowed actions: accept_trade, reject_trade, counter_trade, explain.",
    ].join(" "),
    user: JSON.stringify({
      visible_state: visibleState,
      active_proposal: proposal,
      ...(decisionContext ? { decision_context: decisionContext } : {}),
      decision_rules: [
        "Use decision_context as the economic ledger for this proposal when it is provided.",
        "trustLevel is continuous between 0 and 1 and represents confidence that the counterparty will honor the visible proposal.",
        "First evaluate visible local benefit: whether offered_resource reduces unmet need, whether requested_resource is affordable, and whether the exchange would create a shortage.",
        "Then evaluate uncertainty risk. As trustLevel increases, uncertainty should matter less. As trustLevel decreases, uncertainty should matter more.",
        "For the same proposal and visible state, increasing trustLevel should never make rejection more likely.",
        "Accept when visible local benefit, affordability, and trust-adjusted risk support the exchange.",
        "Reject when the exchange is unaffordable, locally harmful, lacks enough benefit, or low trust makes uncertainty outweigh the benefit.",
        "Use counter_trade when the exchange direction is useful but the quantities make the current ratio unattractive.",
        "Your reason must cite benefit, cost, reserve impact, trust-adjusted risk, or net utility from the decision_context.",
      ],
      output_examples: [
        { type: "accept_trade", proposal_id: proposal.proposal_id, reason: "The exchange reduces an unmet need, I can afford the requested resource, and trust-adjusted risk is acceptable." },
        { type: "reject_trade", proposal_id: proposal.proposal_id, reason: "The requested resource is too costly for my current inventory, so the local benefit does not justify the exchange." },
        { type: "counter_trade", proposal_id: proposal.proposal_id, offered_resource: proposal.offered_resource, offered_quantity: proposal.offered_quantity, requested_resource: proposal.requested_resource, requested_quantity: proposal.requested_quantity, reason: "The exchange direction helps, but the ratio should be adjusted." },
        { type: "reject_trade", proposal_id: proposal.proposal_id, reason: "The offer has some local benefit, but current trust makes uncertainty outweigh it." },
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

  return async (visibleState, proposal, decisionContext = null) => {
    const prompt = buildAgentPrompt({ visibleState, proposal, decisionContext });
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
