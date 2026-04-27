#!/usr/bin/env node
"use strict";

const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const VALID_REPOS = new Set(["workspace", "core-lint", "core-ui", "portal", "pylon", "scripts"]);
const CORE_LINT_CONSUMERS = ["core-ui", "portal", "pylon", "scripts"];
/** Total width (including `+`/`|` borders) for all preflight ASCII tables. */
const STANDARD_TABLE_WIDTH = 150;
/** Column inner widths for the streaming TAP test table; must satisfy `computeBorderLen` = STANDARD_TABLE_WIDTH. */
const LIVE_TEST_TABLE_WIDTHS = [5, 10, 56, 66];

/** Strip workspace root from log text so CI/local output does not leak absolute paths. */
function sanitizeLogPaths(text) {
  if (!text || typeof text !== "string") return text;
  let out = text;
  const rootAbs = path.normalize(ROOT);
  const variants = new Set([
    rootAbs,
    `${rootAbs}${path.sep}`,
    rootAbs.replace(/\\/g, "/"),
    `${rootAbs.replace(/\\/g, "/")}/`,
  ]);
  for (const v of variants) {
    if (v.length >= 1) out = out.split(v).join("");
  }
  return out;
}

/** Prefer repo-relative paths for tables and summaries (under workspace ROOT). */
function toWorkspaceRelativeDisplay(p) {
  if (p == null || p === "") return p;
  const s = String(p).trim();
  if (!s || s === "-") return s;
  const abs = path.isAbsolute(s) ? path.normalize(s) : path.normalize(path.join(ROOT, s));
  const rootAbs = path.normalize(ROOT);
  if (abs === rootAbs || abs.startsWith(`${rootAbs}${path.sep}`)) {
    let rel = path.relative(rootAbs, abs);
    if (!rel || rel === "") rel = ".";
    return rel.split(path.sep).join("/");
  }
  return path.basename(abs);
}

