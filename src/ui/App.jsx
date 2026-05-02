import React, { useEffect, useRef, useState } from "react";
import {
  buildTradeNetwork,
  compareTrustRuns,
  createRunStore,
  scanTrustLevels,
} from "../index.js";

const store = createRunStore();

export function App() {
  const [seed, setSeed] = useState("island-001");
  const [trust, setTrust] = useState(0.65);
  const [turnLimit, setTurnLimit] = useState(12);
  const [enableReputation, setEnableReputation] = useState(true);
  const [enableExtraResource, setEnableExtraResource] = useState(false);
  const [agentProvider, setAgentProvider] = useState("local");
  const [view, setView] = useState("run");
  const [sessionId, setSessionId] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [emergenceResult, setEmergenceResult] = useState(null);
  const [autoRun, setAutoRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedRuns, setSavedRuns] = useState(() => store.list());
  const tabsRef = useRef(null);

  const options = {
    seed,
    turnLimit,
    globalTrust: trust,
    proposalStrategy: "auto",
    enableReputation,
    protoCurrencyCandidates: enableExtraResource ? ["shells"] : [],
  };
  const comparison = compareTrustRuns({ ...options, lowTrust: 0.15, highTrust: trust });
  const scan = scanTrustLevels({ ...options, trustLevels: [0, 0.25, 0.5, 0.75, 1] });

  useEffect(() => {
    if (!autoRun || loading || !sessionId || snapshot?.finished) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      stepSession();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [autoRun, loading, sessionId, snapshot?.turn, snapshot?.finished]);

  useEffect(() => {
    tabsRef.current?.querySelector("button.active")?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [view]);

  const runSession = async () => {
    setLoading(true);
    setError("");
    setAutoRun(false);
    try {
      const data = await postJson("/api/simulations", {
        seed,
        turnLimit,
        trust,
        agentProvider,
        enableReputation,
        enableShells: enableExtraResource,
      });
      setSessionId(data.id);
      setSnapshot(data.snapshot);
      setView("run");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const runEmergence = async () => {
    setAutoRun(false);
    setLoading(true);
    setError("");
    try {
      const data = await postJson("/api/emergence/runs", {
        seeds: [seed, `${seed}-b`, `${seed}-c`],
        turnLimit,
        extraResources: enableExtraResource ? ["beads"] : [],
      });
      setEmergenceResult(data);
      setView("emergence");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const stepSession = async () => {
    if (!sessionId || loading || snapshot?.finished) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await postJson(`/api/simulations/${encodeURIComponent(sessionId)}/step`, {});
      setSnapshot(data.snapshot);
      if (data.snapshot.finished) {
        setAutoRun(false);
      }
    } catch (requestError) {
      setAutoRun(false);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const saveRun = () => {
    if (!snapshot) {
      return;
    }
    const record = {
      id: `${Date.now()}`,
      label: `${seed} / ${agentProvider} / turn ${snapshot.turn}`,
      createdAt: new Date().toISOString(),
      summary: {
        metrics: snapshot.metrics,
        tribes: snapshot.tribes,
      },
    };
    store.save(record);
    setSavedRuns(store.list());
  };

  return (
    <main className="app-shell">
      <aside className="control-rail">
        <div className="title-block">
          <span>Island barter lab</span>
          <h1>Economic Simulator</h1>
        </div>

        <label className="field">
          <span>Seed</span>
          <input value={seed} onChange={(event) => setSeed(event.target.value)} />
        </label>

        <label className="field">
          <span>Trust {trust.toFixed(2)}</span>
          <input type="range" min="0" max="1" step="0.05" value={trust} onChange={(event) => setTrust(Number(event.target.value))} />
        </label>

        <label className="field">
          <span>Turns</span>
          <input type="number" min="1" max="50" value={turnLimit} onChange={(event) => setTurnLimit(Number(event.target.value))} />
        </label>

        <label className="field">
          <span>Agent</span>
          <select value={agentProvider} onChange={(event) => setAgentProvider(event.target.value)}>
            <option value="local">Local NPC</option>
            <option value="longcat">LongCat</option>
          </select>
        </label>

        <div className="checks">
          <label><input type="checkbox" checked={enableReputation} onChange={(event) => setEnableReputation(event.target.checked)} /> Reputation</label>
          <label><input type="checkbox" checked={enableExtraResource} onChange={(event) => setEnableExtraResource(event.target.checked)} /> Extra resource</label>
        </div>

        <button className="primary" onClick={runSession} disabled={loading}><Icon name="play" /> Run</button>
        <button className="secondary" onClick={runEmergence} disabled={loading}><Icon name="compare" /> Run emergence</button>
        <button className="secondary" onClick={stepSession} disabled={!sessionId || loading || snapshot?.finished}><Icon name="step" /> Next turn</button>
        <button className="secondary" onClick={() => setAutoRun((value) => !value)} disabled={!sessionId || loading || snapshot?.finished}><Icon name={autoRun ? "pause" : "auto"} /> {autoRun ? "Pause" : "Auto"}</button>
        <button className="secondary" onClick={saveRun} disabled={!snapshot}><Icon name="save" /> Save</button>

        {error ? <p className="error-line">{error}</p> : null}
      </aside>

      <section className="workspace">
        <nav className="tabs" aria-label="Views" ref={tabsRef}>
          <button className={view === "run" ? "active" : ""} onClick={() => setView("run")}><Icon name="activity" /> Run</button>
          <button className={view === "compare" ? "active" : ""} onClick={() => setView("compare")}><Icon name="compare" /> Compare</button>
          <button className={view === "saved" ? "active" : ""} onClick={() => setView("saved")}><Icon name="database" /> Saved</button>
          <button className={view === "emergence" ? "active" : ""} onClick={() => setView("emergence")}><Icon name="activity" /> Emergence</button>
        </nav>

        {view === "run" && <RunView snapshot={snapshot} loading={loading} autoRun={autoRun} />}
        {view === "compare" && <CompareView comparison={comparison} scan={scan} />}
        {view === "saved" && <SavedView records={savedRuns} />}
        {view === "emergence" && <EmergenceView result={emergenceResult} />}
      </section>
    </main>
  );
}

function Icon({ name }) {
  const symbols = {
    activity: "◒",
    auto: "↻",
    compare: "⇄",
    database: "▤",
    pause: "Ⅱ",
    play: "▶",
    save: "▣",
    step: "→",
  };
  return <span className="button-icon" aria-hidden="true">{symbols[name]}</span>;
}

function RunView({ snapshot, loading, autoRun }) {
  if (!snapshot) {
    return (
      <section className="panel placeholder-panel">
        <h2>Ready to run</h2>
        <p>Change parameters without changing results. Click Run to create a simulation session, then advance one turn at a time or use Auto.</p>
      </section>
    );
  }

  const network = buildTradeNetwork(snapshot.events);

  return (
    <div className="run-grid">
      <section className="session-status">
        <StatusPill label="Turn" value={`${snapshot.turn} / ${snapshot.turnLimit}`} />
        <StatusPill label="Mode" value={autoRun ? "Auto" : "Manual"} />
        <StatusPill label="State" value={snapshot.finished ? "Finished" : loading ? "Thinking" : "Waiting"} />
      </section>
      <Metrics metrics={snapshot.metrics} />
      <section className="panel tribes-panel">
        <h2>Current inventories</h2>
        <div className="tribe-grid">
          {snapshot.tribes.map((tribe) => <TribeCard key={tribe.tribe_id} tribe={tribe} resources={snapshot.resources} />)}
        </div>
      </section>
      <section className="panel">
        <h2>Current proposal</h2>
        <ProposalCard proposal={snapshot.currentProposal} />
        <DecisionCard decision={snapshot.currentDecision} />
        <DecisionLedger context={snapshot.currentDecisionContext} agreement={snapshot.currentDecisionAgreement} />
      </section>
      <section className="panel">
        <h2>Turn log</h2>
        {snapshot.turnEvents.length === 0 ? <p className="event-line">No turn has run yet.</p> : null}
        {snapshot.turnEvents.map((event, index) => <p className="event-line" key={`${event.type}-${event.proposal_id ?? event.turn}-${index}`}>{describeEvent(event)}</p>)}
      </section>
      <section className="panel">
        <h2>Network so far</h2>
        {network.edges.length === 0 ? <p className="event-line">No trade relationship yet.</p> : null}
        {network.edges.map((edge) => <p className="event-line" key={`${edge.from}-${edge.to}`}>{`${edge.from} -> ${edge.to}: ${edge.completed} completed / ${edge.rejected} rejected`}</p>)}
      </section>
    </div>
  );
}

function StatusPill({ label, value }) {
  return <article className="status-pill"><span>{label}</span><strong>{value}</strong></article>;
}

function ProposalCard({ proposal }) {
  if (!proposal) {
    return <p className="event-line">No active proposal yet.</p>;
  }
  return (
    <article className="proposal-card">
      <span>{proposal.proposal_id}</span>
      <strong>{proposal.from_tribe} asks {proposal.to_tribe}</strong>
      <p>{proposal.offered_quantity} {formatResourceName(proposal.offered_resource)} for {proposal.requested_quantity} {formatResourceName(proposal.requested_resource)}</p>
    </article>
  );
}

function DecisionCard({ decision }) {
  if (!decision) {
    return <p className="event-line">NPC has not decided yet.</p>;
  }
  return (
    <article className={`decision-card ${decision.type === "accept_trade" ? "accepted" : "rejected"}`}>
      <span>{decision.type.replaceAll("_", " ")}</span>
      <p>{formatVisibleText(decision.reason)}</p>
    </article>
  );
}

function DecisionLedger({ context, agreement }) {
  if (!context) {
    return <p className="event-line">Decision ledger appears after a proposal is evaluated.</p>;
  }

  const rows = [
    ["Benefit", context.utility.gross_benefit],
    ["Cost", -context.pay.payment_opportunity_cost],
    ["Reserve", -context.pay.reserve_penalty],
    ["Risk", -context.trust.trust_adjusted_risk],
    ["Net", context.utility.net_utility],
  ];

  return (
    <article className="ledger-card">
      <div className="ledger-head">
        <span>Decision ledger</span>
        <strong className={context.utility.recommendation === "accept" ? "accept-text" : "reject-text"}>{context.utility.recommendation}</strong>
      </div>
      <p className={`agreement-line ${agreement === false ? "diverged" : ""}`}>{formatAgreement(agreement)}</p>
      <div className="ledger-flow">
        <LedgerResource title="Receive" entry={context.receive} />
        <LedgerResource title="Pay" entry={context.pay} />
      </div>
      <p className="exchange-line">Exchange ratio: {formatLedgerNumber(context.exchange?.offered_per_requested ?? 0)} received per paid</p>
      <div className="ledger-rows">
        {rows.map(([label, value]) => <LedgerRow key={label} label={label} value={value} />)}
      </div>
    </article>
  );
}

function LedgerResource({ title, entry }) {
  return (
    <div className="ledger-resource">
      <span>{title}</span>
      <strong>{entry.quantity} {formatResourceName(entry.resource)}</strong>
      <p>gap {entry.gap_before} to {entry.gap_after}</p>
    </div>
  );
}

function LedgerRow({ label, value }) {
  const formatted = typeof value === "number" && value > 0 ? `+${formatLedgerNumber(value)}` : formatLedgerNumber(value);
  return (
    <div className={`ledger-row ${label === "Net" ? "net-row" : ""}`}>
      <span>{label}</span>
      <strong>{formatted}</strong>
    </div>
  );
}

function Metrics({ metrics }) {
  return (
    <section className="metrics">
      <Metric label="Completion" value={`${Math.round(metrics.trade_completion_rate * 100)}%`} />
      <Metric label="Acceptance" value={`${Math.round(metrics.acceptance_rate * 100)}%`} />
      <Metric label="Completed" value={metrics.completed_trades} />
      <Metric label="Ledger align" value={`${Math.round((metrics.recommendation_agreement_rate ?? 0) * 100)}%`} />
      <Metric label="Invalid output" value={`${Math.round(metrics.invalid_output_rate * 100)}%`} />
    </section>
  );
}

function Metric({ label, value }) {
  return <article className="metric"><strong>{value}</strong><span>{label}</span></article>;
}

function TribeCard({ tribe, resources }) {
  return (
    <article className="tribe-card">
      <h3>{tribe.tribe_id} / {formatResourceName(tribe.dominant_resource)}</h3>
      <div className="resource-list">
        {resources.map((resource) => <span key={resource}>{formatResourceName(resource)}: {tribe.inventory[resource] ?? 0}/{tribe.targets?.[resource] ?? tribe.needs?.[resource] ?? 0}</span>)}
      </div>
      {tribe.reputation ? <p className="reputation">{formatReputation(tribe.reputation)}</p> : null}
    </article>
  );
}

function CompareView({ comparison, scan }) {
  return (
    <div className="compare-layout">
      <article className="panel compare-card"><h2>Low trust</h2><p className="huge">{Math.round(comparison.low.metrics.trade_completion_rate * 100)}%</p></article>
      <article className="panel compare-card"><h2>High trust</h2><p className="huge">{Math.round(comparison.high.metrics.trade_completion_rate * 100)}%</p></article>
      <section className="panel scan-panel">
        <h2>Trust scan</h2>
        {scan.map((row) => <div className="scan-row" key={row.trust}><span>{row.trust.toFixed(2)}</span><i style={{ width: `${Math.round(row.metrics.trade_completion_rate * 100)}%` }} /><strong>{Math.round(row.metrics.trade_completion_rate * 100)}%</strong></div>)}
      </section>
    </div>
  );
}

function EmergenceView({ result }) {
  if (!result) {
    return (
      <section className="panel placeholder-panel">
        <h2>Emergence</h2>
        <p>Run a multi-seed experiment to compare macro outcomes, resource-level bridge signals, and evidence-linked findings.</p>
      </section>
    );
  }

  return (
    <div className="compare-layout emergence-layout">
      <article className="panel compare-card">
        <h2>Runs</h2>
        <p className="huge">{result.runs.length}</p>
      </article>
      <article className="panel compare-card">
        <h2>Completion</h2>
        <p className="huge">{Math.round(result.summary.average_trade_completion_rate * 100)}%</p>
      </article>
      <section className="panel scan-panel">
        <h2>Findings</h2>
        {result.report.findings.map((finding, index) => (
          <article className="saved-card" key={`${finding.title}-${index}`}>
            <h2>{formatVisibleText(finding.title)}</h2>
            <p>Confidence: {formatConfidence(finding.confidence)}</p>
            <p>{formatEvidence(finding.evidence)}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

function SavedView({ records }) {
  return (
    <section className="panel">
      {records.length === 0 ? <p className="event-line">No saved runs</p> : null}
      {records.map((record) => <article className="saved-card" key={record.id}><h2>{record.label}</h2><p>{record.summary.metrics.completed_trades} completed trades</p></article>)}
    </section>
  );
}

function describeEvent(event) {
  if (event.type === "proposal_created") return `${event.from_tribe} offered ${event.offered_quantity} ${formatResourceName(event.offered_resource)} to ${event.to_tribe} for ${event.requested_quantity} ${formatResourceName(event.requested_resource)}.`;
  if (event.type === "proposal_accepted") return `Accepted: ${formatVisibleText(event.reason)}`;
  if (event.type === "proposal_rejected") return `Rejected: ${formatVisibleText(event.reason)}`;
  if (event.type === "counter_proposed") return `Countered: ${event.offered_quantity} ${formatResourceName(event.offered_resource)} for ${event.requested_quantity} ${formatResourceName(event.requested_resource)}.`;
  if (event.type === "proposal_invalid") return `Invalid proposal: ${formatVisibleText(event.reason)}`;
  if (event.type === "trade_settled") return "Trade settled.";
  if (event.type === "run_finished") return "Run finished.";
  return event.type.replaceAll("_", " ");
}

function formatReputation(reputation) {
  return Object.entries(reputation)
    .filter(([, score]) => score !== 0)
    .map(([tribe, score]) => `${tribe}: ${score > 0 ? "+" : ""}${score}`)
    .join(" · ") || "No local reputation changes";
}

function formatResourceName(resource) {
  return resource === "shells" || resource === "beads" ? "extra resource" : resource;
}

function formatLedgerNumber(value) {
  if (typeof value !== "number") {
    return String(value);
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatAgreement(agreement) {
  if (agreement === true) {
    return "Agent aligned with the ledger";
  }
  if (agreement === false) {
    return "Agent diverged from the ledger";
  }
  return "Agreement pending";
}

function formatEvidence(evidence) {
  return Object.entries(evidence)
    .map(([key, value]) => `${key}: ${typeof value === "number" ? value.toFixed(2) : formatVisibleText(String(value))}`)
    .join(" · ");
}

function formatConfidence(confidence) {
  return confidence === "medium" ? "moderate" : confidence;
}

function formatVisibleText(text) {
  return text.replaceAll("shells", "extra resource").replaceAll("beads", "extra resource");
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
}
