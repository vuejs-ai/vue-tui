import { fork } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const kind = process.argv[2];
const childPath = fileURLToPath(new URL("./child.mjs", import.meta.url));
const child = fork(childPath, [kind], {
  env: process.env,
  stdio: ["inherit", "inherit", "inherit", "ipc"],
});
const streams = {
  stdinIsTTY: process.stdin.isTTY === true,
  stdoutIsTTY: process.stdout.isTTY === true,
  stderrIsTTY: process.stderr.isTTY === true,
};

let childMessage;
child.on("message", (message) => {
  childMessage = message;
});

async function send(message) {
  if (!process.send) throw new Error("Program B requires an IPC channel to Program A.");
  await new Promise((resolve, reject) => {
    process.send(message, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

const result = await new Promise((resolve) => {
  child.on("error", (error) => {
    resolve({ error });
  });
  child.on("close", (exitCode, signal) => {
    resolve({ exitCode, signal });
  });
});

if (result.error) {
  await send({
    status: "program-b-failed",
    streams,
    message: result.error.stack ?? result.error.message,
  });
  process.exitCode = 1;
} else {
  const relayed = result.exitCode === 0 && result.signal === null && childMessage;
  await send({
    status: relayed ? "relayed" : "program-b-failed",
    streams,
    exitCode: result.exitCode,
    signal: result.signal,
    childMessage,
  });
  if (!relayed) process.exitCode = 1;
}
