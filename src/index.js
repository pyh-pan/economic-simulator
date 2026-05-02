const RESOURCES = ["fish", "water", "fruit", "animals", "wood"];

export { createLongCatAgent, createOpenAiCompatibleAgent } from "./agents.js";
export * from "./emergence/index.js";
export { buildTradeNetwork, compareTrustRuns, scanTrustLevels } from "./experiments.js";
export { createRunStore, serializeRunRecord } from "./storage.js";

const TRIBE_DEFINITIONS = [
  ["fishers", "fish"],
  ["waterkeepers", "water"],
  ["fruiters", "fruit"],
  ["herders", "animals"],
  ["woodcutters", "wood"],
];

const ACTION_SCHEMAS = {
  propose_trade: ["type", "to_tribe", "offered_resource", "offered_quantity", "requested_resource", "requested_quantity", "reason"],
  accept_trade: ["type", "proposal_id", "reason"],
  reject_trade: ["type", "proposal_id", "reason"],
  counter_trade: ["type", "proposal_id", "offered_resource", "offered_quantity", "requested_resource", "requested_quantity", "reason"],
  explain: ["type", "text"],
};

export function createDefaultWorld({ seed = "default", turnLimit = 10, globalTrust = 0.5, enableReputation = false, protoCurrencyCandidates = [], productionShocks = [], norms = {} } = {}) {
  const tribes = {};
  const resources = [...RESOURCES, ...protoCurrencyCandidates.filter((resource) => !RESOURCES.includes(resource))];

  for (const [tribeId, dominantResource] of TRIBE_DEFINITIONS) {
    const inventory = Object.fromEntries(resources.map((resource) => [resource, resource === dominantResource ? 10 : resource === "shells" ? 2 : 1]));
    const needs = Object.fromEntries(resources.map((resource) => [resource, resource === dominantResource || protoCurrencyCandidates.includes(resource) ? 0 : 3]));
    const targets = { ...needs };
    const reserves = Object.fromEntries(resources.map((resource) => [resource, 1]));
    const productionRates = Object.fromEntries(resources.map((resource) => [resource, resource === dominantResource ? 1 : 0]));
    const priorities = Object.fromEntries(resources.map((resource) => [resource, 1]));

    tribes[tribeId] = {
      tribe_id: tribeId,
      dominant_resource: dominantResource,
      inventory,
      needs,
      targets,
      reserves,
      production_rates: productionRates,
      priorities,
      local_history: [],
      ...(enableReputation ? { reputation: Object.fromEntries(TRIBE_DEFINITIONS.filter(([otherId]) => otherId !== tribeId).map(([otherId]) => [otherId, 0])) } : {}),
    };
  }

  return {
    config: {
      seed,
      turn_limit: turnLimit,
      global_trust: globalTrust,
      enable_reputation: enableReputation,
      proto_currency_candidates: protoCurrencyCandidates,
      production_shocks: productionShocks.map((shock) => ({ ...shock })),
      norms: { ...norms },
    },
    resources,
    turn: 0,
    tribes,
    proposals: {},
    events: [],
    rng: createRng(seed),
  };
}

export function getVisibleState(world, tribeId) {
  const tribe = world.tribes[tribeId];
  if (!tribe) {
    throw new Error(`Unknown tribe: ${tribeId}`);
  }

  const proposals = Object.values(world.proposals)
    .filter((proposal) => proposal.to_tribe === tribeId || proposal.from_tribe === tribeId)
    .map((proposal) => ({ ...proposal }));

  return {
    tribeId,
    dominantResource: tribe.dominant_resource,
    turn: world.turn,
    trustLevel: world.config.global_trust,
    inventory: { ...tribe.inventory },
    needs: { ...tribe.needs },
    targets: { ...tribe.targets },
    reserves: { ...tribe.reserves },
    productionRates: effectiveProductionRates(world, tribe),
    priorities: { ...tribe.priorities },
    norms: { ...world.config.norms },
    ...(tribe.reputation ? { reputation: { ...tribe.reputation } } : {}),
    localHistory: tribe.local_history.map((event) => ({ ...event })),
    proposals,
  };
}

export function computeDecisionContext(visibleState, proposal) {
  const trustLevel = clamp01(Number(visibleState.trustLevel ?? 0.5));
  const offered = describeReceivedResource(visibleState, proposal);
  const requested = describePaidResource(visibleState, proposal);
  const baseTradeRisk = 0.25;
  const trustAdjustedRisk = roundTo(baseTradeRisk * (1 - trustLevel), 4);
  const grossBenefit = offered.target_gap_benefit;
  const totalCost = roundTo(requested.payment_opportunity_cost + requested.reserve_penalty + trustAdjustedRisk, 4);
  const netUtility = roundTo(grossBenefit - totalCost, 4);
  const minimumNetUtility = Number(visibleState.norms?.minimum_net_utility ?? 0);

  return {
    objective: "reduce unmet resource targets while preserving reserves",
    receive: offered,
    pay: requested,
    exchange: {
      offered_per_requested: roundTo(proposal.offered_quantity / proposal.requested_quantity, 4),
      requested_per_offered: roundTo(proposal.requested_quantity / proposal.offered_quantity, 4),
    },
    trust: {
      trustLevel,
      base_trade_risk: baseTradeRisk,
      trust_adjusted_risk: trustAdjustedRisk,
    },
    norms: {
      minimum_net_utility: minimumNetUtility,
    },
    utility: {
      gross_benefit: grossBenefit,
      total_cost: totalCost,
      net_utility: netUtility,
      recommendation: netUtility > minimumNetUtility ? "accept" : "reject",
    },
  };
}

