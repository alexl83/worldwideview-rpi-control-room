import process from "node:process";
import puppeteer from "puppeteer-core";

const baseUrl = (process.env.WWV_BROWSER_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const profileDir = process.env.WWV_BROWSER_PROFILE ?? "/var/lib/wwv-browser/profile";
const email = process.env.WWV_BROWSER_EMAIL ?? "";
const password = process.env.WWV_BROWSER_PASSWORD ?? "";
const headlessSessionId = process.env.WWV_HEADLESS_SESSION_ID
  ?? "00000000-0000-4000-8000-000000000001";

let browser;
let page;
let loadedBuildId = "";
let healthCheckRunning = false;

function log(message, details = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), message, ...details }));
}

async function loginIfNeeded() {
  if (!page.url().includes("/login")) return;
  if (!email || !password) throw new Error("WWV headless session requires login credentials");

  await page.waitForSelector("#email", { timeout: 30_000 });
  await page.type("#email", email);
  await page.type("#password", password);
  await page.click('button[type="submit"]');
  try {
    await page.waitForFunction(
      () => window.location.pathname !== "/login",
      { timeout: 45_000 },
    );
  } catch {
    const diagnostic = await page.evaluate(() => document.body.innerText.slice(0, 500));
    throw new Error(`WWV headless login failed: ${diagnostic}`);
  }
  log("authenticated");
}

async function currentBuild() {
  try {
    const response = await fetch(`${baseUrl}/api/build`);
    if (response.ok) {
      const info = await response.json();
      return String(info.build_id ?? Date.now());
    }
  } catch {}
  return String(Date.now());
}

async function openGlobe() {
  const build = await currentBuild();
  await page.goto(`${baseUrl}/?headless=1&build=${build}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await loginIfNeeded();
  if (!page.url().startsWith(baseUrl)) {
    await page.goto(`${baseUrl}/?headless=1&build=${build}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  }
  await page.waitForSelector('input[placeholder="Search places, addresses, flights..."]', {
    timeout: 90_000,
  });
  loadedBuildId = build;
  log("globe ready", { url: page.url() });
}

async function start() {
  browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    headless: true,
    userDataDir: profileDir,
    defaultViewport: { width: 1024, height: 640, deviceScaleFactor: 1 },
    args: [
      "--disable-dev-shm-usage",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--no-first-run",
      "--no-default-browser-check",
      "--mute-audio",
    ],
  });

  page = (await browser.pages())[0] ?? await browser.newPage();
  await page.evaluateOnNewDocument((sessionId) => {
    sessionStorage.setItem("wwv-globe-session-id", sessionId);
  }, headlessSessionId);
  page.on("pageerror", (error) => log("page error", { error: String(error) }));
  await openGlobe();

  setInterval(async () => {
    if (healthCheckRunning) return;
    healthCheckRunning = true;
    try {
      if (page.isClosed()) throw new Error("page closed");
      if (page.url().includes("/login")) await loginIfNeeded();
      const serverBuildId = await currentBuild();
      if (serverBuildId && serverBuildId !== loadedBuildId) {
        log("new build detected", { loadedBuildId, serverBuildId });
        await openGlobe();
      }
      await page.evaluate(() => document.visibilityState);
    } catch (error) {
      log("health check failed", { error: String(error) });
      await browser?.close().catch(() => {});
      process.exit(1);
    } finally {
      healthCheckRunning = false;
    }
  }, 30_000).unref();
}

async function shutdown(signal) {
  log("shutting down", { signal });
  await browser?.close().catch(() => {});
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

start().catch((error) => {
  log("fatal", { error: error?.stack ?? String(error) });
  process.exit(1);
});
