# TODOs

Concrete follow-up work that Yunfei explicitly asked the project not to forget. This file does not decide public API direction and is not a source of speculative work. Public API authority remains the [Runtime public API decision ledger](./runtime-public-api-decisions.md); complete or remove an item when the implementation and its focused evidence land.

## Deferred higher-layer work

- [ ] Revisit an explicit, optional Ink-like error boundary and formatted error screen in `@vue-tui/components` after the Runtime foundation is settled. It must use only Vue and public Runtime APIs, must not become a hidden Runtime wrapper or mount option, and must not assume automatic exit, retry, source-file access, or Fullscreen error durability until real application use establishes those contracts.

## Deferred test coverage

- [ ] Re-add an end-to-end check that a delayed HMR error cannot overwrite a newer successful update, using a technique that works on Linux. Two attempts were removed on 2026-07-25: blocking a `hotUpdate` hook stalls that file's whole update chain, and buffering the runner-bound error still left the newer edit undelivered on Linux CI while both passed on macOS. The sending half of the mechanism — `vue-tui:hmr-error-context` carrying the failing update's own timestamp on both the client and SSR paths — stays covered deterministically in `packages/vite/src/bridge-hmr.spec.ts`.
- [ ] Re-add reload-dependent Vite HMR coverage when a technique works on Linux. Every check that needed a full reload, or an update after a failed hot update, reached the in-process module runner on macOS but not on Linux CI: the delayed-error ordering test was removed on 2026-07-25, as was the whole target-lifetime journey (its Runtime-owned invariants are covered deterministically in use-focus.test.tsx). Hot-update coverage is unaffected and still runs.
