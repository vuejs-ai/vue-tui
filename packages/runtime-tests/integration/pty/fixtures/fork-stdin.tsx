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

const runChild = async (kind: FixtureKind): Promise<void> => {
  const App = defineComponent({
    name: "ForkStdinChild",
    setup() {
      if (kind === "active-input") useInput(() => {});
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

  if (kind === "input-free" && failure === undefined) {
    await nextTick();
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
  if (kind === "input-free" && failure === undefined) {
    await sendToParent({ kind, status: "rendered", streams });
    return;
  }

  const message = failure instanceof Error ? failure.message : String(failure);
  await sendToParent({ kind, status: "rejected", streams, message });
};

const runParent = async (topology: StdinTopology, kind: FixtureKind): Promise<void> => {
  const fixturePath = fileURLToPath(import.meta.url);
  const child = fork(fixturePath, ["child", kind], {
    env: process.env,
    stdio: [topology === "ignored" ? "ignore" : "pipe", "inherit", "inherit", "ipc"],
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

const roleOrTopology = process.argv[2];
const kind = process.argv[3];

if (kind !== "input-free" && kind !== "active-input") {
  throw new Error(`Unknown fork fixture kind: ${kind}`);
}

if (roleOrTopology === "child") {
  await runChild(kind);
} else {
  if (roleOrTopology !== "ignored" && roleOrTopology !== "piped") {
    throw new Error(`Unknown fork stdin topology: ${roleOrTopology}`);
  }
  await runParent(roleOrTopology, kind);
}
