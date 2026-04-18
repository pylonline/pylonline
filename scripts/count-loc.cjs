#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "..");

const ignoredDirNames = new Set([
  ".cache",
  ".git",
  ".github",
  ".generated",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
]);

const codeExtensions = new Set([
  ".cjs",
  ".css",
  ".cts",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".less",
  ".mjs",
  ".mts",
  ".sass",
  ".scss",
  ".sh",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);

function shouldIgnoreDirectory(entryName) {
  return entryName.startsWith(".") || ignoredDirNames.has(entryName);
}

function isCodeFile(filePath) {
  return codeExtensions.has(path.extname(filePath).toLowerCase());
}

function countLinesInFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  if (!content) return 0;
  const lineBreaks = content.match(/\n/g);
  return (lineBreaks ? lineBreaks.length : 0) + 1;
}

function countDirectoryLoc(directoryPath) {
  let fileCount = 0;
  let lineCount = 0;

  const stack = [directoryPath];
  while (stack.length > 0) {
    const currentPath = stack.pop();
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (!shouldIgnoreDirectory(entry.name)) {
          stack.push(entryPath);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      if (!isCodeFile(entryPath)) continue;
      fileCount += 1;
      lineCount += countLinesInFile(entryPath);
    }
  }

  return { fileCount, lineCount };
}

function resolveTargetDirectories(rawArgs) {
  if (rawArgs.length > 0) {
    return rawArgs.map((rawArg) => {
      const targetPath = path.resolve(workspaceRoot, rawArg);
      if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
        throw new Error(`Not a directory: ${rawArg}`);
      }
      return {
        label: path.relative(workspaceRoot, targetPath) || path.basename(targetPath),
        absolutePath: targetPath,
      };
    });
  }

  return fs
    .readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !shouldIgnoreDirectory(entry.name))
    .map((entry) => ({
      label: entry.name,
      absolutePath: path.join(workspaceRoot, entry.name),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function printResults(results) {
  const labelWidth = Math.max(
    "directory".length,
    ...results.map((result) => result.label.length)
  );
  const filesWidth = Math.max("files".length, ...results.map((result) => String(result.fileCount).length));
  const linesWidth = Math.max("lines".length, ...results.map((result) => String(result.lineCount).length));

  const header =
    `${"directory".padEnd(labelWidth)}  ` +
    `${"files".padStart(filesWidth)}  ` +
    `${"lines".padStart(linesWidth)}`;

  console.log(header);
  console.log(
    `${"-".repeat(labelWidth)}  ${"-".repeat(filesWidth)}  ${"-".repeat(linesWidth)}`
  );

  let totalFiles = 0;
  let totalLines = 0;
  for (const result of results) {
    totalFiles += result.fileCount;
    totalLines += result.lineCount;
    console.log(
      `${result.label.padEnd(labelWidth)}  ` +
        `${String(result.fileCount).padStart(filesWidth)}  ` +
        `${String(result.lineCount).padStart(linesWidth)}`
    );
  }

  console.log(
    `${"-".repeat(labelWidth)}  ${"-".repeat(filesWidth)}  ${"-".repeat(linesWidth)}`
  );
  console.log(
    `${"total".padEnd(labelWidth)}  ${String(totalFiles).padStart(filesWidth)}  ${String(totalLines).padStart(linesWidth)}`
  );
}

function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
    console.log("Usage: node scripts/count-loc.cjs [subdir ...]");
    console.log("Counts code-like file lines in each target directory.");
    console.log("Defaults to visible top-level workspace subdirectories.");
    process.exit(0);
  }

  const targets = resolveTargetDirectories(rawArgs);
  const results = targets.map((target) => ({
    label: target.label,
    ...countDirectoryLoc(target.absolutePath),
  }));
  printResults(results);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
