# Changelog

All notable changes to `@vue-tui/components` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/). While on
`0.x`, minor versions may include breaking changes.

## Unreleased

Measured against the published `0.1.1`, which exported only `Spinner`.

### Added

- **`ScrollBox`** — bounded, passive viewport for either rendering mode. Four imperative scroll operations on its component handle, each returning whether the top line changed. No wheel or keyboard input of its own.
- **`Newline`** — emits `count` newline characters inside a `<Text>`. Moved out of `@vue-tui/runtime`.
- **`Spacer`** — a growing `Box` that fills the free main-axis space. Moved out of `@vue-tui/runtime`.

### Changed

- **Component types** — exports publish a stable author-facing constructor instead of the SFC's generated `DefineComponent`, which bakes the build-time Vue patch release into the tarball.
- **`SpinnerProps["color"]`** — narrowed from `string` to Runtime's `Color`.
- **Runtime surface** — migrated to `useLayoutSize()`, direct-Box `useBoxMetrics()`, and the tagged `useInput()` contract.