export function validateAction(action) {
  if (!isPlainObject(action)) {
    return { ok: false, error: "Action must be an object" };
  }

  const schema = ACTION_SCHEMAS[action.type];
  if (!schema) {
    return { ok: false, error: `Unknown action type: ${action.type}` };
  }

  for (const key of Object.keys(action)) {
    if (!schema.includes(key)) {
      return { ok: false, error: `Unknown field: ${key}` };
    }
  }

  for (const key of schema) {
    if (!(key in action)) {
      return { ok: false, error: `Missing field: ${key}` };
    }
  }

  if (action.type === "propose_trade" || action.type === "counter_trade") {
    if (!RESOURCES.includes(action.offered_resource) || !RESOURCES.includes(action.requested_resource)) {
      return { ok: false, error: "Unknown resource" };
    }
    if (!isPositiveInteger(action.offered_quantity) || !isPositiveInteger(action.requested_quantity)) {
      return { ok: false, error: "Trade quantities must be positive integers" };
    }
  }

  return { ok: true, action: { ...action } };
}

export function runSimulation({ seed = "default", turnLimit = 10, globalTrust = 0.5, agents = {}, proposals = [], proposalStrategy = "fixed", enableReputation = false, protoCurrencyCandidates = [], productionShocks = [], norms = {} } = {}) {
  const world = createDefaultWorld({ seed, turnLimit, globalTrust, enableReputation, protoCurrencyCandidates, productionShocks, norms });
  const initialTotals = resourceTotals(world);
  let agentCalls = 0;
  let invalidAgentOutputs = 0;
  let recommendationDecisions = 0;
  let recommendationAgreements = 0;
  let positiveUtilityDecisions = 0;
  let positiveUtilityAcceptances = 0;
  let negativeUtilityDecisions = 0;
  let negativeUtilityAcceptances = 0;
  let highTrustVagueDistrustRejections = 0;

  for (let turn = 1; turn <= turnLimit; turn += 1) {
    world.turn = turn;
    appendEvent(world, { type: "turn_started", turn });

    const proposal = createProposal(world, turn, proposals[turn - 1], proposalStrategy);
    const proposalValidation = validateProposal(world, proposal);

    if (!proposalValidation.ok) {
      proposal.status = "invalid";
      proposal.resolution_reason = proposalValidation.error;
      appendEvent(world, { type: "proposal_invalid", turn, proposal_id: proposal.proposal_id, reason: proposalValidation.error });
      continue;
    }

    appendEvent(world, {
      type: "proposal_created",
      turn,
      proposal_id: proposal.proposal_id,
      from_tribe: proposal.from_tribe,
      to_tribe: proposal.to_tribe,
      offered_resource: proposal.offered_resource,
      offered_quantity: proposal.offered_quantity,
      requested_resource: proposal.requested_resource,
      requested_quantity: proposal.requested_quantity,
    });

    const agent = agents[proposal.to_tribe] ?? defaultResponder(world.config.global_trust, world.rng);
    const visibleState = getVisibleState(world, proposal.to_tribe);
    const decisionContext = computeDecisionContext(visibleState, proposal);

    let action = trustGateAction(world, proposal);
    if (!action) {
      agentCalls += 1;
      action = agent(visibleState, proposal, decisionContext);
    }
    let validation = validateAction(action);

    if (!validation.ok) {
      invalidAgentOutputs += 1;
      appendEvent(world, { type: "agent_output_invalid", turn, proposal_id: proposal.proposal_id, error: validation.error });

      agentCalls += 1;
      action = agent(visibleState, proposal, decisionContext);
      validation = validateAction(action);

      if (validation.ok) {
        appendEvent(world, { type: "agent_output_repaired", turn, proposal_id: proposal.proposal_id });
      } else {
        invalidAgentOutputs += 1;
        proposal.status = "invalid";
        proposal.resolution_reason = "deterministic fallback after invalid output";
        appendEvent(world, { type: "fallback_applied", turn, proposal_id: proposal.proposal_id, reason: proposal.resolution_reason });
        continue;
      }
    }

    const agreement = actionMatchesRecommendation(validation.action, decisionContext);
    if (agreement !== null) {
      recommendationDecisions += 1;
      if (agreement) {
        recommendationAgreements += 1;
      }
    }
    if (isTradeDecision(validation.action)) {
      if (decisionContext.utility.net_utility > 0) {
        positiveUtilityDecisions += 1;
        if (validation.action.type === "accept_trade") {
          positiveUtilityAcceptances += 1;
        }
      } else {
        negativeUtilityDecisions += 1;
        if (validation.action.type === "accept_trade") {
          negativeUtilityAcceptances += 1;
        }
      }
      if (decisionContext.trust.trustLevel >= 0.75 && validation.action.type === "reject_trade" && isVagueDistrustReason(validation.action.reason)) {
        highTrustVagueDistrustRejections += 1;
      }
    }

    applyAction(world, proposal, validation.action);
  }

  appendEvent(world, { type: "run_finished", turn: world.turn });

  const finalTotals = resourceTotals(world);
  const invariants = checkInvariants(world, initialTotals, finalTotals);
  const metrics = computeMetrics(
    world.events,
    agentCalls,
    invalidAgentOutputs,
    recommendationDecisions,
    recommendationAgreements,
    positiveUtilityDecisions,
    positiveUtilityAcceptances,
    negativeUtilityDecisions,
    negativeUtilityAcceptances,
    highTrustVagueDistrustRejections,
  );

  return {
    events: world.events,
    metrics,
    initialTotals,
    finalTotals,
    invariants,
    world: sanitizeWorld(world),
  };
}

