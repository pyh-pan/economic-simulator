import { generateAgentProfiles } from "./profiles.js";

export const BASE_RESOURCES = ["fish", "water", "fruit", "animals", "wood"];
export const DEFAULT_PRODUCTION_TYPES = ["fish", "water", "fruit", "animals", "wood"];

export function createEmergenceWorld({
  seed = "default",
  turnLimit = 60,
  agentCount = 15,
  extraResources = [],
  productionTypes = DEFAULT_PRODUCTION_TYPES,
  initialDominantInventory = 8,
  initialOtherInventory = 2,
  initialExtraInventory = 1,
  baseNeed = 3,
  profileDistribution,
  randomEncounterRate = 0.45,
  searchBudget = 2,
  marketSignalWindow = 8,
} = {}) {
  const normalizedExtraResources = uniqueResources(extraResources).filter((resource) => !BASE_RESOURCES.includes(resource));
  const resources = [...BASE_RESOURCES, ...normalizedExtraResources];
  const profiles = generateAgentProfiles({
    seed: `${seed}:profiles`,
    count: agentCount,
    distribution: profileDistribution,
  });
  const configuredProductionTypes = productionTypes.length > 0 ? [...productionTypes] : DEFAULT_PRODUCTION_TYPES;
  validateProductionTypes(configuredProductionTypes, resources);
  const profileIds = profiles.map((profile) => profile.id);
  const agents = profiles.map((profileRecord, index) => {
    const productionType = configuredProductionTypes[index % configuredProductionTypes.length];

    return {
      id: profileRecord.id,
      archetype: profileRecord.archetype,
      production_type: productionType,
      inventory: createInventory(resources, normalizedExtraResources, productionType, {
        initialDominantInventory,
        initialOtherInventory,
        initialExtraInventory,
      }),
      needs: createNeeds(resources, normalizedExtraResources, productionType, baseNeed),
      profile: structuredClone(profileRecord.profile),
      memory: { transactions: [], acceptances: [] },
      relationships: createRelationships(profileIds, profileRecord.id),
      unmet_need: 0,
      search_cost: 0,
    };
  });

  return {
    config: {
      seed,
      turn_limit: turnLimit,
      resources,
      extra_resources: normalizedExtraResources,
      production_types: configuredProductionTypes,
      random_encounter_rate: randomEncounterRate,
      search_budget: searchBudget,
      market_signal_window: marketSignalWindow,
    },
    turn: 0,
    agents,
    proposals: {},
    events: [],
    marketSignals: emptyMarketSignals(resources),
    rng: createRng(seed),
  };
}

export function getEmergenceVisibleState(world, agentId) {
  const agent = world.agents.find((candidate) => candidate.id === agentId);

  if (!agent) {
    throw new Error(`Unknown emergence agent: ${agentId}`);
  }

  return {
    agentId,
    turn: world.turn,
    config: cloneConfig(world.config),
    agent: {
      id: agent.id,
      archetype: agent.archetype,
      production_type: agent.production_type,
      inventory: structuredClone(agent.inventory),
      needs: structuredClone(agent.needs),
      profile: structuredClone(agent.profile),
      relationships: structuredClone(agent.relationships),
      unmet_need: agent.unmet_need,
      search_cost: agent.search_cost,
    },
    proposals: getVisibleProposals(world.proposals, agentId),
    memory: {
      transactions: structuredClone(agent.memory.transactions.slice(-10)),
      acceptances: structuredClone(agent.memory.acceptances.slice(-10)),
    },
    marketSignals: structuredClone(world.marketSignals),
  };
}

export function emptyMarketSignals(resources) {
  return {
    resource_acceptance_counts: Object.fromEntries(resources.map((resource) => [resource, 0])),
    recent_completion_rate: 0,
    recent_search_difficulty: 0,
  };
}

export function createRng(seed) {
  let state = hashSeed(seed);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function uniqueResources(resources) {
  const seen = new Set();
  const unique = [];

  for (const resource of resources) {
    if (seen.has(resource)) {
      continue;
    }
    seen.add(resource);
    unique.push(resource);
  }

  return unique;
}

function validateProductionTypes(productionTypes, resources) {
  const resourceSet = new Set(resources);

  for (const productionType of productionTypes) {
    if (!resourceSet.has(productionType)) {
      throw new Error(`Unknown production type: ${productionType}`);
    }
  }
}

function createInventory(resources, extraResources, productionType, inventoryConfig) {
  const extraResourceSet = new Set(extraResources);

  return Object.fromEntries(
    resources.map((resource) => {
      if (resource === productionType) {
        return [resource, inventoryConfig.initialDominantInventory];
      }
      if (extraResourceSet.has(resource)) {
        return [resource, inventoryConfig.initialExtraInventory];
      }
      return [resource, inventoryConfig.initialOtherInventory];
    }),
  );
}

function createNeeds(resources, extraResources, productionType, baseNeed) {
  const extraResourceSet = new Set(extraResources);

  return Object.fromEntries(
    resources.map((resource) => {
      if (resource === productionType || extraResourceSet.has(resource)) {
        return [resource, 0];
      }
      return [resource, baseNeed];
    }),
  );
}

function createRelationships(agentIds, ownId) {
  return Object.fromEntries(agentIds.filter((agentId) => agentId !== ownId).map((agentId) => [agentId, 0]));
}

function getVisibleProposals(proposals, agentId) {
  return Object.fromEntries(
    Object.entries(proposals).filter(([, proposal]) => proposalInvolvesAgent(proposal, agentId)).map(([proposalId, proposal]) => [proposalId, structuredClone(proposal)]),
  );
}

function proposalInvolvesAgent(proposal, agentId) {
  return [
    proposal.agent_id,
    proposal.agentId,
    proposal.proposer_id,
    proposal.proposerId,
    proposal.responder_id,
    proposal.responderId,
    proposal.from_agent,
    proposal.to_agent,
    proposal.from,
    proposal.to,
  ].includes(agentId);
}

function cloneConfig(config) {
  return {
    seed: config.seed,
    turn_limit: config.turn_limit,
    resources: [...config.resources],
    extra_resources: [...config.extra_resources],
    production_types: [...config.production_types],
    random_encounter_rate: config.random_encounter_rate,
    search_budget: config.search_budget,
    market_signal_window: config.market_signal_window,
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
