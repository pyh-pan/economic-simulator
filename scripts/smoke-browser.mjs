import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const executablePath = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const screenshotPath = process.env.SCREENSHOT_PATH ?? "/tmp/economic-simulator-browser-smoke.png";

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
const consoleProblems = [];

page.on("pageerror", (error) => {
  pageErrors.push(error.stack || error.message);
});

page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    consoleProblems.push({
      type: message.type(),
      text: message.text(),
      url: message.location().url,
    });
  }
});

await page.goto(baseUrl, { waitUntil: "networkidle" });
const initialTabHeights = await tabHeights(page);
const emergenceTab = page.getByRole("button", { name: /Emergence/ });
await emergenceTab.click();
await page.getByRole("heading", { name: "Emergence" }).waitFor();
const emergencePlaceholderTabHeights = await tabHeights(page);
await page.getByRole("button", { name: /Run emergence/ }).click();
await page.waitForFunction(() => document.body.innerText.includes("Findings"));
const emergenceResultTabHeights = await tabHeights(page);
await page.getByLabel("Views").getByRole("button", { name: /^Run$/ }).click();
await page.locator(".control-rail .primary").click();
await page.getByText("Ready to run").waitFor({ state: "detached" });
await page.getByRole("button", { name: /Next turn/ }).click();
await page.waitForFunction(() => document.body.innerText.includes("1 / 12"));
const runningTabHeights = await tabHeights(page);
await page.screenshot({ path: screenshotPath, fullPage: true });

const result = await page.evaluate(() => ({
  title: document.title,
  rootChildren: document.querySelector("#root")?.children.length ?? 0,
  hasAppTitle: document.body.innerText.includes("Economic Simulator"),
  hasMetrics: document.body.innerText.includes("COMPLETION"),
  hasTribes: document.body.innerText.includes("Current inventories"),
  hasProposal: document.body.innerText.includes("Current proposal"),
  hasDecision: document.body.innerText.toLowerCase().includes("accept trade") || document.body.innerText.toLowerCase().includes("reject trade"),
  hasEmergence: document.body.innerText.includes("Emergence"),
}));

await browser.close();

if (pageErrors.length > 0 || consoleProblems.length > 0) {
  throw new Error(JSON.stringify({ pageErrors, consoleProblems }, null, 2));
}

if (!result.hasAppTitle || !result.hasMetrics || !result.hasTribes || !result.hasProposal || !result.hasDecision || !result.hasEmergence || result.rootChildren < 1) {
  throw new Error(`Browser smoke failed: ${JSON.stringify(result)}`);
}

const measuredTabHeights = [
  ...initialTabHeights,
  ...emergencePlaceholderTabHeights,
  ...emergenceResultTabHeights,
  ...runningTabHeights,
];
if (measuredTabHeights.some((height) => height < 36 || height > 44)) {
  throw new Error(`Tab buttons should keep a stable compact height: ${JSON.stringify({ initialTabHeights, emergencePlaceholderTabHeights, emergenceResultTabHeights, runningTabHeights })}`);
}

const uniqueTabHeights = new Set(measuredTabHeights);
if (uniqueTabHeights.size !== 1) {
  throw new Error(`Tab buttons should not resize across views: ${JSON.stringify({ initialTabHeights, emergencePlaceholderTabHeights, emergenceResultTabHeights, runningTabHeights })}`);
}

console.log(`Browser smoke passed: ${baseUrl}`);
console.log(`Screenshot: ${screenshotPath}`);

async function tabHeights(page) {
  return page.locator(".tabs button").evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().height)));
}
