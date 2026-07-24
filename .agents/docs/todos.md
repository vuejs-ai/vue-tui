# TODOs

Concrete follow-up work that Yunfei explicitly asked the project not to forget. This file does not decide public API direction and is not a source of speculative work. Public API authority remains the [Runtime public API decision ledger](./runtime-public-api-decisions.md); complete or remove an item when the implementation and its focused evidence land.

## Runtime public API review

- [ ] Internalize the official Runtime tooling bridges without changing their behavior: remove `@vue-tui/runtime/devtools` and `@vue-tui/runtime/testing` from the supported public contract; move `connectDevtools`, `createTestHostBridge`, and the bridge-specific test types behind narrowly named internal package entries used by the version-coupled `@vue-tui/vite` and `@vue-tui/testing` packages; update those imports, package exports and tarball contents, exact public and internal boundary guards, clean consumers, documentation, and focused tooling tests. Do not publish a broad internal barrel, grant application-facing higher layers privileged access, or claim third-party replacement support. The current implementation remains unchanged until this TODO is executed.

## Deferred higher-layer work

- [ ] Revisit an explicit, optional Ink-like error boundary and formatted error screen in `@vue-tui/components` after the Runtime foundation is settled. It must use only Vue and public Runtime APIs, must not become a hidden Runtime wrapper or mount option, and must not assume automatic exit, retry, source-file access, or Fullscreen error durability until real application use establishes those contracts.
