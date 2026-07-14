import { fork } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const topology = process.argv[2];
const kind = process.argv[3];
const target =
  topology === "ignored"
    ? fileURLToPath(new URL("./child.mjs", import.meta.url))
    : fileURLToPath(new URL("./program-b.mjs", import.meta.url));
const stdio =
  topology === "ignored"
    ? ["ignore", "inherit", "inherit", "ipc"]
    : ["pipe", "inherit", "inherit", "ipc"];
const childOutputStart = "__FORK_CHILD_OUTPUT_START__";
const childOutputEnd = "__FORK_CHILD_OUTPUT_END__";

if (topology !== "ignored" && topology !== "piped") {
  throw new Error(`Unknown fork topology: ${topology}`);
}

process.stdout.write(childOutputStart);
const child = fork(target, [kind], {
  env: process.env,
  stdio,
});

let message;
child.on("message", (value) => {
  message = value;
});
child.on("error", (error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
child.on("close", (exitCode, signal) => {
  const result = {
    topology,
    kind,
    exitCode,
    signal,
    message,
    streams: {
      stdinIsTTY: process.stdin.isTTY === true,
      stdoutIsTTY: process.stdout.isTTY === true,
      stderrIsTTY: process.stderr.isTTY === true,
    },
  };
  process.stdout.write(`${childOutputEnd}__FORK_RESULT__${JSON.stringify(result)}\n`);
  if (exitCode !== 0 || signal !== null || !message) process.exitCode = 1;
});