export function createSimulationSession({
  seed = "default",
  turnLimit = 10,
  globalTrust = 0.5,
  agents = {},
  proposals = [],
  proposalStrategy = "fixed",
  enableReputation = false,
  protoCurrencyCandidates = [],
  productionShocks = [],
  norms = {},
} = {}) {
  const world = createDefaultWorld({ seed, turnLimit, globalTrust, enableReputation, protoCurrencyCandidates, productionShocks, norms });
  return {
    world,
    agents,
    proposals,
    proposalStrategy,
    initialTotals: resourceTotals(world),
    agentCalls: 0,
    invalidAgentOutputs: 0,
    recommendationDecisions: 0,
    recommendationAgreements: 0,
    positiveUtilityDecisions: 0,
    positiveUtilityAcceptances: 0,
    negativeUtilityDecisions: 0,
    negativeUtilityAcceptances: 0,
    highTrustVagueDistrustRejections: 0,
    finished: false,
    currentProposal: null,
    currentDecision: null,
    currentDecisionContext: null,
    currentDecisionAgreement: null,
    lastTurnEvents: [],
  };
}

export async function advanceSimulationTurn(session) {
  if (session.finished) {
    return getSimulationSnapshot(session);
  }

  const world = session.world;
  const turnLimit = world.config.turn_limit;

  if (world.turn >= turnLimit) {
    finishSession(session);
    return getSimulationSnapshot(session);
  }

  const turnStartIndex = world.events.length;
  const turn = world.turn + 1;
  world.turn = turn;
  session.currentProposal = null;
  session.currentDecision = null;
  session.currentDecisionContext = null;
  session.currentDecisionAgreement = null;

  appendEvent(world, { type: "turn_started", turn });

  const proposal = createProposal(world, turn, session.proposals[turn - 1], session.proposalStrategy);
  session.currentProposal = stableClone(proposal);
  const proposalValidation = validateProposal(world, proposal);

  if (!proposalValidation.ok) {
    proposal.status = "invalid";
    proposal.resolution_reason = proposalValidation.error;
    appendEvent(world, { type: "proposal_invalid", turn, proposal_id: proposal.proposal_id, reason: proposalValidation.error });
    captureTurnEvents(session, turnStartIndex);
    finishIfLimitReached(session);
    return getSimulationSnapshot(session);
  }

  appendEvent(world, {
    type: "proposal_created",
    turn,
    proposal_id: proposal.proposal_id,
    from_tribe: proposal.from_tribe,
    to_tribe: proposal.to_tribe,
    offered_resource: proposal.offered_resource,
    offered_quantity: proposal.offered_quantity,
    requested_resource: proposal.requested_resource,
    requested_quantity: proposal.requested_quantity,
  });

  const visibleState = getVisibleState(world, proposal.to_tribe);
  const decisionContext = computeDecisionContext(visibleState, proposal);
  session.currentDecisionContext = stableClone(decisionContext);
  const agent = session.agents[proposal.to_tribe] ?? defaultResponder(world.config.global_trust, world.rng);

  let action = trustGateAction(world, proposal);
  if (!action) {
    session.agentCalls += 1;
    action = await agent(visibleState, proposal, decisionContext);
  }
  let validation = validateAction(action);

  if (!validation.ok) {
    session.invalidAgentOutputs += 1;
    appendEvent(world, { type: "agent_output_invalid", turn, proposal_id: proposal.proposal_id, error: validation.error });

    session.agentCalls += 1;
    action = await agent(visibleState, proposal, decisionContext);
    validation = validateAction(action);

    if (validation.ok) {
      appendEvent(world, { type: "agent_output_repaired", turn, proposal_id: proposal.proposal_id });
    } else {
      session.invalidAgentOutputs += 1;
      proposal.status = "invalid";
      proposal.resolution_reason = "deterministic fallback after invalid output";
      appendEvent(world, { type: "fallback_applied", turn, proposal_id: proposal.proposal_id, reason: proposal.resolution_reason });
      captureTurnEvents(session, turnStartIndex);
      finishIfLimitReached(session);
      return getSimulationSnapshot(session);
    }
  }

  session.currentDecision = stableClone(validation.action);
  session.currentDecisionAgreement = actionMatchesRecommendation(validation.action, decisionContext);
  if (session.currentDecisionAgreement !== null) {
    session.recommendationDecisions += 1;
    if (session.currentDecisionAgreement) {
      session.recommendationAgreements += 1;
    }
  }
  if (isTradeDecision(validation.action)) {
    if (decisionContext.utility.net_utility > 0) {
      session.positiveUtilityDecisions += 1;
      if (validation.action.type === "accept_trade") {
        session.positiveUtilityAcceptances += 1;
      }
    } else {
      session.negativeUtilityDecisions += 1;
      if (validation.action.type === "accept_trade") {
        session.negativeUtilityAcceptances += 1;
      }
    }
    if (decisionContext.trust.trustLevel >= 0.75 && validation.action.type === "reject_trade" && isVagueDistrustReason(validation.action.reason)) {
      session.highTrustVagueDistrustRejections += 1;
    }
  }
  applyAction(world, proposal, validation.action);
  session.currentProposal = stableClone(proposal);

  captureTurnEvents(session, turnStartIndex);
  finishIfLimitReached(session);
  return getSimulationSnapshot(session);
}

