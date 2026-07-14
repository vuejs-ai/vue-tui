import process from "node:process";
import { defineComponent, h, nextTick } from "vue";
import { createApp, Text, useInput, useInputAvailability } from "@vue-tui/runtime";

const kind = process.argv[2];
if (kind !== "input-free" && kind !== "active-input") {
  throw new Error(`Unknown fork fixture kind: ${kind}`);
}

const streams = {
  stdinIsTTY: process.stdin.isTTY === true,
  stdoutIsTTY: process.stdout.isTTY === true,
  stderrIsTTY: process.stderr.isTTY === true,
};

let availability;
const App = defineComponent({
  name: "ForkStdinFixture",
  setup() {
    availability = useInputAvailability().availability.value;
    if (kind === "active-input") useInput(() => "consume");
    const text = kind === "input-free" ? "__FORK_OUTPUT_OK__" : "__ACTIVE_INPUT__";
    return () => h(Text, null, () => text);
  },
});

const app = createApp(App);

async function send(message) {
  if (!process.send) return;
  await new Promise((resolve, reject) => {
    process.send(message, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

try {
  let mountFailure;
  try {
    app.mount({ patchConsole: false });
  } catch (error) {
    mountFailure = error;
  }

  if (kind === "input-free") {
    if (mountFailure) throw mountFailure;
    await nextTick();
    await app.waitUntilRenderFlush();
    app.unmount();
    await send({ kind, status: "rendered", availability, streams });
  } else {
    let failure = mountFailure;
    if (!failure) {
      try {
        await app.waitUntilExit();
      } catch (error) {
        failure = error;
      }
    }
    try {
      app.unmount();
    } catch (error) {
      throw new Error("Failed to clean up the rejected managed-input mount.", { cause: error });
    }

    const message = failure instanceof Error ? failure.message : String(failure);
    const expected =
      "Managed input is unavailable because the current process.stdin is not a controllable TTY.\n" +
      "Read raw bytes through useStdin().stdin, or mount a controllable TTY to use vue-tui input handlers.";
    if (message !== expected) {
      throw new Error(`Unexpected managed-input failure: ${JSON.stringify(message)}`);
    }
    if (availability?.status !== "unavailable" || availability.reason !== "stdin-not-tty") {
      throw new Error(`Unexpected input availability: ${JSON.stringify(availability)}`);
    }
    await send({ kind, status: "rejected", availability, message, streams });
  }
} catch (error) {
  try {
    app.unmount();
  } catch {
    // Preserve the first failure.
  }
  await send({
    kind,
    status: "fixture-failed",
    streams,
    message: error instanceof Error ? (error.stack ?? error.message) : String(error),
  }).catch(() => {});
  process.exitCode = 1;
}
