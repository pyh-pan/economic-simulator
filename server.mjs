import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { advanceSimulationTurn, createLongCatAgent, createSimulationSession, getSimulationSnapshot } from "./src/index.js";

loadEnv();

const TRIBES = ["fishers", "waterkeepers", "fruiters", "herders", "woodcutters"];

export function createApiApp({ useVite = process.env.NODE_ENV !== "test" } = {}) {
  const sessions = new Map();
  let vitePromise = null;

  const server = createServer(async (request, response) => {
    try {
      if (request.url === "/api/simulations" && request.method === "POST") {
        const body = await readJson(request);
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const agents = createAgents(body.agentProvider);
        const session = createSimulationSession({
          seed: body.seed ?? "island-001",
          turnLimit: Number(body.turnLimit ?? 12),
          globalTrust: Number(body.trust ?? 0.65),
          agents,
          proposalStrategy: "auto",
          enableReputation: body.enableReputation !== false,
          protoCurrencyCandidates: body.enableShells ? ["shells"] : [],
        });
        sessions.set(id, session);
        return sendJson(response, 200, { id, snapshot: getSimulationSnapshot(session) });
      }

      const stepMatch = request.url?.match(/^\/api\/simulations\/([^/]+)\/step$/);
      if (stepMatch && request.method === "POST") {
        const session = sessions.get(decodeURIComponent(stepMatch[1]));
        if (!session) {
          return sendJson(response, 404, { error: "Unknown simulation session" });
        }
        const snapshot = await advanceSimulationTurn(session);
        return sendJson(response, 200, { id: stepMatch[1], snapshot });
      }

      if (request.url === "/api/health" && request.method === "GET") {
        return sendJson(response, 200, { ok: true });
      }

      if (useVite) {
        const vite = await getVite(vitePromise);
        vitePromise = Promise.resolve(vite);
        return vite.middlewares(request, response);
      }

      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
  });

  return {
    listen(port, host = "127.0.0.1") {
      return new Promise((resolveListen) => {
        server.listen(port, host, () => resolveListen(server));
      });
    },
    close() {
      return new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
    },
  };
}

function createAgents(agentProvider = "local") {
  if (agentProvider === "longcat") {
    const agent = createLongCatAgent();
    return Object.fromEntries(TRIBES.map((tribeId) => [tribeId, agent]));
  }
  return Object.fromEntries(TRIBES.map((tribeId) => [tribeId, createLocalNpcAgent()]));
}

function createLocalNpcAgent() {
  return (visibleState, proposal) => {
    const offeredNeed = visibleState.needs[proposal.offered_resource] ?? 0;
    const offeredInventory = visibleState.inventory[proposal.offered_resource] ?? 0;
    const requestedInventory = visibleState.inventory[proposal.requested_resource] ?? 0;
    const reputation = visibleState.reputation?.[proposal.from_tribe] ?? 0;
    const trustLevel = visibleState.trustLevel ?? 0.5;
    const needsOfferedResource = offeredInventory < offeredNeed;
    const canPay = requestedInventory >= proposal.requested_quantity;
    const trustsPartner = reputation >= -1;

    if (trustLevel < 0.25) {
      return {
        type: "reject_trade",
        proposal_id: proposal.proposal_id,
        reason: `Trust is only ${trustLevel.toFixed(2)}, so I suspect the offer may hide risk and refuse the exchange.`,
      };
    }

    if (canPay && needsOfferedResource && trustsPartner) {
      return {
        type: "accept_trade",
        proposal_id: proposal.proposal_id,
        reason: `I need ${proposal.offered_resource}, can spare ${proposal.requested_resource}, and trust is sufficient for this exchange.`,
      };
    }

    return {
      type: "reject_trade",
      proposal_id: proposal.proposal_id,
      reason: `I reject because need, inventory, or trust does not justify this exchange.`,
    };
  };
}

async function getVite(existing) {
  if (existing) {
    return existing;
  }
  const { createServer: createViteServer } = await import("vite");
  return createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
}

async function readJson(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
  }
  return text ? JSON.parse(text) : {};
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function loadEnv(file = ".env") {
  let text;
  try {
    text = readFileSync(resolve(process.cwd(), file), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 5173);
  const app = createApiApp();
  const server = await app.listen(port);
  const address = server.address();
  console.log(`Economic simulator listening on http://localhost:${address.port}/`);
}