export function getSimulationSnapshot(session) {
  const world = session.world;
  const finalTotals = resourceTotals(world);
  return {
    turn: world.turn,
    turnLimit: world.config.turn_limit,
    finished: session.finished,
    currentProposal: session.currentProposal ? stableClone(session.currentProposal) : null,
    currentDecision: session.currentDecision ? stableClone(session.currentDecision) : null,
    currentDecisionContext: session.currentDecisionContext ? stableClone(session.currentDecisionContext) : null,
    currentDecisionAgreement: session.currentDecisionAgreement,
    turnEvents: session.lastTurnEvents.map((event) => ({ ...event })),
    events: world.events.map((event) => ({ ...event })),
    metrics: computeMetrics(
      world.events,
      session.agentCalls,
      session.invalidAgentOutputs,
      session.recommendationDecisions,
      session.recommendationAgreements,
      session.positiveUtilityDecisions,
      session.positiveUtilityAcceptances,
      session.negativeUtilityDecisions,
      session.negativeUtilityAcceptances,
      session.highTrustVagueDistrustRejections,
    ),
    invariants: checkInvariants(world, session.initialTotals, finalTotals),
    resources: [...world.resources],
    tribes: Object.values(world.tribes).map((tribe) => ({
      tribe_id: tribe.tribe_id,
      dominant_resource: tribe.dominant_resource,
      inventory: { ...tribe.inventory },
      needs: { ...tribe.needs },
      targets: { ...tribe.targets },
      reserves: { ...tribe.reserves },
      production_rates: { ...tribe.production_rates },
      priorities: { ...tribe.priorities },
      ...(tribe.reputation ? { reputation: { ...tribe.reputation } } : {}),
    })),
  };
}

