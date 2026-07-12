# @vue-tui/testing

> **Early stage** — under active development. Bug reports are welcome, but the API may still change.

Deterministic test host for Vue terminal applications. It mounts an application against modeled terminal or stream inputs, records renderer content, and applies the emitted bytes to an in-memory terminal emulator. The host never patches the process-global `console`.

## Install

`vue` and `@vue-tui/runtime` should already be dependencies of the application under test.

```bash
npm install -D @vue-tui/testing
```

## Quick start

```tsx
import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vitest";
import { Box, Text, useInput } from "@vue-tui/runtime";
import { render } from "@vue-tui/testing";

const Counter = defineComponent(() => {
  const count = shallowRef(0);

  useInput((event) => {
    if (event.kind !== "text") return "continue";
    if (event.text === "+") {
      count.value++;
      return "consume";
    }
    if (event.text === "-") {
      count.value--;
      return "consume";
    }
    return "continue";
  });

  return () => (
    <Box>
      <Text>Count: {count.value}</Text>
    </Box>
  );
});

test("the counter responds to input", async () => {
  const result = await render(Counter);
  try {
    expect(result.lastFrame()).toBe("Count: 0");

    await result.stdin.write("+");
    expect(result.lastFrame()).toBe("Count: 1");
  } finally {
    result.dispose();
  }
});
```

## Three observations

The test host exposes three intentionally different views of one run:

| Observation              | Meaning                                                                      | Use it for                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `session`                | Readonly production-like facts visible to the component                      | Requested and effective mode, fallback, output policy, dimensions, and capabilities               |
| `frames` / `lastFrame()` | Renderer commits before the output writer adds screen and lifecycle controls | Exact component output, renderer styling, and `<Static>` deltas                                   |
| `screen()`               | Cell surface after stdout and stderr bytes pass through a terminal emulator  | Alternate-screen behavior, cursor position, scrollback, external writes, and teardown restoration |

Content frames are not screenshots. They retain renderer-emitted SGR styling, such as text colors, but deliberately exclude cursor movement, erase commands, alternate-screen commands, direct `useStdout()` writes, and all teardown-phase observer commits. Use `screen()` when the assertion is about what a terminal would contain.

## `render(component, options?)`

`render()` mounts the root component and waits for its initial render. Omission models a visual Inline application with TTY stdin, TTY stdout, live updates, and a `100 × 100` terminal.

```ts
interface RenderOptions {
  readonly host?: TestHost;
  readonly columns?: number;
  readonly rows?: number;
  readonly props?: Record<string, unknown>;
}
```

| Render field | Default   | Meaning                                         |
| ------------ | --------- | ----------------------------------------------- |
| `host`       | See below | Production-like environment modeled by the test |
| `columns`    | `100`     | Layout and emulator width                       |
| `rows`       | `100`     | Emulator height and TTY height                  |
| `props`      | —         | Props passed to the root component              |

`columns` and `rows` must be positive safe integers. They set both the modeled output dimensions and the emulator dimensions. `rows` still controls the emulator when `host.stdout` is `"stream"`, but a stream does not claim physical terminal rows in `session`.

For a visual Inline TTY, `rows` is the production maximum live-region height: short content is not padded, while naturally taller layout is recalculated within that height and hard-clipped to the modeled columns and rows. Screen-reader and stream presentations remain row-unbounded. The emulated Inline screen also includes production's initial fresh-row boundary, immutable coordinated output, and snapshot-on-resize behavior; content frames exclude those writer controls.

### Host options

```ts
interface TestHost {
  readonly mode?: "inline" | "fullscreen";
  readonly presentation?: "visual" | "screen-reader";
  readonly updates?: "live" | "at-teardown";
  readonly stdin?: "tty" | "non-tty";
  readonly stdout?: "tty" | "stream";
}
```

