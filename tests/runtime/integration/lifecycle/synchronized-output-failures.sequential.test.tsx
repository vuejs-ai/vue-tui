// Sequential: these tests replace process-level terminal writes while failure cleanup is observed.
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import {
  bsu,
  createInternalMountOptions,
  esu,
  useStdout,
} from "../../../../packages/runtime/dist/internal.mjs";
import { makeRawTrackingStdin, makeTtyWritable } from "./test-streams.ts";

test.sequential("a failed coordinated Inline write closes synchronized output and restores the frame", async () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin } = makeRawTrackingStdin();
  const writes: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  let failPayload = false;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    writes.push(chunk);
    if (failPayload && chunk.includes("COORDINATED_FAILURE")) {
      throw new Error("coordinated data failed");
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  let coordinatedWrite: ((data: string) => void) | undefined;
  const App = defineComponent(() => {
    coordinatedWrite = useStdout().write;
    return () => <Text>ACTIVE_FRAME</Text>;
  });
  const app = createApp(App);
  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      maxFps: 0,
      patchConsole: false,
    }),
  );
  await app.waitUntilRenderFlush();

  const writesBeforeFailure = writes.length;
  failPayload = true;
  let writeError: unknown;
  try {
    coordinatedWrite!("COORDINATED_FAILURE\n");
  } catch (error) {
    writeError = error;
  }
  failPayload = false;

  const failureWrites = writes.slice(writesBeforeFailure);
  const failureTransaction = failureWrites.join("");
  const beginIndex = failureTransaction.indexOf(bsu);
  const payloadIndex = failureTransaction.indexOf("COORDINATED_FAILURE");
  const restoreIndex = failureTransaction.indexOf("ACTIVE_FRAME", payloadIndex);
  const endIndex = failureTransaction.indexOf(esu, restoreIndex);
  const observed = {
    error: writeError instanceof Error ? writeError.message : undefined,
    beganBeforePayload: beginIndex >= 0 && beginIndex < payloadIndex,
    restoredFrameAfterPayload: restoreIndex > payloadIndex,
    endedAfterRestore: endIndex > restoreIndex,
  };

  app.unmount();

  expect(observed).toEqual({
    error: "coordinated data failed",
    beganBeforePayload: true,
    restoredFrameAfterPayload: true,
    endedAfterRestore: true,
  });
});

test.sequential("a failed Inline resize boundary still closes synchronized output", async () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin } = makeRawTrackingStdin();
  const writes: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  let failNextResizeBoundary = false;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    writes.push(chunk);
    if (failNextResizeBoundary && chunk.includes("\x1b[?25l")) {
      failNextResizeBoundary = false;
      throw new Error("resize boundary failed");
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  const app = createApp(defineComponent(() => () => <Text>ACTIVE_FRAME</Text>));
  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      maxFps: 0,
      patchConsole: false,
    }),
  );
  await app.waitUntilRenderFlush();

  const writesBeforeFailure = writes.length;
  stdout.columns = 60;
  failNextResizeBoundary = true;
  const exited = app.waitUntilExit();
  stdout.emit("resize");
  await expect(exited).rejects.toThrow("resize boundary failed");

  const failureWrites = writes.slice(writesBeforeFailure);
  const failureTransaction = failureWrites.join("");
  const beginIndex = failureTransaction.indexOf(bsu);
  const payloadIndex = failureTransaction.indexOf("\x1b[?25l", beginIndex);
  const esuIndex = failureTransaction.indexOf(esu, payloadIndex);
  app.unmount();

  expect({
    beganSynchronizedOutput: beginIndex >= 0 && beginIndex < payloadIndex,
    closedAfterFailure: esuIndex > payloadIndex,
  }).toEqual({
    beganSynchronizedOutput: true,
    closedAfterFailure: true,
  });
});

test.sequential("a failed ordinary Inline render still closes synchronized output", async () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin } = makeRawTrackingStdin();
  const writes: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  let failNextFrame = false;
  let failedRenderAttempts = 0;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    writes.push(chunk);
    if (failNextFrame && chunk.includes("ORDINARY_RENDER_FAILURE")) {
      failNextFrame = false;
      failedRenderAttempts++;
      throw new Error("ordinary render failed");
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  const content = shallowRef("initial");
  const App = defineComponent(() => () => <Text>{content.value}</Text>);
  const app = createApp(App);
  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      // Keep the update below pending so unmount's synchronous final commit drives
      // the ordinary frame writer without throwing out of Vue's global post-flush
      // queue and contaminating another test in this worker.
      maxFps: 1,
      patchConsole: false,
    }),
  );
  await app.waitUntilRenderFlush();

  content.value = "ORDINARY_RENDER_FAILURE";
  await nextTick();

  const writesBeforeFailure = writes.length;
  failNextFrame = true;
  app.unmount();
  const failureWrites = writes.slice(writesBeforeFailure);
  const failureTransaction = failureWrites.join("");
  const beginIndex = failureTransaction.indexOf(bsu);
  const payloadIndex = failureTransaction.indexOf("ORDINARY_RENDER_FAILURE", beginIndex);
  const esuIndex = failureTransaction.indexOf(esu, payloadIndex);

  expect({
    failedRenderAttempts,
    beganSynchronizedOutput: beginIndex >= 0 && beginIndex < payloadIndex,
    closedAfterFailure: esuIndex > payloadIndex,
  }).toEqual({
    failedRenderAttempts: 1,
    beganSynchronizedOutput: true,
    closedAfterFailure: true,
  });
});