export async function runSimulationAsync({ seed = "default", turnLimit = 10, globalTrust = 0.5, agents = {}, proposals = [], proposalStrategy = "fixed", enableReputation = false, protoCurrencyCandidates = [], productionShocks = [], norms = {} } = {}) {
  const world = createDefaultWorld({ seed, turnLimit, globalTrust, enableReputation, protoCurrencyCandidates, productionShocks, norms });
  const initialTotals = resourceTotals(world);
  let agentCalls = 0;
  let invalidAgentOutputs = 0;
  let recommendationDecisions = 0;
  let recommendationAgreements = 0;
  let positiveUtilityDecisions = 0;
  let positiveUtilityAcceptances = 0;
  let negativeUtilityDecisions = 0;
  let negativeUtilityAcceptances = 0;
  let highTrustVagueDistrustRejections = 0;

  for (let turn = 1; turn <= turnLimit; turn += 1) {
    world.turn = turn;
    appendEvent(world, { type: "turn_started", turn });

    const proposal = createProposal(world, turn, proposals[turn - 1], proposalStrategy);
    const proposalValidation = validateProposal(world, proposal);

    if (!proposalValidation.ok) {
      proposal.status = "invalid";
      proposal.resolution_reason = proposalValidation.error;
      appendEvent(world, { type: "proposal_invalid", turn, proposal_id: proposal.proposal_id, reason: proposalValidation.error });
      continue;
    }

    appendEvent(world, {
      type: "proposal_created",
      turn,
      proposal_id: proposal.proposal_id,
      from_tribe: proposal.from_tribe,
      to_tribe: proposal.to_tribe,
      offered_resource: proposal.offered_resource,
      offered_quantity: proposal.offered_quantity,
      requested_resource: proposal.requested_resource,
      requested_quantity: proposal.requested_quantity,
    });

    const agent = agents[proposal.to_tribe] ?? defaultResponder(world.config.global_trust, world.rng);
    const visibleState = getVisibleState(world, proposal.to_tribe);
    const decisionContext = computeDecisionContext(visibleState, proposal);

    let action = trustGateAction(world, proposal);
    if (!action) {
      agentCalls += 1;
      action = await agent(visibleState, proposal, decisionContext);
    }
    let validation = validateAction(action);

    if (!validation.ok) {
      invalidAgentOutputs += 1;
      appendEvent(world, { type: "agent_output_invalid", turn, proposal_id: proposal.proposal_id, error: validation.error });

      agentCalls += 1;
      action = await agent(visibleState, proposal, decisionContext);
      validation = validateAction(action);

      if (validation.ok) {
        appendEvent(world, { type: "agent_output_repaired", turn, proposal_id: proposal.proposal_id });
      } else {
        invalidAgentOutputs += 1;
        proposal.status = "invalid";
        proposal.resolution_reason = "deterministic fallback after invalid output";
        appendEvent(world, { type: "fallback_applied", turn, proposal_id: proposal.proposal_id, reason: proposal.resolution_reason });
        continue;
      }
    }

    const agreement = actionMatchesRecommendation(validation.action, decisionContext);
    if (agreement !== null) {
      recommendationDecisions += 1;
      if (agreement) {
        recommendationAgreements += 1;
      }
    }
    if (isTradeDecision(validation.action)) {
      if (decisionContext.utility.net_utility > 0) {
        positiveUtilityDecisions += 1;
        if (validation.action.type === "accept_trade") {
          positiveUtilityAcceptances += 1;
        }
      } else {
        negativeUtilityDecisions += 1;
        if (validation.action.type === "accept_trade") {
          negativeUtilityAcceptances += 1;
        }
      }
      if (decisionContext.trust.trustLevel >= 0.75 && validation.action.type === "reject_trade" && isVagueDistrustReason(validation.action.reason)) {
        highTrustVagueDistrustRejections += 1;
      }
    }

    applyAction(world, proposal, validation.action);
  }

  appendEvent(world, { type: "run_finished", turn: world.turn });

  const finalTotals = resourceTotals(world);
  const invariants = checkInvariants(world, initialTotals, finalTotals);
  const metrics = computeMetrics(
    world.events,
    agentCalls,
    invalidAgentOutputs,
    recommendationDecisions,
    recommendationAgreements,
    positiveUtilityDecisions,
    positiveUtilityAcceptances,
    negativeUtilityDecisions,
    negativeUtilityAcceptances,
    highTrustVagueDistrustRejections,
  );

  return {
    events: world.events,
    metrics,
    initialTotals,
    finalTotals,
    invariants,
    world: sanitizeWorld(world),
  };
}

function captureTurnEvents(session, turnStartIndex) {
  session.lastTurnEvents = session.world.events.slice(turnStartIndex).map((event) => ({ ...event }));
}

function finishIfLimitReached(session) {
  if (session.world.turn >= session.world.config.turn_limit) {
    finishSession(session);
  }
}

function finishSession(session) {
  if (session.finished) {
    return;
  }
  appendEvent(session.world, { type: "run_finished", turn: session.world.turn });
  session.lastTurnEvents = [...session.lastTurnEvents, { type: "run_finished", turn: session.world.turn }];
  session.finished = true;
}

export function createLlmAgent({ provider }) {
  if (typeof provider !== "function") {
    throw new Error("createLlmAgent requires a provider function");
  }

  return async (visibleState, proposal, decisionContext = null) => provider({
    visibleState: stableClone(visibleState),
    proposal: stableClone(proposal),
    decisionContext: decisionContext ? stableClone(decisionContext) : null,
    allowedActions: Object.keys(ACTION_SCHEMAS),
  });
}

export function buildReplaySummary(run) {
  const turnMap = new Map();
  for (const event of run.events) {
    const turn = event.turn ?? 0;
    if (!turnMap.has(turn)) {
      turnMap.set(turn, []);
    }
    turnMap.get(turn).push({ ...event });
  }

  return {
    config: { ...run.world.config },
    resources: [...run.world.resources],
    metrics: { ...run.metrics },
    invariants: stableClone(run.invariants),
    turns: [...turnMap.entries()]
      .filter(([turn]) => turn > 0)
      .sort(([a], [b]) => a - b)
      .map(([turn, events]) => ({ turn, events })),
    tribes: Object.values(run.world.tribes).map((tribe) => ({
      tribe_id: tribe.tribe_id,
      dominant_resource: tribe.dominant_resource,
      inventory: { ...tribe.inventory },
      needs: { ...tribe.needs },
      targets: { ...tribe.targets },
      reserves: { ...tribe.reserves },
      production_rates: { ...tribe.production_rates },
      priorities: { ...tribe.priorities },
      ...(tribe.reputation ? { reputation: { ...tribe.reputation } } : {}),
    })),
  };
}

