export const PROFILE_KEYS = [
  "time_horizon",
  "risk_tolerance",
  "trust_baseline",
  "reputation_sensitivity",
  "liquidity_awareness",
  "fairness_preference",
  "opportunity_seeking",
];

export const ARCHETYPES = {
  steward: {
    time_horizon: 0.86,
    risk_tolerance: 0.28,
    trust_baseline: 0.74,
    reputation_sensitivity: 0.82,
    liquidity_awareness: 0.58,
    fairness_preference: 0.91,
    opportunity_seeking: 0.34,
  },
  trader: {
    time_horizon: 0.62,
    risk_tolerance: 0.56,
    trust_baseline: 0.52,
    reputation_sensitivity: 0.65,
    liquidity_awareness: 0.88,
    fairness_preference: 0.57,
    opportunity_seeking: 0.72,
  },
  hoarder: {
    time_horizon: 0.79,
    risk_tolerance: 0.18,
    trust_baseline: 0.22,
    reputation_sensitivity: 0.48,
    liquidity_awareness: 0.81,
    fairness_preference: 0.29,
    opportunity_seeking: 0.24,
  },
  opportunist: {
    time_horizon: 0.31,
    risk_tolerance: 0.82,
    trust_baseline: 0.38,
    reputation_sensitivity: 0.34,
    liquidity_awareness: 0.66,
    fairness_preference: 0.24,
    opportunity_seeking: 0.91,
  },
  reciprocator: {
    time_horizon: 0.68,
    risk_tolerance: 0.42,
    trust_baseline: 0.69,
    reputation_sensitivity: 0.86,
    liquidity_awareness: 0.49,
    fairness_preference: 0.78,
    opportunity_seeking: 0.51,
  },
};

const DEFAULT_DISTRIBUTION = Object.fromEntries(Object.keys(ARCHETYPES).map((archetype) => [archetype, 1]));

export function normalizeDistribution(distribution) {
  const entries = Object.entries(distribution ?? {});

  for (const [archetype, weight] of entries) {
    if (!(archetype in ARCHETYPES)) {
      throw new Error(`Unknown archetype: ${archetype}`);
    }
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error("Profile distribution weights must be non-negative finite numbers");
    }
  }

  const weights = entries.filter(([, weight]) => weight > 0);
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);

  if (total <= 0) {
    throw new Error("Profile distribution must have positive weight");
  }

  return Object.fromEntries(weights.map(([archetype, weight]) => [archetype, weight / total]));
}

export function generateAgentProfiles({ seed = "default", count = 15, distribution = DEFAULT_DISTRIBUTION } = {}) {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Agent count must be a non-negative integer");
  }

  const normalizedDistribution = normalizeDistribution(distribution);
  const archetypes = Object.entries(normalizedDistribution);
  const rng = createRng(seed);

  return Array.from({ length: count }, (_, index) => {
    const archetype = pickArchetype(archetypes, rng());
    const baseProfile = ARCHETYPES[archetype];

    if (!baseProfile) {
      throw new Error(`Unknown archetype: ${archetype}`);
    }

    return {
      id: `agent_${String(index + 1).padStart(2, "0")}`,
      archetype,
      profile: jitterProfile(baseProfile, rng),
    };
  });
}

function pickArchetype(archetypes, roll) {
  let cumulative = 0;

  for (const [archetype, probability] of archetypes) {
    cumulative += probability;
    if (roll < cumulative) {
      return archetype;
    }
  }

  return archetypes.at(-1)[0];
}

function jitterProfile(profile, rng) {
  return Object.fromEntries(PROFILE_KEYS.map((key) => [key, clamp(round(profile[key] + (rng() * 0.08 - 0.04)))]));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function clamp(value) {
  return Math.min(1, Math.max(0, value));
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
