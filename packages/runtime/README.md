# @vue-tui/runtime

Vue-idiomatic terminal renderer in the spirit of [React Ink](https://github.com/vadimdemedes/ink). Platform-specific runtime parallel to `@vue/runtime-dom`.

## Install

```bash
pnpm add @vue-tui/runtime vue
```

## Quickstart

```ts
import { defineComponent, h, ref } from "vue";
import { createApp, Box, Text, useInput } from "@vue-tui/runtime";

const Counter = defineComponent({
  setup() {
    const count = ref(0);
    useInput((input) => {
      if (input === "+") count.value++;
      if (input === "-") count.value--;
    });
    return () => h(Box, null, h(Text, null, `Count: ${count.value}`));
  },
});

createApp(Counter).mount();
```

## API

Single entry point — `createApp(root, rootProps?)`. Returns a `TuiApp` (`Omit<VueApp<TuiNode>, "mount">` plus four TUI methods).

```ts
import { createApp } from "@vue-tui/runtime";

const app = createApp(App, { initialState }).use(myPlugin).provide(themeKey, dark);

app.mount(); // all defaults (process.*)
app.mount({ debug: true }); // just flags
app.mount({ stdout: customWritable }); // partial stream override
app.mount({ stdout, stdin, stderr }); // explicit streams (testing)

await app.waitUntilExit();
app.unmount(); // optional — see "Cleanup" below
```

### Cleanup

`mount()` registers a `process.on("exit")` listener that runs the same teardown
as `unmount()`. So you only need `app.unmount()` if you want to tear down the
app before the process is ready to exit (mid-program, in tests, or when one
process hosts multiple UIs sequentially). For a normal CLI that exits when the
user quits or the script ends, cleanup happens automatically.

### `TuiApp` interface

```ts
interface TuiApp extends VueApp<TuiNode> {
  mount(options?: MountOptions): ComponentPublicInstance;
  unmount(): void;
  waitUntilExit(): Promise<void>;
}

interface MountOptions {
  stdout?: NodeJS.WriteStream; // default: process.stdout
  stdin?: NodeJS.ReadStream; // default: process.stdin
  stderr?: NodeJS.WriteStream; // default: process.stderr
  debug?: boolean; // default: false
  exitOnCtrlC?: boolean; // default: true
  rawMode?: boolean; // default: true when interactive
  interactive?: boolean; // default: true (false if in CI or !stdout.isTTY)
  patchConsole?: boolean; // default: true (disabled in debug mode)
  maxFps?: number; // default: ~30fps (32ms)
  onRender?: (info: { renderTime: number }) => void;
  isScreenReaderEnabled?: boolean; // default: false (true when INK_SCREEN_READER=true)
}
```

All fields optional with per-field fallback.

### Components

`Box`, `Text`, `Newline`, `Spacer`, `Static`, `Transform`.

### Composables

`useExit`, `useInput`, `useFocus`, `useFocusManager`, `useStdin`, `useStdout`, `useStderr`, `useTerminalSize` / `useWindowSize`, `useCursor`, `useAnimation`, `useBoxMetrics` / `measureElement`, `usePaste`, `useIsScreenReaderEnabled`.

Tab / Shift+Tab / Escape are handled automatically when any component uses `useFocus`. `useFocus` returns `{ isFocused, focus }` and manages raw mode. `useFocusManager` exposes `activeId` in addition to `focusNext` / `focusPrevious` / `focus` / `enableFocus` / `disableFocus`.

## Waiting on exit / handling errors

```ts
// Fire-and-forget (most common):
createApp(App).mount();

// Wait for the app to exit:
const app = createApp(App);
app.mount();
await app.waitUntilExit();

// Catch errors thrown from setup / render / useExit(err):
const app = createApp(App);
app.mount();
app.waitUntilExit().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

See `docs/superpowers/specs/2026-05-18-vue-tui-core-design.md` for the full design.
