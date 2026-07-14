import { PassThrough } from "node:stream";
import { defineComponent, isReadonly, nextTick, shallowRef } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import {
  createApp,
  renderToString,
  Text,
  useInput,
  useInputAvailability,
  type InputAvailability,
  type UseInputAvailabilityReturn,
} from "@vue-tui/runtime";
import { captureWrites, makeFakeWritable } from "../lifecycle/test-streams.ts";

describe("useInputAvailability", () => {
  test("returns one stable runtime-readonly available ref for a controllable TTY", async () => {
    let first: UseInputAvailabilityReturn | undefined;
    let second: UseInputAvailabilityReturn | undefined;
    const App = defineComponent(() => {
      first = useInputAvailability();
      second = useInputAvailability();
      return () => <Text>availability</Text>;
    });

    const result = await render(App);

    expect(first).not.toBe(second);
    expect(first?.availability).toBe(second?.availability);
    expect(first?.availability.value).toEqual({ status: "available" });
    expect(isReadonly(first?.availability)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first?.availability.value)).toBe(true);
    result.unmount();
  });

  test("keeps the same available ref across suspension and resume", async () => {
    let availability: UseInputAvailabilityReturn | undefined;
    const App = defineComponent(() => {
      availability = useInputAvailability();
      return () => <Text>availability</Text>;
    });

    const result = await render(App);
    const stableRef = availability?.availability;
    await result.terminal.suspend();
    expect(availability?.availability).toBe(stableRef);
    expect(stableRef?.value).toEqual({ status: "available" });
    await result.terminal.resume();
    expect(availability?.availability).toBe(stableRef);
    expect(stableRef?.value).toEqual({ status: "available" });
    result.unmount();
  });

  test("reports stdin-not-tty without creating managed input demand", async () => {
    let availability: InputAvailability | undefined;
    const App = defineComponent(() => {
      availability = useInputAvailability().availability.value;
      return () => <Text>availability</Text>;
    });

    const result = await render(App, { host: { stdin: "non-tty" } });

    expect(availability).toEqual({ status: "unavailable", reason: "stdin-not-tty" });
    expect(result.terminal.rawMode.history).toEqual([]);
    result.unmount();
  });

  test("keeps an inactive non-TTY registration inert until activation fails", async () => {
    const active = shallowRef(false);
    let availability: InputAvailability | undefined;
    const App = defineComponent(() => {
      availability = useInputAvailability().availability.value;
      useInput(() => "continue", { isActive: active });
      return () => <Text>availability</Text>;
    });

    const result = await render(App, { host: { stdin: "non-tty" } });
    expect(availability).toEqual({ status: "unavailable", reason: "stdin-not-tty" });
    expect(result.terminal.rawMode.history).toEqual([]);

    active.value = true;
    await nextTick().catch(() => {});
    await expect(result.waitUntilExit()).rejects.toThrow(
      "Managed input is unavailable because the mounted stdin is not a controllable TTY",
    );
    expect(result.terminal.rawMode.history).toEqual([]);
    result.dispose();
  });

  test("distinguishes a TTY that cannot be controlled", () => {
    const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
    Object.assign(stdin, { isTTY: true, isRaw: false });
    const stdout = makeFakeWritable();
    const stderr = makeFakeWritable();
    let availability: InputAvailability | undefined;
    const App = defineComponent(() => {
      availability = useInputAvailability().availability.value;
      return () => <Text>availability</Text>;
    });
    const app = createApp(App);

    app.mount({ stdout, stderr, stdin, maxFps: 0, patchConsole: false });
    expect(availability).toEqual({
      status: "unavailable",
      reason: "stdin-not-controllable",
    });

    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  });

  test("reports string-host during renderToString", () => {
    let availability: InputAvailability | undefined;
    const App = defineComponent(() => {
      availability = useInputAvailability().availability.value;
      return () => <Text>availability</Text>;
    });

    expect(renderToString(App)).toContain("availability");
    expect(availability).toEqual({ status: "unavailable", reason: "string-host" });
  });

  test("keeps an active string-host registration inert", () => {
    let called = false;
    let availability: InputAvailability | undefined;
    const App = defineComponent(() => {
      availability = useInputAvailability().availability.value;
      useInput(() => {
        called = true;
        return "continue";
      });
      return () => <Text>string input</Text>;
    });

    expect(renderToString(App)).toContain("string input");
    expect(availability).toEqual({ status: "unavailable", reason: "string-host" });
    expect(called).toBe(false);
  });

  test("keeps preflight stable when a pre-raw setterless TTY is later revoked", async () => {
    const stdin = new PassThrough() as unknown as NodeJS.ReadStream & { isRaw: boolean };
    Object.assign(stdin, {
      isTTY: true,
      isRaw: true,
      ref() {},
      unref() {},
    });
    const stdout = makeFakeWritable();
    const stderr = makeFakeWritable();
    const stdoutWrites = captureWrites(stdout);
    const stderrWrites = captureWrites(stderr);
    const active = shallowRef(false);
    let availability: UseInputAvailabilityReturn | undefined;
    const App = defineComponent(() => {
      availability = useInputAvailability();
      useInput(() => "continue", { isActive: active });
      return () => <Text>pre-raw</Text>;
    });
    const app = createApp(App);
    app.mount({ stdout, stderr, stdin, maxFps: 0, patchConsole: false });

    expect(availability?.availability.value).toEqual({ status: "available" });
    stdin.isRaw = false;
    const exited = app.waitUntilExit();
    active.value = true;
    await nextTick().catch(() => {});
    await expect(exited).rejects.toThrow(
      "Managed input is unavailable because the mounted stdin is not a controllable TTY",
    );
    expect(availability?.availability.value).toEqual({ status: "available" });
    expect(stdin.listenerCount("data")).toBe(0);
    expect(stdoutWrites.join("") + stderrWrites.join("")).toContain(
      "Managed input is unavailable because the mounted stdin is not a controllable TTY",
    );

    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  });
});
