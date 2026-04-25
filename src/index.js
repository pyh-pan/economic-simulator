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
  explain: ["type", "text"],
};

export function createDefaultWorld({ seed = "default", turnLimit = 10, globalTrust = 0.5, enableReputation = false, protoCurrencyCandidates = [] } = {}) {
  const tribes = {};
  const resources = [...RESOURCES, ...protoCurrencyCandidates.filter((resource) => !RESOURCES.includes(resource))];

  for (const [tribeId, dominantResource] of TRIBE_DEFINITIONS) {
    const inventory = Object.fromEntries(resources.map((resource) => [resource, resource === dominantResource ? 10 : resource === "shells" ? 2 : 1]));
    const needs = Object.fromEntries(resources.map((resource) => [resource, resource === dominantResource || protoCurrencyCandidates.includes(resource) ? 0 : 3]));

    tribes[tribeId] = {
      tribe_id: tribeId,
      dominant_resource: dominantResource,
      inventory,
      needs,
      local_history: [],
      ...(enableReputation ? { reputation: Object.fromEntries(TRIBE_DEFINITIONS.filter(([otherId]) => otherId !== tribeId).map(([otherId]) => [otherId, 0])) } : {}),
    };
  }

  return {
    config: { seed, turn_limit: turnLimit, global_trust: globalTrust, enable_reputation: enableReputation, proto_currency_candidates: protoCurrencyCandidates },
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
    ...(tribe.reputation ? { reputation: { ...tribe.reputation } } : {}),
    localHistory: tribe.local_history.map((event) => ({ ...event })),
    proposals,
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

  if (action.type === "propose_trade") {
    if (!RESOURCES.includes(action.offered_resource) || !RESOURCES.includes(action.requested_resource)) {
      return { ok: false, error: "Unknown resource" };
    }
    if (!isPositiveInteger(action.offered_quantity) || !isPositiveInteger(action.requested_quantity)) {
      return { ok: false, error: "Trade quantities must be positive integers" };
    }
  }

  return { ok: true, action: { ...action } };
}

export function runSimulation({ seed = "default", turnLimit = 10, globalTrust = 0.5, agents = {}, proposals = [], proposalStrategy = "fixed", enableReputation = false, protoCurrencyCandidates = [] } = {}) {
  const world = createDefaultWorld({ seed, turnLimit, globalTrust, enableReputation, protoCurrencyCandidates });
  const initialTotals = resourceTotals(world);
  let agentCalls = 0;
  let invalidAgentOutputs = 0;

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

    let action = trustGateAction(world, proposal);
    if (!action) {
      agentCalls += 1;
      action = agent(visibleState, proposal);
    }
    let validation = validateAction(action);

    if (!validation.ok) {
      invalidAgentOutputs += 1;
      appendEvent(world, { type: "agent_output_invalid", turn, proposal_id: proposal.proposal_id, error: validation.error });

      agentCalls += 1;
      action = agent(visibleState, proposal);
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

    applyAction(world, proposal, validation.action);
  }

  appendEvent(world, { type: "run_finished", turn: world.turn });

  const finalTotals = resourceTotals(world);
  const invariants = checkInvariants(world, initialTotals, finalTotals);
  const metrics = computeMetrics(world.events, agentCalls, invalidAgentOutputs);

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
} = {}) {
  const world = createDefaultWorld({ seed, turnLimit, globalTrust, enableReputation, protoCurrencyCandidates });
  return {
    world,
    agents,
    proposals,
    proposalStrategy,
    initialTotals: resourceTotals(world),
    agentCalls: 0,
    invalidAgentOutputs: 0,
    finished: false,
    currentProposal: null,
    currentDecision: null,
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
  const agent = session.agents[proposal.to_tribe] ?? defaultResponder(world.config.global_trust, world.rng);

  let action = trustGateAction(world, proposal);
  if (!action) {
    session.agentCalls += 1;
    action = await agent(visibleState, proposal);
  }
  let validation = validateAction(action);

  if (!validation.ok) {
    session.invalidAgentOutputs += 1;
    appendEvent(world, { type: "agent_output_invalid", turn, proposal_id: proposal.proposal_id, error: validation.error });

    session.agentCalls += 1;
    action = await agent(visibleState, proposal);
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
    turnEvents: session.lastTurnEvents.map((event) => ({ ...event })),
    events: world.events.map((event) => ({ ...event })),
    metrics: computeMetrics(world.events, session.agentCalls, session.invalidAgentOutputs),
    invariants: checkInvariants(world, session.initialTotals, finalTotals),
    resources: [...world.resources],
    tribes: Object.values(world.tribes).map((tribe) => ({
      tribe_id: tribe.tribe_id,
      dominant_resource: tribe.dominant_resource,
      inventory: { ...tribe.inventory },
      needs: { ...tribe.needs },
      ...(tribe.reputation ? { reputation: { ...tribe.reputation } } : {}),
    })),
  };
}

export async function runSimulationAsync({ seed = "default", turnLimit = 10, globalTrust = 0.5, agents = {}, proposals = [], proposalStrategy = "fixed", enableReputation = false, protoCurrencyCandidates = [] } = {}) {
  const world = createDefaultWorld({ seed, turnLimit, globalTrust, enableReputation, protoCurrencyCandidates });
  const initialTotals = resourceTotals(world);
  let agentCalls = 0;
  let invalidAgentOutputs = 0;

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

    let action = trustGateAction(world, proposal);
    if (!action) {
      agentCalls += 1;
      action = await agent(visibleState, proposal);
    }
    let validation = validateAction(action);

    if (!validation.ok) {
      invalidAgentOutputs += 1;
      appendEvent(world, { type: "agent_output_invalid", turn, proposal_id: proposal.proposal_id, error: validation.error });

      agentCalls += 1;
      action = await agent(visibleState, proposal);
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

    applyAction(world, proposal, validation.action);
  }

  appendEvent(world, { type: "run_finished", turn: world.turn });

  const finalTotals = resourceTotals(world);
  const invariants = checkInvariants(world, initialTotals, finalTotals);
  const metrics = computeMetrics(world.events, agentCalls, invalidAgentOutputs);

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

  return async (visibleState, proposal) => provider({
    visibleState: stableClone(visibleState),
    proposal: stableClone(proposal),
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

function computeMetrics(events, agentCalls, invalidAgentOutputs) {
  const validTradeProposals = events.filter((event) => event.type === "proposal_created").length;
  const acceptedProposals = events.filter((event) => event.type === "proposal_accepted").length;
  const rejectedProposals = events.filter((event) => event.type === "proposal_rejected").length;
  const completedTrades = events.filter((event) => event.type === "trade_settled").length;

  return {
    valid_trade_proposals: validTradeProposals,
    accepted_proposals: acceptedProposals,
    rejected_proposals: rejectedProposals,
    completed_trades: completedTrades,
    trade_completion_rate: rate(completedTrades, validTradeProposals),
    acceptance_rate: rate(acceptedProposals, validTradeProposals),
    rejection_rate: rate(rejectedProposals, validTradeProposals),
    invalid_agent_outputs: invalidAgentOutputs,
    agent_calls: agentCalls,
    invalid_output_rate: rate(invalidAgentOutputs, agentCalls),
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

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function stableClone(value) {
  return JSON.parse(JSON.stringify(value));
}