function createProposal(world, turn, plannedProposal, proposalStrategy) {
  const source = plannedProposal ?? (proposalStrategy === "auto" ? createAutoProposal(world, turn) : {
    from_tribe: "fishers",
    to_tribe: "fruiters",
    offered_resource: "fish",
    offered_quantity: 1,
    requested_resource: "fruit",
    requested_quantity: 1,
  });

  const proposal = {
    proposal_id: `proposal-${turn}`,
    turn,
    from_tribe: source.from_tribe,
    to_tribe: source.to_tribe,
    offered_resource: source.offered_resource,
    offered_quantity: source.offered_quantity,
    requested_resource: source.requested_resource,
    requested_quantity: source.requested_quantity,
    status: "pending",
    resolution_reason: "",
  };

  world.proposals[proposal.proposal_id] = proposal;
  return proposal;
}

function effectiveProductionRates(world, tribe) {
  const rates = { ...tribe.production_rates };
  for (const shock of world.config.production_shocks ?? []) {
    if (shock.turn === world.turn && shock.tribe_id === tribe.tribe_id && shock.resource in rates) {
      rates[shock.resource] = Number(shock.production_rate ?? rates[shock.resource]);
    }
  }
  return rates;
}

function describeReceivedResource(visibleState, proposal) {
  const resource = proposal.offered_resource;
  const quantity = proposal.offered_quantity;
  const target = resourceTarget(visibleState, resource);
  const before = resourceInventory(visibleState, resource);
  const after = before + quantity;
  const gapBefore = resourceGap(target, before);
  const gapAfter = resourceGap(target, after);

  return {
    resource,
    quantity,
    target,
    inventory_before: before,
    inventory_after: after,
    gap_before: gapBefore,
    gap_after: gapAfter,
    target_gap_benefit: roundTo((gapBefore - gapAfter) * resourcePriority(visibleState, resource), 4),
  };
}

function describePaidResource(visibleState, proposal) {
  const resource = proposal.requested_resource;
  const quantity = proposal.requested_quantity;
  const target = resourceTarget(visibleState, resource);
  const reserve = resourceReserve(visibleState, resource);
  const productionRate = resourceProductionRate(visibleState, resource);
  const before = resourceInventory(visibleState, resource);
  const after = before - quantity;
  const gapBefore = resourceGap(target, before);
  const gapAfter = resourceGap(target, after);
  const newGapCost = (Math.max(0, gapAfter - gapBefore) * resourcePriority(visibleState, resource)) / (1 + productionRate);
  const reservePenalty = Math.max(0, reserve - after);

  return {
    resource,
    quantity,
    target,
    reserve,
    production_rate: productionRate,
    inventory_before: before,
    inventory_after: after,
    gap_before: gapBefore,
    gap_after: gapAfter,
    payment_opportunity_cost: roundTo(newGapCost, 4),
    reserve_penalty: roundTo(reservePenalty, 4),
  };
}

function resourceTarget(visibleState, resource) {
  return Number(visibleState.targets?.[resource] ?? visibleState.needs?.[resource] ?? 0);
}

function resourceInventory(visibleState, resource) {
  return Number(visibleState.inventory?.[resource] ?? 0);
}

function resourceReserve(visibleState, resource) {
  return Number(visibleState.reserves?.[resource] ?? 1);
}

function resourceProductionRate(visibleState, resource) {
  return Number(visibleState.productionRates?.[resource] ?? (visibleState.dominantResource === resource ? 1 : 0));
}

function resourcePriority(visibleState, resource) {
  return Number(visibleState.priorities?.[resource] ?? 1);
}

function resourceGap(target, inventory) {
  return Math.max(0, target - inventory);
}

function createAutoProposal(world, turn) {
  const tribeIds = Object.keys(world.tribes);
  const fromTribeId = tribeIds[(turn - 1) % tribeIds.length];
  const from = world.tribes[fromTribeId];
  const requestedResource = world.resources.find((resource) => from.needs[resource] > 0 && from.inventory[resource] < from.needs[resource]) ?? nextNonDominantResource(world, from.dominant_resource);
  const toTribeId = tribeIds.find((tribeId) => tribeId !== fromTribeId && world.tribes[tribeId].dominant_resource === requestedResource)
    ?? tribeIds.find((tribeId) => tribeId !== fromTribeId && world.tribes[tribeId].inventory[requestedResource] > 0);

  return {
    from_tribe: fromTribeId,
    to_tribe: toTribeId,
    offered_resource: from.dominant_resource,
    offered_quantity: 1,
    requested_resource: requestedResource,
    requested_quantity: 1,
  };
}

