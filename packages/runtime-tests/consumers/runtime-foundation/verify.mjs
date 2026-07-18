import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import stringWidth from "string-width";
import stripAnsi from "strip-ansi";
import { countOccurrences, fullBufferText, runShellJourney, visibleText } from "./pty-harness.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../../..");
const patchDirectory = join(scriptDirectory, "patches");
const forkFixtureDirectory = join(scriptDirectory, "fixtures/fork-stdin");
const consumer = requestedConsumer();
const temporaryRoot = mkdtempSync(join(tmpdir(), "vue-tui-runtime-foundation-"));
const tarballDirectory = join(temporaryRoot, "tarballs");
const cloneDirectory = join(temporaryRoot, "clones");

const consumers = {
  "coding-agent": {
    pin: "3e44c9a266e52ebeba2db669b4bb96521b9e2f3a",
    patch: "coding-agent.patch",
    patchSha256: "a1fee89cea36f71d0d2bdc10d0609a6d12830de8fb334585ccef827c1806261b",
    changedPaths: ["examples/coding-agent/src/app.vue"],
    sourceRoot: "examples/coding-agent/src",
  },
  mo: {
    repository: "https://github.com/liangmiQwQ/mo.git",
    pin: "6bea467a6995f4912e809b417b5c56a3964cc556",
    patch: "mo.patch",
    patchSha256: "fa624015de1de3c563d9c95f55332f1c618b2ad238692e9e687bb2b997628751",
    changedPaths: ["src/components/selector.vue", "src/utils/selector.ts"],
    sourceRoot: "src",
  },
  machud: {
    repository: "https://github.com/hyf0/machud.git",
    pin: "a51a6853686eb818471d0027d2549e6e664c9b36",
    patch: "machud.patch",
    patchSha256: "196c404c697712c5c8898a8426cc1a977c7a974d6a881141461c476277b336ce",
    changedPaths: [
      "src/App.vue",
      "src/components/Graph.vue",
      "src/components/Sparkline.vue",
      "src/main.ts",
    ],
    sourceRoot: "src",
  },
};

const ENTER_ALT_SCREEN = "\u001b[?1049h";
const EXIT_ALT_SCREEN = "\u001b[?1049l";
const ENABLE_BRACKETED_PASTE = "\u001b[?2004h";
const DISABLE_BRACKETED_PASTE = "\u001b[?2004l";
const QUERY_KITTY_KEYBOARD = "\u001b[?u";
const ENABLE_KITTY_KEYBOARD = "\u001b[>1u";
const DISABLE_KITTY_KEYBOARD = "\u001b[<u";
const HIDE_CURSOR = "\u001b[?25l";
const SHOW_CURSOR = "\u001b[?25h";
const ENABLE_SGR_MOUSE = "\u001b[?1006h";
const DISABLE_SGR_MOUSE = "\u001b[?1006l";
const ENABLE_DRAG_MOUSE = "\u001b[?1002h";
const DISABLE_DRAG_MOUSE = "\u001b[?1002l";
const ENABLE_SYNC_OUTPUT = "\u001b[?2026h";
const DISABLE_SYNC_OUTPUT = "\u001b[?2026l";

const activeChildren = new Set();
const inheritedEnvironment = Object.fromEntries(
  ["HOME", "LANG", "LC_ALL", "LOGNAME", "PATH", "PNPM_HOME", "SHELL", "TMPDIR", "USER"]
    .filter((name) => process.env[name] !== undefined)
    .map((name) => [name, process.env[name]]),
);

function killChildProcessGroup(child, signal) {
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back when the child exited before its process group was signaled.
    }
  }
  try {
    child.kill(signal);
  } catch {
    // The child may have exited concurrently.
  }
}

function printRecord(kind, details) {
  process.stdout.write(`[runtime-foundation] ${kind} ${JSON.stringify(details)}\n`);
}

function commandDisplay(command, args) {
  return [command, ...args].map((value) => JSON.stringify(value)).join(" ");
}

async function run(
  command,
  args,
  cwd = repositoryRoot,
  { env = {}, timeoutMs = 10 * 60_000, expectedExitCodes = [0] } = {},
) {
  const display = commandDisplay(command, args);
  printRecord("command:start", { cwd, command: display });
  const result = await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...inheritedEnvironment,
        CI: "true",
        FORCE_COLOR: "0",
        ...env,
      },
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeChildren.add(child);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    let timedOut = false;
    let killTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      killChildProcessGroup(child, "SIGTERM");
      killTimer = setTimeout(() => {
        killChildProcessGroup(child, "SIGKILL");
      }, 2_000);
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      activeChildren.delete(child);
      rejectRun(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      activeChildren.delete(child);
      if (timedOut) {
        rejectRun(
          new Error(`${display} timed out after ${timeoutMs}ms in ${cwd}.\n${stdout}\n${stderr}`),
        );
      } else {
        resolveRun({ code, signal, stdout, stderr });
      }
    });
  });

  if (!expectedExitCodes.includes(result.code) || result.signal !== null) {
    throw new Error(
      `${display} failed in ${cwd} with code ${result.code} and signal ${result.signal}.\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`,
    );
  }
  printRecord("command:pass", { cwd, command: display, exitCode: result.code });
  return result;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function installCodingAgentFetchHarness(entry) {
  const source = readFileSync(entry, "utf8");
  const constructorTail = 'baseURL: "https://api.deepseek.com"\n\t});';
  assert.equal(
    countOccurrences(source, constructorTail),
    1,
    "Could not locate the pinned coding-agent OpenAI constructor in its built artifact.",
  );
  const instrumented = source.replace(
    constructorTail,
    'baseURL: "https://api.deepseek.com",\n\t\tfetch: globalThis.fetch\n\t});',
  );
  writeFileSync(entry, instrumented);
  printRecord("coding-agent:transport-harness", {
    entry,
    beforeSha256: createHash("sha256").update(source).digest("hex"),
    afterSha256: sha256(entry),
  });
}

