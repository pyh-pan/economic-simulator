import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildReplaySummary, createLongCatAgent, runSimulationAsync } from "../src/index.js";

loadEnv();

const tribes = ["fishers", "waterkeepers", "fruiters", "herders", "woodcutters"];
const agent = createLongCatAgent();
const agents = Object.fromEntries(tribes.map((tribeId) => [tribeId, agent]));
const seed = process.env.SIM_SEED ?? "longcat-island-001";
const turnLimit = Number(process.env.SIM_TURN_LIMIT ?? 5);
const globalTrust = Number(process.env.SIM_TRUST ?? 0.65);
const protoCurrencyCandidates = process.env.SIM_PROTO_CURRENCY === "shells" ? ["shells"] : [];

const run = await runSimulationAsync({
  seed,
  turnLimit,
  globalTrust,
  agents,
  proposalStrategy: "auto",
  enableReputation: true,
  protoCurrencyCandidates,
});

console.log(JSON.stringify(buildReplaySummary(run), null, 2));

function loadEnv(file = ".env") {
  const path = resolve(process.cwd(), file);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