function nextNonDominantResource(world, dominantResource) {
  return world.resources.find((resource) => resource !== dominantResource);
}

function validateProposal(world, proposal) {
  if (!world.tribes[proposal.from_tribe]) {
    return { ok: false, error: `Unknown from_tribe: ${proposal.from_tribe}` };
  }
  if (!world.tribes[proposal.to_tribe]) {
    return { ok: false, error: `Unknown to_tribe: ${proposal.to_tribe}` };
  }
  if (!world.resources.includes(proposal.offered_resource) || !world.resources.includes(proposal.requested_resource)) {
    return { ok: false, error: "Unknown proposal resource" };
  }
  if (!isPositiveInteger(proposal.offered_quantity) || !isPositiveInteger(proposal.requested_quantity)) {
    return { ok: false, error: "Proposal quantities must be positive integers" };
  }
  if (!canSettle(world, proposal)) {
    return { ok: false, error: "Proposal cannot settle with current inventories" };
  }
  return { ok: true };
}

function defaultResponder(globalTrust, rng) {
  return (_visibleState, proposal) => {
    const threshold = rng();
    if (globalTrust >= threshold) {
      return { type: "accept_trade", proposal_id: proposal.proposal_id, reason: "The offer seems trustworthy enough." };
    }
    return { type: "reject_trade", proposal_id: proposal.proposal_id, reason: "The offer does not seem trustworthy enough." };
  };
}

function actionMatchesRecommendation(action, decisionContext) {
  const recommendation = decisionContext?.utility?.recommendation;
  if (!recommendation || !["accept_trade", "reject_trade"].includes(action?.type)) {
    return null;
  }
  return (recommendation === "accept" && action.type === "accept_trade") || (recommendation === "reject" && action.type === "reject_trade");
}

function isTradeDecision(action) {
  return ["accept_trade", "reject_trade"].includes(action?.type);
}

