#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const VALID_REPOS = new Set(["workspace", "core-lint", "core-ui", "portal", "pylon", "scripts"]);

function parseArgs(argv) {
  const args = {
    repo: "all",
    bump: "",
    noFrozenLockfile: false,
    dryRun: false,
    summaryJson: false,
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

  return args;
}

function printHelpAndExit(code, error = "") {
  if (error) {
    console.error(`\nError: ${error}\n`);
  }
  console.log(`Usage:
  node wrang-release.cjs [--repo <name|all>] [--bump <patch|minor|major|x.y.z>] [--dry-run] [--summary-json] [--no-frozen-lockfile]

Examples:
  node wrang-release.cjs
  node wrang-release.cjs --repo core-ui
  node wrang-release.cjs --repo core-ui --bump patch --dry-run
  node wrang-release.cjs --repo portal --dry-run --summary-json
  node wrang-release.cjs --repo core-ui --bump patch
  node wrang-release.cjs --repo portal --no-frozen-lockfile

Repos:
  workspace, core-lint, core-ui, portal, pylon, scripts, all`);
  process.exit(code);
}

function run(command, cwd = ROOT) {
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
    stdio: "inherit",
    env: childEnv,
  });
  if (result.status !== 0) {
    const location = path.relative(ROOT, cwd) || ".";
    throw new Error(`Command failed in ${location}: ${command}`);
  }
}

function nowMs() {
  return Date.now();
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const sec = (ms / 1000).toFixed(1);
  return `${sec}s`;
}

function repoDir(repoName) {
  return path.join(ROOT, repoName);
}

function ensureRepoExists(repoName) {
  const dir = repoDir(repoName);
  if (!fs.existsSync(dir)) {
    throw new Error(`Repo path not found: ${repoName}`);
  }
}

function bumpVersion(repoName, bumpArg) {
  if (!bumpArg || repoName === "workspace") return;
  ensureRepoExists(repoName);
  const dir = repoDir(repoName);
  console.log(`\n=== Bump ${repoName} version (${bumpArg}) ===`);
  run(`npm version ${bumpArg} --no-git-tag-version`, dir);
}

function runWorkspaceChecks(options) {
  console.log("\n=== Workspace install + root checks ===");
  const installCommand = options.noFrozenLockfile
    ? "pnpm install --no-frozen-lockfile"
    : "pnpm install --frozen-lockfile";
  run(installCommand, ROOT);
  run("pnpm run submodules:status", ROOT);
  run("pnpm run check:workspace-root", ROOT);
}

function runRepoChecks(repoName) {
  const dir = repoName === "workspace" ? ROOT : repoDir(repoName);
  if (repoName !== "workspace") ensureRepoExists(repoName);

  console.log(`\n=== Check ${repoName} ===`);
  if (repoName === "workspace") {
    run("pnpm run check:workspace-root", dir);
    return;
  }

  if (repoName === "portal" || repoName === "pylon") {
    run("pnpm run core-ui:prepare", dir);
    run("pnpm run ui:sync", dir);
  }

  run("pnpm run check", dir);
  run("pnpm run test", dir);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const orderedRepos = ["core-lint", "core-ui", "scripts", "portal", "pylon"];
  const targets = args.repo === "all" ? orderedRepos : [args.repo];
  const startedAt = nowMs();
  const summary = {
    repoTarget: args.repo,
    frozenLockfile: !args.noFrozenLockfile,
    dryRun: args.dryRun,
    bump: args.bump || "none",
    checks: [],
    bumpApplied: false,
  };

  console.log("Running release preflight...");
  console.log(`repo target: ${args.repo}`);
  console.log(`frozen lockfile: ${args.noFrozenLockfile ? "off" : "on"}`);
  console.log(`dry run: ${args.dryRun ? "on" : "off"}`);
  console.log(`summary json: ${args.summaryJson ? "on" : "off"}`);

  const workspaceStart = nowMs();
  runWorkspaceChecks(args);
  summary.checks.push({
    name: "workspace",
    status: "passed",
    durationMs: nowMs() - workspaceStart,
  });
  for (const repoName of targets) {
    const repoStart = nowMs();
    runRepoChecks(repoName);
    summary.checks.push({
      name: repoName,
      status: "passed",
      durationMs: nowMs() - repoStart,
    });
  }

  if (args.bump) {
    if (args.dryRun) {
      console.log(`\nDry run: checks passed; would bump ${args.repo} with "${args.bump}".`);
    } else {
      bumpVersion(args.repo, args.bump);
      summary.bumpApplied = true;
    }
  }

  const totalMs = nowMs() - startedAt;
  console.log("\n=== Release preflight summary ===");
  console.log(`target: ${summary.repoTarget}`);
  console.log(`frozen lockfile: ${summary.frozenLockfile ? "on" : "off"}`);
  console.log(`dry run: ${summary.dryRun ? "on" : "off"}`);
  console.log(`bump request: ${summary.bump}`);
  console.log(
    `bump applied: ${summary.bump === "none" ? "n/a" : summary.bumpApplied ? "yes" : "no"}`
  );
  for (const check of summary.checks) {
    console.log(`- ${check.name}: ${check.status} (${formatDuration(check.durationMs)})`);
  }
  console.log(`total: ${formatDuration(totalMs)}`);
  if (args.summaryJson) {
    const summaryPayload = {
      ...summary,
      totalDurationMs: totalMs,
      checks: summary.checks.map((check) => ({
        ...check,
      })),
    };
    console.log("summary_json:", JSON.stringify(summaryPayload));
  }

  console.log("\nRelease preflight passed.");
}

try {
  main();
} catch (error) {
  console.error(`\nRelease preflight failed: ${error.message}`);
  process.exit(1);
}