/** Compact test-file display (drop <repo>/tests/ or tests/ prefix). */
function toTestFileDisplayPath(p) {
  const rel = toWorkspaceRelativeDisplay(p);
  if (!rel || rel === "-") return rel;
  return rel.replace(/^[^/]+\/tests\//, "").replace(/^tests\//, "");
}

function printRepoCheckSectionBanner(repoName) {
  const inner = `=== CHECK ${String(repoName).toUpperCase()} ===`;
  if (inner.length >= STANDARD_TABLE_WIDTH) {
    console.log(`\n${inner.slice(0, STANDARD_TABLE_WIDTH)}`);
    return;
  }
  const pad = STANDARD_TABLE_WIDTH - inner.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  console.log(`\n${"=".repeat(left)}${inner}${"=".repeat(right)}`);
}

function printCenteredBanner(label) {
  const inner = `=== ${String(label).toUpperCase()} ===`;
  if (inner.length >= STANDARD_TABLE_WIDTH) {
    console.log(`\n${inner.slice(0, STANDARD_TABLE_WIDTH)}`);
    return;
  }
  const pad = STANDARD_TABLE_WIDTH - inner.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  console.log(`\n${"=".repeat(left)}${inner}${"=".repeat(right)}`);
}

function parseArgs(argv) {
  const args = {
    repo: "all",
    bump: "",
    noFrozenLockfile: false,
    dryRun: false,
    summaryJson: false,
    syncCoreLintVersion: false,
    refreshCoreLintLockfiles: false,
    coreLintVersion: "local",
    coreUiConsumerSource: "repo-main",
    coreUiConsumerRef: "main",
    verbose: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo" && argv[i + 1]) {
      args.repo = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (arg.startsWith("--repo=")) {
      args.repo = String(arg.slice("--repo=".length)).trim();
      continue;
    }
    if (arg === "--bump" && argv[i + 1]) {
      args.bump = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (arg.startsWith("--bump=")) {
      args.bump = String(arg.slice("--bump=".length)).trim();
      continue;
    }
    if (arg === "--no-frozen-lockfile") {
      args.noFrozenLockfile = true;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--summary-json") {
      args.summaryJson = true;
      continue;
    }
    if (arg === "--sync-core-lint-version") {
      args.syncCoreLintVersion = true;
      continue;
    }
    if (arg === "--refresh-core-lint-lockfiles") {
      args.refreshCoreLintLockfiles = true;
      continue;
    }
    if (arg === "--core-lint-version" && argv[i + 1]) {
      args.coreLintVersion = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (arg.startsWith("--core-lint-version=")) {
      args.coreLintVersion = String(arg.slice("--core-lint-version=".length)).trim();
      continue;
    }
    if (arg === "--core-ui-consumer-source" && argv[i + 1]) {
      args.coreUiConsumerSource = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (arg.startsWith("--core-ui-consumer-source=")) {
      args.coreUiConsumerSource = String(arg.slice("--core-ui-consumer-source=".length)).trim();
      continue;
    }
    if (arg === "--core-ui-consumer-ref" && argv[i + 1]) {
      args.coreUiConsumerRef = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (arg.startsWith("--core-ui-consumer-ref=")) {
      args.coreUiConsumerRef = String(arg.slice("--core-ui-consumer-ref=".length)).trim();
      continue;
    }
    if (arg === "--verbose") {
      args.verbose = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelpAndExit(0);
    }
  }

  if (args.repo !== "all" && !VALID_REPOS.has(args.repo)) {
    printHelpAndExit(1, `Invalid --repo value "${args.repo}"`);
  }
  if (args.bump && args.repo === "all") {
    printHelpAndExit(1, "--bump requires a single --repo target");
  }
  if (args.bump && args.repo === "workspace") {
    printHelpAndExit(1, "--bump does not apply to workspace root");
  }
  if (!args.coreLintVersion) {
    printHelpAndExit(1, "--core-lint-version must be 'local', 'skip', or an explicit version");
  }
  if (!["local", "repo-main"].includes(args.coreUiConsumerSource)) {
    printHelpAndExit(1, "--core-ui-consumer-source must be 'local' or 'repo-main'");
  }
  if (!args.coreUiConsumerRef) {
    args.coreUiConsumerRef = "main";
  }

  return args;
}

function printHelpAndExit(code, error = "") {
  if (error) {
    console.error(`\nError: ${error}\n`);
  }
  console.log(`Usage:
  node wrang-release.cjs [--repo <name|all>] [--bump <patch|minor|major|x.y.z>] [--dry-run] [--summary-json] [--core-lint-version <local|skip|x.y.z>] [--core-ui-consumer-source <local|repo-main>] [--core-ui-consumer-ref <branch>] [--sync-core-lint-version] [--refresh-core-lint-lockfiles] [--verbose] [--no-frozen-lockfile]

Examples:
  node wrang-release.cjs
  node wrang-release.cjs --repo core-ui
  node wrang-release.cjs --repo core-ui --bump patch --dry-run
  node wrang-release.cjs --repo portal --dry-run --summary-json
  node wrang-release.cjs --core-lint-version local
  node wrang-release.cjs --core-lint-version 0.2.2
  node wrang-release.cjs --sync-core-lint-version
  node wrang-release.cjs --refresh-core-lint-lockfiles
  node wrang-release.cjs --core-ui-consumer-source repo-main --core-ui-consumer-ref main
  node wrang-release.cjs --verbose
  node wrang-release.cjs --repo core-ui --bump patch
  node wrang-release.cjs --repo portal --no-frozen-lockfile

Repos:
  workspace, core-lint, core-ui, portal, pylon, scripts, all`);
  process.exit(code);
}

function run(command, cwd = ROOT) {
  const result = runWithResult(command, cwd);
  if (!result.ok) {
    const location = path.relative(ROOT, cwd) || ".";
    throw new Error(`Command failed in ${location}: ${command}`);
  }
}

function runWithResult(command, cwd = ROOT, options = {}) {
  const { printOutput = false } = options;
  const childEnv = { ...process.env };
  // Some local shells inject npm_config_* keys that modern npm treats as
  // unsupported/legacy config aliases; remove known noisy keys for cleaner runs.
  for (const key of Object.keys(childEnv)) {
    const normalized = key.toLowerCase();
    if (!normalized.startsWith("npm_config_")) continue;
    if (
      normalized.includes("pylonline_registry") ||
      normalized.includes("verify_deps_before_run") ||
      normalized.includes("npm_globalconfig") ||
      normalized.includes("jsr_registry")
    ) {
      delete childEnv[key];
    }
  }
  // Keep preflight output readable when nested npm invocations emit
  // env-config deprecation chatter that is not actionable for repo code.
  childEnv.NPM_CONFIG_LOGLEVEL = childEnv.NPM_CONFIG_LOGLEVEL || "error";
  childEnv.npm_config_loglevel = childEnv.npm_config_loglevel || "error";
  const result = spawnSync(command, {
    cwd,
    shell: true,
    stdio: "pipe",
    encoding: "utf8",
    env: childEnv,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  if (printOutput) {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  }
  return {
    ok: result.status === 0,
    status: result.status,
    command,
    cwd,
    stdout,
    stderr,
  };
}

async function runWithStreamingResult(command, cwd = ROOT, options = {}) {
  const { printOutput = false, onLine, env: envExtra = null } = options;
  const childEnv = { ...process.env, ...(envExtra || {}) };
  for (const key of Object.keys(childEnv)) {
    const normalized = key.toLowerCase();
    if (!normalized.startsWith("npm_config_")) continue;
    if (
      normalized.includes("pylonline_registry") ||
      normalized.includes("verify_deps_before_run") ||
      normalized.includes("npm_globalconfig") ||
      normalized.includes("jsr_registry")
    ) {
      delete childEnv[key];
    }
  }
  childEnv.NPM_CONFIG_LOGLEVEL = childEnv.NPM_CONFIG_LOGLEVEL || "error";
  childEnv.npm_config_loglevel = childEnv.npm_config_loglevel || "error";

  return await new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let stderrBuffer = "";

    const flushBufferedLines = (chunk, isStdErr) => {
      const next = (isStdErr ? stderrBuffer : stdoutBuffer) + chunk;
      const lines = next.split(/\r?\n/);
      const remainder = lines.pop() || "";
      for (const line of lines) {
        if (onLine) onLine(line, { isStdErr });
      }
      if (isStdErr) stderrBuffer = remainder;
      else stdoutBuffer = remainder;
    };

    child.stdout.on("data", (data) => {
      const chunk = String(data);
      stdout += chunk;
      if (printOutput) process.stdout.write(chunk);
      if (onLine) flushBufferedLines(chunk, false);
    });
    child.stderr.on("data", (data) => {
      const chunk = String(data);
      stderr += chunk;
      if (printOutput) process.stderr.write(chunk);
      if (onLine) flushBufferedLines(chunk, true);
    });

    child.on("close", (code) => {
      if (onLine) {
        if (stdoutBuffer) onLine(stdoutBuffer, { isStdErr: false });
        if (stderrBuffer) onLine(stderrBuffer, { isStdErr: true });
      }
      resolve({
        ok: code === 0,
        status: code,
        command,
        cwd,
        stdout,
        stderr,
      });
    });
  });
}

function nowMs() {
  return Date.now();
}

function formatDuration(ms) {
  const sec = (ms / 1000).toFixed(3);
  return `${sec}s`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveExpectedCoreLintVersion(options) {
  const configured = String(options.coreLintVersion || "local").trim();
  if (configured === "skip") {
    return { version: "", source: "skipped" };
  }
  if (configured === "local") {
    const coreLintPkgPath = path.join(ROOT, "core-lint", "package.json");
    const coreLintVersion = String(readJson(coreLintPkgPath).version || "").trim();
    if (!coreLintVersion) {
      throw new Error("Unable to resolve core-lint version from core-lint/package.json");
    }
    return { version: coreLintVersion, source: "local" };
  }
  return { version: configured, source: "explicit" };
}

function resolveWorkspacePackageVersion(repoName) {
  const packageJsonPath = path.join(ROOT, repoName, "package.json");
  if (!fs.existsSync(packageJsonPath)) return "";
  try {
    const pkg = readJson(packageJsonPath);
    return String(pkg?.version || "").trim();
  } catch (_error) {
    return "";
  }
}

function buildWorkspaceInternalLockRefreshCommand() {
  const coreLintVersion = resolveWorkspacePackageVersion("core-lint");
  const coreUiVersion = resolveWorkspacePackageVersion("core-ui");
  const targets = [];
  if (coreLintVersion) targets.push(`@pylonline/core-lint@${coreLintVersion}`);
  if (coreUiVersion) targets.push(`@pylonline/core-ui@${coreUiVersion}`);
  if (!targets.length) return "";
  return `pnpm update -r ${targets.join(" ")} --lockfile-only`;
}

function syncCoreLintPins(options) {
  const resolved = resolveExpectedCoreLintVersion(options);
  if (resolved.source === "skipped") {
    return {
      coreLintVersion: "",
      source: "skipped",
      changed: [],
      validated: [],
      skipped: true,
    };
  }

  const coreLintVersion = resolved.version;
  const coreLintPkgPath = path.join(ROOT, "core-lint", "package.json");
  if (resolved.source === "local" && !fs.existsSync(coreLintPkgPath)) {
    throw new Error("core-lint/package.json not found for local version resolution");
  }

  const mismatches = [];
  for (const repoName of CORE_LINT_CONSUMERS) {
    const pkgPath = path.join(ROOT, repoName, "package.json");
    if (!fs.existsSync(pkgPath)) continue;
    const pkg = readJson(pkgPath);
    const current = pkg?.devDependencies?.["@pylonline/core-lint"];
    if (current === coreLintVersion) continue;

    mismatches.push({
      repo: repoName,
      current: current || "(missing)",
      expected: coreLintVersion,
      filePath: pkgPath,
      pkg,
    });
  }

  if (!mismatches.length) {
    return {
      coreLintVersion,
      source: resolved.source,
      changed: [],
      validated: CORE_LINT_CONSUMERS,
      skipped: false,
    };
  }

  if (!options.syncCoreLintVersion) {
    const details = mismatches
      .map((entry) => `${entry.repo}: ${entry.current} -> ${entry.expected}`)
      .join(", ");
    console.warn(
      `core-lint version pin mismatch detected (${details}). Auto-syncing pins to ${coreLintVersion}.`
    );
  }

  const changed = [];
  for (const mismatch of mismatches) {
    const pkg = mismatch.pkg;
    pkg.devDependencies = pkg.devDependencies || {};
    pkg.devDependencies["@pylonline/core-lint"] = coreLintVersion;
    writeJson(mismatch.filePath, pkg);
    changed.push(mismatch.repo);
  }

  return {
    coreLintVersion,
    source: resolved.source,
    changed,
    validated: CORE_LINT_CONSUMERS,
    skipped: false,
  };
}

function refreshCoreLintConsumerLockfiles(repos) {
  const refreshed = [];
  for (const repoName of repos) {
    const dir = repoDir(repoName);
    const lockPath = path.join(dir, "package-lock.json");
    if (!fs.existsSync(lockPath)) continue;
    console.log(`\n=== Refresh npm lockfile checksums (${repoName}) ===`);
    run("npm install --package-lock-only --ignore-scripts", dir);
    refreshed.push(repoName);
  }
  return refreshed;
}

function parseTapResultLine(line) {
  const trimmed = String(line || "").trim();
  let match = trimmed.match(/^ok\s+(\d+)\s+-\s+(.+)$/);
  if (match) return { id: Number(match[1]), name: match[2], status: "passed" };
  match = trimmed.match(/^not ok\s+(\d+)\s+-\s+(.+)$/);
  if (match) return { id: Number(match[1]), name: match[2], status: "failed" };
  return null;
}

function visibleTextLength(value) {
  return String(value ?? "").replace(/\x1b\[[0-9;]*m/g, "").length;
}

function buildTableBorder(widths) {
  return `+${widths.map((w) => "-".repeat(w + 2)).join("+")}+`;
}

function formatTableDataRow(cells, widths) {
  return cells
    .map((cell, idx) => {
      const raw = String(cell ?? "");
      const padding = Math.max(0, widths[idx] - visibleTextLength(raw));
      return ` ${raw}${" ".repeat(padding)} `;
    })
    .join("|");
}

function printLiveTestTableHeader() {
  const border = buildTableBorder(LIVE_TEST_TABLE_WIDTHS);
  const headerRow = formatTableDataRow(["#", "status", "file", "test"], LIVE_TEST_TABLE_WIDTHS);
  console.log(border);
  console.log(`|${headerRow}|`);
  console.log(border);
}

function printLiveTestTableFooter() {
  console.log(buildTableBorder(LIVE_TEST_TABLE_WIDTHS));
}

function printLiveTestTableRow(testResult) {
  const w = LIVE_TEST_TABLE_WIDTHS;
  const row = [
    `${testResult.id}`,
    colorizeStatus(testResult.status, testResult.status.toUpperCase()),
    ellipsize(toTestFileDisplayPath(testResult.file || "-"), w[2]),
    ellipsize(testResult.name || "", w[3]),
  ];
  const rowText = formatTableDataRow(row, LIVE_TEST_TABLE_WIDTHS);
  console.log(`|${rowText}|`);
}

async function recordCommandCheck(summary, failures, name, command, cwd, options = {}) {
  const { verbose = false } = options;
  const startedAt = nowMs();
  const onLine = options.onLine || null;
  const heartbeat = options.heartbeat || false;
  let heartbeatTimer = null;
  if (!verbose && heartbeat) {
    heartbeatTimer = setInterval(() => {
      const elapsedSec = Math.floor((nowMs() - startedAt) / 1000);
      if (elapsedSec >= 5) {
        console.log(`${name} still running... ${elapsedSec}s`);
      }
    }, 5000);
  }
  const parseCoreLintSteps = Boolean(options.parseCoreLintCheckSteps) && !verbose;
  const checkStepMarker = "CORE_LINT_CHECK_STEP";
  const userOnLine = options.onLine;
  const combinedOnLine =
    parseCoreLintSteps || userOnLine
      ? (line, meta) => {
          if (parseCoreLintSteps && line.startsWith(`${checkStepMarker}\t`)) {
            const fields = line.split("\t");
            if (fields[1] === "ok") {
              const label = fields.slice(2).join("\t").trim() || "step";
              console.log(`  ${label}: passed`);
            }
          }
          if (userOnLine) userOnLine(line, meta);
        }
      : null;

  const result = await runWithStreamingResult(command, cwd, {
    printOutput: verbose,
    onLine: combinedOnLine,
    ...(parseCoreLintSteps ? { env: { CORE_LINT_CHECK_STEPS: "1" } } : {}),
  });
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  const status = result.ok ? "passed" : "failed";
  const durationMs = nowMs() - startedAt;
  summary.checks.push({
    name,
    status,
    durationMs,
  });
  if (!result.ok) {
    const location = path.relative(ROOT, cwd) || ".";
    const details = extractFailureDetails(`${result.stdout}\n${result.stderr}`);
    let failureExcerpt = "";
    if (!verbose) {
      const merged = `${result.stdout}\n${result.stderr}`.trim();
      const excerpt = extractFailureExcerpt(merged);
      if (excerpt) failureExcerpt = excerpt;
    }
    failures.push({
      name,
      location,
      command,
      exitCode: result.status,
      ...(failureExcerpt ? { failureExcerpt } : {}),
      ...details,
    });
  }
  return {
    ...result,
    durationMs,
  };
}

function extractFailureDetails(output) {
  const text = String(output || "");
  const lines = text.split(/\r?\n/);
  const testName =
    lines
      .map((line) => line.trim())
      .find((line) => /^not ok\s+\d+\s+-\s+/.test(line))
      ?.replace(/^not ok\s+\d+\s+-\s+/, "") || "";
  const locationMatch = text.match(/location:\s*'([^']+)'/m);
  let filePath = "";
  if (locationMatch && locationMatch[1]) {
    filePath = locationMatch[1].replace(/:\d+:\d+$/, "");
  }
  if (!filePath) {
    const absoluteMatch = text.match(/(\/[^\s'"]+\.test\.[cm]?[jt]s)(?::\d+:\d+)?/m);
    if (absoluteMatch && absoluteMatch[1]) {
      filePath = absoluteMatch[1];
    }
  }
  if (!filePath) {
    const genericMatch =
      text.match(/(?:^|\s)(tests\/[^\s:]+\.test\.[cm]?[jt]s)\b/m) ||
      text.match(/(?:^|\s)([^:\s]*tests\/[^\s:]+\.test\.[cm]?[jt]s)\b/m);
    if (genericMatch && genericMatch[1] && !genericMatch[1].includes("*")) {
      filePath = genericMatch[1];
    }
  }
  const relFile = filePath ? toWorkspaceRelativeDisplay(filePath) : "";
  return {
    ...(testName ? { testName } : {}),
    ...(relFile ? { filePath: relFile } : {}),
  };
}

function extractFailureExcerpt(output) {
  const text = String(output || "").trim();
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const matcher = /(not ok\s+\d+\s+-|(^|\s)error(\s|:)|ERR!|ELIFECYCLE|failed\b|✖)/i;
  const hitIndexes = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (matcher.test(lines[i])) hitIndexes.push(i);
  }
  if (!hitIndexes.length) {
    const tailCount = Math.min(25, lines.length);
    return lines.slice(lines.length - tailCount).join("\n");
  }

  const keep = new Set();
  for (const idx of hitIndexes) {
    const start = Math.max(0, idx - 2);
    const end = Math.min(lines.length - 1, idx + 3);
    for (let i = start; i <= end; i += 1) keep.add(i);
  }
  const selected = [...keep].sort((a, b) => a - b).map((i) => lines[i]);
  const maxLines = 50;
  if (selected.length <= maxLines) return selected.join("\n");
  const head = selected.slice(0, 25);
  const tail = selected.slice(selected.length - 25);
  return `${head.join("\n")}\n... (excerpt truncated) ...\n${tail.join("\n")}`;
}

function checkNameToRepo(checkName) {
  if (checkName.startsWith("core-lint pin") || checkName.startsWith("core-lint lockfile")) {
    return "workspace";
  }
  if (checkName.startsWith("workspace")) return "workspace";
  const repos = ["core-lint", "core-ui", "scripts", "portal", "pylon"];
  for (const repo of repos) {
    if (checkName.startsWith(`${repo} `) || checkName === repo) return repo;
  }
  return "workspace";
}

function computeRepoStatuses(checks) {
  const order = ["workspace", "core-lint", "core-ui", "scripts", "portal", "pylon"];
  const statuses = {};
  for (const repo of order) {
    statuses[repo] = {
      repo,
      status: "skipped",
      stepsPassed: 0,
      stepsFailed: 0,
      stepsSkipped: 0,
      testsPassed: 0,
      testsFailed: 0,
      testsTotal: 0,
    };
  }
  for (const check of checks) {
    const repo = checkNameToRepo(check.name);
    if (!statuses[repo]) continue;
    if (check.status === "failed") {
      statuses[repo].stepsFailed += 1;
    } else if (check.status === "passed") {
      statuses[repo].stepsPassed += 1;
    } else {
      statuses[repo].stepsSkipped += 1;
    }
  }
  for (const repo of order) {
    const entry = statuses[repo];
    if (entry.stepsFailed > 0) entry.status = "failed";
    else if (entry.stepsPassed > 0) entry.status = "passed";
  }
  return order.map((repo) => statuses[repo]);
}

function toRepoDisplayName(repo) {
  return repo === "workspace" ? "pylonline" : repo;
}

function colorizeStatus(status, text) {
  if (!process.stdout.isTTY) return text;
  const reset = "\x1b[0m";
  const red = "\x1b[31m";
  const green = "\x1b[32m";
  const yellow = "\x1b[33m";
  if (status === "failed") return `${red}${text}${reset}`;
  if (status === "passed") return `${green}${text}${reset}`;
  return `${yellow}${text}${reset}`;
}

function printRepoStatusTable(checks, repoReports) {
  const rows = computeRepoStatuses(checks);
  for (const row of rows) {
    const report = repoReports[row.repo];
    if (!report || !Array.isArray(report.tests)) continue;
    for (const test of report.tests) {
      row.testsTotal += 1;
      if (test.status === "failed") row.testsFailed += 1;
      else if (test.status === "passed") row.testsPassed += 1;
    }
  }
  const headers = ["repo", "status"];
  const rawRows = rows.map((row) => [
    toRepoDisplayName(row.repo),
    row.status.toUpperCase(),
    String(row.testsPassed),
    String(row.testsFailed),
    String(row.testsTotal),
  ]);
  headers.push("tests ok", "tests fail", "tests total");
  console.log("\nRepo status table (steps + tests):");
  const displayRows = rawRows.map((row, i) => {
    const cells = [...row];
    cells[1] = colorizeStatus(rows[i].status, cells[1]);
    return cells;
  });
  const totals = rows.reduce(
    (acc, row) => {
      acc.testsPassed += row.testsPassed;
      acc.testsFailed += row.testsFailed;
      acc.testsTotal += row.testsTotal;
      return acc;
    },
    { testsPassed: 0, testsFailed: 0, testsTotal: 0 }
  );
  displayRows.push([
    "TOTAL",
    colorizeStatus("passed", "PASSED"),
    String(totals.testsPassed),
    String(totals.testsFailed),
    String(totals.testsTotal),
  ]);
  printSimpleTable(headers, displayRows, { separatorBeforeLastRow: true });
}

function collectFailedTestsByRepo(repoReports) {
  const order = ["workspace", "core-lint", "core-ui", "scripts", "portal", "pylon"];
  const failed = [];
  for (const repo of order) {
    const report = repoReports[repo];
    if (!report || !Array.isArray(report.tests)) continue;
    for (const test of report.tests) {
      if (test.status !== "failed") continue;
      failed.push({
        repo: toRepoDisplayName(repo),
        id: test.id,
        name: test.name || "-",
        file: test.file ? toTestFileDisplayPath(test.file) : "-",
      });
    }
  }
  return failed;
}

function summarizeCheckCounts(checks) {
  const counts = { passed: 0, failed: 0, skipped: 0 };
  for (const check of checks) {
    if (check.status === "passed") counts.passed += 1;
    else if (check.status === "failed") counts.failed += 1;
    else counts.skipped += 1;
  }
  return counts;
}

function colorizeLabel(kind, text) {
  if (!process.stdout.isTTY) return text;
  const reset = "\x1b[0m";
  const redBold = "\x1b[1;31m";
  const yellowBold = "\x1b[1;33m";
  const greenBold = "\x1b[1;32m";
  if (kind === "error") return `${redBold}${text}${reset}`;
  if (kind === "warn") return `${yellowBold}${text}${reset}`;
  return `${greenBold}${text}${reset}`;
}

function parseTapTests(output) {
  const text = String(output || "");
  const tests = [];
  const lines = text.split(/\r?\n/);
  let pendingFailedTestIndex = -1;
  let discoveredFile = "";
  const locationRegex = /location:\s*'([^']+)'/;
  const absoluteFileRegex = /(\/[^\s'"]+\.test\.[cm]?[jt]s)(?::\d+:\d+)?/;

  for (const line of lines) {
    const trimmed = line.trim();
    let match = trimmed.match(/^ok\s+(\d+)\s+-\s+(.+)$/);
    if (match) {
      tests.push({ id: Number(match[1]), name: match[2], status: "passed", file: "" });
      continue;
    }
    match = trimmed.match(/^not ok\s+(\d+)\s+-\s+(.+)$/);
    if (match) {
      tests.push({ id: Number(match[1]), name: match[2], status: "failed", file: "" });
      pendingFailedTestIndex = tests.length - 1;
      continue;
    }

    const locationMatch = trimmed.match(locationRegex);
    if (locationMatch && locationMatch[1]) {
      const filePath = toWorkspaceRelativeDisplay(locationMatch[1].replace(/:\d+:\d+$/, ""));
      discoveredFile = discoveredFile || filePath;
      if (pendingFailedTestIndex >= 0 && tests[pendingFailedTestIndex]) {
        tests[pendingFailedTestIndex].file = filePath;
        pendingFailedTestIndex = -1;
      }
      continue;
    }

    const absoluteFileMatch = trimmed.match(absoluteFileRegex);
    if (absoluteFileMatch && absoluteFileMatch[1] && !absoluteFileMatch[1].includes("*")) {
      discoveredFile = discoveredFile || toWorkspaceRelativeDisplay(absoluteFileMatch[1]);
    }
  }

  // If TAP stream appears to come from a single concrete test file, apply it
  // so the table has a useful filename for passed test rows too.
  if (discoveredFile) {
    const relDiscovered = toWorkspaceRelativeDisplay(discoveredFile);
    for (const test of tests) {
      if (!test.file) test.file = relDiscovered;
    }
  }
  return tests;
}

function collectFilesRecursive(startDir, extensions) {
  const results = [];
  if (!fs.existsSync(startDir)) return results;
  const stack = [startDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(full);
      }
    }
  }
  return results;
}

function buildTestNameIndex(repoDirPath) {
  const testDirs = ["tests", "test"].map((segment) => path.join(repoDirPath, segment));
  const files = [];
  for (const dir of testDirs) {
    files.push(...collectFilesRecursive(dir, [".test.cjs", ".test.mjs", ".test.js", ".test.ts"]));
  }
  const index = new Map();
  const pattern = /\b(?:test|it)\s*\(\s*["'`]{1}([^"'`]+)["'`]{1}\s*,/g;
  for (const filePath of files) {
    const rel = path.relative(ROOT, filePath) || filePath;
    const content = fs.readFileSync(filePath, "utf8");
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const testName = String(match[1] || "").trim();
      if (!testName) continue;
      if (!index.has(testName)) index.set(testName, []);
      index.get(testName).push(rel);
    }
  }
  return index;
}

function hydrateMissingTestFiles(tests, repoDirPath, cacheRef) {
  const unresolved = tests.some((test) => !test.file || test.file === "-");
  if (!unresolved) return;
  if (!cacheRef.index) {
    cacheRef.index = buildTestNameIndex(repoDirPath);
  }
  for (const test of tests) {
    if (test.file && test.file !== "-") continue;
    const candidates = cacheRef.index.get(test.name) || [];
    if (!candidates.length) continue;
    test.file = candidates[0];
  }
}

function formatFailureDetails(failure) {
  const relPath = failure.filePath ? toTestFileDisplayPath(failure.filePath) : "";
  const showFile = Boolean(relPath && !relPath.includes("*"));
  const fileDetail = showFile ? ` | file: ${relPath}` : "";
  const testDetail = failure.testName ? ` | test: ${failure.testName}` : "";
  const detail = failure.error ? ` | error: ${failure.error}` : "";
  return `${fileDetail}${testDetail}${detail}`;
}

function dedupeFailuresForDisplay(failures) {
  const groupedByRepo = new Map();
  for (const failure of failures) {
    const repo = checkNameToRepo(failure.name);
    const bucket = groupedByRepo.get(repo) || [];
    bucket.push(failure);
    groupedByRepo.set(repo, bucket);
  }

  const result = [];
  for (const [, repoFailures] of groupedByRepo) {
    const hasTestFailure = repoFailures.some(
      (failure) => failure.command === "pnpm run test" && (failure.testName || failure.filePath)
    );

    // If we have a concrete test failure for the repo, suppress generic check failures
    // that usually repeat the same root issue without extra signal.
    const candidates = hasTestFailure
      ? repoFailures.filter((failure) => failure.command !== "pnpm run check")
      : repoFailures;

    const seen = new Set();
    for (const failure of candidates) {
      const key = [
        failure.location || "",
        failure.command || "",
        failure.filePath || "",
        failure.testName || "",
        failure.error || "",
      ].join("::");
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(failure);
    }
  }
  return result;
}

function normalizeCellText(value) {
  return String(value ?? "");
}

function ellipsize(text, maxLen) {
  if (text.length <= maxLen) return text;
  if (maxLen <= 1) return text.slice(0, maxLen);
  return `${text.slice(0, maxLen - 1)}…`;
}

function wrapCell(text, width) {
  if (!text) return [""];
  const lines = [];
  let remaining = text;
  while (remaining.length > width) {
    lines.push(remaining.slice(0, width));
    remaining = remaining.slice(width);
  }
  lines.push(remaining);
  return lines;
}

function printSimpleTable(headers, rows, options = {}) {
  const {
    fixedWidths = null,
    wrapColumns = {},
    ellipsizeColumns = {},
    minTableWidth = STANDARD_TABLE_WIDTH,
    maxTableWidth = STANDARD_TABLE_WIDTH,
    separatorBeforeLastRow = false,
  } = options;
  const visibleLength = (value) =>
    String(value ?? "").replace(/\x1b\[[0-9;]*m/g, "").length;

  const processedRows = rows.map((row) =>
    row.map((cell, idx) => {
      let text = normalizeCellText(cell);
      const maxLen = ellipsizeColumns[idx];
      if (Number.isFinite(maxLen)) text = ellipsize(text, maxLen);
      return text;
    })
  );

  let widths = headers.map((header, idx) =>
    Math.max(header.length, ...processedRows.map((row) => visibleLength(row[idx])))
  );
  if (Array.isArray(fixedWidths) && fixedWidths.length === headers.length) {
    widths = [...fixedWidths];
  }
  const computeBorderLen = (colWidths) => colWidths.reduce((acc, w) => acc + w + 3, 1);
  if (Number.isFinite(minTableWidth)) {
    let borderLen = computeBorderLen(widths);
    if (borderLen < minTableWidth) {
      let deficit = minTableWidth - borderLen;
      let idx = 0;
      while (deficit > 0) {
        widths[idx % widths.length] += 1;
        deficit -= 1;
        idx += 1;
      }
    }
  }
  if (Number.isFinite(maxTableWidth)) {
    let borderLen = computeBorderLen(widths);
    if (borderLen > maxTableWidth) {
      let overshoot = borderLen - maxTableWidth;
      while (overshoot > 0) {
        let widestIdx = 0;
        for (let i = 1; i < widths.length; i += 1) {
          if (widths[i] > widths[widestIdx]) widestIdx = i;
        }
        if (widths[widestIdx] <= 8) break;
        widths[widestIdx] -= 1;
        overshoot -= 1;
      }
    }
  }

  const wrapRowToLines = (cells) => {
    const wrapped = cells.map((cell, idx) => {
      const wrapWidth = wrapColumns[idx];
      if (Number.isFinite(wrapWidth) && wrapWidth > 0) return wrapCell(cell, wrapWidth);
      return [cell];
    });
    const rowHeight = Math.max(...wrapped.map((cellLines) => cellLines.length));
    const lines = [];
    for (let lineIdx = 0; lineIdx < rowHeight; lineIdx += 1) {
      lines.push(
        wrapped.map((cellLines, idx) => {
          const raw = cellLines[lineIdx] || "";
          const padding = Math.max(0, widths[idx] - visibleLength(raw));
          return `${raw}${" ".repeat(padding)}`;
        })
      );
    }
    return lines;
  };

  const border = `+${widths.map((w) => "-".repeat(w + 2)).join("+")}+`;
  const headerCells = headers.map((header, idx) => {
    const padding = Math.max(0, widths[idx] - visibleLength(header));
    return ` ${header}${" ".repeat(padding)} `;
  });
  console.log(border);
  console.log(`|${headerCells.join("|")}|`);
  console.log(border);

  for (let rowIdx = 0; rowIdx < processedRows.length; rowIdx += 1) {
    const row = processedRows[rowIdx];
    if (
      separatorBeforeLastRow &&
      processedRows.length > 1 &&
      rowIdx === processedRows.length - 1
    ) {
      console.log(border);
    }
    const lines = wrapRowToLines(row);
    for (const lineCells of lines) {
      const padded = lineCells.map((cell) => ` ${cell} `);
      console.log(`|${padded.join("|")}|`);
    }
  }
  console.log(border);

}

function printRepoExecutionSummary(repoName, repoReport, repoFailures = [], options = {}) {
  const { liveTestTablePrinted = false } = options;
  const label = repoName === "workspace" ? "Workspace" : `Repo ${repoName}`;
  if (!liveTestTablePrinted) {
    console.log(`\n${label} results:`);
    if (repoReport.tests.length) {
      console.log("Test results:");
      const testRows = repoReport.tests.map((test) => [
        `${test.id}`,
        colorizeStatus(test.status, test.status.toUpperCase()),
        toTestFileDisplayPath(test.file || "-"),
        test.name,
      ]);
      printSimpleTable(["#", "status", "file", "test"], testRows, {
        ellipsizeColumns: { 2: LIVE_TEST_TABLE_WIDTHS[2], 3: LIVE_TEST_TABLE_WIDTHS[3] },
      });
    } else {
      console.log("Test results: none detected");
    }
  }

  console.log("\nSummary:");
  const stepRows = repoReport.steps.map((step) => [
    step.stepName,
    colorizeStatus(step.status, step.status.toUpperCase()),
    formatDuration(step.durationMs),
  ]);
  if (stepRows.length) {
    printSimpleTable(["step", "status", "duration"], stepRows);
  } else {
    console.log("No steps recorded.");
  }

  if (repoFailures.length) {
    const displayFailures = dedupeFailuresForDisplay(repoFailures);
    console.log(`\n${colorizeLabel("error", "Repo failures:")}`);
    for (const failure of displayFailures) {
      console.log(
        `${colorizeLabel("error", "!!")} ${failure.name} [exit ${failure.exitCode}] -> ${failure.command}${formatFailureDetails(failure)}`
      );
      if (failure.failureExcerpt) {
        console.log(`--- failure excerpt (${failure.name}) ---`);
        console.log(sanitizeLogPaths(failure.failureExcerpt));
        console.log("--- end failure excerpt ---");
      }
    }
  }
}

function parseSubmoduleStatusLines(output) {
  const lines = String(output || "").split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^([+\-U ]?)([0-9a-f]{7,40})\s+([^\s]+)(?:\s+\((.+)\))?$/);
    if (!match) continue;
    rows.push({
      state: match[1] || " ",
      sha: match[2],
      path: match[3],
      ref: match[4] || "",
    });
  }
  return rows;
}

function printSubmoduleSummaryFromOutput(output) {
  const rows = parseSubmoduleStatusLines(output);
  if (!rows.length) return;
  console.log("\nPost-submodule summary:");
  printSimpleTable(
    ["repo", "sha", "ref"],
    rows.map((row) => [row.path, row.sha.slice(0, 12), row.ref || "-"])
  );
}

function repoDir(repoName) {
  return path.join(ROOT, repoName);
}

function resolveCoreUiPrepareCommand(repoName, options) {
  if (repoName !== "portal" && repoName !== "pylon") {
    return "pnpm run core-ui:prepare";
  }
  if (options.coreUiConsumerSource === "repo-main") {
    const ref = String(options.coreUiConsumerRef || "main").trim() || "main";
    return `pnpm run core-ui:prepare -- --source remote --path ../core-ui --ref ${ref}`;
  }
  return "pnpm run core-ui:prepare";
}

function resolveRepoCheckCommand(repoName, dir) {
  const fallback = "pnpm run check";
  if (repoName === "workspace") return fallback;
  const packageJsonPath = path.join(dir, "package.json");
  if (!fs.existsSync(packageJsonPath)) return fallback;

  let packageJson;
  try {
    packageJson = readJson(packageJsonPath);
  } catch (_error) {
    return fallback;
  }

  const checkScript = String(packageJson?.scripts?.check || "").trim();
  if (!checkScript) return fallback;
  const match = checkScript.match(/^core-lint\s+check(?:\s+(.*))?$/);
  if (!match) return fallback;

  const coreLintCliPath = path.join(ROOT, "core-lint", "bin", "core-lint.cjs");
  if (!fs.existsSync(coreLintCliPath)) return fallback;
  const extraArgs = match[1] ? ` ${match[1]}` : "";
  return `${process.execPath} ${JSON.stringify(coreLintCliPath)} check${extraArgs}`;
}

function resolveRepoFormatWriteCommand(repoName, dir) {
  const fallback = "pnpm run format:write";
  if (repoName === "workspace") return fallback;
  const packageJsonPath = path.join(dir, "package.json");
  if (!fs.existsSync(packageJsonPath)) return fallback;

  let packageJson;
  try {
    packageJson = readJson(packageJsonPath);
  } catch (_error) {
    return fallback;
  }

  const formatWriteScript = String(packageJson?.scripts?.["format:write"] || "").trim();
  if (!formatWriteScript) return "";
  const match = formatWriteScript.match(/^core-lint\s+format\s+--write(?:\s+(.*))?$/);
  if (!match) return fallback;

  const coreLintCliPath = path.join(ROOT, "core-lint", "bin", "core-lint.cjs");
  if (!fs.existsSync(coreLintCliPath)) return fallback;
  const extraArgs = match[1] ? ` ${match[1]}` : "";
  return `${process.execPath} ${JSON.stringify(coreLintCliPath)} format --write${extraArgs}`;
}

function ensureRepoExists(repoName) {
  const dir = repoDir(repoName);
  if (!fs.existsSync(dir)) {
    throw new Error(`Repo path not found: ${repoName}`);
  }
}

function repoNeedsCoreLintLockfileRefresh(dir) {
  const lockPath = path.join(dir, "package-lock.json");
  if (!fs.existsSync(lockPath)) return false;
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return false;
  try {
    const pkg = readJson(pkgPath);
    const dev = pkg?.devDependencies || {};
    const deps = pkg?.dependencies || {};
    return Boolean(dev["@pylonline/core-lint"] || deps["@pylonline/core-lint"]);
  } catch (_error) {
    return false;
  }
}

function resolveRepoDependencyVersion(dir, packageName) {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return "";
  try {
    const pkg = readJson(pkgPath);
    const dev = pkg?.devDependencies || {};
    const deps = pkg?.dependencies || {};
    return String(dev[packageName] || deps[packageName] || "").trim();
  } catch (_error) {
    return "";
  }
}

function bumpVersion(repoName, bumpArg) {
  if (!bumpArg || repoName === "workspace") return;
  ensureRepoExists(repoName);
  const dir = repoDir(repoName);
  console.log(`\n=== Bump ${repoName} version (${bumpArg}) ===`);
  run(`npm version ${bumpArg} --no-git-tag-version`, dir);
}

async function runWorkspaceChecks(options, summary, failures) {
  printCenteredBanner("WORKSPACE INSTALL + ROOT CHECKS");
  const internalLockRefreshCommand = buildWorkspaceInternalLockRefreshCommand();
  if (internalLockRefreshCommand) {
    const workspaceLockRefreshRes = await recordCommandCheck(
      summary,
      failures,
      "workspace internal package lock refresh",
      internalLockRefreshCommand,
      ROOT,
      options
    );
    summary.repoReports.workspace.steps.push({
      stepName: "internal package lock refresh",
      status: workspaceLockRefreshRes.ok ? "passed" : "failed",
      durationMs: workspaceLockRefreshRes.durationMs,
    });
  }
  const installCommand = options.noFrozenLockfile
    ? "pnpm install --no-frozen-lockfile"
    : "pnpm install --frozen-lockfile";
  const repoReport = summary.repoReports.workspace;
  const installRes = await recordCommandCheck(
    summary,
    failures,
    "workspace install",
    installCommand,
    ROOT,
    options
  );
  repoReport.steps.push({
    stepName: "install",
    status: installRes.ok ? "passed" : "failed",
    durationMs: installRes.durationMs,
  });
  const submoduleRes = await recordCommandCheck(
    summary,
    failures,
    "workspace submodules status",
    "pnpm run submodules:status",
    ROOT,
    options
  );
  repoReport.steps.push({
    stepName: "submodules status",
    status: submoduleRes.ok ? "passed" : "failed",
    durationMs: submoduleRes.durationMs,
  });
  printSubmoduleSummaryFromOutput(`${submoduleRes.stdout}\n${submoduleRes.stderr}`);
  const rootRes = await recordCommandCheck(
    summary,
    failures,
    "workspace root check",
    "pnpm run check:workspace-root",
    ROOT,
    options
  );
  repoReport.steps.push({
    stepName: "root check",
    status: rootRes.ok ? "passed" : "failed",
    durationMs: rootRes.durationMs,
  });
  const repoFailures = failures.filter((failure) => checkNameToRepo(failure.name) === "workspace");
  printRepoExecutionSummary("workspace", repoReport, repoFailures);
}

async function ensureCoreUiSyncForConsumers(summary, failures, options) {
  const consumers = ["portal", "pylon"];
  for (const repoName of consumers) {
    const dir = repoDir(repoName);
    ensureRepoExists(repoName);
    const repoReport = summary.repoReports[repoName];
    const alreadySynced = summary.coreUiSyncBootstrapRepos.has(repoName);
    if (alreadySynced) continue;

    printRepoCheckSectionBanner(`${repoName} core-ui sync bootstrap`);

    const prepCommand = resolveCoreUiPrepareCommand(repoName, options);
    const prepRes = await recordCommandCheck(
      summary,
      failures,
      `${repoName} core-ui prepare`,
      prepCommand,
      dir,
      options
    );
    repoReport.steps.push({
      stepName: "core-ui prepare",
      status: prepRes.ok ? "passed" : "failed",
      durationMs: prepRes.durationMs,
    });

    const syncRes = await recordCommandCheck(
      summary,
      failures,
      `${repoName} ui sync`,
      "pnpm run ui:sync",
      dir,
      options
    );
    repoReport.steps.push({
      stepName: "ui sync",
      status: syncRes.ok ? "passed" : "failed",
      durationMs: syncRes.durationMs,
    });

    summary.coreUiSyncBootstrapRepos.add(repoName);
  }
}

async function runRepoChecksWithOptions(repoName, summary, failures, options) {
  const dir = repoName === "workspace" ? ROOT : repoDir(repoName);
  if (repoName !== "workspace") ensureRepoExists(repoName);

  const repoReport = summary.repoReports[repoName];
  printRepoCheckSectionBanner(repoName);
  if (repoName === "workspace") {
    const res = await recordCommandCheck(
      summary,
      failures,
      "workspace root check",
      "pnpm run check:workspace-root",
      dir,
      options
    );
    repoReport.steps.push({
      stepName: "root check",
      status: res.ok ? "passed" : "failed",
      durationMs: res.durationMs,
    });
    const repoFailures = failures.filter((failure) => checkNameToRepo(failure.name) === repoName);
    printRepoExecutionSummary(repoName, repoReport, repoFailures);
    return;
  }

  if (repoNeedsCoreLintLockfileRefresh(dir)) {
    const pinnedCoreLintVersion = resolveRepoDependencyVersion(dir, "@pylonline/core-lint");
    const lockRefreshCommand = pinnedCoreLintVersion
      ? `npm install "@pylonline/core-lint@${pinnedCoreLintVersion}" --package-lock-only --ignore-scripts --prefer-online --force`
      : "npm install --package-lock-only --ignore-scripts --prefer-online --force";
    const lockRefreshRes = await recordCommandCheck(
      summary,
      failures,
      `${repoName} core-lint lockfile refresh`,
      lockRefreshCommand,
      dir,
      options
    );
    repoReport.steps.push({
      stepName: "core-lint lockfile refresh",
      status: lockRefreshRes.ok ? "passed" : "failed",
      durationMs: lockRefreshRes.durationMs,
    });
  }

  const pinnedCoreUiVersion = resolveRepoDependencyVersion(dir, "@pylonline/core-ui");
  if (pinnedCoreUiVersion) {
    const coreUiLockRefreshRes = await recordCommandCheck(
      summary,
      failures,
      `${repoName} core-ui lockfile refresh`,
      `npm install "@pylonline/core-ui@${pinnedCoreUiVersion}" --package-lock-only --ignore-scripts --prefer-online --force`,
      dir,
      options
    );
    repoReport.steps.push({
      stepName: "core-ui lockfile refresh",
      status: coreUiLockRefreshRes.ok ? "passed" : "failed",
      durationMs: coreUiLockRefreshRes.durationMs,
    });
  }

  const ciInstallRes = await recordCommandCheck(
    summary,
    failures,
    `${repoName} ci install`,
    "npm install --no-audit --no-fund",
    dir,
    options
  );
  repoReport.steps.push({
    stepName: "ci install",
    status: ciInstallRes.ok ? "passed" : "failed",
    durationMs: ciInstallRes.durationMs,
  });

  if (repoName === "portal" || repoName === "pylon") {
    if (!summary.coreUiSyncBootstrapRepos.has(repoName)) {
      const prepCommand = resolveCoreUiPrepareCommand(repoName, options);
      const prepRes = await recordCommandCheck(
        summary,
        failures,
        `${repoName} core-ui prepare`,
        prepCommand,
        dir,
        options
      );
      repoReport.steps.push({
        stepName: "core-ui prepare",
        status: prepRes.ok ? "passed" : "failed",
        durationMs: prepRes.durationMs,
      });
      const syncRes = await recordCommandCheck(
        summary,
        failures,
        `${repoName} ui sync`,
        "pnpm run ui:sync",
        dir,
        options
      );
      repoReport.steps.push({
        stepName: "ui sync",
        status: syncRes.ok ? "passed" : "failed",
        durationMs: syncRes.durationMs,
      });
      summary.coreUiSyncBootstrapRepos.add(repoName);
    }
  }

  if (!options.verbose) {
    console.log(`${repoName} check (pnpm run check):`);
  }
  const formatWriteCommand = resolveRepoFormatWriteCommand(repoName, dir);
  if (formatWriteCommand) {
    if (!options.verbose) {
      console.log(`${repoName} format write (${formatWriteCommand}):`);
    }
    const formatWriteRes = await recordCommandCheck(
      summary,
      failures,
      `${repoName} format write`,
      formatWriteCommand,
      dir,
      options
    );
    repoReport.steps.push({
      stepName: "format write",
      status: formatWriteRes.ok ? "passed" : "failed",
      durationMs: formatWriteRes.durationMs,
    });
    if (!options.verbose) {
      console.log(`${repoName} format write ${formatWriteRes.ok ? "passed" : "failed"}`);
    }
  }
  const checkCommand = resolveRepoCheckCommand(repoName, dir);
  const checkRes = await recordCommandCheck(
    summary,
    failures,
    `${repoName} check`,
    checkCommand,
    dir,
    { ...options, heartbeat: true, parseCoreLintCheckSteps: true }
  );
  repoReport.steps.push({
    stepName: "check",
    status: checkRes.ok ? "passed" : "failed",
    durationMs: checkRes.durationMs,
  });
  if (!options.verbose) {
    console.log(`${repoName} check ${checkRes.ok ? "passed" : "failed"}`);
  }
  if (!options.verbose) {
    console.log("Test results:");
    printLiveTestTableHeader();
  }
  const liveTests = [];
  const testNameIndexEntry = summary.testNameIndexCache[repoName] || { index: null };
  summary.testNameIndexCache[repoName] = testNameIndexEntry;
  if (!testNameIndexEntry.index) {
    testNameIndexEntry.index = buildTestNameIndex(dir);
  }
  const testRes = await recordCommandCheck(
    summary,
    failures,
    `${repoName} test`,
    "pnpm run test",
    dir,
    {
      ...options,
      onLine: (line) => {
        const parsed = parseTapResultLine(line);
        if (!parsed) return;
        const candidates = testNameIndexEntry.index.get(parsed.name) || [];
        parsed.file = toWorkspaceRelativeDisplay(candidates[0] || "");
        liveTests.push(parsed);
        if (!options.verbose) {
          printLiveTestTableRow(parsed);
        }
      },
    }
  );
  if (!options.verbose) {
    printLiveTestTableFooter();
  }
  repoReport.steps.push({
    stepName: "test",
    status: testRes.ok ? "passed" : "failed",
    durationMs: testRes.durationMs,
  });
  const parsedTests =
    liveTests.length > 0 ? liveTests : parseTapTests(`${testRes.stdout}\n${testRes.stderr}`);
  hydrateMissingTestFiles(parsedTests, dir, summary.testNameIndexCache[repoName]);
  for (const test of parsedTests) {
    if (test.file && test.file !== "-") test.file = toWorkspaceRelativeDisplay(test.file);
  }
  repoReport.tests.push(...parsedTests);
  const repoFailures = failures.filter((failure) => checkNameToRepo(failure.name) === repoName);
  printRepoExecutionSummary(repoName, repoReport, repoFailures, {
    liveTestTablePrinted: !options.verbose,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const orderedRepos = ["core-lint", "core-ui", "scripts", "portal", "pylon"];
  const targets = args.repo === "all" ? orderedRepos : [args.repo];
  const startedAt = nowMs();
  const summary = {
    repoTarget: args.repo,
    frozenLockfile: !args.noFrozenLockfile,
    dryRun: args.dryRun,
    bump: args.bump || "none",
    coreLintVersionInput: args.coreLintVersion,
    coreLintVersionSource: "",
    coreLintVersion: "",
    coreLintPinsUpdated: [],
    coreLintLockfilesRefreshed: [],
    coreUiSyncBootstrapRepos: new Set(),
    failures: [],
    checks: [],
    repoReports: {
      workspace: { steps: [], tests: [] },
      "core-lint": { steps: [], tests: [] },
      "core-ui": { steps: [], tests: [] },
      scripts: { steps: [], tests: [] },
      portal: { steps: [], tests: [] },
      pylon: { steps: [], tests: [] },
    },
    testNameIndexCache: {},
    bumpApplied: false,
  };
  const failures = summary.failures;

  console.log("Running release preflight...");
  console.log(`repo target: ${args.repo}`);
  console.log(`frozen lockfile: ${args.noFrozenLockfile ? "off" : "on"}`);
  console.log(`dry run: ${args.dryRun ? "on" : "off"}`);
  console.log(`summary json: ${args.summaryJson ? "on" : "off"}`);
  console.log(`core-lint version mode: ${args.coreLintVersion}`);
  console.log(
    `consumer core-ui source: ${args.coreUiConsumerSource} (ref ${args.coreUiConsumerRef})`
  );
  console.log(`sync core-lint version: ${args.syncCoreLintVersion ? "on" : "off"}`);
  console.log(
    `refresh core-lint lockfiles: ${args.refreshCoreLintLockfiles ? "on" : "off"}`
  );
  console.log(`verbose output: ${args.verbose ? "on" : "off"}`);

  let pinResult = null;
  const pinStart = nowMs();
  try {
    pinResult = syncCoreLintPins(args);
    summary.coreLintVersion = pinResult.coreLintVersion;
    summary.coreLintVersionSource = pinResult.source;
    summary.coreLintPinsUpdated = pinResult.changed;
    summary.checks.push({
      name: "core-lint pin validation",
      status: pinResult.skipped ? "skipped" : "passed",
      durationMs: nowMs() - pinStart,
    });
    if (pinResult.changed.length) {
      console.log(
        `Updated core-lint pin to ${pinResult.coreLintVersion} in: ${pinResult.changed.join(", ")}`
      );
      console.log("Refreshing workspace pnpm lockfile to match updated pin(s).");
    }
    if (pinResult.skipped) {
      console.log("Skipped core-lint pin validation (--core-lint-version skip).");
    }
  } catch (error) {
    summary.checks.push({
      name: "core-lint pin validation",
      status: "failed",
      durationMs: nowMs() - pinStart,
    });
    failures.push({
      name: "core-lint pin validation",
      location: ".",
      command: "pin validation",
      exitCode: 1,
      error: error.message,
    });
    console.error(`core-lint pin validation failed: ${error.message}`);
  }

  if (pinResult && (args.refreshCoreLintLockfiles || pinResult.changed.length)) {
    const refreshStart = nowMs();
    const refreshTargets = args.refreshCoreLintLockfiles ? CORE_LINT_CONSUMERS : pinResult.changed;
    const refreshed = refreshCoreLintConsumerLockfiles(refreshTargets);
    summary.coreLintLockfilesRefreshed = refreshed;
    summary.checks.push({
      name: "core-lint lockfile refresh",
      status: "passed",
      durationMs: nowMs() - refreshStart,
    });
  }

  if (pinResult && pinResult.changed.length) {
    const workspaceLockRefresh = await recordCommandCheck(
      summary,
      failures,
      "workspace pnpm lockfile refresh",
      "pnpm install --lockfile-only",
      ROOT,
      args
    );
    summary.repoReports.workspace.steps.push({
      stepName: "pnpm lockfile refresh",
      status: workspaceLockRefresh.ok ? "passed" : "failed",
      durationMs: workspaceLockRefresh.durationMs,
    });
  }

  await runWorkspaceChecks(args, summary, failures);
  await ensureCoreUiSyncForConsumers(summary, failures, args);
  for (const repoName of targets) {
    await runRepoChecksWithOptions(repoName, summary, failures, args);
  }

  if (args.bump) {
    if (failures.length) {
      console.log("\nSkipping version bump because one or more checks failed.");
    } else if (args.dryRun) {
      console.log(`\nDry run: checks passed; would bump ${args.repo} with "${args.bump}".`);
    } else {
      bumpVersion(args.repo, args.bump);
      summary.bumpApplied = true;
    }
  }

  const totalMs = nowMs() - startedAt;
  printCenteredBanner("RELEASE PREFLIGHT SUMMARY");
  const summaryRows = [
    ["target", summary.repoTarget],
    ["frozen lockfile", summary.frozenLockfile ? "on" : "off"],
    ["dry run", summary.dryRun ? "on" : "off"],
    ["bump request", summary.bump],
    ["core-lint version input", summary.coreLintVersionInput],
    ["core-lint version source", summary.coreLintVersionSource || "unknown"],
    ["core-lint expected version", summary.coreLintVersion || "n/a"],
    [
      "core-lint pin updates",
      summary.coreLintPinsUpdated.length ? summary.coreLintPinsUpdated.join(", ") : "none",
    ],
    [
      "core-lint lockfiles refreshed",
      summary.coreLintLockfilesRefreshed.length
        ? summary.coreLintLockfilesRefreshed.join(", ")
        : "none",
    ],
    ["failures", String(failures.length)],
    ["bump applied", summary.bump === "none" ? "n/a" : summary.bumpApplied ? "yes" : "no"],
  ];
  printSimpleTable(["field", "value"], summaryRows);
  const counts = summarizeCheckCounts(summary.checks);
  console.log(`checks: passed ${counts.passed} | failed ${counts.failed} | skipped ${counts.skipped}`);
  console.log(`total: ${formatDuration(totalMs)}`);
  printRepoStatusTable(summary.checks, summary.repoReports);
  const failedTests = collectFailedTestsByRepo(summary.repoReports);
  if (failedTests.length) {
    console.log(`\n${colorizeLabel("error", "FAILED TESTS")}`);
    const testRows = failedTests.map((test) => [
      colorizeStatus("failed", "FAILED"),
      test.repo,
      String(test.id ?? "-"),
      test.name || "-",
      test.file || "-",
    ]);
    printSimpleTable(["status", "repo", "#", "test", "file"], testRows);
  }

  if (failures.length) {
    const displayFailures = dedupeFailuresForDisplay(failures);
    console.log(`\n${colorizeLabel("error", "FAILED CHECKS")}`);
    const rows = displayFailures.map((failure) => [
      colorizeStatus("failed", "FAILED"),
      failure.location || "-",
      String(failure.exitCode ?? "-"),
      failure.command || "-",
      failure.testName || "-",
      failure.filePath && !failure.filePath.includes("*")
        ? toTestFileDisplayPath(failure.filePath)
        : "-",
    ]);
    printSimpleTable(["status", "repo", "exit", "command", "test", "file"], rows);
  }
  if (args.summaryJson) {
    const summaryPayload = {
      ...summary,
      coreUiSyncBootstrapRepos: Array.from(summary.coreUiSyncBootstrapRepos),
      totalDurationMs: totalMs,
      checks: summary.checks.map((check) => ({
        ...check,
      })),
      failedChecks: failures.map((failure) => ({
        name: failure.name,
        location: failure.location,
        command: failure.command,
        exitCode: failure.exitCode,
        ...(failure.filePath
          ? { filePath: toTestFileDisplayPath(failure.filePath) }
          : {}),
        ...(failure.testName ? { testName: failure.testName } : {}),
        ...(failure.error ? { error: failure.error } : {}),
      })),
      repoStatuses: computeRepoStatuses(summary.checks),
      failedTests: failedTests.map((test) => ({
        repo: test.repo,
        id: test.id,
        testName: test.name,
        filePath: test.file,
      })),
    };
    console.log("summary_json:", JSON.stringify(summaryPayload));
  }

  if (failures.length) {
    console.log(`\n${colorizeLabel("error", "Release preflight completed with failures.")}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n${colorizeLabel("ok", "Release preflight passed.")}`);
}

main().catch((error) => {
  console.error(`\nRelease preflight failed: ${error.message}`);
  process.exit(1);
});
