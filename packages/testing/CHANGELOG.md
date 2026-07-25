# Changelog

All notable changes to `@vue-tui/testing` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/). While on
`0.x`, minor versions may include breaking changes.

## Unreleased

Measured against the published `0.0.3`, whose render options were `columns`,
`rows`, `props`, and `exitOnCtrlC`.

### Added

- **Host modeling** — `mode`, `stdin`, `stdout`, and `patchConsole` render options, resolved by the production resolver. Omission still models an Inline TTY.
- **`screen()`** — the cell surface after stdout and stderr pass through a terminal emulator.
- **`dispose()`** — releases every test-host resource, idempotently. `unmount()` keeps the restored emulator readable for teardown assertions.
- **`terminal.suspend()` / `resume()`** — job-control behavior.
- **Named types** — `ContentFrame`, `LastFrameOptions`, `ScreenSnapshot`.

### Changed

- **Observations** — `frames` and `lastFrame()` read renderer commits directly, so they carry rendered content and styling but no cursor, erase, or alternate-screen sequences. Those belong to `screen()`.
- **Runtime surface** — migrated to `useLayoutSize()`, direct-Box `useBoxMetrics()`, and the tagged `useInput()` contract.

### Removed

- **Internal barrel** — the package reaches Runtime only through `@vue-tui/runtime/internal/testing`.