async function packPackage(packageDirectory, { ignoreScripts = false } = {}) {
  const { stdout } = await run(
    "pnpm",
    ["pack", "--pack-destination", tarballDirectory, "--json"],
    packageDirectory,
    { env: ignoreScripts ? { PNPM_CONFIG_IGNORE_SCRIPTS: "true" } : {} },
  );
  const parsed = JSON.parse(stdout);
  const record = Array.isArray(parsed) ? parsed[0] : parsed;
  const filename = isAbsolute(record.filename)
    ? record.filename
    : resolve(packageDirectory, record.filename);
  assert.ok(existsSync(filename), `Packed artifact does not exist: ${filename}`);
  assert.ok(filename.endsWith(".tgz"), `Unexpected packed artifact: ${filename}`);
  printRecord("artifact", {
    packageDirectory,
    path: filename,
    sha256: sha256(filename),
  });
  return filename;
}

async function packVueTui(needsVite) {
  await run("vp", ["run", "@vue-tui/runtime#build"]);
  const runtime = await packPackage(join(repositoryRoot, "packages/runtime"));
  let vite;
  if (needsVite) {
    await run("vp", ["run", "@vue-tui/vite#build"]);
    vite = await packPackage(join(repositoryRoot, "packages/vite"));
  }
  return { runtime, vite };
}

function collectFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function assertPublicProductImports(root, allowedPackages) {
  const sourceExtensions = new Set([".js", ".mjs", ".ts", ".tsx", ".vue"]);
  for (const path of collectFiles(root)) {
    const extension = path.slice(path.lastIndexOf("."));
    if (!sourceExtensions.has(extension)) continue;
    const source = readFileSync(path, "utf8");
    assert.equal(
      source.includes("@vue-tui/runtime/internal"),
      false,
      `${path} imports the unsupported Runtime internal entry.`,
    );
    for (const forbidden of [
      "@vue-tui/runtime/src",
      "packages/runtime/src",
      join(repositoryRoot, "packages/runtime/src"),
    ]) {
      assert.equal(source.includes(forbidden), false, `${path} contains source path ${forbidden}.`);
    }
    for (const match of source.matchAll(/@vue-tui\/[A-Za-z0-9-]+(?:\/[A-Za-z0-9._/-]+)?/g)) {
      assert.ok(
        allowedPackages.has(match[0]),
        `${path} uses unapproved vue-tui package entry ${match[0]}.`,
      );
    }
  }
}

function assertConsumerPublicImports(name, clone) {
  assertPublicProductImports(
    join(clone, consumers[name].sourceRoot),
    new Set(
      name === "coding-agent"
        ? ["@vue-tui/runtime", "@vue-tui/runtime/inline"]
        : ["@vue-tui/runtime"],
    ),
  );
}

function assertNoSourceAlias(path) {
  const source = readFileSync(path, "utf8");
  for (const forbidden of [
    "@vue-tui/runtime/internal",
    "@vue-tui/runtime/src",
    "packages/runtime/src",
    join(repositoryRoot, "packages/runtime/src"),
  ]) {
    assert.equal(source.includes(forbidden), false, `${path} contains source alias ${forbidden}.`);
  }
}

