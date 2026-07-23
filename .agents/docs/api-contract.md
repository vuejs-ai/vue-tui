# Public API contract & surface

> **Status:** inventory and enforcement record for the public contract currently implemented on the branch. The [Runtime public API decision ledger](./runtime-public-api-decisions.md) is the authoritative inventory of stated selections and Open target questions; its unstamped entries await review and vouch. The exhaustive retained-public table records the previous candidate. The current `createApp` superseding decision below is vouched but not yet implemented.

What is — and isn't — part of `@vue-tui/runtime`'s public contract, and how the contract is
tested. The principles and capability work used to choose future APIs live in
[api-design](./api-design.md). Behavioral _divergences_ from Ink live in
[ink-divergences](./ink-divergences.md); this file is about the SHAPE of the public surface itself.

## Experimental stability policy

Here, “public contract” means the authoring surface intentionally supported, documented, typed, and tested in the current version. It does not promise cross-release backward compatibility while vue-tui remains experimental. Under the [vouched product policy](./intent.md#api-stability-during-experimentation), a public value, type, option, path, or behavior may be renamed, moved, changed, or removed directly when an accepted target design supports that change; aliases, deprecation windows, and runtime shims are not required merely because an API shipped before 1.0.

The public-surface guards remain important. They make every change deliberate, prevent accidental exports or type drift, and prove that the resulting current API is internally coherent. A clean-slate change updates the implementation, value and type guards, documentation, examples, tests, and first-party consumers together.

The target contract keeps only facts and operations that an external layer cannot reproduce correctly without Runtime ownership. The still-Open layout candidate exposes `useLayoutWidth()`, setup-time nullable `useViewportHeight()`, and direct-Box `useBoxSize()`; the broader render-session graph, physical terminal dimensions, general accepted-tree presence, accepted-paint fragments, and caret coordinates remain internal.

The vouched Focus target is one `useFocus()` return contract with two explicit overloads. Every call creates a distinct opaque identity in one private per-app controller; `useFocus()` follows its Vue scope, while `useFocus(target)` additionally follows a readonly ref to a current-app stateful component's rendered boundary. The handle exposes only readonly `isFocused`, `focus(): void`, and `blur(): void`. Valid acquisition synchronously replaces the previous owner. Unavailable, disposed, and string-rendering operations are inert without queued acquisition; target loss, scope disposal, rollback, and cleanup clear ownership without restoration. Runtime exposes no manager, focus scopes, traversal, Tab handling, disabled or automatic-focus policy, string lookup, focused-input routing, geometry, or renderer nodes. See the [vouched review](./runtime-public-api-review.md#usefocus) and the pending implementation item in [TODOs](./todos.md#runtime-public-api-review).

The implemented candidate exposes one global `useInput()` subscription with only key, text, and paste events. Its handler currently returns `undefined` or the exact object `{ preventDefault: true }`, and the object suppresses the implemented Ctrl+C default without claiming route propagation. `isActive` is the only implemented hook option. A focus handle composes through `useInput(handler, { isActive: focus.isFocused })`; Runtime does not turn focus ownership into delivery, priority, or propagation. Parser metadata, availability wrappers, focus routing and scope policy, route decisions, normalized external forwarding, and Kitty constants are not public contracts. `useStdin().stdin` remains the implemented exact raw mounted-stream escape hatch.

**Superseding decision, 2026-07-23:** retain `useInput()` but replace the implemented event and control candidate with the vouched nested `TuiInputEvent`, `TuiKey`, and `TuiKeyName` contract; remove handler results, default Ctrl+C exit, and the old flat `kind` projection. The implementation and all current-contract documentation remain follow-up work. See the [vouched event decision](./runtime-public-api-decisions.md#useinput-exposes-one-tagged-text-key-and-paste-event-contract), the [vouched delivery decision](./runtime-public-api-decisions.md#useinput-is-a-live-broadcast-subscription-without-propagation-results), and [TODOs](./todos.md#runtime-public-api-review).

Runtime lifecycle exposes `createApp()`, a finite `MountOptions` host choice, `useApp().exit()`, and the app-owner barriers `waitUntilRenderFlush()` and `waitUntilExit()`. Output coordination, scheduler cadence, terminal acquisition, suspend/resume, restoration, and error aggregation remain Runtime mechanisms rather than general application APIs. The current public mount fields are only `stdin`, `stdout`, `stderr`, `mode`, and `patchConsole`. The vouched console contract is default-on protection, a `false` escape hatch, normally nested application registrations, installation before user components run, release after Vue cleanup, and forwarding without content-based filtering; its implementation follow-up remains in [TODOs](./todos.md#runtime-public-api-review).

**Superseding decision, 2026-07-23:** `waitUntilRenderFlush()` is an always-callable barrier for already-accepted work, not a mounted-state validator. It resolves immediately before mount and after completed exit, waits for accepted work while mounted, and waits for already-started teardown output without reporting the exit result; `waitUntilExit()` remains authoritative for complete restoration and exit errors. The current pre-mount and teardown availability errors remain implementation follow-up in [TODOs](./todos.md#runtime-public-api-review).

The implemented candidate exposes one prop-free `Static` value on `@vue-tui/runtime/inline`; Vue iteration owns collection identity while Runtime owns irreversible acceptance. It currently consumes an output-free first render, accepts the implemented string and final non-TTY hosts, and rejects effective Fullscreen.

**Superseding decision, 2026-07-23:** retain the `/inline` entry and prop-free default-slot component, but leave an output-free instance open until its first non-empty eligible output. That block commits once, its slot subtree follows normal Vue unmount lifecycle, later changes cannot rewrite it, ordinary conditional unmount does not erase accepted history, and remount creates a new block. True Fullscreen still throws. The empty-output implementation gap is tracked in [TODOs](./todos.md#runtime-public-api-review); remaining non-TTY, string, ordering, hidden-ancestor, and placement semantics remain Open.

The current contract has no screen-reader presentation, ARIA component props or named types, `INK_SCREEN_READER` selection, transcript renderer, internal screen-reader string helper, or testing-only presentation selector. Removed inputs are rejected by the same closed option and component surfaces as other unknown fields. The historical accessibility experiment is recorded in [accessibility-api](./accessibility-api.md), but neither a public nor hidden support path remains.

The common rendering vocabulary is `Box` and `Text`. Newlines and flex spacers are ordinary composition; animation, transforms, broad Yoga styles, physical caret, pointer routing, arbitrary painted-Text selection, clipboard transport, and arbitrary coordinated stdout/stderr are not part of the minimum public foundation. Sound underlying mechanisms may remain private without becoming compatibility promises. `ScrollBox` retains Boolean scroll results because an outer application can use them to decide whether to continue its own routing.

Vue's Box-rooted `v-show` behavior and nested Text foreground reset through `color="revert"` or `color="initial"` remain supported renderer behavior. These features need Runtime host and paint semantics but add no policy hook.

## The contract = exports from supported package entry points **and their user-consumable types**

The public API is everything exported from the common root (`@vue-tui/runtime`) and every explicitly documented supported public subpath, together with **their types**: component prop types, composable return/options types, and named types such as `BoxSize`, `BoxProps`, `UseXReturn`, and `UseXOptions`. A package `exports` entry is not sufficient by itself; the path becomes supported only when the project documents and guards it as an authoring surface.

A type is **as much a part of the current contract as runtime behavior**. If user code can name a type and annotate with it, changing or removing it changes the supported authoring surface at compile time. That is allowed during experimentation when deliberate, but the type surface must be designed, updated, and tested with the same care as runtime behavior.

Because it is contract, it is **tested, not merely shipped**:

- `public-api.test.ts` snapshots the **exact** common-root value-export set — adding, removing, or renaming any runtime export fails it, so every surface change must be a deliberate edit there. Each supported public subpath needs its own exact value-export guard, named-type checks, declaration inspection, and clean package consumer. Type-only exports are erased at runtime, so the type surface is guarded individually rather than exhaustively snapshotted. The removed presentation option, ARIA names, environment behavior, and helper paths have negative package and runtime guards rather than private compatibility shims.
- Type-safety behavior is established by running the type-checker against real TSX and template usage, never assumed. The historical ARIA experiment in [accessibility-api](./accessibility-api.md) remains evidence that permissive template global attributes cannot replace a closed Runtime semantic contract.

## Repository internals are not a package contract

`@vue-tui/runtime/internal` is not a package export. Repository tests may build a private `dist/internal.mjs` bridge so their symbols share identity with the built public bundle, but that file is excluded from the published tarball and cannot be imported through the package export map. Supported integration boundaries are the narrow `/devtools` and `/testing` subpaths; first-party packages use the same supported entries available to third parties.

Placement rule for any export:

- A user-facing contract whose semantics are common across supported rendering surfaces → the **main barrel**.
- A user-facing contract that intentionally requires one explicit terminal surface or integration boundary → a documented **public subpath**, when that boundary is part of the selected design rather than a directory-organizing convenience.
- Needed only by repository tests or implementation code → a source-private module, never a supported package path.

Packaging/build internals (the `exports` field shape, `.mjs` paths, `dist` layout) are likewise
**not** part of the behavioral/type contract and are not aligned to Ink — see the alignment-scope
note in [ink-divergences](./ink-divergences.md).

### Historical incidental exposure: `TuiNode` via `TuiApp`

`TuiNode` is an `/internal` type, but it is **incidentally reachable** through the public `TuiApp`, which `extends Omit<App<TuiNode>, "mount">` to inherit Vue's full app surface — Vue's `App<HostElement>` carries the host type on its internal `_container` field. This is a **conscious non-fix, not a supported authoring contract**: `_container` is a Vue-internal field no consumer uses, so the exposure is cosmetic. Narrowing it (`App<unknown>` / a `Pick<App, …>` allowlist) was considered and skipped as ceremony without user-visible benefit. Treat `TuiNode`-through-`TuiApp` as unsupported and don't re-flag it. [VOUCHED @hyfdev]

**Superseding decision, 2026-07-22:** retain the documented Vue application capabilities, exclude Vue's private app fields and `TuiNode` from the public type, and make `mount()` return the actual user root instance. The historical paragraph above explains the previous implementation but no longer describes the target. See the [vouched decision](./runtime-public-api-decisions.md#createapp-retains-the-documented-vue-application-model) and [current item review](./runtime-public-api-review.md#createapp-and-tuiapp).
