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

## Output observations

The test host exposes two intentionally different views of one run:

| Observation              | Meaning                                                                      | Use it for                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `frames` / `lastFrame()` | Renderer commits before the output writer adds screen and lifecycle controls | Exact component output, renderer styling, and `<Static>` deltas                                                  |
| `screen()`               | Cell surface after stdout and stderr bytes pass through a terminal emulator  | Alternate-screen behavior, cursor position and visibility, scrollback, external writes, and teardown restoration |

Content frames are not screenshots. They retain renderer-emitted SGR styling, such as text colors, but deliberately exclude cursor movement, erase commands, alternate-screen commands, direct `useStdout()` writes, and all teardown-phase observer commits. Use `screen()` when the assertion is about what a terminal would contain.

The test host deliberately does not republish Runtime's internal mode resolution, output policy, or capability objects. Configure a production-like host through `RenderOptions`, then assert what the application renders, what the modeled terminal contains, and how terminal ownership changes through suspension or teardown.

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

`columns` and `rows` must be positive safe integers no greater than 65535. They set both the modeled output dimensions and the emulator dimensions. Because the xterm test emulator allocates the complete viewport, their product must also be no greater than 1048576 cells; use direct Runtime streams when testing a larger Inline terminal whose rendered region is small. `rows` still controls the emulator when `host.stdout` is `"stream"`, while the Runtime layout remains row-unbounded because a stream does not own a finite visual viewport.

For a visual Inline TTY, `rows` is the production maximum live-region height: short content is not padded, while naturally taller layout is recalculated within that height and hard-clipped to the modeled columns and rows. Screen-reader and stream presentations remain row-unbounded. The emulated Inline screen also includes production's initial fresh-row boundary, immutable coordinated output, and snapshot-on-resize behavior; content frames exclude those writer controls.

### Host options

```ts
interface TestHost {
  readonly mode?: "inline" | "fullscreen";
  readonly presentation?: "visual" | "screen-reader";
  readonly updates?: "live" | "at-teardown";
  readonly stdin?: "tty" | "non-tty";
  readonly stdout?: "tty" | "stream";
  readonly clipboard?: TestClipboardBehavior;
}

type TestClipboardBehavior = "copied" | "requested" | "unavailable" | "rejected";
```

| Host field     | Default                                      | Meaning                                                          |
| -------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| `mode`         | `"inline"`                                   | Requested production screen model                                |
| `presentation` | `"visual"`                                   | Visual renderer or linear screen-reader transcript               |
| `updates`      | `"live"` for TTY; `"at-teardown"` for stream | Dynamic-output cadence                                           |
| `stdin`        | `"tty"`                                      | Whether input supports TTY behavior such as raw mode             |
| `stdout`       | `"tty"`                                      | Whether output can acquire a terminal surface and dimensions     |
| `clipboard`    | —                                            | Modeled custom clipboard result; omission leaves it unconfigured |

These controls model production facts rather than setting unrelated internal booleans. In particular:

- a Fullscreen request on stream stdout has no effective terminal mode;
- `updates: "live"` on a stream enables the live stream updater but does not create a stable viewport or terminal hit testing;
- a Fullscreen screen-reader request resolves to an Inline transcript on the normal screen;
- `updates: "at-teardown"` uses the final-stream policy even when the underlying output is a TTY.
- `clipboard` models one app-owned custom transport and never reads or writes the ambient system clipboard.

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
  expect((await result.screen()).lines.join("\n")).not.toContain("Final result");

  result.unmount();
  expect((await result.screen()).lines.join("\n")).toContain("Final result");
} finally {
  result.dispose();
}
```

## `RenderResult`

### `frames`

`frames` is a readonly live array of rendering-phase content commits. The public view and every frame reject runtime mutation while the host retains a private writable collection for later commits:

```ts
interface ContentFrame {
  readonly dynamic: string;
  readonly staticOutput: string;
}
```

`dynamic` is the complete current dynamic region. `staticOutput` is only the content of newly accepted `<Static>` instances in that commit. Both strings retain SGR styling emitted by the renderer, while output-writer controls and direct side-channel writes remain outside the frame. Teardown commits are excluded, so unmounting or exiting does not append cleanup frames.

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
  readonly cursor: {
    readonly column: number;
    readonly row: number;
    readonly visible: boolean;
  };
}
```

`lines` contains every visible row, including trailing cell spaces. `scrollback` contains rows above the normal buffer viewport. `cursor.visible` reports the terminal's current DECTCEM visibility mode after all pending output has been parsed; it does not model cursor blinking or whether a graphical terminal window has focus. Trim lines in the assertion when padding is irrelevant. A TTY host models the output line discipline that moves a line feed to column zero; a stream host preserves raw line-feed cursor movement because no TTY performs that conversion.

### Input, clipboard, and terminal controls

