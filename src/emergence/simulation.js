import { createEmergenceWorld } from "./world.js";

export function runEmergenceSimulation(options = {}) {
  const world = createEmergenceWorld(options);
  const events = world.events;
  const initialTotals = resourceTotals(world);
  const producedTotals = zeroTotals(world.config.resources);
  const consumedTotals = zeroTotals(world.config.resources);

  for (let turn = 1; turn <= world.config.turn_limit; turn += 1) {
    world.turn = turn;
    appendEvent(world, { type: "turn_started", turn });

    for (const agent of world.agents) {
      agent.inventory[agent.production_type] += 1;
      producedTotals[agent.production_type] += 1;
      appendEvent(world, {
        type: "agent_produced",
        turn,
        agent_id: agent.id,
        resource: agent.production_type,
        quantity: 1,
      });
    }

    for (const agent of world.agents) {
      const needsResult = consumeNeeds(agent, world.config.resources);
      addTotals(consumedTotals, needsResult.consumedResources);
      const unmetNeed = needsResult.unmetNeed;
      agent.unmet_need = unmetNeed;
      appendEvent(world, {
        type: "needs_checked",
        turn,
        agent_id: agent.id,
        unmet_need: unmetNeed,
        consumed_resources: needsResult.consumedResources,
      });
    }

    const proposals = createTurnProposals(world);
    for (const proposal of proposals) {
      appendEvent(world, {
        type: "proposal_created",
        turn,
        proposal_id: proposal.proposal_id,
        from_agent: proposal.from_agent,
        to_agent: proposal.to_agent,
        offered_resource: proposal.offered_resource,
        offered_quantity: proposal.offered_quantity,
        requested_resource: proposal.requested_resource,
        requested_quantity: proposal.requested_quantity,
      });
    }

    for (const proposal of proposals) {
      resolveProposal(world, proposal);
    }

    updateMarketSignals(world);
  }

  appendEvent(world, { type: "run_finished", turn: world.turn });

  const finalTotals = resourceTotals(world);
  const invariants = checkInvariants(world, initialTotals, producedTotals, consumedTotals, finalTotals);

  return {
    events,
    initialTotals,
    finalTotals,
    invariants,
    world: sanitizeWorld(world),
  };
}

function appendEvent(world, event) {
  world.events.push(event);
}

function consumeNeeds(agent, resources) {
  let unmetNeed = 0;
  const consumedResources = zeroTotals(resources);

  for (const [resource, needed] of Object.entries(agent.needs)) {
    if (needed <= 0) {
      continue;
    }

    if (agent.inventory[resource] > 0) {
      agent.inventory[resource] -= 1;
      consumedResources[resource] += 1;
    } else {
      unmetNeed += 1;
    }
  }

  return { unmetNeed, consumedResources };
}

function createTurnProposals(world) {
  const attempts = Math.max(1, Math.round(world.agents.length * world.config.random_encounter_rate));
  const proposals = [];

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const fromAgent = pick(world.agents, world.rng);
    const toAgent = pickCounterparty(world, fromAgent.id);
    const proposal = buildProposal(world, fromAgent, toAgent);

    if (!proposal) {
      continue;
    }

    world.proposals[proposal.proposal_id] = proposal;
    proposals.push(proposal);
  }

  return proposals;
}

function buildProposal(world, fromAgent, toAgent) {
  const requestedResource = chooseRequestedResource(world.config.resources, fromAgent, toAgent);
  const offeredResource = chooseOfferedResource(world.config.resources, fromAgent, toAgent, requestedResource);

  if (!requestedResource || !offeredResource) {
    return null;
  }

  return {
    proposal_id: `proposal-${world.turn}-${Object.keys(world.proposals).length + 1}`,
    turn: world.turn,
    from_agent: fromAgent.id,
    to_agent: toAgent.id,
    offered_resource: offeredResource,
    offered_quantity: 1,
    requested_resource: requestedResource,
    requested_quantity: 1,
    status: "pending",
  };
}

