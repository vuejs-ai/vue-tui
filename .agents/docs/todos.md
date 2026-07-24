# TODOs

Concrete follow-up work that Yunfei explicitly asked the project not to forget. This file does not decide public API direction and is not a source of speculative work. Public API authority remains the [Runtime public API decision ledger](./runtime-public-api-decisions.md); complete or remove an item when the implementation and its focused evidence land.

## Runtime public API review

- [ ] Ask Yunfei to review the implemented live `Static` ordering, hidden-ancestor behavior, placement, nesting, and Static-specific failure-timing candidate before removing the corresponding Open decision-ledger entry or calling the Runtime foundation complete.

## Deferred higher-layer work

- [ ] Revisit an explicit, optional Ink-like error boundary and formatted error screen in `@vue-tui/components` after the Runtime foundation is settled. It must use only Vue and public Runtime APIs, must not become a hidden Runtime wrapper or mount option, and must not assume automatic exit, retry, source-file access, or Fullscreen error durability until real application use establishes those contracts.
