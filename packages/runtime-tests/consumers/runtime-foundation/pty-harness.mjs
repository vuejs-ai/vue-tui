import assert from "node:assert/strict";
import { createRequire } from "node:module";
import process from "node:process";
import headless from "@xterm/headless";

const require = createRequire(import.meta.url);
const { spawn } = require("node-pty");
const { Terminal } = headless;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const inheritedEnvironment = Object.fromEntries(
  ["HOME", "LANG", "LC_ALL", "LOGNAME", "PATH", "PNPM_HOME", "SHELL", "TMPDIR", "USER"]
    .filter((name) => process.env[name] !== undefined)
    .map((name) => [name, process.env[name]]),
);

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function shellCommand(command, args) {
  return [command, ...args].map(shellQuote).join(" ");
}

function bufferText(terminal, viewportOnly) {
  const buffer = terminal.buffer.active;
  const start = viewportOnly ? buffer.viewportY : 0;
  const length = viewportOnly ? terminal.rows : buffer.length;
  return Array.from({ length }, (_, index) =>
    (buffer.getLine(start + index)?.translateToString(true) ?? "").trimEnd(),
  ).join("\n");
}

export function visibleText(terminal) {
  return bufferText(terminal, true);
}

export function fullBufferText(terminal) {
  return bufferText(terminal, false);
}

export async function runShellJourney({
  command,
  args = [],
  cwd,
  env = {},
  columns,
  rows,
  expectedStatus = 0,
  timeoutMs = 30_000,
}) {
  const script = [
    "shell_before=$(stty -g)",
    "stty -echo",
    "printf '__HARNESS_READY__\\n'",
    "printf '__SHELL_BEFORE__\\n'",
    "before=$(stty -g)",
    shellCommand(command, args),
    "status=$?",
    "after=$(stty -g)",
    'if [ "$before" = "$after" ]; then termios=ok; else termios=bad; fi',
    'stty "$before"',
    'printf \'\\n__APP_EXIT__:%s\\n__TERMIOS__:%s\\n\' "$status" "$termios"',
    "IFS= read -r shell_line",
    "printf '__SHELL_INPUT__:%s\\n' \"$shell_line\"",
    'stty "$shell_before"',
    `if [ "$termios" != ok ]; then exit 91; fi`,
    `if [ "$status" -ne ${expectedStatus} ]; then exit 92; fi`,
    "exit 0",
  ].join("\n");

  const terminal = new Terminal({
    cols: columns,
    rows,
    allowProposedApi: true,
    scrollback: 10_000,
  });
  const child = (() => {
    try {
      return spawn("/bin/bash", ["--noprofile", "--norc", "-c", script], {
        name: "xterm-256color",
        cols: columns,
        rows,
        cwd,
        env: {
          ...inheritedEnvironment,
          TERM: "xterm-256color",
          CI: "false",
          FORCE_COLOR: "3",
          NODE_NO_WARNINGS: "1",
          ...env,
        },
      });
    } catch (error) {
      terminal.dispose();
      throw error;
    }
  })();

  let raw = "";
  let exited = false;
  let exitInfo;
  let parser = Promise.resolve();
  let resolveExit;
  const exitPromise = new Promise((resolve) => {
    resolveExit = resolve;
  });

  const terminalData = terminal.onData((data) => {
    if (!exited) child.write(data);
  });
  const terminalBinary = terminal.onBinary((data) => {
    if (!exited) child.write(Buffer.from(data, "binary"));
  });

  child.onData((data) => {
    raw += data;
    parser = parser.then(
      () =>
        new Promise((resolve) => {
          terminal.write(data, resolve);
        }),
    );
  });
  child.onExit((info) => {
    exited = true;
    exitInfo = info;
    resolveExit(info);
  });

  const deadlineFor = (milliseconds) => Date.now() + milliseconds;
  async function waitFor(predicate, label, milliseconds = timeoutMs) {
    const deadline = deadlineFor(milliseconds);
    let lastRawLength = -1;
    while (Date.now() < deadline) {
      await parser;
      if (predicate()) return;
      if (raw.length === lastRawLength) await delay(20);
      lastRawLength = raw.length;
    }
    await parser;
    if (predicate()) return;
    throw new Error(
      `Timed out waiting for ${label}.\nVisible screen:\n${visibleText(terminal)}\nRaw tail:\n${JSON.stringify(raw.slice(-4000))}`,
    );
  }

  async function waitForRaw(search, milliseconds) {
    await waitFor(() => raw.includes(search), JSON.stringify(search), milliseconds);
  }

  async function waitForVisible(included, excluded = [], milliseconds) {
    await waitFor(
      () => {
        const screen = visibleText(terminal);
        return (
          included.every((value) => screen.includes(value)) &&
          excluded.every((value) => !screen.includes(value))
        );
      },
      `visible ${JSON.stringify(included)} without ${JSON.stringify(excluded)}`,
      milliseconds,
    );
  }

  async function finish(shellInput = "shell-ok") {
    const completeExitPattern = /__APP_EXIT__:-?\d+(?:\r)?\n/;
    const completeTermiosPattern = /__TERMIOS__:(?:ok|bad)(?:\r)?\n/;
    const exitPattern = new RegExp(`__APP_EXIT__:${expectedStatus}(?:\\r)?\\n`);
    const termiosPattern = /__TERMIOS__:ok(?:\r)?\n/;
    await waitFor(
      () => completeExitPattern.test(raw) && completeTermiosPattern.test(raw),
      "complete application exit and termios markers",
      timeoutMs,
    );
    await parser;
    assert.match(raw, exitPattern);
    assert.match(raw, termiosPattern);
    child.write(`${shellInput}\r`);
    await waitForRaw(`__SHELL_INPUT__:${shellInput}`, timeoutMs);
    let exitTimer;
    const timedExit = new Promise((_, reject) => {
      exitTimer = setTimeout(() => {
        reject(new Error("The PTY wrapper shell did not exit."));
      }, timeoutMs);
    });
    let info;
    try {
      info = await Promise.race([exitPromise, timedExit]);
    } finally {
      clearTimeout(exitTimer);
    }
    await parser;
    assert.equal(info.exitCode, 0, `PTY wrapper exited with ${JSON.stringify(info)}`);
    return { raw, terminal, exitInfo };
  }

  async function cleanup() {
    terminalData.dispose();
    terminalBinary.dispose();
    if (!exited) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        try {
          child.kill("SIGTERM");
        } catch {
          // The wrapper may have exited concurrently.
        }
      }
      await Promise.race([exitPromise, delay(500)]);
    }
    if (!exited) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          // The wrapper may have exited concurrently.
        }
      }
      await Promise.race([exitPromise, delay(500)]);
    }
    terminal.dispose();
  }

  try {
    await waitForRaw("__HARNESS_READY__", timeoutMs);
  } catch (error) {
    await cleanup();
    throw error;
  }

  return {
    child,
    terminal,
    write(value) {
      if (exited) throw new Error("Cannot write to an exited PTY journey.");
      child.write(value);
    },
    raw() {
      return raw;
    },
    waitFor,
    waitForRaw,
    waitForVisible,
    finish,
    cleanup,
  };
}

export function countOccurrences(value, search) {
  return value.split(search).length - 1;
}
