import { createRequire } from "node:module";
import process from "node:process";
import { createApp, Text, useApp } from "@vue-tui/runtime";
import { INTERNAL_KITTY_KEYBOARD } from "../../../../runtime/dist/internal.mjs";
import { useInternalInputRoutingForTest } from "../../../../runtime/dist/internal.mjs";
import { createInternalMountOptions } from "../../../../runtime/dist/internal.mjs";
import { defineComponent, onMounted } from "vue";

const require = createRequire(import.meta.url);
const { spawn } = require("node-pty") as typeof import("node-pty");

const requestedMode = process.argv[2] === "fullscreen" ? "fullscreen" : "inline";
const expectedChildBytes = Buffer.concat([
  Buffer.from("A\x03paste\x03\x1b[?1u\nbody\x1b[?25h"),
  Buffer.from("�"),
]);
const childProgram = String.raw`
process.stdin.setRawMode(true);
process.stdin.resume();
const expected = Buffer.from(process.env.EXPECTED_HEX, "hex");
const chunks = [];
let quietTimer;
let finished = false;
const finish = (received, exitCode) => {
  if (finished) return;
  finished = true;
  if (quietTimer) clearTimeout(quietTimer);
  process.stdin.pause();
  process.stdout.write("__CHILD_HEX__" + received.toString("hex") + "__", () => {
    process.exitCode = exitCode;
  });
};
process.stdout.write("__CHILD_READY__");
process.stdin.on("data", chunk => {
  chunks.push(Buffer.from(chunk));
  const received = Buffer.concat(chunks);
  if (received.length < expected.length) return;
  if (received.length > expected.length || !received.equals(expected)) {
    finish(received, 2);
    return;
  }
  if (quietTimer) clearTimeout(quietTimer);
  quietTimer = setTimeout(() => finish(received, 0), 50);
});
`;

const child = spawn(process.execPath, ["-e", childProgram], {
  name: "xterm-256color",
  cols: 80,
  rows: 24,
  cwd: process.cwd(),
  env: {
    ...(process.env as Record<string, string>),
    EXPECTED_HEX: expectedChildBytes.toString("hex"),
  },
});

let childOutput = "";
let childReady = false;
let childExited = false;
let requestExit: (() => void) | undefined;
let childFailure: Error | undefined;
let childTailTimedOut = false;
let childTailTimer: ReturnType<typeof setTimeout> | undefined;
let outerExitRequested = false;
const kinds: string[] = [];
const fidelities: string[] = [];
const sequences: string[] = [];
let resolveChildReady!: () => void;
let rejectChildReady!: (error: Error) => void;
const childReadyPromise = new Promise<void>((resolve, reject) => {
  resolveChildReady = resolve;
  rejectChildReady = reject;
});
const childReadyTimer = setTimeout(
  () => rejectChildReady(new Error("child PTY did not enter raw mode within 5 seconds")),
  5000,
);
const maybeRequestOuterExit = () => {
  if (!childExited || !requestExit || outerExitRequested) return;
  if (!childOutput.includes("__CHILD_HEX__") && !childTailTimedOut) return;
  outerExitRequested = true;
  requestExit();
};

child.onData((data) => {
  childOutput += data;
  if (!childReady && childOutput.includes("__CHILD_READY__")) {
    childReady = true;
    clearTimeout(childReadyTimer);
    resolveChildReady();
  }
  if (childOutput.includes("__CHILD_HEX__")) {
    if (childTailTimer) clearTimeout(childTailTimer);
    maybeRequestOuterExit();
  }
});
child.onExit(({ exitCode }) => {
  childExited = true;
  if (exitCode !== 0) childFailure = new Error(`child PTY exited with ${exitCode}`);
  if (!childReady) {
    clearTimeout(childReadyTimer);
    rejectChildReady(childFailure ?? new Error("child PTY exited before entering raw mode"));
  } else if (!childOutput.includes("__CHILD_HEX__")) {
    childTailTimer = setTimeout(() => {
      childTailTimedOut = true;
      childFailure ??= new Error("child PTY exited before its final output was observed");
      maybeRequestOuterExit();
    }, 1000);
  }
  maybeRequestOuterExit();
});

try {
  await childReadyPromise;
} catch (error) {
  try {
    child.kill();
  } catch {
    // Preserve the readiness failure.
  }
  throw error;
}

const App = defineComponent(() => {
  const { exit } = useApp();
  requestExit = exit;
  maybeRequestOuterExit();
  const inputRouting = useInternalInputRoutingForTest();

  const boundary = inputRouting.registerSemantic({
    id: "pane",
    handle: (fact) => ({
      performed: false,
      continue: true,
      preventDefault: fact.kind === "key" && fact.key.name === "c" && fact.key.modifiers.ctrl,
      blockExternal: false,
    }),
  });
  const external = inputRouting.registerExternal({
    id: "child-pty-adapter",
    receive(source) {
      kinds.push(source.fact.kind);
      fidelities.push(source.fidelity);
      sequences.push(Buffer.from(source.sequence).toString("hex"));
      switch (source.fact.kind) {
        case "text":
          child.write(source.fact.text);
          break;
        case "key":
          child.write(source.fact.sequence);
          break;
        case "paste":
          // The child has not enabled bracketed paste. A terminal adapter sends
          // the semantic payload rather than blindly replaying the outer wrapper.
          child.write(source.fact.text);
          break;
        case "uninterpreted":
          child.write(source.sequence);
          break;
        case "pointer":
          throw new Error("pointer input is outside this F3 fixture");
      }
    },
  });
  inputRouting.select({
    activeBoundary: boundary.lease,
    external: external.lease,
  });

  onMounted(() => {
    process.stdout.write("__READY__");
  });
  return () => <Text>external input adapter ready</Text>;
});

const app = createApp(App);
app.mount(
  createInternalMountOptions({
    mode: requestedMode,
    // The selected private topology owns the outer terminal's input demand.
    maxFps: 0,
    patchConsole: false,
    [INTERNAL_KITTY_KEYBOARD]: { mode: "auto" },
  }),
);

try {
  await app.waitUntilExit();
  if (childFailure) throw childFailure;
  process.stdout.write(`__KINDS__${JSON.stringify(kinds)}__`);
  process.stdout.write(`__FIDELITIES__${JSON.stringify(fidelities)}__`);
  process.stdout.write(`__SEQUENCES__${JSON.stringify(sequences)}__`);
  process.stdout.write(childOutput);
  process.stdout.write("__FALLTHROUGH_OK__");
} finally {
  if (childTailTimer) clearTimeout(childTailTimer);
  try {
    child.kill();
  } catch {
    // The child normally exits after receiving the expected bytes.
  }
}