function rewriteDependency(packagePath, section, name, tarball) {
  const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
  assert.equal(
    typeof manifest[section]?.[name],
    "string",
    `${packagePath} does not declare ${section}.${name}.`,
  );
  manifest[section][name] = `file:${tarball}`;
  writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function assertPackedResolution(packageJsonPath, ...sourcePackageDirectories) {
  const resolved = realpathSync(packageJsonPath);
  for (const sourcePackageDirectory of sourcePackageDirectories) {
    const sourceRoot = realpathSync(sourcePackageDirectory);
    assert.equal(
      resolved.startsWith(`${sourceRoot}/`),
      false,
      `${packageJsonPath} resolved to source package ${resolved}.`,
    );
  }
  printRecord("packed-resolution", { requested: packageJsonPath, resolved });
}

async function preparePinnedConsumer(name, artifacts) {
  const config = consumers[name];
  const clone = join(cloneDirectory, name);
  if (name === "coding-agent") {
    await run(
      "git",
      ["clone", "--local", "--no-hardlinks", "--no-checkout", repositoryRoot, clone],
      repositoryRoot,
    );
  } else {
    await run(
      "git",
      ["clone", "--filter=blob:none", "--no-checkout", config.repository, clone],
      repositoryRoot,
    );
  }
  await run("git", ["checkout", "--detach", config.pin], clone);
  const { stdout: head } = await run("git", ["rev-parse", "HEAD"], clone);
  assert.equal(head.trim(), config.pin);

  const patchPath = join(patchDirectory, config.patch);
  assert.equal(sha256(patchPath), config.patchSha256, `${config.patch} checksum drifted.`);
  await run("git", ["apply", "--check", patchPath], clone);
  await run("git", ["apply", patchPath], clone);
  await run("git", ["diff", "--check"], clone);
  const { stdout: changed } = await run("git", ["diff", "--name-only"], clone);
  assert.deepEqual(changed.trim().split("\n").filter(Boolean), config.changedPaths);
  assertConsumerPublicImports(name, clone);
  printRecord("consumer", {
    name,
    pin: config.pin,
    clone,
    patch: config.patch,
    patchSha256: config.patchSha256,
  });

  if (name === "coding-agent") {
    const manifest = join(clone, "examples/coding-agent/package.json");
    rewriteDependency(manifest, "dependencies", "@vue-tui/runtime", artifacts.runtime);
    rewriteDependency(manifest, "devDependencies", "@vue-tui/vite", artifacts.vite);
    assertNoSourceAlias(join(clone, "examples/coding-agent/vite.config.ts"));
  } else if (name === "mo") {
    rewriteDependency(
      join(clone, "package.json"),
      "devDependencies",
      "@vue-tui/runtime",
      artifacts.runtime,
    );
  } else {
    rewriteDependency(
      join(clone, "package.json"),
      "dependencies",
      "@vue-tui/runtime",
      artifacts.runtime,
    );
  }

  await run("vp", ["install", "--no-frozen-lockfile"], clone);
  assertConsumerPublicImports(name, clone);

  const packageRoot = name === "coding-agent" ? join(clone, "examples/coding-agent") : clone;
  assertPackedResolution(
    join(packageRoot, "node_modules/@vue-tui/runtime/package.json"),
    join(repositoryRoot, "packages/runtime"),
    ...(name === "coding-agent" ? [join(clone, "packages/runtime")] : []),
  );
  if (name === "coding-agent") {
    assertPackedResolution(
      join(packageRoot, "node_modules/@vue-tui/vite/package.json"),
      join(repositoryRoot, "packages/vite"),
      join(clone, "packages/vite"),
    );
  }
  return clone;
}

function assertOwnershipPair(raw, enable, disable, required = true) {
  const enabled = countOccurrences(raw, enable);
  const disabled = countOccurrences(raw, disable);
  if (required) assert.ok(enabled > 0, `Expected terminal acquisition ${JSON.stringify(enable)}.`);
  assert.equal(enabled, disabled, `Unbalanced terminal ownership for ${JSON.stringify(enable)}.`);
  if (enabled > 0) {
    assert.ok(raw.lastIndexOf(disable) > raw.lastIndexOf(enable));
    assert.ok(raw.lastIndexOf(disable) < raw.lastIndexOf("__APP_EXIT__:"));
  }
}

function assertCursorRestoration(raw, required = true) {
  const hides = countOccurrences(raw, HIDE_CURSOR);
  const shows = countOccurrences(raw, SHOW_CURSOR);
  if (required) assert.ok(hides > 0, "Expected the application to hide the cursor.");
  if (hides === 0 && shows === 0) return;
  assert.ok(hides > 0, "Cursor was shown without first being hidden.");
  assert.ok(shows > 0, "Cursor was hidden without being restored.");
  assert.ok(raw.lastIndexOf(SHOW_CURSOR) > raw.lastIndexOf(HIDE_CURSOR));
  assert.ok(raw.lastIndexOf(SHOW_CURSOR) < raw.lastIndexOf("__APP_EXIT__:"));
}

function assertInteractiveRestoration(raw, terminal, { fullscreen }) {
  assertOwnershipPair(raw, ENABLE_BRACKETED_PASTE, DISABLE_BRACKETED_PASTE);
  assertOwnershipPair(raw, ENABLE_KITTY_KEYBOARD, DISABLE_KITTY_KEYBOARD, false);
  // Cursor visibility writes are idempotent state declarations, not counted
  // acquisitions: every repaint may hide again while one final show restores it.
  assertCursorRestoration(raw);
  assertOwnershipPair(raw, ENTER_ALT_SCREEN, EXIT_ALT_SCREEN, fullscreen);
  if (fullscreen) {
    const enterIndex = raw.indexOf(ENTER_ALT_SCREEN);
    for (const sequence of [
      HIDE_CURSOR,
      QUERY_KITTY_KEYBOARD,
      ENABLE_KITTY_KEYBOARD,
      ENABLE_BRACKETED_PASTE,
      ENABLE_SGR_MOUSE,
      ENABLE_DRAG_MOUSE,
      ENABLE_SYNC_OUTPUT,
    ]) {
      const acquisitionIndex = raw.indexOf(sequence);
      if (acquisitionIndex >= 0) {
        assert.ok(
          acquisitionIndex > enterIndex,
          `Fullscreen acquired ${JSON.stringify(sequence)} before its alternate-screen surface.`,
        );
      }
    }
  } else {
    assert.equal(countOccurrences(raw, ENTER_ALT_SCREEN), 0);
    assert.equal(countOccurrences(raw, EXIT_ALT_SCREEN), 0);
  }
  assertOwnershipPair(raw, ENABLE_SGR_MOUSE, DISABLE_SGR_MOUSE, false);
  assertOwnershipPair(raw, ENABLE_DRAG_MOUSE, DISABLE_DRAG_MOUSE, false);
  assertOwnershipPair(raw, ENABLE_SYNC_OUTPUT, DISABLE_SYNC_OUTPUT, false);
  assert.equal(terminal.buffer.active.type, "normal");
  assert.equal(terminal.modes.bracketedPasteMode, false);
  assert.equal(terminal.modes.mouseTrackingMode, "none");
  assert.equal(terminal.modes.synchronizedOutputMode, false);
}

async function verifyCodingAgent(artifacts) {
  const clone = await preparePinnedConsumer("coding-agent", artifacts);
  await run("vp", ["run", "@vue-tui/example-coding-agent#build"], clone);
  assertConsumerPublicImports("coding-agent", clone);
  const entry = join(clone, "examples/coding-agent/dist/main.mjs");
  installCodingAgentFetchHarness(entry);

  const journey = await runShellJourney({
    command: process.execPath,
    args: [`--import=${join(scriptDirectory, "coding-agent-fetch-stub.mjs")}`, entry],
    cwd: clone,
    env: { DEEPSEEK_API_KEY: "stub" },
    columns: 100,
    rows: 30,
    timeoutMs: 45_000,
  });

  try {
    await journey.waitForVisible(["> ", "█"]);
    journey.write("alp你🙂");
    await journey.waitForVisible(["> alp你🙂"]);
    journey.write("\r");
    await journey.waitForVisible(["STREAM_ACCEPT_1"], ["[Enter] run / [Esc] skip"]);
    await journey.waitForVisible(["printf ACCEPTED_TOOL", "[Enter] run / [Esc] skip"]);
    journey.write("approval-blocked");
    journey.write("\r");
    await journey.waitForVisible(["ACCEPTED_COMPLETE", "> "]);
    journey.write("beta");
    await journey.waitForVisible(["> beta"]);
    journey.write("\r");
    await journey.waitForVisible(["STREAM_REJECT"]);
    await journey.waitForVisible(["printf SHOULD_NOT_RUN", "[Enter] run / [Esc] skip"]);
    journey.write("\u001b");
    await journey.waitForVisible(["REJECTED_COMPLETE", "> "]);
    journey.write("restored");
    await journey.waitForVisible(["> restored"]);
    journey.write("\u0003");
    const { raw, terminal } = await journey.finish("coding-shell-ok");
    const finalDocument = fullBufferText(terminal);

    let previousHistoryIndex = -1;
    for (const value of [
      "You: alp你🙂",
      "Agent: STREAM_ACCEPT_1 STREAM_ACCEPT_2",
      "printf ACCEPTED_TOOL",
      "ACCEPTED_COMPLETE",
      "You: beta",
      "Agent: STREAM_REJECT",
      "printf SHOULD_NOT_RUN",
      "(skipped by user)",
      "REJECTED_COMPLETE",
      "restored",
    ]) {
      assert.equal(
        countOccurrences(finalDocument, value),
        1,
        `Expected one final logical occurrence of ${JSON.stringify(value)}.\n${finalDocument}`,
      );
      const historyIndex = finalDocument.indexOf(value);
      assert.ok(
        historyIndex > previousHistoryIndex,
        `Expected ${JSON.stringify(value)} after the preceding history item.\n${finalDocument}`,
      );
      previousHistoryIndex = historyIndex;
    }
    assert.equal(
      countOccurrences(finalDocument, "SHOULD_NOT_RUN"),
      1,
      `Rejected tool command produced output instead of remaining skipped.\n${finalDocument}`,
    );
    assert.equal(countOccurrences(finalDocument, "ACCEPTED_TOOL"), 2);
    const acceptedCommandIndex = finalDocument.indexOf("printf ACCEPTED_TOOL");
    const acceptedResultIndex = finalDocument.indexOf(
      "ACCEPTED_TOOL",
      acceptedCommandIndex + "printf ACCEPTED_TOOL".length,
    );
    assert.ok(acceptedResultIndex > acceptedCommandIndex);
    assert.ok(acceptedResultIndex < finalDocument.indexOf("ACCEPTED_COMPLETE"));
    assert.equal(finalDocument.includes("approval-blocked"), false);
    assertInteractiveRestoration(raw, terminal, { fullscreen: false });
    assert.ok(finalDocument.includes("__SHELL_INPUT__:coding-shell-ok"));
    printRecord("journey:pass", { consumer: "coding-agent", profile: "100x30 real PTY" });
  } finally {
    await journey.cleanup();
  }
}

function createMoFixture() {
  const home = join(temporaryRoot, "mo-home");
  const root = join(temporaryRoot, "mo-repositories");
  const temp = join(temporaryRoot, "mo-tmp");
  mkdirSync(join(home, ".config"), { recursive: true });
  mkdirSync(root, { recursive: true });
  mkdirSync(temp, { recursive: true });
  writeFileSync(join(home, ".zshrc"), "");
  const repositories = [
    ["vuejs", "core"],
    ["vuejs", "vite"],
    ["voidzero", "rolldown"],
  ];
  for (const [owner, name] of repositories) {
    const path = join(root, owner, name);
    mkdirSync(path, { recursive: true });
  }
  writeFileSync(
    join(home, ".config/morc.json"),
    `${JSON.stringify({ root, shells: ["zsh"], compositionAlias: false }, null, 2)}\n`,
  );
  return { home, root, temp, repositories };
}

async function initializeMoRepositories(fixture) {
  for (const [owner, name] of fixture.repositories) {
    const path = join(fixture.root, owner, name);
    await run("git", ["init", "--quiet"], path);
    await run("git", ["remote", "add", "origin", `https://github.com/${owner}/${name}.git`], path);
  }
}

async function runMoJourney({ binary, clone, fixture, cancel }) {
  const actionsPath = join(fixture.temp, "mo-shell-actions");
  rmSync(actionsPath, { force: true });
  const journey = await runShellJourney({
    command: binary,
    args: ["cd"],
    cwd: clone,
    env: {
      HOME: fixture.home,
      TMPDIR: fixture.temp,
      PATH: `${dirname(binary)}:${process.env.PATH}`,
    },
    columns: 100,
    rows: 30,
    expectedStatus: cancel ? 130 : 0,
    timeoutMs: 30_000,
  });

  try {
    await journey.waitForVisible(["Where would you like to go?"]);
    if (cancel) {
      journey.write("\u0003");
      const { raw, terminal } = await journey.finish("mo-cancel-shell-ok");
      assert.ok(fullBufferText(terminal).includes("Canceled."));
      assert.equal(existsSync(actionsPath), false);
      assertInteractiveRestoration(raw, terminal, { fullscreen: false });
    } else {
      journey.write("vite");
      await journey.waitForVisible(["vite", "(vuejs)"]);
      journey.write("\r");
      await journey.waitForVisible(["✓ Where would you like to go?"]);
      const { raw, terminal } = await journey.finish("mo-accept-shell-ok");
      const expectedPath = join(fixture.root, "vuejs/vite");
      const finalDocument = fullBufferText(terminal);
      assert.ok(finalDocument.includes("✓ Where would you like to go?"));
      assert.ok(finalDocument.includes("vuejs/vite"));
      assert.deepEqual(JSON.parse(readFileSync(actionsPath, "utf8")), [
        { type: "cd", path: expectedPath },
      ]);
      assertInteractiveRestoration(raw, terminal, { fullscreen: false });
    }
  } finally {
    await journey.cleanup();
  }
}

async function verifyMo(artifacts) {
  const clone = await preparePinnedConsumer("mo", artifacts);
  await run("vp", ["run", "build"], clone);
  assertConsumerPublicImports("mo", clone);
  const checks = await run("vp", ["check"], clone, { expectedExitCodes: [0, 1] });
  const checkOutput = stripAnsi(`${checks.stdout}\n${checks.stderr}`);
  assert.match(checkOutput, /All 63 files are correctly formatted/);
  assert.match(checkOutput, /Found 0 errors and 39 warnings in 32 files/);
  printRecord("consumer:baseline-noise", {
    name: "mo",
    command: "vp check",
    errors: 0,
    warnings: 39,
  });
  await run("vp", ["run", "test"], clone);

  // The pinned mo package's `prepare` regenerates shared Vite+ configuration,
  // which is unrelated to this already-built Runtime migration and is not
  // compatible with the disposable staged config. Pack the verified dist as-is.
  const moTarball = await packPackage(clone, { ignoreScripts: true });
  const prefix = join(temporaryRoot, "mo-prefix");
  mkdirSync(prefix, { recursive: true });
  await run("npm", ["install", "--global", "--prefix", prefix, moTarball]);
  const binary = join(prefix, "bin/mo");
  assert.ok(existsSync(binary));
  const fixture = createMoFixture();
  await initializeMoRepositories(fixture);
  await runMoJourney({ binary, clone, fixture, cancel: false });
  await runMoJourney({ binary, clone, fixture, cancel: true });
  printRecord("journey:pass", { consumer: "mo", profiles: ["accept", "cancel"] });
}

function findFirstCellColor(terminal, needle) {
  const buffer = terminal.buffer.active;
  for (let row = 0; row < terminal.rows; row++) {
    const line = buffer.getLine(buffer.viewportY + row);
    if (!line) continue;
    const text = line.translateToString(false);
    const column = text.indexOf(needle);
    if (column < 0) continue;
    const cell = line.getCell(column);
    if (cell) return { mode: cell.getFgColorMode(), color: cell.getFgColor() };
  }
  return null;
}

function cellRuns(line, pattern) {
  return [...line.matchAll(pattern)].map((match) => {
    const start = stringWidth(line.slice(0, match.index));
    const width = stringWidth(match[0]);
    return { start, width, end: start + width };
  });
}

function inspectMachudWideGeometry(terminal) {
  const lines = visibleText(terminal).split("\n");
  const borderRow = lines.findIndex((line) => cellRuns(line, /╭─+╮/gu).length === 3);
  if (borderRow < 0) return null;
  const panels = cellRuns(lines[borderRow], /╭─+╮/gu);
  const graphRow = lines.findIndex(
    (line, index) => index > borderRow && cellRuns(line, /[\u2800-\u28ff]+/gu).length === 3,
  );
  if (graphRow < 0) return null;
  const graphs = cellRuns(lines[graphRow], /[\u2800-\u28ff]+/gu);
  const topTitleRow = lines.findIndex(
    (line) => line.includes("CPU") && line.includes("GPU") && line.includes("MEMORY"),
  );
  const middleTitleRow = lines.findIndex(
    (line) => line.includes("NETWORK") && line.includes("POWER") && line.includes("DISK"),
  );
  const statusTitleRow = lines.findIndex((line) => line.includes("STATUS"));
  const topTitleLine = lines[topTitleRow] ?? "";
  const titlesInsidePanels = ["CPU", "GPU", "MEMORY"].every((title, index) => {
    const offset = topTitleLine.indexOf(title);
    if (offset < 0) return false;
    const column = stringWidth(topTitleLine.slice(0, offset));
    return column > panels[index].start && column < panels[index].end;
  });
  const coherent =
    panels[0].start === 0 &&
    panels.at(-1).end === terminal.cols &&
    panels.slice(1).every((panel, index) => panel.start - panels[index].end === 1) &&
    graphs.every(
      (graph, index) =>
        graph.start === panels[index].start + 2 && graph.width === panels[index].width - 4,
    ) &&
    titlesInsidePanels &&
    topTitleRow > borderRow &&
    middleTitleRow > topTitleRow &&
    statusTitleRow > middleTitleRow;
  return {
    coherent,
    columns: terminal.cols,
    panelWidths: panels.map(({ width }) => width),
    graphWidths: graphs.map(({ width }) => width),
  };
}

async function verifyMachud(artifacts) {
  const clone = await preparePinnedConsumer("machud", artifacts);
  await run("vp", ["run", "build"], clone);
  assertConsumerPublicImports("machud", clone);
  const tests = await run("vp", ["run", "test"], clone);
  assert.match(stripAnsi(`${tests.stdout}\n${tests.stderr}`), /30 passed/);
  const verification = await run("vp", ["run", "verify"], clone, {
    env: { CI: "false" },
    timeoutMs: 15 * 60_000,
  });
  const verificationOutput = stripAnsi(`${verification.stdout}\n${verification.stderr}`);
  assert.match(verificationOutput, /ran 108 assertions ≥ pinned floor 108/);
  assert.match(verificationOutput, /verify: PASS/);
  const snapshot = await run(process.execPath, ["dist/machud.mjs", "--once"], clone, {
    env: { COLUMNS: "120", LINES: "40", FORCE_COLOR: "3" },
    timeoutMs: 60_000,
  });
  const snapshotText = stripAnsi(snapshot.stdout);
  for (const value of ["machud", "CPU", "MEMORY", "q quit", "t theme"]) {
    assert.ok(snapshotText.includes(value), `Machud snapshot did not contain ${value}.`);
  }
  assert.equal(snapshotText.includes("NaN"), false);
  assert.ok(
    snapshotText.split("\n").every((line) => stringWidth(line) <= 120),
    "Machud snapshot exceeded 120 columns.",
  );

  const journey = await runShellJourney({
    command: process.execPath,
    args: [join(clone, "dist/machud.mjs")],
    cwd: clone,
    env: { MACHUD_TEST_APPEARANCE: "dark" },
    columns: 120,
    rows: 40,
    timeoutMs: 45_000,
  });
  try {
    await journey.waitFor(() => {
      const screen = visibleText(journey.terminal);
      const geometry = inspectMachudWideGeometry(journey.terminal);
      return (
        journey.terminal.buffer.active.type === "alternate" &&
        screen.includes("machud") &&
        screen.includes("q quit · t theme · refresh 1s") &&
        geometry?.coherent === true &&
        geometry.columns === 120
      );
    }, "Machud live 120-column panel and graph geometry");
    const initialGeometry = inspectMachudWideGeometry(journey.terminal);
    assert.ok(initialGeometry?.coherent);

    const rawLengthBeforeResize = journey.raw().length;
    // Parse the next application transaction against the same dimensions that
    // SIGWINCH reports to the child.
    journey.terminal.resize(100, 40);
    journey.child.resize(100, 40);
    await journey.waitFor(() => {
      const geometry = inspectMachudWideGeometry(journey.terminal);
      return (
        journey.raw().length > rawLengthBeforeResize &&
        geometry?.coherent === true &&
        geometry.columns === 100 &&
        geometry.panelWidths.some((width, index) => width !== initialGeometry.panelWidths[index])
      );
    }, "Machud live responsive panel and graph geometry after PTY resize");
    const resizedGeometry = inspectMachudWideGeometry(journey.terminal);
    assert.ok(resizedGeometry?.coherent);
    assert.notDeepEqual(resizedGeometry.panelWidths, initialGeometry.panelWidths);
    assert.notDeepEqual(resizedGeometry.graphWidths, initialGeometry.graphWidths);
    printRecord("machud:live-geometry", {
      initial: initialGeometry,
      resized: resizedGeometry,
    });

    const darkColor = findFirstCellColor(journey.terminal, "machud");
    assert.ok(darkColor, "Could not locate Machud title color.");
    journey.write("t");
    await journey.waitFor(() => {
      const current = findFirstCellColor(journey.terminal, "machud");
      return current && (current.mode !== darkColor.mode || current.color !== darkColor.color);
    }, "Machud live dark-to-light theme change");
    journey.write("q");
    const { raw, terminal } = await journey.finish("machud-shell-ok");
    const finalDocument = fullBufferText(terminal);
    assert.ok(finalDocument.includes("__SHELL_BEFORE__"));
    assert.ok(finalDocument.includes("__SHELL_INPUT__:machud-shell-ok"));
    assertInteractiveRestoration(raw, terminal, { fullscreen: true });
    printRecord("journey:pass", {
      consumer: "machud",
      profile: "120x40 -> 100x40 real PTY",
    });
  } finally {
    await journey.cleanup();
  }
}

function assertForkTerminalBehavior(output, terminal, activeInput) {
  for (const sequence of [
    ENTER_ALT_SCREEN,
    EXIT_ALT_SCREEN,
    ENABLE_BRACKETED_PASTE,
    DISABLE_BRACKETED_PASTE,
    ENABLE_KITTY_KEYBOARD,
    DISABLE_KITTY_KEYBOARD,
    ENABLE_SGR_MOUSE,
    DISABLE_SGR_MOUSE,
    ENABLE_DRAG_MOUSE,
    DISABLE_DRAG_MOUSE,
  ]) {
    assert.equal(
      output.includes(sequence),
      false,
      `Fork fixture emitted ${JSON.stringify(sequence)}.`,
    );
  }
  if (activeInput) {
    for (const sequence of [HIDE_CURSOR, SHOW_CURSOR, ENABLE_SYNC_OUTPUT, DISABLE_SYNC_OUTPUT]) {
      assert.equal(
        output.includes(sequence),
        false,
        `Rejected fork input emitted ${JSON.stringify(sequence)}.`,
      );
    }
  } else {
    assertCursorRestoration(output, false);
    assertOwnershipPair(output, ENABLE_SYNC_OUTPUT, DISABLE_SYNC_OUTPUT, false);
  }
  assert.equal(terminal.buffer.active.type, "normal");
  assert.equal(terminal.modes.bracketedPasteMode, false);
  assert.equal(terminal.modes.mouseTrackingMode, "none");
  assert.equal(terminal.modes.synchronizedOutputMode, false);
}

function forkResult(output) {
  const match = output.match(/__FORK_RESULT__(\{[^\r\n]*\})/);
  assert.ok(match, `Missing fork result in:\n${output}`);
  return JSON.parse(match[1]);
}

function forkChildOutput(output) {
  const startMarker = "__FORK_CHILD_OUTPUT_START__";
  const endMarker = "__FORK_CHILD_OUTPUT_END__";
  const start = output.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing fork child-output start marker in:\n${output}`);
  const contentStart = start + startMarker.length;
  const end = output.indexOf(endMarker, contentStart);
  assert.notEqual(end, -1, `Missing fork child-output end marker in:\n${output}`);
  assert.equal(output.indexOf(startMarker, contentStart), -1, "Duplicate fork start marker.");
  assert.equal(output.indexOf(endMarker, end + endMarker.length), -1, "Duplicate fork end marker.");
  return output.slice(contentStart, end);
}

async function verifyForkStdin(artifacts) {
  const project = join(temporaryRoot, "fork-stdin-consumer");
  mkdirSync(project, { recursive: true });
  writeFileSync(
    join(project, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        type: "module",
        packageManager: "pnpm@11.1.2",
        dependencies: {
          "@vue-tui/runtime": `file:${artifacts.runtime}`,
          vue: "3.4.38",
        },
      },
      null,
      2,
    )}\n`,
  );
  for (const name of ["child.mjs", "program-a.mjs", "program-b.mjs"]) {
    copyFileSync(join(forkFixtureDirectory, name), join(project, name));
  }
  assertPublicProductImports(project, new Set(["@vue-tui/runtime"]));
  await run("pnpm", ["install", "--no-frozen-lockfile", "--ignore-scripts"], project);
  assertPackedResolution(
    join(project, "node_modules/@vue-tui/runtime/package.json"),
    join(repositoryRoot, "packages/runtime"),
  );

  for (const topology of ["ignored", "piped"]) {
    for (const kind of ["input-free", "active-input"]) {
      for (let repetition = 1; repetition <= 3; repetition++) {
        const journey = await runShellJourney({
          command: process.execPath,
          args: [join(project, "program-a.mjs"), topology, kind],
          cwd: project,
          env: { FORCE_COLOR: "0" },
          timeoutMs: 30_000,
          columns: 80,
          rows: 24,
        });
        try {
          await journey.waitForRaw("__FORK_RESULT__");
          const { raw, terminal } = await journey.finish(
            `fork-${topology}-${kind}-${repetition}-shell-ok`,
          );
          const finalDocument = fullBufferText(terminal);
          const record = forkResult(raw);
          const childOutput = forkChildOutput(raw);
          assert.equal(record.topology, topology);
          assert.equal(record.kind, kind);
          assert.equal(record.exitCode, 0);
          assert.equal(record.signal, null);
          assert.deepEqual(record.streams, {
            stdinIsTTY: true,
            stdoutIsTTY: true,
            stderrIsTTY: true,
          });
          assert.deepEqual(record.message?.streams, {
            stdinIsTTY: false,
            stdoutIsTTY: true,
            stderrIsTTY: true,
          });
          const childMessage =
            topology === "ignored" ? record.message : record.message?.childMessage;
          assert.equal(
            record.message?.status,
            topology === "ignored" ? (kind === "input-free" ? "rendered" : "rejected") : "relayed",
          );
          assert.equal(childMessage?.kind, kind);
          assert.deepEqual(childMessage?.streams, {
            stdinIsTTY: false,
            stdoutIsTTY: true,
            stderrIsTTY: true,
          });
          assert.deepEqual(childMessage?.availability, {
            status: "unavailable",
            reason: "stdin-not-tty",
          });
          if (kind === "input-free") {
            assert.equal(childMessage.status, "rendered");
            const printableChildOutput = stripAnsi(childOutput).replaceAll("\r\n", "\n");
            assert.equal(
              printableChildOutput,
              "__FORK_OUTPUT_OK__\n",
              `Input-free fork emitted unexpected printable output.\nRaw output: ${JSON.stringify(childOutput)}`,
            );
            assert.equal(countOccurrences(finalDocument, "__FORK_OUTPUT_OK__"), 1);
          } else {
            assert.equal(childMessage.status, "rejected");
            assert.match(childMessage.message, /^Managed input is unavailable/);
            assert.equal(childOutput, "", "Rejected managed input wrote to inherited output.");
            assert.equal(finalDocument.includes("__ACTIVE_INPUT__"), false);
          }
          assert.ok(finalDocument.includes(`fork-${topology}-${kind}-${repetition}-shell-ok`));
          assertForkTerminalBehavior(raw, terminal, kind === "active-input");
          printRecord("fork:pass", { topology, kind, repetition, profile: "80x24 real PTY" });
        } finally {
          await journey.cleanup();
        }
      }
    }
  }
}

