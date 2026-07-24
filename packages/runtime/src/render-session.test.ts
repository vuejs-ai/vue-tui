import { expect, test } from "vite-plus/test";
import { MAX_LAYOUT_VALUE } from "./numeric-limits.ts";
import {
  createLiveRenderSessionService,
  createStringRenderSessionService,
  needsTerminalSizeProbe,
  normalizeRequestedMode,
  resolveLiveDimensions,
  resolveLiveSurface,
  type LiveHostInput,
} from "./render-session.ts";

const detected80x24 = {
  kind: "detected",
  source: "controlling-tty",
  size: { columns: 80, rows: 24 },
} as const;

const unavailable = { kind: "unavailable" } as const;

function liveInput(overrides: Partial<LiveHostInput> = {}): LiveHostInput {
  return {
    requestedMode: "inline",
    liveUpdatesOverride: undefined,
    stdout: { isTTY: true, columns: 100, rows: 30 },
    terminalProbe: unavailable,
    ...overrides,
  };
}

test("normalizes the finite mount mode input", () => {
  expect(normalizeRequestedMode({})).toBe("inline");
  expect(normalizeRequestedMode({ mode: undefined })).toBe("inline");
  expect(normalizeRequestedMode({ mode: "inline" })).toBe("inline");
  expect(normalizeRequestedMode({ mode: "fullscreen" })).toBe("fullscreen");
});

test.each([null, false, true, "full-screen", 0, {}, [], () => {}, Symbol("mode"), 1n])(
  "rejects invalid mode %#",
  (mode) => {
    expect(() => normalizeRequestedMode({ mode })).toThrow(
      'Mount option "mode" must be "inline", "fullscreen", or undefined',
    );
  },
);

test("resolves one dimensions snapshot with source provenance", () => {
  expect(resolveLiveDimensions({ isTTY: true, columns: 120, rows: 40 }, detected80x24)).toEqual({
    terminal: { columns: 120, rows: 40 },
    layout: { columns: 120, rows: 40 },
  });

  expect(
    resolveLiveDimensions({ isTTY: true, columns: 120, rows: undefined }, detected80x24),
  ).toEqual({
    terminal: { columns: 80, rows: 24 },
    layout: { columns: 80, rows: 24 },
  });

  expect(resolveLiveDimensions({ isTTY: true, columns: 0, rows: Number.NaN }, unavailable)).toEqual(
    {
      terminal: null,
      layout: { columns: 80, rows: 24 },
    },
  );

  expect(resolveLiveDimensions({ isTTY: false, columns: 120, rows: 40 }, detected80x24)).toEqual({
    terminal: null,
    layout: { columns: 80, rows: 24 },
  });
});

test("rejects terminal axes outside Runtime's accepted layout range", () => {
  const outsideLayoutRange = MAX_LAYOUT_VALUE + 1;

  expect(needsTerminalSizeProbe({ isTTY: true, columns: outsideLayoutRange, rows: 24 })).toBe(true);
  expect(needsTerminalSizeProbe({ isTTY: true, columns: 80, rows: outsideLayoutRange })).toBe(true);

  expect(
    resolveLiveDimensions({ isTTY: true, columns: outsideLayoutRange, rows: 24 }, unavailable),
  ).toEqual({
    terminal: null,
    layout: { columns: 80, rows: 24 },
  });
  expect(
    resolveLiveDimensions({ isTTY: true, columns: outsideLayoutRange, rows: 24 }, detected80x24),
  ).toEqual({
    terminal: { columns: 80, rows: 24 },
    layout: { columns: 80, rows: 24 },
  });
  expect(
    resolveLiveDimensions({ isTTY: true, columns: 120, rows: outsideLayoutRange }, unavailable),
  ).toEqual({
    terminal: null,
    layout: { columns: 120, rows: 24 },
  });
  expect(
    resolveLiveDimensions({ isTTY: false, columns: outsideLayoutRange, rows: 24 }, unavailable),
  ).toEqual({
    terminal: null,
    layout: { columns: 80, rows: 24 },
  });
  expect(
    resolveLiveDimensions(
      { isTTY: true, columns: undefined, rows: undefined },
      {
        kind: "detected",
        source: "controlling-tty",
        size: { columns: outsideLayoutRange, rows: 24 },
      },
    ),
  ).toEqual({
    terminal: null,
    layout: { columns: 80, rows: 24 },
  });
});

test("accepts the maximum layout value on either terminal axis", () => {
  expect(
    resolveLiveDimensions({ isTTY: true, columns: MAX_LAYOUT_VALUE, rows: 1 }, unavailable),
  ).toEqual({
    terminal: { columns: MAX_LAYOUT_VALUE, rows: 1 },
    layout: { columns: MAX_LAYOUT_VALUE, rows: 1 },
  });
  expect(
    resolveLiveDimensions({ isTTY: true, columns: 1, rows: MAX_LAYOUT_VALUE }, unavailable),
  ).toEqual({
    terminal: { columns: 1, rows: MAX_LAYOUT_VALUE },
    layout: { columns: 1, rows: MAX_LAYOUT_VALUE },
  });
});

