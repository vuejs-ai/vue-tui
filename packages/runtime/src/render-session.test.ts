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
    isCI: false,
    presentation: "visual",
    suspensionSupported: false,
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

test("reports host suspension independently from output cadence and effective mode", () => {
  const surfaces = [
    resolveLiveSurface(liveInput({ suspensionSupported: true })),
    resolveLiveSurface(liveInput({ suspensionSupported: true, liveUpdatesOverride: false })),
    resolveLiveSurface(
      liveInput({
        suspensionSupported: true,
        stdout: { isTTY: false, columns: undefined, rows: undefined },
        liveUpdatesOverride: true,
      }),
    ),
    resolveLiveSurface(liveInput({ suspensionSupported: true, requestedMode: "fullscreen" })),
  ];

  expect(surfaces.map((surface) => surface.session.capabilities.suspension)).toEqual([
    true,
    true,
    true,
    true,
  ]);
});

test.each(["fullscreen", "alternateScreen"] as const)(
  "rejects own removed %s before mode validation",
  (key) => {
    expect(() => normalizeRequestedMode({ [key]: undefined, mode: null })).toThrow(
      `Mount option "${key}" was removed`,
    );
  },
);

test("does not treat inherited old keys as removed mount options", () => {
  const options = Object.create({ fullscreen: true }) as { mode?: string };
  options.mode = "inline";
  expect(normalizeRequestedMode(options)).toBe("inline");
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
    layout: { columns: 120, rows: null },
  });

  expect(
    resolveLiveDimensions({ isTTY: true, columns: 120, rows: undefined }, detected80x24),
  ).toEqual({
    terminal: { columns: 80, rows: 24 },
    layout: { columns: 80, rows: null },
  });

  expect(resolveLiveDimensions({ isTTY: true, columns: 0, rows: Number.NaN }, unavailable)).toEqual(
    {
      terminal: null,
      layout: { columns: 80, rows: null },
    },
  );

  expect(resolveLiveDimensions({ isTTY: false, columns: 120, rows: 40 }, detected80x24)).toEqual({
    terminal: null,
    layout: { columns: 120, rows: null },
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
    layout: { columns: 80, rows: null },
  });
  expect(
    resolveLiveDimensions({ isTTY: true, columns: outsideLayoutRange, rows: 24 }, detected80x24),
  ).toEqual({
    terminal: { columns: 80, rows: 24 },
    layout: { columns: 80, rows: null },
  });
  expect(
    resolveLiveDimensions({ isTTY: true, columns: 120, rows: outsideLayoutRange }, unavailable),
  ).toEqual({
    terminal: null,
    layout: { columns: 120, rows: null },
  });
  expect(
    resolveLiveDimensions({ isTTY: false, columns: outsideLayoutRange, rows: 24 }, unavailable),
  ).toEqual({
    terminal: null,
    layout: { columns: 80, rows: null },
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
    layout: { columns: 80, rows: null },
  });
});

test("accepts the maximum layout value on either terminal axis", () => {
  expect(
    resolveLiveDimensions({ isTTY: true, columns: MAX_LAYOUT_VALUE, rows: 1 }, unavailable),
  ).toEqual({
    terminal: { columns: MAX_LAYOUT_VALUE, rows: 1 },
    layout: { columns: MAX_LAYOUT_VALUE, rows: null },
  });
  expect(
    resolveLiveDimensions({ isTTY: true, columns: 1, rows: MAX_LAYOUT_VALUE }, unavailable),
  ).toEqual({
    terminal: { columns: 1, rows: MAX_LAYOUT_VALUE },
    layout: { columns: 1, rows: null },
  });
});

test("live updates disabled has first fallback priority", () => {
  const surface = resolveLiveSurface(
    liveInput({
      requestedMode: "fullscreen",
      liveUpdatesOverride: false,
      stdout: { isTTY: false, columns: undefined, rows: undefined },
    }),
  );

  expect(surface.kind).toBe("final-stream");
  expect(surface.session.mode).toEqual({
    requested: "fullscreen",
    effective: null,
    fallback: "live-updates-disabled",
  });
  expect(surface.session.output).toEqual({
    destination: "stream",
    dynamicUpdates: "at-teardown",
    presentation: "visual",
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
  expect(surface.session.dimensions.terminal).toBeNull();
});

test("screen-reader Fullscreen request resolves to an Inline main-screen transcript", () => {
  const surface = resolveLiveSurface(
    liveInput({
      requestedMode: "fullscreen",
      presentation: "screen-reader",
      stdout: { isTTY: true, columns: undefined, rows: undefined },
    }),
  );

  expect(surface.kind).toBe("inline-terminal");
  expect(surface.session.mode).toEqual({
    requested: "fullscreen",
    effective: "inline",
    fallback: "screen-reader-transcript",
  });
  expect(surface.session.output).toEqual({
    destination: "terminal",
    dynamicUpdates: "live",
    presentation: "screen-reader",
  });
  expect(surface.session.capabilities).toEqual({
    stableOrigin: false,
    elementHitTesting: false,
    suspension: false,
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
    layout: { columns: 80, rows: null },
  });
});

test("visual Inline exposes terminal rows as a maximum layout bound", () => {
  const surface = resolveLiveSurface(liveInput());

  expect(surface.kind).toBe("inline-terminal");
  expect(surface.session.dimensions).toEqual({
    terminal: { columns: 100, rows: 30 },
    layout: { columns: 100, rows: 30 },
  });
  expect(surface.session.capabilities.stableOrigin).toBe(false);
});

test("visual Fullscreen owns an exact detected viewport and hit map", () => {
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
  expect(surface.session.capabilities).toEqual({
    stableOrigin: true,
    elementHitTesting: true,
    suspension: false,
  });
});

test("CI changes only the default and an explicit override wins", () => {
  expect(resolveLiveSurface(liveInput({ isCI: true })).kind).toBe("final-stream");
  expect(resolveLiveSurface(liveInput({ isCI: true, liveUpdatesOverride: true })).kind).toBe(
    "inline-terminal",
  );
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
  expect(session.capabilities.elementHitTesting).toBe(true);

  service.dispose();
  service.updateDimensions({
    terminal: { columns: 60, rows: 10 },
    layout: { columns: 60, rows: 10 },
  });
  expect(session.dimensions.layout).toEqual({ columns: 70, rows: 20 });
  expect(session.capabilities.elementHitTesting).toBe(true);
});

test.each(["visual", "screen-reader"] as const)(
  "string service exposes one fixed %s document snapshot",
  (presentation) => {
    const service = createStringRenderSessionService({ columns: 37, presentation });
    const session = service.session;

    expect(session).toEqual({
      host: "string",
      mode: null,
      output: { destination: "document", dynamicUpdates: "none", presentation },
      dimensions: { terminal: null, layout: { columns: 37, rows: null } },
      capabilities: {
        stableOrigin: false,
        elementHitTesting: false,
        suspension: false,
      },
    });
    service.dispose();
    expect(service.session).toBe(session);
    expect(session.dimensions.layout).toEqual({ columns: 37, rows: null });
    expect(session.capabilities.elementHitTesting).toBe(false);
  },
);