function requestedConsumer() {
  const index = process.argv.indexOf("--consumer");
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  const allowed = new Set(["coding-agent", "mo", "machud", "fork-stdin"]);
  if (!allowed.has(value) || process.argv.length !== 4) {
    throw new Error(
      "Usage: node packages/runtime-tests/consumers/runtime-foundation/verify.mjs --consumer coding-agent|mo|machud|fork-stdin",
    );
  }
  return value;
}

let succeeded = false;
try {
  mkdirSync(tarballDirectory);
  mkdirSync(cloneDirectory);
  printRecord("start", {
    consumer,
    repositoryRoot,
    head: (await run("git", ["rev-parse", "HEAD"])).stdout.trim(),
    temporaryRoot,
  });
  const artifacts = await packVueTui(consumer === "coding-agent");
  if (consumer === "coding-agent") await verifyCodingAgent(artifacts);
  if (consumer === "mo") await verifyMo(artifacts);
  if (consumer === "machud") await verifyMachud(artifacts);
  if (consumer === "fork-stdin") await verifyForkStdin(artifacts);
  succeeded = true;
  printRecord("complete", { consumer, status: "pass" });
} finally {
  for (const child of activeChildren) killChildProcessGroup(child, "SIGTERM");
  if (process.env.VUE_TUI_KEEP_RUNTIME_FOUNDATION_TEMP === "1") {
    printRecord("temporary-root:kept", { temporaryRoot, succeeded });
  } else {
    rmSync(temporaryRoot, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}
