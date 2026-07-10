# Application API design

> **Status:** unstamped proposed design program. This record identifies the next product-design layer, the evidence it must satisfy, and the order of work. It does not accept an API name, signature, component catalog, breaking change, or 1.0 surface.

## Current conclusion

API design is the next product-design phase for vue-tui. Positioning explains what the framework is, application scenarios provide product evidence, and renderer-performance work is parked until measurement justifies it. The remaining question is the contract a Vue application can depend on without rebuilding terminal interaction mechanics itself.

Do not begin by listing components or specifying every future prop. Start with capability boundaries and state ownership, validate them through representative journeys, and only then stabilize composables and components. API design and journey implementation should alternate: abstract design supplies a coherent model, while real applications prevent the model from becoming speculative.

The first concrete design topic is the **presentation contract**: which terminal surface the application owns in inline and full-screen modes, which regions remain addressable, where completed output lives, and which capabilities each mode can honestly provide. Input, focus, geometry, scrolling, overlays, and components must be designed inside that contract rather than assuming a permanently addressable screen.

Interaction ownership follows as the second topic. It must distinguish two independent questions: how one effective logical focus target is maintained, and how app, overlay, region, focused-control, and external-target handlers take priority or pass an event onward. These are cooperating parts of one input model, not three competing choices called targeted events, scoped commands, and a hybrid.

## What counts as application API

The API is larger than the runtime export list. It includes:

- the Vue platform behavior an author can rely on, including component lifecycle, refs, props, events, slots, `v-model`, directives, and `provide`/`inject`;
- app creation, terminal-session lifecycle, requested and effective presentation, environment capabilities, exit, restoration, and render completion;
- renderer primitives for layout, text, clipping, measurement, cursor placement, hit testing, and any future renderer-native surface;
- composables that expose app services or reusable headless interaction behavior;
- higher-level components and their controlled state, events, slots, and imperative handles;
- public types, failure and degradation behavior, and compatibility policy;
- testing and development APIs needed to drive the same semantics deterministically.

The existing [public API contract](./api-contract.md) governs which runtime exports and types are stable. This record governs how those APIs should be chosen and fit together. The vouched [package layers](./package-layers.md) continue to govern where accepted capabilities live.

## First principles

### Make ownership explicit

Every mutable interaction state needs one source of truth and a clear set of semantic operations. A focus target should not be focused in two independent registries; a text cursor should not be inferred separately by the editor, painter, and terminal cursor; a scroll component should not keep a hidden position that another navigation helper also tries to own.

Framework-provided state should normally be exposed as readonly Vue refs plus semantic operations. Values applications need to control or persist should support normal Vue controlled-state conventions such as `v-model`, `update:*` events, and explicit props. A component may provide internal default state, but controlled and uncontrolled modes must not create two competing owners.

### Separate application meaning from interaction mechanics

The working division to validate through the representative journeys is:

| Application responsibility                                                                | Framework responsibility                                                                             | Controlled boundary                                                                           |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Messages, tool calls, metrics, Git or database entities, workspace and PTY-session models | Terminal input parsing, mode ownership and restoration, output coordination                          | Current value, query, active key, selected or expanded keys, open state                       |
| Search ranking, alert thresholds, approval policy, command execution, domain validation   | Input routing, focus order and scopes, modal input isolation, focus and cursor restoration           | Application supplies state and policy; framework supplies generic mechanics and emits changes |
| Model requests, polling, filesystem and process side effects, PTY lifecycle               | Text-editing mechanics, collection navigation, scroll coordination, generic pending/cancel mechanics | Application decides what submit, accept, cancel, or retry means                               |
| Product layout, fields, visual hierarchy, and domain-specific labels                      | Renderer primitives, geometry, clipping, targeted events, lifecycle cleanup                          | Components compose primitives without acquiring domain data or side effects                   |

This boundary does not imply one large framework state machine. It says generic mechanics should not be rewritten in every application, while domain models and side effects should not enter vue-tui.

### Be Vue-native at the public boundary