| Host field     | Default                                      | Meaning                                                      |
| -------------- | -------------------------------------------- | ------------------------------------------------------------ |
| `mode`         | `"inline"`                                   | Requested production screen model                            |
| `presentation` | `"visual"`                                   | Visual renderer or linear screen-reader transcript           |
| `updates`      | `"live"` for TTY; `"at-teardown"` for stream | Dynamic-output cadence                                       |
| `stdin`        | `"tty"`                                      | Whether input supports TTY behavior such as raw mode         |
| `stdout`       | `"tty"`                                      | Whether output can acquire a terminal surface and dimensions |

These controls model production facts rather than setting unrelated internal booleans. In particular:

- a Fullscreen request on stream stdout has no effective terminal mode;
- `updates: "live"` on a stream enables the live stream updater but does not create a stable viewport or terminal hit testing;
- a Fullscreen screen-reader request resolves to an Inline transcript on the normal screen;
- `updates: "at-teardown"` uses the final-stream policy even when the underlying output is a TTY.

The removed `liveUpdates`, `debug`, and `exitOnCtrlC` render options are rejected. Use `host.updates` for cadence; content-frame observation is always available. While managed input is active, Ctrl+C is a delayed framework default. A `useInput()` handler can prevent it for one event by returning `"consume"` or a complete decision whose `defaultAction` is `"prevent"`.

### Examples

Model a Fullscreen TTY and assert its terminal surface:

```tsx
const Dashboard = defineComponent(() => () => <Text>Dashboard</Text>);
const result = await render(Dashboard, {
  columns: 80,
  rows: 24,
  host: { mode: "fullscreen" },
});
try {
  expect(result.session.mode.effective).toBe("fullscreen");
  expect((await result.screen()).activeBuffer).toBe("alternate");

  result.unmount();
  expect((await result.screen()).activeBuffer).toBe("normal");
} finally {
  result.dispose();
}
```

Model final stream output:

```tsx
const FinalResult = defineComponent(() => () => <Text>Final result</Text>);
const result = await render(FinalResult, {
  host: { stdout: "stream" },
});
try {
  expect(result.session.output.dynamicUpdates).toBe("at-teardown");
  expect((await result.screen()).lines.join("\n")).not.toContain("Final result");

  result.unmount();
  expect((await result.screen()).lines.join("\n")).toContain("Final result");
} finally {
  result.dispose();
}
```

## `RenderResult`

### `session`

`session` is the deeply readonly live-session snapshot exposed to the component tree. Its identity remains stable while reactive facts such as dimensions update. Runtime mutation is rejected; readonly is not only a TypeScript annotation.

| Field          | Meaning                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| `host`         | Always `"live"`; tests model a live production host rather than exposing a test-only branch to components |
| `mode`         | Requested mode, effective mode, and a detectable fallback reason                                          |
| `output`       | Destination (`"terminal"` or `"stream"`), update cadence, and presentation                                |
| `dimensions`   | Physical terminal dimensions when acquired, plus effective layout dimensions                              |
| `capabilities` | Availability of stable origin, renderer-owned element hit testing, and suspension                         |

Test-only observation remains on `RenderResult`; it does not change the component's `session.host`.

Components read this same object through the public `useRenderSession()` composable and can use `useLayoutSize()` for destructurable readonly `columns` and `rows` refs. `rows` is `null` for an unbounded stream or screen-reader transcript and numeric for a bounded visual TTY layout. The modeled `mode`, `output`, and `capabilities` are immutable for one render session; resize and continuation update only its dimensions.

The deterministic host reports `session.capabilities.suspension: true` for every modeled live surface. This is an immutable host-lifecycle capability, not a claim that the selected output owns a terminal screen.

### `frames`

`frames` is a readonly live array of rendering-phase content commits. The public view and every frame reject runtime mutation while the host retains a private writable collection for later commits:

```ts
interface ContentFrame {
  readonly dynamic: string;
  readonly staticOutput: string;
}
```

`dynamic` is the complete current dynamic region. `staticOutput` is only the new `<Static>` content produced by that commit. Both strings retain SGR styling emitted by the renderer, while output-writer controls and direct side-channel writes remain outside the frame. Teardown commits are excluded, so unmounting or exiting does not append cleanup frames.

### `lastFrame(options?)`

Returns the `dynamic` string from the latest content frame. It always returns a string after `render()` resolves.

