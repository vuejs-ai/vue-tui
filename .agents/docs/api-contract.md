# Public API contract & surface

> **Status:** current contract record for the minimum Runtime foundation. The [exhaustive retained-public ledger](./runtime-public-foundation-reaudit.md#exhaustive-retained-public-ledger) is authoritative; older unstamped F1–F8 contracts are implementation history where they disagree with it. No VOUCHED stamp changed.

What is — and isn't — part of `@vue-tui/runtime`'s public contract, and how the contract is
tested. The principles and capability work used to choose future APIs live in
[api-design](./api-design.md). Behavioral _divergences_ from Ink live in
[ink-divergences](./ink-divergences.md); this file is about the SHAPE of the public surface itself.

## Experimental stability policy

Here, “public contract” means the authoring surface intentionally supported, documented, typed, and tested in the current version. It does not promise cross-release backward compatibility while vue-tui remains experimental. Under the [vouched product policy](./goal.md#api-stability-during-experimentation), a public value, type, option, path, or behavior may be renamed, moved, changed, or removed directly when an accepted target design supports that change; aliases, deprecation windows, and runtime shims are not required merely because an API shipped before 1.0.

The public-surface guards remain important. They make every change deliberate, prevent accidental exports or type drift, and prove that the resulting current API is internally coherent. A clean-slate change updates the implementation, value and type guards, documentation, examples, tests, and first-party consumers together.

The minimum contract keeps only facts and operations that an external layer cannot reproduce correctly without Runtime ownership. Layout exposes `useLayoutWidth()`, setup-time nullable `useViewportHeight()`, direct-Box `useBoxSize()`, and direct-Box `useBoxPresence()`. The broader render-session graph, physical terminal dimensions, accepted-paint fragments, and caret coordinates remain internal.

Input exposes one global `useInput()` subscription with only key, text, and paste events. A handler returns `undefined` or the exact object `{ preventDefault: true }`; that object suppresses only Runtime's Ctrl+C default and does not claim route propagation. `isActive` is the only hook option. Parser metadata, availability wrappers, focus and scope policy, route decisions, normalized external forwarding, and Kitty constants are not public contracts. `useStdin().stdin` remains the exact raw mounted-stream escape hatch.

Runtime lifecycle exposes `createApp()`, a finite `MountOptions` host choice, `useApp().exit()`, and the app-owner barriers `waitUntilRenderFlush()` and `waitUntilExit()`. Output coordination, scheduler cadence, terminal acquisition, suspend/resume, restoration, and error aggregation remain Runtime mechanisms rather than general application APIs. The public mount options are only `stdin`, `stdout`, `stderr`, `mode`, `presentation`, and `patchConsole`.

Inline terminal history is one `Static` value on `@vue-tui/runtime/inline`. It has no collection props or named item types: Vue iteration owns collection identity, while Runtime owns irreversible acceptance and stream ordering. Effective visual Fullscreen rejects it; Inline, screen-reader, string, and final non-TTY hosts retain their explicit history behavior.

The common rendering vocabulary is `Box` and `Text`. Newlines and flex spacers are ordinary composition; animation, transforms, broad Yoga styles, physical caret, pointer routing, arbitrary painted-Text selection, clipboard transport, and arbitrary coordinated stdout/stderr are not part of the minimum public foundation. Sound underlying mechanisms may remain private without becoming compatibility promises. `ScrollBox` retains Boolean scroll results because an outer application can use them to decide whether to continue its own routing.

Vue's Box-rooted `v-show` behavior and nested Text foreground reset through `color="revert"` or `color="initial"` remain supported renderer behavior. These features need Runtime host and paint semantics but add no policy hook.

## The contract = exports from supported package entry points **and their user-consumable types**

The public API is everything exported from the common root (`@vue-tui/runtime`) and every explicitly documented supported public subpath, together with **their types**: component prop types, composable return/options types, and named types such as `AriaRole`, `BoxSize`, `BoxProps`, `UseXReturn`, and `UseXOptions`. A package `exports` entry is not sufficient by itself; the path becomes supported only when the project documents and guards it as an authoring surface.

A type is **as much a part of the current contract as runtime behavior**. If user code can name a type and annotate with it, changing or removing it changes the supported authoring surface at compile time. That is allowed during experimentation when deliberate, but the type surface must be designed, updated, and tested with the same care as runtime behavior.

Because it is contract, it is **tested, not merely shipped**:

- `public-api.test.ts` snapshots the **exact** common-root value-export set — adding, removing, or
  renaming any runtime export fails it, so every surface change must be a deliberate edit there. Each supported public subpath needs its own exact value-export guard, named-type checks, declaration inspection, and clean package consumer.
  Specific internal-only members (`measureText`, the screen-reader linearizer) are additionally
  tripwired, and internal-only _types_ (e.g. `ScreenReaderOptions`) are guarded with a compile-time
  `@ts-expect-error`. Type-only exports are erased at runtime, so the _type_ surface is guarded
  individually rather than exhaustively snapshotted.
- Type-_safety_ behavior is established by RUNNING the type-checker against real usage (`tsc` for
  TSX, `vue-tsc` for templates), never assumed. See [accessibility-api](./accessibility-api.md) for a worked example —
  which aria spellings the compiler does and does not catch, proven with both tools.

## Repository internals are not a package contract

`@vue-tui/runtime/internal` is not a package export. Repository tests may build a private `dist/internal.mjs` bridge so their symbols share identity with the built public bundle, but that file is excluded from the published tarball and cannot be imported through the package export map. Supported integration boundaries are the narrow `/devtools` and `/testing` subpaths; first-party packages use the same supported entries available to third parties.

Placement rule for any export:

- A user-facing contract whose semantics are common across supported rendering surfaces → the **main barrel**.
- A user-facing contract that intentionally requires one explicit terminal surface or integration boundary → a documented **public subpath**, when that boundary is part of the selected design rather than a directory-organizing convenience.
- Needed only by repository tests or implementation code → a source-private module, never a supported package path.

Packaging/build internals (the `exports` field shape, `.mjs` paths, `dist` layout) are likewise
**not** part of the behavioral/type contract and are not aligned to Ink — see the alignment-scope
note in [ink-divergences](./ink-divergences.md).

### Accepted incidental exposure: `TuiNode` via `TuiApp`

`TuiNode` is an `/internal` type, but it is **incidentally reachable** through the public `TuiApp`, which `extends Omit<App<TuiNode>, "mount">` to inherit Vue's full app surface — Vue's `App<HostElement>` carries the host type on its internal `_container` field. This is a **conscious non-fix, not a supported authoring contract**: `_container` is a Vue-internal field no consumer uses, so the exposure is cosmetic. Narrowing it (`App<unknown>` / a `Pick<App, …>` allowlist) was considered and skipped as ceremony without user-visible benefit. Treat `TuiNode`-through-`TuiApp` as unsupported and don't re-flag it. [VOUCHED @hyf0]
