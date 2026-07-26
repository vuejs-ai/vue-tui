# Changelog

All notable changes to `@vue-tui/use` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/). While on `0.x`, minor versions may include breaking changes.

## 0.0.1

### Added

- **`useInputWhileMounted()`** — returns a Vue function ref that activates a global input subscription only while its one bound vnode is mounted.
- **`<UseInputWhileMounted>`** — renderless component form on `@vue-tui/use/components` that emits `input` during its own mounted lifetime.