- Use component mount and unmount, effect scopes, and `provide`/`inject` to create and clean up app and subtree services.
- Prefer props, typed emits, `v-model`, slots, readonly refs, and semantic template-ref methods over React-shaped hooks or renderer handles.
- Support both templates and TSX and prove their types with `vue-tsc` and `tsc`.
- Treat idiomatic Vue behavior such as `v-show` as a platform-contract question with terminal semantics, not as an arbitrary DOM feature request.
- Keep host nodes, Yoga nodes, paint buffers, ANSI encoding, and scheduler internals behind the runtime boundary.

### Distinguish request, effective state, and capability

An application can request full-screen presentation, mouse handling, raw input, Kitty keyboard features, or another terminal behavior without the environment being able to provide it. Public environment APIs must distinguish:

1. what the application requested;
2. what presentation and modes are actually active;
3. what the terminal is known to support, not support, or has not yet answered.

Capability negotiation shares stdin with user input. Replies to framework-owned terminal queries must reach the waiting protocol controller before application input routing, and a timeout must leave an explicit unknown or unsupported result without losing unrelated bytes.

Do not make components inspect `stdout.isTTY`, process environment variables, or private mount options. Do not silently turn an unavailable capability into a successful-looking operation when the caller needs to adapt. The failure, no-op, fallback, or detectable-state behavior must be part of each API contract.

### Preserve real differences between inline and full-screen

Shared concepts should use one API only when their semantics are genuinely shared. Inline output can append completed content to main-screen scrollback but cannot address arbitrary old rows. Full-screen output owns an addressable alternate-screen viewport. Presentation differences belong primarily to the app runtime backend; components should depend on semantic capabilities rather than scattering checks for a mount boolean. The concrete invariants and their API consequences are the first design packet below.

### Design types and testing with behavior

Public value exports, public types, lifecycle and cleanup, template and TSX inference, non-TTY behavior, and terminal-visible output are all contract. Every accepted API should arrive with its testing control surface rather than leaving `@vue-tui/testing` to imitate it later.

## Public layers

| Layer                   | Responsibility                                                                                                                         | Stability rule                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Vue platform contract   | Which Vue authoring and lifecycle behavior has terminal meaning                                                                        | Supported behavior is tested in templates and TSX; unsupported behavior is documented or rejected clearly            |
| Runtime primitives      | Layout, text, clipping, measurement, hit testing, cursor and renderer-native surfaces                                                  | Small semantic surface; no Yoga, host-tree, cell-buffer, or ANSI implementation leakage                              |
| App runtime services    | Session lifecycle, effective presentation, capabilities, input parsing and routing, focus scopes, terminal modes, scheduling and flush | One service set per mounted app, provided through typed Vue injection and exposed through focused public composables |
| `@vue-tui/use`          | Independent headless behavior with no component or direct terminal dependency                                                          | Create the reserved package only when the first evidence-backed member is accepted                                   |
| `@vue-tui/components`   | Rendered, typed Vue components and component-specific companion composables                                                            | Compose only public runtime/use APIs; use controlled-state conventions and semantic handles                          |
| Testing and development | Deterministic semantic input, lifecycle, frames, PTY-visible acceptance, HMR and clean-consumer workflows                              | Test APIs track public behavior and distinguish content frames from final emulated terminal screens                  |

These are responsibility layers, not a requirement to split the renderer into framework-neutral packages. vue-tui is intentionally Vue-native.

## Evidence from the current API

### Input is broadcast while focus is separate

[`useInput`](../../packages/runtime/src/composables/useInput.ts) registers a listener on a shared emitter. The stdin controller performs Tab or Escape focus behavior and then broadcasts input to every active listener in [the app render loop](../../packages/runtime/src/render.ts). Focus registration in [`useFocus`](../../packages/runtime/src/composables/useFocus.ts) does not make its component the owner of subsequent key or paste events; applications manually feed `isFocused` or another state into `useInput({ isActive })`.

