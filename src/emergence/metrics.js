export function buildEmergenceMetrics(run) {
  const resources = run?.world?.config?.resources ?? [];
  const agents = run?.world?.agents ?? [];
  const events = run?.events ?? [];
  const proposalEvents = events.filter((event) => event.type === "proposal_created");
  const acceptedEvents = events.filter((event) => event.type === "proposal_accepted");
  const rejectedEvents = events.filter((event) => event.type === "proposal_rejected");
  const proposalsById = new Map(proposalEvents.map((event) => [event.proposal_id, event]));
  const acceptedProposals = proposalsForEvents(acceptedEvents, proposalsById);
  const rejectedProposals = proposalsForEvents(rejectedEvents, proposalsById);
  const centralityByAgent = buildCentralityByAgent(agents, acceptedProposals);

  return {
    macro: buildMacroMetrics({ run, agents, proposalEvents, acceptedProposals, rejectedProposals, centralityByAgent }),
    resources: Object.fromEntries(
      resources.map((resource) => [
        resource,
        buildResourceMetrics(resource, { agents, proposalEvents, acceptedProposals, centralityByAgent }),
      ]),
    ),
    agents: agents.map((agent) => ({
      agent_id: agent.id,
      archetype: agent.archetype,
      production_type: agent.production_type,
      unmet_need: agent.unmet_need ?? 0,
      trade_success_count: acceptedProposals.filter((proposal) => involvesAgent(proposal, agent.id)).length,
      rejection_count: rejectedProposals.filter((proposal) => involvesAgent(proposal, agent.id)).length,
      centrality: centralityByAgent.get(agent.id) ?? 0,
    })),
  };
}

function buildMacroMetrics({ run, agents, proposalEvents, acceptedProposals, rejectedProposals, centralityByAgent }) {
  const unmetNeed = totalUnmetNeed(run, agents);
  const networkDensity = buildNetworkDensity(agents, acceptedProposals);

  return {
    trade_completion_rate: rate(acceptedProposals.length, proposalEvents.length),
    unmet_need_rate: unmetNeed.rate,
    average_search_cost: average(rejectedProposals.length, agents.length),
    network_density: networkDensity,
    network_centralization: buildNetworkCentralization(agents, centralityByAgent),
    resource_inequality: buildAverageResourceInequality(run, agents),
    welfare_proxy: round(rate(acceptedProposals.length, proposalEvents.length) * (1 - unmetNeed.rate)),
  };
}

function buildResourceMetrics(resource, { agents, proposalEvents, acceptedProposals }) {
  const acceptedWithResource = acceptedProposals.filter((proposal) => proposalUsesResource(proposal, resource));
  const proposalsWithResource = proposalEvents.filter((proposal) => proposalUsesResource(proposal, resource));
  const firstAcceptedTurn = acceptedWithResource[0]?.turn;
  const beforeFirstAcceptance = firstAcceptedTurn
    ? proposalsWithResource.filter((proposal) => proposal.turn < firstAcceptedTurn)
    : proposalsWithResource;
  const afterFirstAcceptance = firstAcceptedTurn ? proposalsWithResource.filter((proposal) => proposal.turn > firstAcceptedTurn) : [];
  const beforeAcceptanceCost = rejectionRate(beforeFirstAcceptance, acceptedProposals);
  const afterAcceptanceCost = rejectionRate(afterFirstAcceptance, acceptedProposals);

  return {
    acceptance_breadth: rate(countUnique(acceptedWithResource.flatMap((proposal) => [proposal.from_agent, proposal.to_agent])), agents.length),
    acceptance_context_diversity: rate(countUnique(acceptedWithResource.map((proposal) => resourceContext(proposal, resource))), 2),
    pass_through_rate: buildPassThroughRate(resource, acceptedProposals),
    non_consumption_holding: buildNonConsumptionHolding(resource, agents),
    trade_bridge_count: countUnique(acceptedWithResource.map((proposal) => agentPairKey(proposal.from_agent, proposal.to_agent))),
    search_cost_reduction_after_acceptance: clamp(beforeAcceptanceCost - afterAcceptanceCost),
    repeat_acceptance_stability: rate(Math.max(0, acceptedWithResource.length - 1), Math.max(0, proposalsWithResource.length - 1)),
  };
}

function proposalsForEvents(resolutionEvents, proposalsById) {
  return resolutionEvents
    .map((event) => proposalsById.get(event.proposal_id))
    .filter(Boolean);
}

function totalUnmetNeed(run, agents) {
  const needSlotsByAgent = new Map(
    agents.map((agent) => [agent.id, Object.values(agent.needs ?? {}).filter((need) => need > 0).length]),
  );
  const needsEvents = (run?.events ?? []).filter((event) => event.type === "needs_checked");
  const totalUnmet = needsEvents.reduce((sum, event) => sum + (event.unmet_need ?? 0), 0);
  const totalPossible = needsEvents.reduce((sum, event) => sum + (needSlotsByAgent.get(event.agent_id) ?? 0), 0);

  return { total: totalUnmet, rate: rate(totalUnmet, totalPossible) };
}