| Property or method                   | Behavior                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stdin.write(data)`                  | Emits input, waits for the input parser, and waits for the resulting render and emulator writes                                                                     |
| `mouse.reporting`                    | Runtime-readonly live view of modeled SGR button or button-motion ownership and its committed transition history                                                    |
| `mouse.down(point, options?)`        | Injects one parsed physical button-down fact; the default button is left                                                                                            |
| `mouse.move(point, modifiers?)`      | Injects one left-button motion fact while button-motion reporting and an unmatched left down are active                                                             |
| `mouse.up(point, options?)`          | Injects one parsed physical button-up fact                                                                                                                          |
| `mouse.wheel(point, direction, ...)` | Injects one parsed four-direction wheel fact                                                                                                                        |
| `clipboard.requests`                 | Runtime-readonly exact text passed to the modeled custom transport, in call order                                                                                   |
| `terminal.columns` / `terminal.rows` | Current emulator dimensions                                                                                                                                         |
| `terminal.resize(columns, rows)`     | Validates the same axis and emulator-cell limits as `render()`, resizes the modeled streams and emulator, emits resize, and waits for rendering                     |
| `terminal.suspend()`                 | Releases modeled input modes; Inline and transcript output remain on the normal buffer, Fullscreen restores the normal buffer, and stream hosts emit no final frame |
| `terminal.resume()`                  | Refreshes dimensions, then establishes and repaints a fresh Inline/transcript region, Fullscreen viewport, or live stream before reacquiring requested input modes  |
| `terminal.rawMode`                   | Runtime-readonly live view of the current raw-mode state and transition history                                                                                     |

The deterministic suspension control drives the production lifecycle boundary but does not pause the JavaScript event loop. While suspended, `terminal.resize()` changes the emulator dimensions immediately; `terminal.resume()` refreshes Runtime layout facts before repainting every live-update surface, including row-unbounded live streams, and then reacquires requested input modes. Final-output streams have no live frame to repaint.

Mouse points are zero-based cells inside the current modeled terminal dimensions. The driver is available only while the Fullscreen application has acquired the reporting level needed for that physical fact. It injects `down`, `move`, `up`, and `wheel` after protocol parsing, then waits for the same application and emulator flush as `stdin.write()`. It deliberately has no `click()` helper: a down/up pair must pass through the production hit testing, click synthesis, propagation, and drag state machines.

```tsx
await result.mouse.down({ x: 2, y: 1 });
await result.mouse.up({ x: 2, y: 1 });
expect(clicks).toHaveLength(1);
```

The clipboard host returns exactly the selected behavior through the production `useClipboard()` service. `"unavailable"` becomes a `ClipboardWriteResult` with reason `"transport-unavailable"`; `"rejected"` returns the production rejected shape. Every call that reaches the modeled adapter is retained in the readonly requests list, including exact newlines and Unicode; an immediately unavailable call during suspension or after disposal does not invoke or record an adapter request:

```tsx
import { defineComponent } from "vue";
import { expect } from "vitest";
import { Text, useClipboard, type UseClipboardReturn } from "@vue-tui/runtime";
import { render } from "@vue-tui/testing";

let clipboard!: UseClipboardReturn;
const Copy = defineComponent(() => {
  clipboard = useClipboard();
  return () => <Text>Copy</Text>;
});

const result = await render(Copy, { host: { clipboard: "copied" } });
try {
  await expect(clipboard.writeText("line\n你🙂")).resolves.toEqual({
    status: "copied",
    text: "line\n你🙂",
  });
  expect(result.clipboard.requests).toEqual(["line\n你🙂"]);
} finally {
  result.dispose();
}
```

Fullscreen `useTextSelection()` uses the same modeled successful paint and the existing mouse driver. Drive a down/move/up sequence to test pointer selection, or call the public commands for application keyboard bindings; `selection.copy()` then records its exact non-empty `selectedText` in `clipboard.requests`. There is no test-only range setter, so tests do not bypass grapheme movement, paint provenance, drag capture, or the production copy bridge.

### Lifecycle methods

| Method                   | Behavior                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `unmount()`              | Tears down the application; the emulator remains available for immediate restoration assertions       |
| `dispose()`              | Idempotently unmounts, removes the host from automatic cleanup, and releases streams and the emulator |
| `waitUntilExit()`        | Settles with the application exit result and rejects for `exit(error)`                                |
| `waitUntilRenderFlush()` | Waits for the runtime render queue and pending emulator writes                                        |

After `dispose()`, retained content facts such as `frames`, `lastFrame()`, and terminal dimension getters remain readable. Operations that require the live test host—`screen()`, input, resize, `suspend()`, `resume()`, render flush, and exit flushing—reject with `Test host has been disposed.`. `unmount()` and `dispose()` remain safe to call again.

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
