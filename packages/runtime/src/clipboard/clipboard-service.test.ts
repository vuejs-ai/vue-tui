import { describe, expect, test } from "vite-plus/test";
import { createInternalClipboardService } from "./clipboard-service.ts";

describe("clipboard service", () => {
  test("serializes custom writes and preserves exact fallback text", async () => {
    const starts: string[] = [];
    const releases = new Map<string, () => void>();
    const service = createInternalClipboardService({
      transport: {
        kind: "custom",
        async writeText(text) {
          starts.push(text);
          await new Promise<void>((resolve) => releases.set(text, resolve));
          return text === "first"
            ? { status: "copied" as const }
            : { status: "unavailable" as const, reason: "permission denied" };
        },
      },
      osc52Available: false,
      writeOsc52() {},
    });

    const first = service.writeText("first");
    const second = service.writeText("second");
    await Promise.resolve();
    expect(starts).toEqual(["first"]);
    releases.get("first")!();
    await expect(first).resolves.toEqual({ status: "copied", text: "first" });
    await Promise.resolve();
    expect(starts).toEqual(["first", "second"]);
    releases.get("second")!();
    await expect(second).resolves.toEqual({
      status: "unavailable",
      text: "second",
      reason: "transport-unavailable",
      detail: "permission denied",
    });
  });

  test("reports OSC 52 as requested and gates suspension and disposal", async () => {
    const writes: string[] = [];
    const service = createInternalClipboardService({
      transport: { kind: "osc52" },
      osc52Available: true,
      writeOsc52: (text) => writes.push(text),
    });

    await expect(service.writeText("exact")).resolves.toEqual({
      status: "requested",
      text: "exact",
    });
    expect(writes).toEqual(["exact"]);

    service.suspend();
    await expect(service.writeText("paused")).resolves.toEqual({
      status: "unavailable",
      text: "paused",
      reason: "suspended",
    });
    service.resume();
    service.dispose();
    await expect(service.writeText("late")).resolves.toEqual({
      status: "unavailable",
      text: "late",
      reason: "disposed",
    });
    expect(writes).toEqual(["exact"]);
  });

  test("settles already-unavailable calls immediately and rechecks queued calls", async () => {
    let release!: () => void;
    const starts: string[] = [];
    const service = createInternalClipboardService({
      transport: {
        kind: "custom",
        async writeText(text) {
          starts.push(text);
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return { status: "copied" };
        },
      },
      osc52Available: false,
      writeOsc52() {},
    });

    const first = service.writeText("first");
    const queued = service.writeText("queued");
    await Promise.resolve();
    service.suspend();
    await expect(service.writeText("already paused")).resolves.toEqual({
      status: "unavailable",
      text: "already paused",
      reason: "suspended",
    });
    release();
    await expect(first).resolves.toEqual({ status: "copied", text: "first" });
    await expect(queued).resolves.toEqual({
      status: "unavailable",
      text: "queued",
      reason: "suspended",
    });
    expect(starts).toEqual(["first"]);
  });

  test("normalizes adapter throws and invalid results into rejected outcomes", async () => {
    const thrown = new Error("denied");
    const service = createInternalClipboardService({
      transport: {
        kind: "custom",
        writeText() {
          throw thrown;
        },
      },
      osc52Available: false,
      writeOsc52() {},
    });
    await expect(service.writeText("secret")).resolves.toEqual({
      status: "rejected",
      text: "secret",
      cause: thrown,
    });
  });
});
