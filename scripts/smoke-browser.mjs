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
await page.getByRole("button", { name: /Emergence/ }).click();
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
const result = await page.evaluate(() => ({
  title: document.title,
  rootChildren: document.querySelector("#root")?.children.length ?? 0,
  hasAppTitle: document.body.innerText.includes("Economic Simulator"),
  hasMetrics: document.body.innerText.includes("COMPLETION"),
  hasAlignmentMetric: document.body.innerText.includes("LEDGER ALIGN"),
  hasTribes: document.body.innerText.includes("Current inventories"),
  hasProposal: document.body.innerText.includes("Current proposal"),
  hasDecision: document.body.innerText.toLowerCase().includes("accept trade") || document.body.innerText.toLowerCase().includes("reject trade"),
  hasLedger: document.body.innerText.toLowerCase().includes("decision ledger"),
  hasAgreement: document.body.innerText.toLowerCase().includes("aligned with the ledger") || document.body.innerText.toLowerCase().includes("diverged from the ledger"),
  hasExchangeRatio: document.body.innerText.toLowerCase().includes("exchange ratio"),
  hasEmergence: Boolean([...document.querySelectorAll(".tabs button")].find((button) => button.innerText.includes("Emergence"))),
}));
await page.getByRole("button", { name: /^Auto$/ }).click();
await page.getByRole("button", { name: /^Pause$/ }).waitFor();
await page.getByRole("button", { name: /Run emergence/ }).click();
await page.waitForFunction(() => document.body.innerText.includes("Findings"));
await page.getByRole("button", { name: /^Auto$/ }).waitFor();
await page.screenshot({ path: screenshotPath, fullPage: true });

if (pageErrors.length > 0 || consoleProblems.length > 0) {
  throw new Error(JSON.stringify({ pageErrors, consoleProblems }, null, 2));
}

if (!result.hasAppTitle || !result.hasMetrics || !result.hasAlignmentMetric || !result.hasTribes || !result.hasProposal || !result.hasDecision || !result.hasLedger || !result.hasAgreement || !result.hasExchangeRatio || !result.hasEmergence || result.rootChildren < 1) {
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

await page.setViewportSize({ width: 390, height: 900 });
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /Run emergence/ }).click();
await page.waitForFunction(() => document.body.innerText.includes("Findings"));
const mobileActiveTab = await activeTabVisibility(page);
if (!mobileActiveTab.fullyVisible) {
  throw new Error(`Active mobile tab should be visible after programmatic view change: ${JSON.stringify(mobileActiveTab)}`);
}

await browser.close();

console.log(`Browser smoke passed: ${baseUrl}`);
console.log(`Screenshot: ${screenshotPath}`);

async function tabHeights(page) {
  return page.locator(".tabs button").evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().height)));
}

async function activeTabVisibility(page) {
  return page.locator(".tabs button.active").evaluate((button) => {
    const tabs = button.closest(".tabs");
    const buttonRect = button.getBoundingClientRect();
    const tabsRect = tabs.getBoundingClientRect();

    return {
      fullyVisible: buttonRect.left >= tabsRect.left && buttonRect.right <= tabsRect.right,
      buttonLeft: Math.round(buttonRect.left),
      buttonRight: Math.round(buttonRect.right),
      tabsLeft: Math.round(tabsRect.left),
      tabsRight: Math.round(tabsRect.right),
      scrollLeft: Math.round(tabs.scrollLeft),
    };
  });
}
