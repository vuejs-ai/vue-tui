import { expect, test } from "vite-plus/test";
import { describeChildFailure, formatEventLog } from "./diagnostics.ts";
import type { TestEvent } from "./events.ts";

const events: readonly TestEvent[] = [
  { seq: 1, ev: "app:mounted" },
  { seq: 2, ev: "hmr:error", data: { phase: "compile" } },
];

function snapshot(overrides: Partial<Parameters<typeof describeChildFailure>[1]> = {}) {
  return {
    root: "/tmp/basic-XXXX",
    command: ["/bin/node", "--import=launcher", "/vite/bin/vite.js", "/tmp/basic-XXXX"],
    exit: undefined,
    events,
    eventChannelFailure: undefined,
    screen: "LABEL-A count=3",
    output: "raw pty bytes",
    ...overrides,
  };
}

test("an empty log says so rather than rendering as blank", () => {
  expect(formatEventLog([])).toBe("(no events received)");
  expect(formatEventLog(events)).toBe(
    '{"seq":1,"ev":"app:mounted"}\n{"seq":2,"ev":"hmr:error","data":{"phase":"compile"}}',
  );
});

test("event diagnostics elide committed frames without dropping their metadata", () => {
  const log = formatEventLog([
    {
      seq: 3,
      ev: "paint:committed",
      data: { frame: "A\nB", generation: 7 },
    },
  ]);

  expect(log).toBe('{"seq":3,"ev":"paint:committed","data":{"frame":"<3 chars>","generation":7}}');
  expect(log).not.toContain("A\\nB");
});

// The child is gone by the time a human reads this, so anything missing here is
// unrecoverable. Each field is asserted by name because dropping one silently
// makes every future failure harder to debug and fails no test.
test("the report carries every field needed to debug a dead child", () => {
  const report = describeChildFailure(new Error("BOOM"), snapshot());

  expect(report.message).toContain("BOOM");
  expect(report.message).toContain("root: /tmp/basic-XXXX");
  expect(report.message).toContain('"--import=launcher"');
  expect(report.message).toContain("exit: running");
  expect(report.message).toContain("event channel failure: none");
  expect(report.message).toContain('{"seq":1,"ev":"app:mounted"}');
  expect(report.message).toContain("LABEL-A count=3");
  expect(report.message).toContain("raw pty bytes");
});

test("the original failure survives as the cause", () => {
  const original = new Error("BOOM");
  expect(describeChildFailure(original, snapshot()).cause).toBe(original);
});

test("an exited child reports its exit instead of claiming to be running", () => {
  const report = describeChildFailure(new Error("BOOM"), snapshot({ exit: { exitCode: 1 } }));
  expect(report.message).toContain('exit: {"exitCode":1}');
  expect(report.message).not.toContain("exit: running");
});

test("a dead event channel is named, since it explains failures that look like timeouts", () => {
  const failure = new Error("channel closed");
  const report = describeChildFailure(
    new Error("BOOM"),
    snapshot({ eventChannelFailure: failure }),
  );
  expect(report.message).toContain("channel closed");
});

test("only the tail of a long output is kept, so the report stays readable", () => {
  const output = `HEAD-MARKER${"x".repeat(8_000)}TAIL-MARKER`;
  const report = describeChildFailure(new Error("BOOM"), snapshot({ output }));
  expect(report.message).toContain("TAIL-MARKER");
  expect(report.message).not.toContain("HEAD-MARKER");
});
