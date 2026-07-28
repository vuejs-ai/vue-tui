import process from "node:process";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineComponent, h, nextTick } from "vue";
import { createApp, Text, useInput } from "@vue-tui/runtime";

type FixtureKind = "input-free" | "active-input";
type StdinTopology = "ignored" | "piped";

interface StreamFacts {
  readonly stdinIsTTY: boolean;
  readonly stdoutIsTTY: boolean;
  readonly stderrIsTTY: boolean;
}

const streamFacts = (): StreamFacts => ({
  stdinIsTTY: process.stdin.isTTY === true,
  stdoutIsTTY: process.stdout.isTTY === true,
  stderrIsTTY: process.stderr.isTTY === true,
});

const sendToParent = async (message: unknown): Promise<void> => {
  if (!process.send) throw new Error("The fork fixture requires an IPC channel.");
  await new Promise<void>((resolve, reject) => {
    process.send!(message, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
};

const runChild = async (topology: StdinTopology, kind: FixtureKind): Promise<void> => {
  let receivedInput = false;
  let resolveExpectedInput!: () => void;
  const expectedInput = new Promise<void>((resolve) => {
    resolveExpectedInput = resolve;
  });
  const App = defineComponent({
    name: "ForkStdinChild",
    setup() {
      if (kind === "active-input") {
        useInput((event) => {
          if (event.type !== "text" || !event.text.includes("x")) return;
          receivedInput = true;
          resolveExpectedInput();
        });
      }
      return () =>
        h(Text, null, () => (kind === "input-free" ? "__FORK_OUTPUT_OK__" : "__ACTIVE_INPUT__"));
    },
  });
  const app = createApp(App);
  const exited = app.waitUntilExit();
  let failure: unknown;

  try {
    app.mount();
  } catch (error) {
    failure = error;
  }

  if (failure === undefined) {
    await nextTick();
    if (topology === "piped" && kind === "active-input") {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1_000);
        void expectedInput.then(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    await app.waitUntilRenderFlush();
    app.unmount();
  }

  try {
    await exited;
  } catch (error) {
    failure ??= error;
  }

  try {
    app.unmount();
  } catch (error) {
    failure ??= error;
  }

  const streams = streamFacts();
  if (failure === undefined) {
    await sendToParent({ kind, status: "rendered", streams, receivedInput });
    return;
  }

  const message =
    failure instanceof Error
      ? failure.message
      : typeof failure === "string"
        ? failure
        : "Unknown fork child failure";
  await sendToParent({ kind, status: "rejected", streams, receivedInput, message });
};

const runParent = async (topology: StdinTopology, kind: FixtureKind): Promise<void> => {
  const fixturePath = fileURLToPath(import.meta.url);
  const child = fork(fixturePath, ["relay", topology, kind], {
    env: process.env,
    stdio: [topology === "ignored" ? "ignore" : "pipe", "inherit", "inherit", "ipc"],
  });
  if (topology === "piped" && kind === "active-input") child.stdin?.write("x");

  let childMessage: unknown;
  child.on("message", (message) => {
    childMessage = message;
  });

  const result = await new Promise<{
    readonly exitCode: number | null;
    readonly signal: string | null;
  }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });

  process.stdout.write(
    `__FORK_RESULT__${JSON.stringify({
      topology,
      kind,
      ...result,
      streams: streamFacts(),
      childMessage,
    })}\n`,
  );

  if (result.exitCode !== 0 || result.signal !== null || childMessage === undefined) {
    process.exitCode = 1;
  }
};

const runRelay = async (topology: StdinTopology, kind: FixtureKind): Promise<void> => {
  const fixturePath = fileURLToPath(import.meta.url);
  const child = fork(fixturePath, ["child", topology, kind], {
    env: process.env,
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });

  let childMessage: unknown;
  child.on("message", (message) => {
    childMessage = message;
  });

  const result = await new Promise<{
    readonly exitCode: number | null;
    readonly signal: string | null;
  }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode, signal) => resolve({ exitCode, signal }));
  });

  if (childMessage !== undefined) await sendToParent(childMessage);
  if (result.exitCode !== 0 || result.signal !== null || childMessage === undefined) {
    process.exitCode = 1;
  }
};

const roleOrTopology = process.argv[2];
const topology =
  roleOrTopology === "child" || roleOrTopology === "relay" ? process.argv[3] : roleOrTopology;
const kind =
  roleOrTopology === "child" || roleOrTopology === "relay" ? process.argv[4] : process.argv[3];

if (kind !== "input-free" && kind !== "active-input") {
  throw new Error(`Unknown fork fixture kind: ${kind}`);
}
if (topology !== "ignored" && topology !== "piped") {
  throw new Error(`Unknown fork stdin topology: ${topology}`);
}

if (roleOrTopology === "child") {
  await runChild(topology, kind);
} else if (roleOrTopology === "relay") {
  await runRelay(topology, kind);
} else {
  await runParent(topology, kind);
}