test("non-TTY Fullscreen and Inline select the same document host", () => {
  for (const requestedMode of ["inline", "fullscreen"] as const) {
    const surface = resolveLiveSurface(
      liveInput({
        requestedMode,
        liveUpdatesOverride: undefined,
        stdout: { isTTY: false, columns: 120, rows: 40 },
      }),
    );

    expect(surface.kind).toBe("final-stream");
    expect(surface.session.mode).toEqual({
      requested: requestedMode,
      effective: null,
      fallback: "stdout-not-tty",
    });
    expect(surface.session.output).toEqual({
      destination: "stream",
      dynamicUpdates: "at-teardown",
    });
    expect(surface.session.dimensions).toEqual({
      terminal: null,
      layout: { columns: 80, rows: 24 },
    });
  }
});

test("live updates disabled still applies on a live TTY", () => {
  const surface = resolveLiveSurface(
    liveInput({
      requestedMode: "inline",
      liveUpdatesOverride: false,
      stdout: { isTTY: true, columns: 100, rows: 30 },
    }),
  );

  expect(surface.kind).toBe("final-stream");
  expect(surface.session.mode).toEqual({
    requested: "inline",
    effective: null,
    fallback: "live-updates-disabled",
  });
  expect(surface.session.output).toEqual({
    destination: "stream",
    dynamicUpdates: "at-teardown",
  });
});

test("a forced non-TTY updater remains a stream without a terminal mode", () => {
  const surface = resolveLiveSurface(
    liveInput({
      requestedMode: "fullscreen",
      liveUpdatesOverride: true,
      stdout: { isTTY: false, columns: 90, rows: 25 },
    }),
  );

  expect(surface.kind).toBe("live-stream");
  expect(surface.session.mode).toEqual({
    requested: "fullscreen",
    effective: null,
    fallback: "stdout-not-tty",
  });
  expect(surface.session.output.dynamicUpdates).toBe("live");
  expect(surface.session.dimensions).toEqual({
    terminal: null,
    layout: { columns: 80, rows: 24 },
  });
});

test("visual TTY without detected dimensions falls back to final stream", () => {
  const surface = resolveLiveSurface(
    liveInput({ stdout: { isTTY: true, columns: undefined, rows: undefined } }),
  );

  expect(surface.kind).toBe("final-stream");
  expect(surface.session.mode.fallback).toBe("terminal-size-unavailable");
  expect(surface.session.output.dynamicUpdates).toBe("at-teardown");
  expect(surface.session.dimensions).toEqual({
    terminal: null,
    layout: { columns: 80, rows: 24 },
  });
});

test("visual Inline exposes terminal rows as a maximum layout bound", () => {
  const surface = resolveLiveSurface(liveInput());

  expect(surface.kind).toBe("inline-terminal");
  expect(surface.session.dimensions).toEqual({
    terminal: { columns: 100, rows: 30 },
    layout: { columns: 100, rows: 30 },
  });
});

test("visual Fullscreen owns an exact detected viewport", () => {
  const surface = resolveLiveSurface(liveInput({ requestedMode: "fullscreen" }));

  expect(surface.kind).toBe("fullscreen-terminal");
  expect(surface.session.mode).toEqual({
    requested: "fullscreen",
    effective: "fullscreen",
    fallback: null,
  });
  expect(surface.session.dimensions).toEqual({
    terminal: { columns: 100, rows: 30 },
    layout: { columns: 100, rows: 30 },
  });
});

test("the reactive service keeps identity and replaces dimensions atomically", () => {
  const initial = resolveLiveSurface(liveInput({ requestedMode: "fullscreen" }));
  const service = createLiveRenderSessionService(initial);
  const session = service.session;

  service.updateDimensions({
    terminal: { columns: 70, rows: 20 },
    layout: { columns: 70, rows: 20 },
  });

  expect(service.session).toBe(session);
  expect(session.dimensions).toEqual({
    terminal: { columns: 70, rows: 20 },
    layout: { columns: 70, rows: 20 },
  });

  service.dispose();
  service.updateDimensions({
    terminal: { columns: 60, rows: 10 },
    layout: { columns: 60, rows: 10 },
  });
  expect(session.dimensions.layout).toEqual({ columns: 70, rows: 20 });
});

test("string service exposes one fixed document snapshot", () => {
  const service = createStringRenderSessionService({ columns: 37, rows: 24 });
  const session = service.session;

  expect(session).toEqual({
    host: "string",
    mode: null,
    output: { destination: "document", dynamicUpdates: "none" },
    dimensions: { terminal: null, layout: { columns: 37, rows: 24 } },
  });
  service.dispose();
  expect(service.session).toBe(session);
  expect(session.dimensions.layout).toEqual({ columns: 37, rows: 24 });
});

test("string service maps unbounded height to private null rows", () => {
  const service = createStringRenderSessionService({ columns: 80, rows: null });
  expect(service.session.dimensions.layout).toEqual({ columns: 80, rows: null });
});