function chooseRequestedResource(resources, fromAgent, toAgent) {
  const candidates = resources.filter((resource) => fromAgent.needs[resource] > 0 && toAgent.inventory[resource] > 0);
  return mostNeededResource(candidates, fromAgent);
}

function chooseOfferedResource(resources, fromAgent, toAgent, requestedResource) {
  const candidates = resources.filter((resource) => {
    if (resource === requestedResource || fromAgent.inventory[resource] <= 0) {
      return false;
    }
    return toAgent.needs[resource] > 0 || surplus(fromAgent, resource) > 0;
  });

  return candidates.toSorted((left, right) => surplus(fromAgent, right) - surplus(fromAgent, left) || left.localeCompare(right))[0];
}

function resolveProposal(world, proposal) {
  const fromAgent = findAgent(world, proposal.from_agent);
  const toAgent = findAgent(world, proposal.to_agent);
  const decision = decideProposal(proposal, fromAgent, toAgent);

  if (decision.accepted && canSettle(fromAgent, toAgent, proposal)) {
    settleProposal(fromAgent, toAgent, proposal);
    proposal.status = "accepted";
    proposal.resolution_reason = decision.reason;
    recordAcceptedProposal(fromAgent, toAgent, proposal);
    appendEvent(world, {
      type: "proposal_accepted",
      turn: world.turn,
      proposal_id: proposal.proposal_id,
      from_agent: fromAgent.id,
      to_agent: toAgent.id,
      reason: decision.reason,
    });
    return;
  }

  const reason = decision.accepted ? "rejected because settlement resources were unavailable" : decision.reason;
  proposal.status = "rejected";
  proposal.resolution_reason = reason;
  recordRejectedProposal(fromAgent, toAgent, proposal, reason);
  appendEvent(world, {
    type: "proposal_rejected",
    turn: world.turn,
    proposal_id: proposal.proposal_id,
    from_agent: fromAgent.id,
    to_agent: toAgent.id,
    reason,
  });
}

function decideProposal(proposal, fromAgent, toAgent) {
  if (toAgent.inventory[proposal.requested_resource] < proposal.requested_quantity) {
    return { accepted: false, reason: "rejected because requested resource was unavailable locally" };
  }

  const relationship = toAgent.relationships[fromAgent.id] ?? 0;
  const offeredNeed = toAgent.needs[proposal.offered_resource] ?? 0;
  const requestedNeed = toAgent.needs[proposal.requested_resource] ?? 0;
  const relationshipAssessment = toAgent.profile.trust_baseline + relationship * 0.08;
  const localNeedAssessment =
    offeredNeed >= requestedNeed || toAgent.inventory[proposal.requested_resource] > requestedNeed + 1;
  const explorationAssessment = toAgent.profile.opportunity_seeking >= 0.5 && surplus(toAgent, proposal.requested_resource) > 0;

  if (relationshipAssessment >= 0.45 && (localNeedAssessment || explorationAssessment)) {
    return { accepted: true, reason: "accepted under local needs and relationship assessment" };
  }

  return { accepted: false, reason: "rejected under local needs and relationship assessment" };
}

function canSettle(fromAgent, toAgent, proposal) {
  return (
    fromAgent.inventory[proposal.offered_resource] >= proposal.offered_quantity &&
    toAgent.inventory[proposal.requested_resource] >= proposal.requested_quantity
  );
}

function settleProposal(fromAgent, toAgent, proposal) {
  fromAgent.inventory[proposal.offered_resource] -= proposal.offered_quantity;
  toAgent.inventory[proposal.offered_resource] += proposal.offered_quantity;
  toAgent.inventory[proposal.requested_resource] -= proposal.requested_quantity;
  fromAgent.inventory[proposal.requested_resource] += proposal.requested_quantity;
}

