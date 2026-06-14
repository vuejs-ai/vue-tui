# Changelog

All notable changes to `@vue-tui/runtime` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/). While on
`0.x`, minor versions may include breaking changes.

## 0.1.0

First public beta. The API is usable and broadly stable, but may still change
before 1.0.

### Public API

- **Rendering** — `createApp(component).mount(options?)`, `renderToString()`.
- **Components** — `Box`, `Text`, `Newline`, `Spacer`, `Static`, `Transform`.
- **Input & focus** — `useInput`, `usePaste`, `useFocus`, `useFocusManager`,
  `useStdin`.
- **App & environment** — `useApp`, `useStdout`, `useStderr`, `useWindowSize`,
  `useIsScreenReaderEnabled`.
- **Layout & cursor** — `useBoxMetrics`, `measureElement`, `useCursor`.
- **Animation** — `useAnimation`.
- **Kitty keyboard protocol** — `kittyFlags`, `kittyModifiers` and related types.

The `@vue-tui/runtime/internal` entry point exposes lower-level host-node and
paint internals. It is intended for tooling (e.g. the test harness) and is **not
covered by semver** — it may change in any release.
