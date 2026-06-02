#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const PORT = Number(process.env.SMOKE_PORT || 3001);
const BASE_URL = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${PORT}`;
const READY_TIMEOUT_MS = Number(process.env.SMOKE_READY_TIMEOUT_MS || 60000);
const startedAt = Date.now();

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function readEnvFile(name) {
  const path = resolve(REPO_ROOT, name);
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

const envFile = { ...readEnvFile(".env"), ...readEnvFile(".env.local"), ...readEnvFile(".env.production") };
const SMOKE_PASSWORD = process.env.SMOKE_APP_PASSWORD || envFile.APP_PASSWORD || "smoke-default-password";
if (!process.env.SMOKE_APP_PASSWORD && !envFile.APP_PASSWORD) {
  console.warn("[smoke] no APP_PASSWORD found in .env or env; using fallback 'smoke-default-password'");
}
const AUTH_SECRET = process.env.AUTH_SECRET || envFile.AUTH_SECRET || `smoke-secret-${Math.random().toString(36).slice(2, 12)}`;
const log = (...args) => console.log("[smoke]", ...args);
const fail = (msg, err) => {
  console.error(`[smoke] FAIL: ${msg}`);
  if (err) console.error(err);
  process.exitCode = 1;
};

async function waitForServer(child) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next start exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(`${BASE_URL}/login`, { redirect: "manual" });
      if (res.status < 500) return;
      lastError = new Error(`login returned ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    await delay(500);
  }
  throw new Error(
    `server did not become ready within ${READY_TIMEOUT_MS}ms (last error: ${lastError?.message || "unknown"})`
  );
}

async function probe(path, { expectStatus, expectJson, method = "GET", body, headers = {} } = {}) {
  const url = `${BASE_URL}${path}`;
  const init = { method, redirect: "manual", headers: { Accept: "application/json", ...headers } };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    if (init.headers && !init.headers["Content-Type"]) {
      init.headers["Content-Type"] = "application/json";
    }
  }
  const res = await fetch(url, init);
  const status = res.status;
  const raw = await res.text();
  let parsed = raw;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // keep raw
    }
  }
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const ok =
    expectStatus === undefined ? status < 500 : status === expectStatus;
  log(`${ok ? "✓" : "✗"} ${method} ${path} → ${status}`);
  if (!ok) {
    throw new Error(
      `unexpected status for ${path}: got ${status}, expected ${expectStatus ?? "<500"}; body=${raw.slice(0, 200)}`
    );
  }
  if (expectJson) {
    for (const key of Object.keys(expectJson)) {
      if (parsed?.[key] !== expectJson[key]) {
        throw new Error(
          `unexpected ${path}.${key}: got ${JSON.stringify(parsed?.[key])}, expected ${JSON.stringify(expectJson[key])}`
        );
      }
    }
  }
  return { status, body: parsed, setCookies, headers: res.headers };
}

function extractSessionCookie(setCookies) {
  if (!setCookies?.length) return null;
  for (const raw of setCookies) {
    const firstSegment = raw.split(";")[0];
    if (firstSegment.startsWith("supr_auth_token=")) {
      return firstSegment;
    }
  }
  return null;
}

async function main() {
  log(`starting next start on :${PORT}`);
  const child = spawn(
    "node",
    ["--disable-warning=DEP0205", "node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "production",
        APP_PASSWORD: SMOKE_PASSWORD,
        AUTH_SECRET,
        PORT: String(PORT),
        HOSTNAME: "127.0.0.1",
      },
    }
  );

  let stdoutBuf = "";
  let stderrBuf = "";
  child.stdout.on("data", (b) => {
    stdoutBuf += b.toString();
  });
  child.stderr.on("data", (b) => {
    stderrBuf += b.toString();
  });

  const cleanup = () => {
    if (child.exitCode === null) {
      try {
        child.kill("SIGTERM");
      } catch {}
      setTimeout(() => {
        if (child.exitCode === null) {
          try {
            child.kill("SIGKILL");
          } catch {}
        }
      }, 3000).unref();
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    await waitForServer(child);
    log("server is up");

    const status = await probe("/api/auth/status", { expectStatus: 200 });
    if (status.body?.secured !== true) {
      throw new Error(
        `expected /api/auth/status to report secured=true with APP_PASSWORD set, got ${JSON.stringify(status.body)}`
      );
    }

    const login = await probe("/api/auth/login", {
      method: "POST",
      expectStatus: 200,
      body: { password: SMOKE_PASSWORD },
    });
    const cookieValue = extractSessionCookie(login.setCookies);
    if (!cookieValue) {
      throw new Error(
        `expected login to set supr_auth_token cookie, got setCookies=${JSON.stringify(login.setCookies)}`
      );
    }
    const authHeaders = { Cookie: cookieValue };

    const health = await probe("/api/health/production", { expectStatus: 200, headers: authHeaders });
    const healthStatus = health.body?.status;
    if (healthStatus !== "pass" && healthStatus !== "warn") {
      throw new Error(
        `expected /api/health/production to be 'pass' or 'warn', got '${healthStatus}'; failures=${JSON.stringify(health.body?.failures)}`
      );
    }
    log(`health status: ${healthStatus}`);

    // Security headers are applied to every route.
    const headerProbe = await probe("/login", { expectStatus: 200 });
    const headerChecks = {
      "content-security-policy": headerProbe.headers.get("content-security-policy"),
      "x-content-type-options": headerProbe.headers.get("x-content-type-options"),
      "x-frame-options": headerProbe.headers.get("x-frame-options"),
      "referrer-policy": headerProbe.headers.get("referrer-policy"),
      "strict-transport-security": headerProbe.headers.get("strict-transport-security"),
      "x-request-id": headerProbe.headers.get("x-request-id"),
    };
    for (const [name, value] of Object.entries(headerChecks)) {
      if (!value) {
        throw new Error(`expected ${name} header to be set, got null`);
      }
    }
    if (!/Content-Security-Policy|X-Content-Type-Options/i.test(JSON.stringify(headerChecks))) {
      log("headers:", headerChecks);
    }
    log(`security headers ok (${Object.keys(headerChecks).length})`);

    log("all smoke probes passed in", Date.now() - startedAt, "ms");
  } catch (e) {
    fail(e.message, e);
    if (stdoutBuf) console.error("[smoke] --- next stdout ---\n" + stdoutBuf);
    if (stderrBuf) console.error("[smoke] --- next stderr ---\n" + stderrBuf);
  } finally {
    cleanup();
    await delay(500);
  }
}

main().catch((e) => fail(e.message, e));