function buildCentralityByAgent(agents, acceptedProposals) {
  const neighborsByAgent = new Map(agents.map((agent) => [agent.id, new Set()]));
  const possibleNeighbors = Math.max(0, agents.length - 1);

  for (const proposal of acceptedProposals) {
    neighborsByAgent.get(proposal.from_agent)?.add(proposal.to_agent);
    neighborsByAgent.get(proposal.to_agent)?.add(proposal.from_agent);
  }

  return new Map(
    agents.map((agent) => [agent.id, rate(neighborsByAgent.get(agent.id)?.size ?? 0, possibleNeighbors)]),
  );
}

function buildNetworkDensity(agents, acceptedProposals) {
  const possibleEdges = (agents.length * (agents.length - 1)) / 2;
  const acceptedEdges = countUnique(acceptedProposals.map((proposal) => agentPairKey(proposal.from_agent, proposal.to_agent)));

  return rate(acceptedEdges, possibleEdges);
}

function buildNetworkCentralization(agents, centralityByAgent) {
  if (agents.length <= 2) {
    return 0;
  }

  const degrees = agents.map((agent) => (centralityByAgent.get(agent.id) ?? 0) * (agents.length - 1));
  const maxDegree = Math.max(0, ...degrees);
  const centralization = degrees.reduce((sum, degree) => sum + maxDegree - degree, 0) / ((agents.length - 1) * (agents.length - 2));

  return round(clamp(centralization));
}

function buildAverageResourceInequality(run, agents) {
  const resources = run?.world?.config?.resources ?? [];

  return rate(
    resources.reduce((sum, resource) => sum + gini(agents.map((agent) => agent.inventory?.[resource] ?? 0)), 0),
    resources.length,
  );
}

function buildPassThroughRate(resource, acceptedProposals) {
  const receivedTurnsByAgent = new Map();
  let passThroughCount = 0;
  let receivedCount = 0;

  for (const proposal of acceptedProposals) {
    if (proposal.requested_resource === resource) {
      receivedCount += 1;
      receivedTurnsByAgent.set(proposal.from_agent, proposal.turn);
    }

    if (proposal.offered_resource === resource) {
      const previousReceivedTurn = receivedTurnsByAgent.get(proposal.from_agent);
      if (previousReceivedTurn !== undefined && previousReceivedTurn < proposal.turn) {
        passThroughCount += 1;
      }
      receivedCount += 1;
      receivedTurnsByAgent.set(proposal.to_agent, proposal.turn);
    }
  }

  return rate(passThroughCount, receivedCount);
}

function buildNonConsumptionHolding(resource, agents) {
  const totalHeld = agents.reduce((sum, agent) => sum + (agent.inventory?.[resource] ?? 0), 0);
  const heldWithoutNeed = agents
    .filter((agent) => (agent.needs?.[resource] ?? 0) === 0)
    .reduce((sum, agent) => sum + (agent.inventory?.[resource] ?? 0), 0);

  return rate(heldWithoutNeed, totalHeld);
}

function rejectionRate(proposals, acceptedProposals) {
  const acceptedIds = new Set(acceptedProposals.map((proposal) => proposal.proposal_id));
  const rejectedCount = proposals.filter((proposal) => !acceptedIds.has(proposal.proposal_id)).length;

  return rate(rejectedCount, proposals.length);
}

function proposalUsesResource(proposal, resource) {
  return proposal.offered_resource === resource || proposal.requested_resource === resource;
}

function resourceContext(proposal, resource) {
  if (proposal.offered_resource === resource) {
    return "offered";
  }
  if (proposal.requested_resource === resource) {
    return "requested";
  }
  return "absent";
}

function involvesAgent(proposal, agentId) {
  return proposal.from_agent === agentId || proposal.to_agent === agentId;
}

function agentPairKey(left, right) {
  return [left, right].toSorted().join(":");
}

function countUnique(values) {
  return new Set(values).size;
}

function gini(values) {
  const sorted = values.toSorted((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);

  if (total === 0 || sorted.length === 0) {
    return 0;
  }

  const weightedSum = sorted.reduce((sum, value, index) => sum + (index + 1) * value, 0);
  return round((2 * weightedSum) / (sorted.length * total) - (sorted.length + 1) / sorted.length);
}

function rate(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  return round(clamp(numerator / denominator));
}

function average(total, count) {
  if (!Number.isFinite(total) || !Number.isFinite(count) || count <= 0) {
    return 0;
  }

  return round(total / count);
}

function clamp(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