function recordAcceptedProposal(fromAgent, toAgent, proposal) {
  fromAgent.relationships[toAgent.id] += 1;
  toAgent.relationships[fromAgent.id] += 1;
  const memory = proposalMemory(proposal, "accepted");
  fromAgent.memory.transactions.push(memory);
  toAgent.memory.transactions.push(memory);
  fromAgent.memory.acceptances.push(memory);
  toAgent.memory.acceptances.push(memory);
}

function recordRejectedProposal(fromAgent, toAgent, proposal, reason) {
  fromAgent.relationships[toAgent.id] -= 1;
  toAgent.relationships[fromAgent.id] -= 1;
  const memory = { ...proposalMemory(proposal, "rejected"), reason };
  fromAgent.memory.transactions.push(memory);
  toAgent.memory.transactions.push(memory);
}

function proposalMemory(proposal, status) {
  return {
    turn: proposal.turn,
    proposal_id: proposal.proposal_id,
    from_agent: proposal.from_agent,
    to_agent: proposal.to_agent,
    offered_resource: proposal.offered_resource,
    requested_resource: proposal.requested_resource,
    status,
  };
}

function updateMarketSignals(world) {
  const recentProposals = Object.values(world.proposals).slice(-world.config.market_signal_window);
  const acceptedProposals = recentProposals.filter((proposal) => proposal.status === "accepted");
  const counts = zeroTotals(world.config.resources);

  for (const proposal of acceptedProposals) {
    counts[proposal.offered_resource] += 1;
    counts[proposal.requested_resource] += 1;
  }

  const completionRate = recentProposals.length === 0 ? 0 : acceptedProposals.length / recentProposals.length;
  const searchDifficulty =
    recentProposals.length === 0 ? 0 : recentProposals.filter((proposal) => proposal.status !== "accepted").length / recentProposals.length;

  world.marketSignals = {
    resource_acceptance_counts: counts,
    recent_completion_rate: round(completionRate),
    recent_search_difficulty: round(searchDifficulty),
  };
}

function checkInvariants(world, initialTotals, producedTotals, consumedTotals, finalTotals) {
  const violations = [];

  for (const agent of world.agents) {
    for (const [resource, quantity] of Object.entries(agent.inventory)) {
      if (quantity < 0) {
        violations.push({ type: "negative_inventory", agent_id: agent.id, resource, quantity });
      }
    }
  }

  for (const resource of world.config.resources) {
    const expected = initialTotals[resource] + producedTotals[resource];
    const actual = finalTotals[resource] + consumedTotals[resource];

    if (actual !== expected) {
      violations.push({
        type: "resource_total_mismatch",
        resource,
        initial: initialTotals[resource],
        produced: producedTotals[resource],
        consumed: consumedTotals[resource],
        final: finalTotals[resource],
      });
    }
  }

  return { violations };
}

function resourceTotals(world) {
  const totals = zeroTotals(world.config.resources);

  for (const agent of world.agents) {
    for (const resource of world.config.resources) {
      totals[resource] += agent.inventory[resource];
    }
  }

  return totals;
}

function zeroTotals(resources) {
  return Object.fromEntries(resources.map((resource) => [resource, 0]));
}

function addTotals(target, source) {
  for (const [resource, quantity] of Object.entries(source)) {
    target[resource] += quantity;
  }
}

function sanitizeWorld(world) {
  return {
    config: structuredClone(world.config),
    turn: world.turn,
    agents: structuredClone(world.agents),
    marketSignals: structuredClone(world.marketSignals),
  };
}

function findAgent(world, agentId) {
  return world.agents.find((agent) => agent.id === agentId);
}

function pick(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

function pickCounterparty(world, fromAgentId) {
  const candidates = world.agents.filter((agent) => agent.id !== fromAgentId);
  return pick(candidates, world.rng);
}

function mostNeededResource(resources, agent) {
  return resources.toSorted((left, right) => {
    const needComparison = agent.needs[right] - agent.needs[left];
    return needComparison || agent.inventory[left] - agent.inventory[right] || left.localeCompare(right);
  })[0];
}

function surplus(agent, resource) {
  return agent.inventory[resource] - (agent.needs[resource] ?? 0);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
