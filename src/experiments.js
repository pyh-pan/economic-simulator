import { buildReplaySummary, runSimulation } from "./index.js";

const TRIBES = ["fishers", "waterkeepers", "fruiters", "herders", "woodcutters"];

export function scanTrustLevels({
  seed,
  turnLimit,
  trustLevels = [0, 0.25, 0.5, 0.75, 1],
  proposalStrategy = "auto",
  enableReputation = true,
  protoCurrencyCandidates = [],
} = {}) {
  return trustLevels.map((trust) => {
    const run = runSimulation({
      seed,
      turnLimit,
      globalTrust: trust,
      proposalStrategy,
      enableReputation,
      protoCurrencyCandidates,
    });
    return { trust, metrics: run.metrics, summary: buildReplaySummary(run) };
  });
}

export function compareTrustRuns({
  seed,
  turnLimit,
  lowTrust = 0.15,
  highTrust = 0.85,
  proposalStrategy = "auto",
  enableReputation = true,
  protoCurrencyCandidates = [],
} = {}) {
  const lowRun = runSimulation({ seed, turnLimit, globalTrust: lowTrust, proposalStrategy, enableReputation, protoCurrencyCandidates });
  const highRun = runSimulation({ seed, turnLimit, globalTrust: highTrust, proposalStrategy, enableReputation, protoCurrencyCandidates });
  const low = buildReplaySummary(lowRun);
  const high = buildReplaySummary(highRun);

  return {
    low,
    high,
    delta: {
      completed_trades: high.metrics.completed_trades - low.metrics.completed_trades,
      acceptance_rate: high.metrics.acceptance_rate - low.metrics.acceptance_rate,
      trade_completion_rate: high.metrics.trade_completion_rate - low.metrics.trade_completion_rate,
    },
  };
}

export function buildTradeNetwork(events) {
  const proposals = new Map();
  for (const event of events) {
    if (event.type === "proposal_created") proposals.set(event.proposal_id, event);
  }

  const edges = new Map();
  for (const event of events) {
    if (event.type !== "trade_settled" && event.type !== "proposal_rejected") continue;
    const proposal = proposals.get(event.proposal_id);
    if (!proposal) continue;
    const key = `${proposal.from_tribe}->${proposal.to_tribe}`;
    const edge = edges.get(key) ?? { from: proposal.from_tribe, to: proposal.to_tribe, completed: 0, rejected: 0 };
    if (event.type === "trade_settled") edge.completed += 1;
    if (event.type === "proposal_rejected") edge.rejected += 1;
    edges.set(key, edge);
  }

  return {
    nodes: TRIBES.map((id) => ({ id })),
    edges: [...edges.values()],
  };
}