This is adequate for simple applications but does not define priority, consumption, propagation, modal isolation, nested regions, or fallthrough to an external PTY. [Issue #250](https://github.com/vuejs-ai/vue-tui/issues/250) is direct consumer evidence: several setup-time `useInput` registrations remain alive even when template `v-if` branches change, and manual `isActive` coordination becomes easy to miss.

The parser already identifies function keys, Insert, modifiers, repeat and release, but the public [`Key`](../../packages/runtime/src/composables/useInput.ts) reduces much of that identity to boolean fields. A workbench cannot reliably bind many keys the runtime already understands.

### Focus, element geometry, and the terminal cursor are disconnected

Current focus is a flat registration list keyed by string IDs. It has no nested scope, trap, restoration stack, tree-derived order, relationship to a rendered element, or click-to-focus contract.

[`useCursor`](../../packages/runtime/src/composables/useCursor.ts) accepts output-origin coordinates. [`useBoxMetrics`](../../packages/runtime/src/composables/useBoxMetrics.ts) exposes parent-relative geometry, while `measureElement` accepts `unknown` and returns only width and height. [`useDraggable`](../../packages/runtime/src/composables/useDraggable.ts) uses a `ComponentPublicInstance` target, and mouse events expose another absolute rectangle shape. A reusable editor cannot yet derive a stable element rectangle and real caret position through one semantic element contract.

Logical focus, collection active item, text insertion point, selection, and terminal cursor must remain distinct concepts even when a component coordinates all of them.

### Modes exist without a public environment contract

[`MountOptions`](../../packages/runtime/src/render.ts) contains presentation and lifecycle choices beside renderer/debug mechanisms. [`useApp`](../../packages/runtime/src/composables/useApp.ts) exposes exit and flush but not effective inline/full-screen presentation, interactivity, or terminal capability. As a result, a pure component cannot adapt through a supported public fact: the [Spinner record](./components/spinner.md#behavior) notes that it always animates because `interactive` is internal.

[`renderToString`](../../packages/runtime/src/render-to-string.ts) substitutes no-op terminal, focus, input, and animation services. The public model does not let a component distinguish a meaningful operation from a no-op or ask which virtual environment it is rendering against. Static rendering, non-interactive final output, tests, inline TTY, full-screen TTY, and the existing screen-reader mode need one explicit capability matrix.

### Headless behaviors are repeatedly hand-written

The first-party [coding-agent example](../../examples/coding-agent/src/app.vue) combines the agent state machine, global key routing, append/backspace editing, approval handling, and a painted `█` cursor in one component. The agent model belongs to the application; editing, input ownership, paste, caret and focus mechanics are reusable framework concerns.

The pinned external [mo selector](https://github.com/liangmiQwQ/mo/blob/6bea467a6995f4912e809b417b5c56a3964cc556/src/components/selector.vue#L48-L124) independently implements query editing, enabled-item navigation, selection, accept/cancel and scroll calculations, while its [completion path](https://github.com/liangmiQwQ/mo/blob/6bea467a6995f4912e809b417b5c56a3964cc556/src/utils/selector.ts#L44-L59) waits an arbitrary 50 ms before unmounting instead of using the existing [`waitUntilRenderFlush()`](../../packages/runtime/src/composables/useApp.ts) contract. Search ranking and project data stay in mo; generic editing, collection movement and acceptance are product evidence for vue-tui. The timeout is evidence to validate the discoverability and sufficiency of the existing flush contract, not to add a second completion primitive.

[`ScrollBox`](../../packages/components/src/scroll-box/scroll-box.vue) correctly owns a bounded viewport and follow-latest mechanism without choosing application keys. Its record also shows why higher-level composition is blocked: global keyboard input collides with focused editing until routing exists.

### The stability and testing contract is incomplete across packages

The exact runtime value exports are guarded, but public types are checked selectively and `components`, `testing`, and `vite` do not have an equivalent whole-package policy. Several composables expose named `UseXReturn` types while `useFocus`, `useFocusManager`, `useWindowSize`, and `useCursor` return anonymous structures.

`@vue-tui/testing` cannot directly select full-screen, screen-reader, mouse, paste, or Kitty behavior through its current `RenderOptions`. Its `LastFrameOptions` participates in a public method signature but is not exported, and `lastFrame()` is typed as possibly undefined although the implementation returns a string after `render()` resolves. These are later surface-audit items, not reasons to postpone the interaction foundation.

## Capability model derived from the scenarios

| Capability                | Conversational application                            | Monitor or task runner                     | Data workbench                              | Terminal-workspace stress              | Likely layer                                         |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| App/session environment   | inline transcript or full-screen conversation         | non-TTY snapshot and full-screen dashboard | persistent multi-region app                 | full-screen shell around PTYs          | runtime service                                      |
| Input ownership           | composer, approval, interrupt                         | global shortcut and focused filter/action  | search, list, detail and overlay routes     | command scope or PTY fallthrough       | runtime service                                      |
| Focus and scopes          | composer to approval and back                         | region or control focus                    | collection, preview, actions and modal      | nested pane focus and restoration      | runtime service                                      |
| Text editing              | prompt, history, multiline, paste                     | filter or action parameter                 | search, rename and forms                    | search/rename outside the PTY          | headless behavior plus component                     |
| Collection behavior       | history and action choices                            | process/job/log lists                      | list, tree, table and preview               | workspace/tab/pane navigator           | headless behavior plus components                    |
| Viewport and scroll       | native inline scrollback or full-screen follow-latest | logs and follow/pause                      | keep active item visible and scroll preview | tab overflow and pane scrollback       | runtime geometry plus headless/component state       |
| Overlay                   | approval and confirmation                             | destructive action or details              | dialog, menu and command palette            | modal, prefix help and settings        | focus/input runtime plus component                   |
| Screen-reader environment | existing linearized runtime output                    | existing linearized runtime output         | existing linearized runtime output          | surrounding vue-tui shell only         | existing runtime accessibility contract              |
| External cell surface     | not normally needed                                   | optional specialized visualization         | optional renderer-native view               | emulated terminal pane with dirty rows | future runtime primitive only with consumer evidence |

The terminal-workspace case is a pressure test. PTY bytes, prefix commands and pane-tree business state do not enter core, but the public interaction model must allow an inner owner to handle an event or deliberately return it to an outer scope or external terminal session.

## First design packet: presentation contract

The vouched product decision defines the two modes but does not yet define their complete application contract. Here, an **addressable region** means terminal cells whose current position the runtime can reliably identify and rewrite later.

### Keep presentation and independent runtime facts separate

- **Presentation mode** is the requested and effective surface model: inline on the main screen or full-screen on the alternate screen.
- **Render host** says whether Vue is mounted to a live terminal session, rendered to a static string, or driven by a deterministic test host.
- **Runtime facts** are independent and can combine: stdin and stdout TTY state, effective interactivity, screen-reader output, debug behavior, dimensions, and protocol results. Screen-reader output can, for example, coexist with an interactive full-screen request; it is not a third presentation mode.
- **Capability** is the semantic fact an API can rely on after those inputs combine, such as live key input, a stable viewport origin, targeted mouse hit testing, resize events, or terminal protocol support.

`fullscreen: true` is currently effective for a mounted app only with interactive rendering and a TTY stdout. A requested mode, the effective mode, independent runtime facts, and derived capabilities must therefore remain separately observable. A component must not infer capabilities from the requested mount boolean or from one coarse environment enum.

### Proposed mode invariants

The following table is the desired public contract to evaluate, not a claim that the current writer already satisfies every row. It derives the API constraints from the two vouched terminal models; implementation gaps are listed immediately afterward.

| Assumption                   | Inline: `fullscreen: false`                                                                                                                                                                                                               | Full-screen: `fullscreen: true`                                                                                                                                                     | API consequence                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terminal surface ownership   | The app shares the main screen with preceding shell output and owns only its current live render region.                                                                                                                                  | The app owns the alternate-screen viewport until teardown.                                                                                                                          | An API must not promise whole-screen effects in inline mode.                                                                                       |
| Completed output and history | Completed `Static` output can become terminal-owned scrollback and is no longer an editable app surface.                                                                                                                                  | The alternate screen has no durable shell history; searchable or navigable history must remain in an app-owned model and be projected into the viewport.                            | Transcript history and viewport scrolling cannot be represented by one hidden offset with identical meaning.                                       |
| Coordinates                  | The live frame is updated relative to its prior position; its absolute top row is not stably known, especially after `Static` output or external writes.                                                                                  | The target contract preserves a viewport origin at `(0, 0)` while the app is mounted.                                                                                               | Shared geometry should be element- or region-relative; absolute hit testing is a capability, not a universal primitive.                            |
| Redraw and visual overlays   | The runtime can redraw its managed live region but cannot cover and later restore arbitrary rows already in scrollback. A visual overlay must fit inside that live region.                                                                | The runtime can repaint the current viewport, so a visual overlay can cover and restore app content.                                                                                | Modal input and focus behavior can be shared, while visual overlay placement and guarantees remain mode-specific.                                  |
| Scrolling                    | Native terminal scrollback is the natural history surface; bounded app scrolling is possible only inside space the live region currently owns.                                                                                            | The application must provide scrolling for content larger than the viewport, for example through a bounded `ScrollBox`.                                                             | Components must state whether they operate on native history, an app-owned viewport, or either with different behavior.                            |
| Resize                       | The current live region can relayout and repaint, but the app cannot retroactively rewrite completed terminal history.                                                                                                                    | The target contract relayouts and repaints the full current viewport.                                                                                                               | Resize contracts must say which state is recomputed and must not imply that inline history is still mounted or editable.                           |
| Mouse and selection          | Raw SGR mouse input is an explicit low-level path when the terminal and stdin support it, but the runtime cannot reliably map absolute mouse coordinates to elements; tracking also suppresses native selection across the shared screen. | A stable-origin environment can provide targeted hit testing when stdin, the terminal, and the active render path support a hit map; tracking is enabled only when the app uses it. | Raw mouse input and semantic element events are distinct capabilities. Targeted mouse remains full-screen-only unless the origin model changes.    |
| Cursor placement             | Cursor coordinates are relative to the current output origin, whose absolute screen row can move.                                                                                                                                         | The target contract lets a managed caret resolve through a stable viewport origin.                                                                                                  | A reusable editor should request a caret relative to a semantic element or managed region instead of computing physical screen cells itself.       |
| Input and logical focus      | Presentation alone says nothing about stdin or raw-mode ownership. When live input is effective, inline uses the shared interaction model.                                                                                                | Presentation alone says nothing about stdin or raw-mode ownership. When live input is effective, full-screen uses the same interaction model.                                       | Logical focus, keyboard routing, paste, and focus scopes can share one semantic model; input availability remains a separately derived capability. |
| Exit and restoration         | Current output remains on the main screen and can remain in shell history after terminal modes and cursor state are restored.                                                                                                             | Leaving the alternate screen restores the previous main-screen contents; the app viewport disappears.                                                                               | Completion, suspension, final output, and teardown behavior must have explicit mode-specific contracts.                                            |

These are product constraints. `Static` and `ScrollBox` are evidence for different history owners, not a rule that either primitive must be rejected when used in the other mode.

### Current implementation gaps exposed by the target

- Effective full-screen already enters the alternate screen before the first render, homes that first frame, and restores the previous main screen and terminal state on exit. This establishes the correct terminal mode but not yet a separate fixed-viewport layout and output backend.
- Inline and full-screen currently share the same relative frame writer, and the Yoga root is constrained by terminal width rather than by a full rows-by-columns viewport. A short full-screen tree therefore does not automatically occupy or relayout the full terminal height.
- The first full-screen frame starts at `(0, 0)`, but `Static` and coordinated stdout or stderr output can move the later dynamic frame downward. The current hit map still starts from the paint grid's `(0, 0)`, so stable-origin targeted mouse and viewport-relative cursor promises require origin-preserving output coordination or an explicit restriction.
- Inline normally rewrites its current dynamic block, but an overflowing frame can use a terminal-clear fallback that also affects earlier main-screen content or scrollback. If the public contract promises ownership of only the live region, the implementation must meet it or document a narrower guarantee.
- `@vue-tui/testing` currently captures content frames in debug mode without selecting full-screen or emulating the final terminal screen. `renderToString` has columns but no rows, presentation, or terminal-I/O lifecycle. The proposed mode matrix therefore needs new testing semantics before it can become contract.

### Questions this packet must settle

1. Which requested mode becomes effective in every supported execution environment, and is an unavailable request ignored, rejected, warned about, or exposed as a detectable fallback?
2. What exact live region does inline own, how does completed output leave it, and what can still be redrawn after `Static`, external output, resize, suspension, and restoration?
3. Given that full-screen is an alternate-screen viewport, which fixed-height layout, origin-preservation, external-output, and lifecycle guarantees hold on clean exit, error, signal, suspension, and nested or busy output streams?
4. Which facts belong in a readonly reactive environment API, including requested mode, effective mode, interactivity, size, stable-origin availability, mouse hit testing, paste, keyboard protocol, color, and screen-reader behavior?
5. Which primitives and components have genuinely shared semantics, which expose capability-dependent behavior, and which should clearly support only one presentation mode?
6. How do deterministic tests select requested mode and execution environment, inspect effective capabilities, and distinguish content frames from the final emulated terminal screen?

Do not publish a mode-dependent editor, overlay, viewport, pointer, geometry, or high-level component API until this matrix is explicit enough that the same application cannot accidentally depend on a full-screen assumption while running inline.

## Second design packet: focus and input inside the presentation contract

Once the presentation contract is explicit, input design can share what both modes actually have in common. If vue-tui promises delivery to a focused owner, the app runtime must maintain one effective logical-focus state. The current `activeId` is a partial version of that ownership; the missing contract is how focus attaches to rendered or semantic elements, how scopes affect it, and how input reaches that owner.

Focus ownership and keyboard priority are separate questions:

1. **Focused delivery:** how a focusable element registers, becomes the one effective focus target, receives a normalized event, and loses or restores focus when hidden, disabled, or unmounted. The public handler may be a Vue event on a semantic element or a composable bound to a focus handle; that attachment shape remains open.
2. **Priority and fallthrough:** after framework-owned terminal-protocol replies have been removed, how an active overlay, app-level shortcut, active region, focused control, component default, and optional external owner such as a PTY get a chance to handle or pass on the same input. Typed commands or inspectable key bindings may help this layer, but they are not an alternative focus system.

A candidate responsibility flow is:

```text
terminal bytes
  -> route replies for active terminal protocol and capability queries
  -> parse remaining bytes once into typed key / text / paste / mouse events
     or explicit uninterpreted input
  -> apply the active priority layers
  -> deliver focused input to the one effective logical-focus owner
  -> continue through explicitly defined outer or fallback handlers
  -> optionally hand an unhandled event to an external owner such as a PTY pane
```

This flow is not an accepted dispatch order. The proposal must answer:

1. How does a handler distinguish handled, continue routing, prevent a component default, and return input to an external owner?
2. Which registrations follow setup-scope lifetime, and which must follow the actual rendered node or `v-if` branch lifetime required by #250?
3. How are logical focus, active collection item, text insertion point, selection and terminal cursor kept separate and coordinated?
4. How do nested focus scopes trap focus, derive traversal order, skip hidden or disabled targets, and restore focus after unmount?
5. Are shortcuts expressed as normalized key events, typed commands and overridable bindings, or both? How can help or status UI inspect active bindings without stringly typed application actions?
6. What remains the purpose and compatibility contract of low-level `useInput`, `useMouseInput`, and direct stdin access?
7. What semantic element or rectangle type lets focus, mouse, measurement, scrolling and a real terminal caret refer to the same rendered object without exposing a host node?
8. Which shared focus and input operations remain meaningful in static, non-interactive and screen-reader environments, and how does each ineffective operation report itself?

Do not publish a new input or focus API until one model handles #250, a modal approval, a global app shortcut, two focusable regions, unmount restoration, both presentation modes, and optional PTY fallthrough without manual boolean coordination.

## Vertical validation journeys

Use the smallest set of applications that forces the shared contract:

1. **Workflow:** a coding-agent composer streams output, accepts Unicode editing and paste, transfers ownership to an approval overlay, supports submit/cancel/interrupt, restores focus and caret, and runs in both inline and full-screen presentation.
2. **Finder:** a mo-like selector owns query text, stable item keys, disabled items, navigation, ensure-visible scrolling, accept and cancel; its search algorithm and domain records remain application-supplied.
3. **Monitor/environment:** a machud-like app supports a non-interactive or static frame and a full-screen live dashboard without try/catch capability detection or hidden process-global assumptions.
4. **Workbench:** two independently active regions plus an overlay prove scoped shortcuts, focus restoration and unhandled-event routing.
5. **Terminal workspace stress:** a focused pane can pass unhandled keys to an external terminal session without making PTY or VT emulation a framework responsibility.

The first implementation prototype should combine the workflow composer and finder selector. Together they test text editing, controlled state, focus, commands, collection movement, scrolling and completion. The prototype may remain internal until its behavior and TypeScript/template shape survive both journeys.

## Work order

1. Inventory the complete public surface across runtime, components, testing and vite; classify each item as stable application API, advanced/embedding API, deprecated compatibility, or internal mechanism.
2. Settle the inline and full-screen presentation contract above, including requested versus effective mode, environment combinations, addressable-region semantics, capability behavior, lifecycle, and testing controls.
3. Write the focus-ownership and input-priority proposal inside that contract, with competing handler-attachment shapes and explicit compatibility for current `useInput` and focus APIs.
4. Prototype both packets through the workflow and finder journeys in inline and full-screen modes, including semantic testing controls and real-PTY acceptance where terminal behavior is claimed.
5. Distill shared controlled-state conventions and decide whether the first independent headless behavior justifies creating `@vue-tui/use`.
6. Design component APIs only after the headless/runtime contracts are exercised; start with the smallest composer/editor and collection primitives the journeys require.
7. Extend the same foundation to viewer scrolling, search, selection and copy. Implement virtualization only when a measured representative journey triggers the parked performance work.
8. Before 1.0, reconcile naming, return types, capability-specific failure behavior, advanced exports and package-wide API/type tests.

Testing API design proceeds with every step rather than as a final phase.

## Review template for each proposed API

Every proposal should state:

- the representative user journey and observable problem;
- application-owned state, framework-owned mechanics, and controlled state;
- events, semantic operations, cleanup and error behavior;
- requested/effective/capability behavior across inline, full-screen, non-TTY, static render, screen-reader mode, testing and HMR;
- template and TSX examples with inferred public types;
- compatibility with existing APIs and a migration path if behavior breaks;
- focused logic tests, type tests, component interaction tests, and real-PTY evidence where terminal state is involved;
- which other scenario proves the abstraction is not one application's business model.

## Prior-art constraints

- Vue's [custom renderer contract](https://github.com/vuejs/core/blob/c0606e91798c8dca4f33d101e1dd836d672592c1/packages/runtime-core/src/renderer.ts#L96-L155) keeps host operations narrow, while [hierarchical provide/inject](https://github.com/vuejs/core/blob/c0606e91798c8dca4f33d101e1dd836d672592c1/packages/runtime-core/src/apiInject.ts#L8-L74) is a natural mechanism for app and subtree services.
- Ink's [`useInput` subscription](https://github.com/vadimdemedes/ink/blob/25766aec618bd62030069f57dd081e5ebdd46add/src/hooks/use-input.ts#L126-L174) and [flat focus hook](https://github.com/vadimdemedes/ink/blob/25766aec618bd62030069f57dd081e5ebdd46add/src/hooks/use-focus.ts#L5-L82) explain vue-tui's current baseline and also its limit for nested applications. Ink parity is not the API objective.
- OpenTUI's [key event contract](https://github.com/anomalyco/opentui/blob/a0b90640761aa89a303c6b5b0d74ef3e6b945652/packages/core/src/lib/KeyHandler.ts#L5-L62) demonstrates handled and propagation semantics. Its framework-neutral core and broad exports are not a reason to migrate or copy its public structure.
- Textual's [focused-widget and app binding route](https://github.com/Textualize/textual/blob/1d99508b928a771b51e1a527319c6b87dcff9e05/docs/guide/input.md#L118-L185) demonstrates why focus, app shortcuts and inspectable bindings belong in one model. Its Python inheritance, string actions and full message system are not proposed for vue-tui.

## Explicit non-decisions

This record does not decide to:

- publish a `useTerminal`, key event, command, focus-scope, editor, list, overlay or cell-surface API under any particular name;
- remove or break `useInput`, current focus APIs, mount options, raw mouse, or direct stream access;
- build a Table, TextInput, Dialog, Tree, Command Palette, TaskList or other catalog item merely because another framework has one;
- create `@vue-tui/use` before an accepted independent behavior requires it;
- make all web Vue directives or DOM event semantics work unchanged in a terminal;
- add a blanket component accessibility requirement or change the runtime's existing accessibility contract;
- choose inline or full-screen as the primary product mode;
- introduce a router, generic message bus, framework-neutral renderer API, or application-domain state machine;
- reopen renderer optimization, virtualization or native-core work without the triggers in [performance.md](./performance.md#when-to-reopen-this-work).
