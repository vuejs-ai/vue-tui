# Changelog

All notable changes to `@vue-tui/vite` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/). While on
`0.x`, minor versions may include breaking changes.

## Unreleased

Measured against the published `0.2.0`.

### Changed

- **Breaking: dev-only** — the plugin no longer configures production builds. `vueTui()` returns just the dev plugins; the build-config plugin and externalization predicate are gone. Applications build with `tsdown` plus `unplugin-vue`.
- **App exit** — signalled over the hot channel instead of a process-global.
- **Runtime access** — only through `@vue-tui/runtime/internal/devtools`; the public-looking `/devtools` path is absent.
