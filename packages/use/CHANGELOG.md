# Changelog

All notable changes to `@vue-tui/use` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/). While on `0.x`, minor versions may include breaking changes.

## Unreleased

### Added

- **`usePasteInput()`** — subscribes only to complete paste events while preserving empty payloads, newlines, control characters, and reactive `useInput()` activation semantics.
- **`useKeyInput()`** — subscribes only to the exact key event member while preserving the original event and reactive `useInput()` activation semantics.
- **`useTextInput()`** — subscribes only to the exact text event member while preserving the original event and optional enhanced key information.
- **Mounted input type selection** — `useInputWhileMounted()` accepts a static `type` option, and `<UseInputWhileMounted>` accepts a reactive `type` prop. Both filter `"text"`, `"key"`, or `"paste"` events and narrow their handler or emitted event type.

## 0.3.0 - 2026-08-02

### Changed

- **Vue baseline** — requires Vue 3.5 or newer within the Vue 3 major line.
- **Release version** — aligned with the rest of the vue-tui `0.3.0` release; this package has no package-specific API changes beyond its dependency baseline.

## 0.0.1

### Added

- **`useInputWhileMounted()`** — returns a Vue function ref that activates a global input subscription only while its one bound vnode is mounted.
- **`<UseInputWhileMounted>`** — renderless component form on `@vue-tui/use/components` that emits `input` during its own mounted lifetime.