function isVagueDistrustReason(reason) {
  const normalized = String(reason ?? "").toLowerCase();
  const mentionsDistrust = /\b(distrust|do not trust|don't trust|not trust|trust is too low|mistrust|deception|misleading)\b/.test(normalized);
  const citesLedger = /\b(benefit|cost|reserve|risk|utility|inventory|need|gap|shortage|afford|target)\b/.test(normalized);
  return mentionsDistrust && !citesLedger;
}

function trustGateAction(world, proposal) {
  if (world.config.global_trust > 0) {
    return null;
  }

  return {
    type: "reject_trade",
    proposal_id: proposal.proposal_id,
    reason: "Trust is zero, so I assume the counterparty may be misleading me and refuse the exchange.",
  };
}

function applyAction(world, proposal, action) {
  if (action.type === "accept_trade" && action.proposal_id === proposal.proposal_id) {
    if (canSettle(world, proposal)) {
      settleTrade(world, proposal, action.reason);
    } else {
      proposal.status = "invalid";
      proposal.resolution_reason = "settlement failed resource checks";
      appendEvent(world, { type: "fallback_applied", turn: world.turn, proposal_id: proposal.proposal_id, reason: proposal.resolution_reason });
    }
    return;
  }

  if (action.type === "reject_trade" && action.proposal_id === proposal.proposal_id) {
    proposal.status = "rejected";
    proposal.resolution_reason = action.reason;
    updateReputation(world, proposal, -1);
    appendEvent(world, { type: "proposal_rejected", turn: world.turn, proposal_id: proposal.proposal_id, reason: action.reason });
    return;
  }

  if (action.type === "counter_trade" && action.proposal_id === proposal.proposal_id) {
    proposal.status = "rejected";
    proposal.resolution_reason = action.reason;
    updateReputation(world, proposal, -1);
    appendEvent(world, {
      type: "counter_proposed",
      turn: world.turn,
      proposal_id: proposal.proposal_id,
      offered_resource: action.offered_resource,
      offered_quantity: action.offered_quantity,
      requested_resource: action.requested_resource,
      requested_quantity: action.requested_quantity,
      reason: action.reason,
    });
    return;
  }

  proposal.status = "invalid";
  proposal.resolution_reason = "action did not match active proposal";
  appendEvent(world, { type: "fallback_applied", turn: world.turn, proposal_id: proposal.proposal_id, reason: proposal.resolution_reason });
}

function canSettle(world, proposal) {
  const from = world.tribes[proposal.from_tribe];
  const to = world.tribes[proposal.to_tribe];
  return (
    from.inventory[proposal.offered_resource] >= proposal.offered_quantity &&
    to.inventory[proposal.requested_resource] >= proposal.requested_quantity
  );
}

function settleTrade(world, proposal, reason) {
  const from = world.tribes[proposal.from_tribe];
  const to = world.tribes[proposal.to_tribe];

  from.inventory[proposal.offered_resource] -= proposal.offered_quantity;
  to.inventory[proposal.offered_resource] += proposal.offered_quantity;
  to.inventory[proposal.requested_resource] -= proposal.requested_quantity;
  from.inventory[proposal.requested_resource] += proposal.requested_quantity;

  proposal.status = "accepted";
  proposal.resolution_reason = reason;
  updateReputation(world, proposal, 1);

  appendEvent(world, { type: "proposal_accepted", turn: world.turn, proposal_id: proposal.proposal_id, reason });
  appendEvent(world, { type: "trade_settled", turn: world.turn, proposal_id: proposal.proposal_id });
}

function updateReputation(world, proposal, delta) {
  const from = world.tribes[proposal.from_tribe];
  const to = world.tribes[proposal.to_tribe];
  if (!from.reputation || !to.reputation) {
    return;
  }
  from.reputation[proposal.to_tribe] += delta;
  to.reputation[proposal.from_tribe] += delta;
}

function appendEvent(world, event) {
  const stored = stableClone(event);
  world.events.push(stored);
  for (const tribe of Object.values(world.tribes)) {
    if (eventInvolvesTribe(world, stored, tribe.tribe_id)) {
      tribe.local_history.push(stored);
    }
  }
}

function eventInvolvesTribe(world, event, tribeId) {
  if (event.from_tribe === tribeId || event.to_tribe === tribeId) {
    return true;
  }
  if (!event.proposal_id) {
    return false;
  }
  const proposal = world.proposals[event.proposal_id];
  return proposal?.from_tribe === tribeId || proposal?.to_tribe === tribeId;
}

function computeMetrics(
  events,
  agentCalls,
  invalidAgentOutputs,
  recommendationDecisions = 0,
  recommendationAgreements = 0,
  positiveUtilityDecisions = 0,
  positiveUtilityAcceptances = 0,
  negativeUtilityDecisions = 0,
  negativeUtilityAcceptances = 0,
  highTrustVagueDistrustRejections = 0,
) {
  const validTradeProposals = events.filter((event) => event.type === "proposal_created").length;
  const acceptedProposals = events.filter((event) => event.type === "proposal_accepted").length;
  const rejectedProposals = events.filter((event) => event.type === "proposal_rejected").length;
  const completedTrades = events.filter((event) => event.type === "trade_settled").length;

  return {
    valid_trade_proposals: validTradeProposals,
    accepted_proposals: acceptedProposals,
    rejected_proposals: rejectedProposals,
    counter_proposals: events.filter((event) => event.type === "counter_proposed").length,
    completed_trades: completedTrades,
    trade_completion_rate: rate(completedTrades, validTradeProposals),
    acceptance_rate: rate(acceptedProposals, validTradeProposals),
    rejection_rate: rate(rejectedProposals, validTradeProposals),
    invalid_agent_outputs: invalidAgentOutputs,
    agent_calls: agentCalls,
    invalid_output_rate: rate(invalidAgentOutputs, agentCalls),
    recommendation_decisions: recommendationDecisions,
    recommendation_agreements: recommendationAgreements,
    recommendation_agreement_rate: rate(recommendationAgreements, recommendationDecisions),
    positive_utility_decisions: positiveUtilityDecisions,
    positive_utility_acceptances: positiveUtilityAcceptances,
    positive_utility_acceptance_rate: rate(positiveUtilityAcceptances, positiveUtilityDecisions),
    negative_utility_decisions: negativeUtilityDecisions,
    negative_utility_acceptances: negativeUtilityAcceptances,
    negative_utility_acceptance_rate: rate(negativeUtilityAcceptances, negativeUtilityDecisions),
    high_trust_vague_distrust_rejections: highTrustVagueDistrustRejections,
  };
}

function resourceTotals(world) {
  const totals = Object.fromEntries(world.resources.map((resource) => [resource, 0]));
  for (const tribe of Object.values(world.tribes)) {
    for (const resource of world.resources) {
      totals[resource] += tribe.inventory[resource];
    }
  }
  return totals;
}

function checkInvariants(world, initialTotals, finalTotals) {
  const violations = [];

  for (const [tribeId, tribe] of Object.entries(world.tribes)) {
    for (const [resource, quantity] of Object.entries(tribe.inventory)) {
      if (quantity < 0) {
        violations.push(`${tribeId}.${resource} inventory below zero`);
      }
    }
  }

  for (const resource of world.resources) {
    if (initialTotals[resource] !== finalTotals[resource]) {
      violations.push(`${resource} total changed from ${initialTotals[resource]} to ${finalTotals[resource]}`);
    }
  }

  return { violations };
}

function sanitizeWorld(world) {
  return {
    config: { ...world.config },
    resources: [...world.resources],
    turn: world.turn,
    tribes: stableClone(world.tribes),
    proposals: stableClone(world.proposals),
  };
}

function createRng(seed) {
  let state = hashSeed(seed);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function hashSeed(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rate(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function roundTo(value, places) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function stableClone(value) {
  return JSON.parse(JSON.stringify(value));
}
