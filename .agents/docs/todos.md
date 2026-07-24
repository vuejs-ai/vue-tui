# TODOs

Concrete follow-up work that Yunfei explicitly asked the project not to forget. This file does not decide public API direction and is not a source of speculative work. Public API authority remains the [Runtime public API decision ledger](./runtime-public-api-decisions.md); complete or remove an item when the implementation and its focused evidence land.

## Runtime public API review

- [ ] Change invalid untyped `useApp().exit(value)` behavior. Before teardown, a first non-`Error`, non-`undefined` value must synchronously throw `TypeError` without selecting or consuming exit; a caught error leaves the app running, while an uncaught error remains subject to surrounding Vue or input error handling. Calls after exit or teardown has started remain no-ops without argument validation. Replace the current conversion into a selected `TypeError` exit and add focused JavaScript-level tests.
- [ ] Remove the hidden `InternalErrorBoundary`, automatic `ErrorOverview`, and Runtime override of `app.config.errorHandler`. Create the Vue app from the user's actual root and follow Vue's component-error propagation and continuation behavior. Keep Runtime-owned cleanup for synchronous mount failures and Runtime terminal, input, output, and renderer failures. Add a no-boundary partial-mount regression that verifies terminal restoration and complete Yoga-node release; if partial host allocation is unsafe, fix it with a narrow host allocation transaction rather than another component error policy.
- [ ] Align console patching with the vouched contract: retain default-on `patchConsole` and the `false` escape hatch; keep one physical global patch with a normal active-application stack; install it before the user component first runs; release each application registration only after its Vue cleanup; remove the current `[Vue warn]` prefix filter; and add focused coverage for the default, opt-out, nested applications, full forwarding including Vue warnings, cleanup-time logging, and final native-console restoration. Do not turn this into a public logging API.

## Deferred higher-layer work

- [ ] Revisit an explicit, optional Ink-like error boundary and formatted error screen in `@vue-tui/components` after the Runtime foundation is settled. It must use only Vue and public Runtime APIs, must not become a hidden Runtime wrapper or mount option, and must not assume automatic exit, retry, source-file access, or Fullscreen error durability until real application use establishes those contracts.
