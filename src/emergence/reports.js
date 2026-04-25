import { runEmergenceSimulation } from "./simulation.js";

const SUMMARY_PRECISION = 1000;
const LINKED_EVENT_LIMIT = 6;

export function runEmergenceExperimentSet({ seeds = ["seed-1", "seed-2", "seed-3"], ...options } = {}) {
  const normalizedSeeds = Array.isArray(seeds) ? [...seeds] : [];
  const runs = normalizedSeeds.map((seed) => runEmergenceSimulation({ ...options, seed }));

  return {
    seeds: normalizedSeeds,
    runs,
    summary: summarizeEmergenceRuns(runs),
  };
}

export function buildEmergenceReport(experiment = { runs: [], summary: summarizeEmergenceRuns([]) }) {
  const runs = experiment.runs ?? [];
  const summary = experiment.summary ?? summarizeEmergenceRuns(runs);
  const findings = [];

  if (runs.length === 0) {
    findings.push({
      title: "No runs were available for resource-level bridge assessment",
      confidence: "high",
      evidence: { runs: 0 },
      linked_events: [],
      alternative_explanations: ["no seeds were provided for the experiment set"],
    });

    return { summary, findings };
  }

  for (const [resource, resourceSummary] of Object.entries(summary.resources ?? {})) {
    const averageAcceptanceBreadth = finite(resourceSummary.average_acceptance_breadth);
    if (averageAcceptanceBreadth <= 0) {
      continue;
    }

    findings.push({
      title: `${resource} showed exchange-bridge behavior`,
      resource,
      confidence: confidenceFor(resourceSummary.seed_presence_rate),
      evidence: {
        average_acceptance_breadth: averageAcceptanceBreadth,
        average_pass_through_rate: finite(resourceSummary.average_pass_through_rate),
        seed_presence_rate: finite(resourceSummary.seed_presence_rate),
      },
      linked_events: linkedEventsForResource(runs, resource).slice(0, LINKED_EVENT_LIMIT),
      alternative_explanations: [
        "profile distribution may have increased exploration",
        "resource scarcity may have increased substitute acceptance",
      ],
    });
  }

  if (findings.length === 0) {
    findings.push({
      title: "No strong exchange-bridge pattern appeared",
      confidence: "high",
      evidence: { runs: runs.length },
      linked_events: [],
      alternative_explanations: ["short turn limit may have limited repeated interactions"],
    });
  }

  return { summary, findings };
}

export function summarizeEmergenceRuns(runs) {
  const resources = resourcesForRuns(runs);

  return {
    run_count: runs.length,
    average_trade_completion_rate: average(runs.map((run) => run.metrics?.macro?.trade_completion_rate ?? 0)),
    average_unmet_need_rate: average(runs.map((run) => run.metrics?.macro?.unmet_need_rate ?? 0)),
    resources: Object.fromEntries(
      resources.map((resource) => {
        const configuredRuns = runs.filter((run) => resourceIsConfigured(run, resource));

        return [
          resource,
          {
            average_acceptance_breadth: average(
              configuredRuns.map((run) => run.metrics?.resources?.[resource]?.acceptance_breadth ?? 0),
            ),
            average_pass_through_rate: average(
              configuredRuns.map((run) => run.metrics?.resources?.[resource]?.pass_through_rate ?? 0),
            ),
            seed_presence_rate: average(
              configuredRuns.map((run) => ((run.metrics?.resources?.[resource]?.acceptance_breadth ?? 0) > 0 ? 1 : 0)),
            ),
          },
        ];
      }),
    ),
  };
}

function resourcesForRuns(runs) {
  const resources = new Set();

  for (const run of runs) {
    for (const resource of run.world?.config?.resources ?? []) {
      resources.add(resource);
    }
  }

  return [...resources];
}

function resourceIsConfigured(run, resource) {
  return (run.world?.config?.resources ?? []).includes(resource);
}

function linkedEventsForResource(runs, resource) {
  return runs.flatMap((run) => {
    const seed = run.world?.config?.seed;
    const proposals = new Map(
      (run.events ?? [])
        .filter((event) => event.type === "proposal_created" && proposalUsesResource(event, resource))
        .map((event) => [event.proposal_id, event]),
    );

    return (run.events ?? [])
      .filter((event) => event.type === "proposal_accepted" && proposals.has(event.proposal_id))
      .map((event) => {
        const proposal = proposals.get(event.proposal_id);
        return {
          seed,
          turn: event.turn,
          proposal_id: event.proposal_id,
          offered_resource: proposal.offered_resource,
          requested_resource: proposal.requested_resource,
        };
      });
  });
}

function proposalUsesResource(proposal, resource) {
  return proposal.offered_resource === resource || proposal.requested_resource === resource;
}

function confidenceFor(seedPresenceRate) {
  if (seedPresenceRate >= 0.67) {
    return "high";
  }
  if (seedPresenceRate >= 0.34) {
    return "medium";
  }
  return "low";
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }

  return round(values.reduce((sum, value) => sum + finite(value), 0) / values.length);
}

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

function round(value) {
  return Math.round(finite(value) * SUMMARY_PRECISION) / SUMMARY_PRECISION;
}