```ts
interface LastFrameOptions {
  readonly raw?: boolean;
  readonly trimLines?: boolean;
}
```

- The default removes trailing spaces from each line and trailing blank output.
- `trimLines: true` removes trailing spaces from each line while retaining the frame's final line structure.
- `raw: true` returns the exact dynamic string and takes precedence over trimming.

### `screen()`

Waits for pending emulator writes and returns a readonly snapshot:

```ts
interface ScreenSnapshot {
  readonly activeBuffer: "normal" | "alternate";
  readonly dimensions: { readonly columns: number; readonly rows: number };
  readonly lines: readonly string[];
  readonly scrollback: readonly string[];
  readonly cursor: { readonly column: number; readonly row: number };
}
```

`lines` contains every visible row, including trailing cell spaces. `scrollback` contains rows above the normal buffer viewport. Trim lines in the assertion when padding is irrelevant. A TTY host models the output line discipline that moves a line feed to column zero; a stream host preserves raw line-feed cursor movement because no TTY performs that conversion.

### Input and terminal controls

| Property or method                   | Behavior                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stdin.write(data)`                  | Emits input, waits for the input parser, and waits for the resulting render and emulator writes                                                                     |
| `terminal.columns` / `terminal.rows` | Current emulator dimensions                                                                                                                                         |
| `terminal.resize(columns, rows)`     | Validates two positive safe integers, resizes the modeled streams and emulator, emits resize, and waits for rendering                                               |
| `terminal.suspend()`                 | Releases modeled input modes; Inline and transcript output remain on the normal buffer, Fullscreen restores the normal buffer, and stream hosts emit no final frame |
| `terminal.resume()`                  | Refreshes dimensions, then establishes and repaints a fresh Inline/transcript region, Fullscreen viewport, or live stream before reacquiring requested input modes  |
| `terminal.rawMode`                   | Runtime-readonly live view of the current raw-mode state and transition history                                                                                     |

The deterministic suspension control drives the production lifecycle boundary but does not pause the JavaScript event loop. While suspended, `terminal.resize()` changes the emulator dimensions immediately; `terminal.resume()` refreshes the public session dimensions before repainting every live-update surface, including row-unbounded live streams, and then reacquires requested input modes. Final-output streams have no live frame to repaint.

### Lifecycle methods

| Method                   | Behavior                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `unmount()`              | Tears down the application; the emulator remains available for immediate restoration assertions       |
| `dispose()`              | Idempotently unmounts, removes the host from automatic cleanup, and releases streams and the emulator |
| `waitUntilExit()`        | Settles with the application exit result and rejects for `exit(error)`                                |
| `waitUntilRenderFlush()` | Waits for the runtime render queue and pending emulator writes                                        |

After `dispose()`, retained content facts such as `session`, `frames`, `lastFrame()`, and terminal dimension getters remain readable. Operations that require the live test host—`screen()`, input, resize, `suspend()`, `resume()`, render flush, and exit flushing—reject with `Test host has been disposed.`. `unmount()` and `dispose()` remain safe to call again.

## Cleanup

Every successful `render()` is tracked. When the test runner exposes a global `afterEach`, importing this package registers automatic cleanup. Otherwise call `cleanup()` from the runner's teardown hook:

```ts
import { afterEach } from "vitest";
import { cleanup } from "@vue-tui/testing";

afterEach(cleanup);
```

When managing one result manually, preserve the emulator until terminal-restoration assertions are complete, then dispose it:

```ts
const result = await render(App, { host: { mode: "fullscreen" } });
try {
  result.unmount();
  expect((await result.screen()).activeBuffer).toBe("normal");
} finally {
  result.dispose();
}
```

Cleanup calls the same idempotent disposal path, attempts to release every tracked host even if one disposal fails, and rethrows collected errors only after the other hosts have been released.

## Links

- [vue-tui](https://github.com/vuejs-ai/vue-tui)
- [`@vue-tui/runtime`](https://www.npmjs.com/package/@vue-tui/runtime)
- [`@vue-tui/vite`](https://www.npmjs.com/package/@vue-tui/vite)

## License

MIT
