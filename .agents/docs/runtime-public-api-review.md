# Runtime public API review

Evidence and results for the item-by-item review of `@vue-tui/runtime`. The [decision ledger](./runtime-public-api-decisions.md) is authoritative for acceptance; current code and older records remain evidence rather than automatic answers when their assumptions changed.

## `createApp` and `TuiApp`

**Status:** the Vue app surface, user-root mount result, complete app barriers, stream protocols and ownership, mount defaults and modes, Inline non-TTY output, transactional preflight, used-stream failures, component-error behavior, console protection, invalid exit input, named app and mount types, and named `UseAppReturn` were vouched by 2026-07-23 and are implemented. The separate `RenderMode` alias is absent because the accepted mode union is derivable as `NonNullable<MountOptions["mode"]>`. Screen-reader presentation, `RenderPresentation`, ARIA props and types, environment selection, internal helpers, and testing selectors have been explicitly removed.

### User tasks

The ordinary application path creates and mounts one Vue application:

```ts
createApp(App).mount();
```

The real `mo` consumer proves that root props, an external owner, a render barrier, and explicit teardown are real needs:

```ts
const app = createApp(Selector, {
  root,
  groups,
  onSelect: async (value) => {
    await app.waitUntilRenderFlush();
    app.unmount();
    resolve(action(value));
  },
});

app.mount();
```

See [`mo.patch`](../../packages/runtime-tests/consumers/runtime-foundation/patches/mo.patch). The first-party testing package also uses `createApp(component, props)`, `mount()`, `unmount()`, and both wait methods.

Standard Vue application configuration must continue to work without Runtime internals:

```ts
const app = createApp(App);

app.use(interactionPlugin);
app.provide(serviceKey, service);
app.config.errorHandler = reportError;

const root = app.mount();
await app.waitUntilExit();
```

### Problems found before implementation

The earlier public type inherited `App<TuiNode>` wholesale. This kept Vue's standard app methods but also exposed underscore-prefixed Vue fields and leaked the renderer-only `TuiNode` through `_container`. Those fields were an incidental consequence of reusing the whole Vue type, not a user capability.

Runtime also mounted a private `InternalErrorBoundary` as the actual Vue root and rendered the user's component beneath it. Consequently `app.mount()` returned the private boundary proxy rather than the user's root instance. A root that exposed `ping()` produced `{ hasPing: false, pingType: "undefined" }`. The implementation removed this wrapper while preserving the dev overlay.

A mount against an already-owned stdout warned, performed an inert no-op, and returned an empty object cast to `ComponentPublicInstance`. A real mount failure threw and rolled back, but left `waitUntilExit()` pending. Both behaviors reported lifecycle state inaccurately and were replaced by the implemented preflight and consumed-attempt contract.

The hidden boundary also returned `false` from `onErrorCaptured`, preventing ordinary descendant errors from reaching the user's `app.config.errorHandler`. Removing it restored Vue's normal capture and application-handler propagation.

### Runtime boundary

Runtime must create the custom renderer, turn mount into terminal acquisition, arbitrate output ownership, roll back partially acquired terminal resources, unmount the Vue tree, flush output, and settle exit only after restoration. A third party cannot reproduce those operations from smaller public APIs.

Vue component-error policy is different. The user's root, `onErrorCaptured` hooks, and `app.config.errorHandler` already define whether a component error is handled or continues through Vue. Runtime does not need a hidden component, automatic error page, or global-handler override to own terminal cleanup. A synchronous mount or Runtime-controlled terminal, input, output, or renderer failure still triggers Runtime rollback.

### Peer evidence

| System                                                                                                              | Relevant public shape                                                                                                                                                  | Result for vue-tui                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [Vue custom renderer](https://vuejs.org/api/custom-renderer.html)                                                   | `renderer.createApp()` returns Vue `App<HostElement>`; Web Vue's [`app.mount()` returns the root component instance](https://vuejs.org/api/application.html#app-mount) | Retain the documented Vue application model and truthful user-root return. Do not treat Vue's private host fields as vue-tui API.              |
| [Ink 7.0.4](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/render.ts)        | A narrow render handle has `unmount()` and the same two wait concepts; Ink also forces a private error boundary                                                        | The barriers are relevant terminal precedent, but React's handle and automatic error UI do not override Vue's application and error contracts. |
| [OpenTUI 0.4.5](https://github.com/anomalyco/opentui/blob/v0.4.5/packages/react/src/reconciler/renderer.ts#L14-L57) | React Root exposes `render/unmount`; a separate renderer owns terminal lifecycle; its React binding privately wraps errors while its Solid binding does not            | Framework bindings and terminal ownership can remain separate; a binding-specific hidden wrapper is not a stable core primitive.               |

Vue establishes the application shape and synchronous `unmount()`. Ink separately establishes the usefulness of terminal exit and flush barriers. No peer determines the exact vue-tui failure windows or justifies Ink's `rerender`, `cleanup`, `clear`, or automatic error screen.

### Vouched decisions and implemented signature

The vouched and implemented Vue app shape is:

```ts
export function createApp(root: Component, rootProps?: Record<string, unknown> | null): TuiApp;

export interface TuiApp extends ConsumerVuePublicAppSurface {
  mount(options?: MountOptions): ComponentPublicInstance;
  waitUntilRenderFlush(): Promise<void>;
  waitUntilExit(): Promise<void>;
}
```

`ConsumerVuePublicAppSurface` above is explanatory, not a proposed export. The target derives from the public `App` type supplied by the consumer's Vue peer while excluding `mount` and underscore-prefixed internals, then adds vue-tui's mount signature. It must not copy a fixed list from the build-time Vue version: a Vue 3.5 consumer receives `onUnmount()`, while an older supported peer exposes only the public application capabilities it actually supplies. `TuiNode` is not reachable through this projection. The optional `rootProps` parameter, named `TuiApp`, and named `MountOptions` are vouched decisions from the current batch review.

The vouched target retains Vue's documented application surface, synchronous `unmount()`, the actual user root component result from `mount()`, `rootProps`, `TuiApp`, `MountOptions`, and the two app-owner barriers. The current minimum surface adds no `render`, `rerender`, `cleanup`, `clear`, app-level terminal controller, or raw renderer.

The console option is decided: `patchConsole` defaults on, `false` is the escape hatch, active applications form a normal stack, protection starts before user component execution and ends after that application's Vue cleanup, and Runtime does not filter intercepted content. The complete accepted mount-host contract is recorded below.

### Vouched lifecycle and error edges

- `unmount()` remains synchronous. `waitUntilExit()` resolves or rejects only after teardown, restoration, and accepted output complete or are abandoned.
- Public option validation and stdout ownership checks happen before a real mount attempt and do not consume the app. An already-owned stdout throws synchronously without touching the owner, and the app may be retried after that stream becomes free.
- The implementation defines one exact transition from preflight to a consumed mount attempt. Once consumed, a mount failure is single-use: Runtime rolls back, `mount()` throws the original failure synchronously, and `waitUntilExit()` rejects with the same failure after cleanup rather than remaining pending.
- Runtime does not insert `InternalErrorBoundary`, render `ErrorOverview`, override `app.config.errorHandler`, normalize Vue component errors into its own fatal policy, or automatically exit on errors that Vue or the application handles.
- A future formatted error boundary or screen is deferred optional `@vue-tui/components` behavior built entirely from Vue and public Runtime APIs. It is not a Runtime mount option or foundation requirement.
- `waitUntilRenderFlush()` resolves immediately before mount and after completed exit, waits for already accepted render and output work while mounted or tearing down, and never duplicates the exit result reported by `waitUntilExit()`.

### Earlier decisions superseded

Earlier records accepted full `App<TuiNode>` inheritance, an inert busy-stdout mount, a placeholder mount return, uniform Runtime error normalization, and an automatic `ErrorOverview`. Those choices remain implementation history but are superseded for the target above. The Vue-shaped `createApp → TuiApp → mount` sequence and absence of Ink aliases survive because they still have independent Vue and user evidence.

### Implementation evidence

- A packed public-only consumer on the minimum supported Vue version proves `rootProps`, `app.use()`, `app.provide()`, `app.config.errorHandler`, component and directive registration, `runWithContext()`, mount, unmount, and the two barriers without Runtime internals or Vue 3.5-only assumptions.
- Declaration checks prove Vue's supported public app operations remain available while `_container`, other private app fields, and `TuiNode` are absent.
- Normal and dev-overlay mounts return the actual user root instance, including an exposed user method; the testing bridge does not re-expose a wrapper proxy.
- A busy stdout throws synchronously without consuming the app, mutating terminal state, or touching the existing owner; the app can mount after the owner releases the stream.
- A consumed mount failure restores resources, throws synchronously, and rejects `waitUntilExit()` with the same failure.
- No-boundary initial and later component-error tests match Vue with and without user `onErrorCaptured` and `app.config.errorHandler` behavior.
- A partial-mount regression proves terminal restoration and complete Yoga-node release. If host allocation is unsafe, a narrow allocation transaction fixes rollback without restoring component-error policy.
- Existing Inline, Fullscreen, non-TTY, string, terminal restoration, and packed-consumer journeys remain green after obsolete error-overview tests are replaced with Vue and Runtime-boundary tests.

## `renderToString`

**Status:** Runtime placement, retention, and the complete minimum contract below were vouched on 2026-07-23 after reviewing the real production use, lifecycle behavior, and peer evidence. Ink 7.0.4 is the only reviewed terminal peer with the same production API shape. Vue SSR supplies relevant Vue application precedent but solves a different asynchronous HTML-rendering problem. OpenTUI, Bubble Tea, Textual, and Blessed do not expose a sufficiently similar production string renderer to determine this contract.

### User task

Applications need one terminal-formatted document without mounting a live terminal application:

```ts
const document = renderToString(Report, { columns: 80 });
await writeFile("report.txt", document);
```

The public [machud monitor](https://github.com/hyfdev/machud/blob/a51a6853686eb818471d0027d2549e6e664c9b36/src/main.ts) is a concrete production consumer: its default command mounts the live full-screen dashboard, while `--once` and `--snapshot` collect one real metric sample, render the same Vue TUI at a deterministic width, write the result to stdout, and exit for piping, CI, or a quick non-interactive view. Its [component tests](https://github.com/hyfdev/machud/blob/a51a6853686eb818471d0027d2549e6e664c9b36/tests/panels.test.ts) use the same operation to verify responsive terminal panels without creating an app or TTY; that testing use is supporting evidence rather than the sole product justification.

The operation needs the Runtime renderer because terminal cell width, wrapping, Yoga layout, Text styling, and `Static` extraction cannot be recreated from Vue output outside Runtime.

### Vouched minimum contract

```ts
export interface RenderToStringOptions {
  readonly columns?: number;
}

export function renderToString(component: Component, options?: RenderToStringOptions): string;
```

The function synchronously renders one initial Vue document, defaults `columns` to `80`, and has unbounded height. It neither acquires terminal resources nor accepts `rows`, `mode`, streams, lifecycle barriers, or other live-host options. `columns` is validated as a positive bounded integer before Vue setup or paint allocation. Runtime should validate the option that affects layout safety, but it need not maintain special recognition of removed terminal options or reject unrelated extra object keys; the public TypeScript shape remains exactly `columns?`.

Normal synchronous Vue setup and mount hooks run because this is a temporary Vue renderer tree, not Vue HTML SSR. Runtime captures the first synchronous committed document: setup-time synchronous state changes are included, while updates queued by `onMounted`, timers, promises, or other later work are not awaited and do not change the returned string. Runtime should not add an asynchronous variant until a real application requires one.

Success and failure both unmount the temporary Vue tree, run component cleanup, and release all Yoga and Runtime-owned resources before returning or throwing. An unhandled component error is synchronously propagated after cleanup and is never swallowed. A shared component may call `useApp()` or register inert `useInput()` behavior while rendering; input handlers are never invoked and `useApp().exit()` is an inert no-op because the temporary application already ends before the function returns.

`Static` is supported as an Inline-document prefix. Every currently visible, non-empty block is collected in Vue tree order and placed before the ordinary document output; the returned string has no artificial trailing newline. A hidden block contributes nothing. An empty block also contributes nothing and then disappears with the temporary tree because string rendering has no future update in which it could become ready. Text layout and styling use the same Runtime renderer as live output rather than a separate string-rendering dialect.

### Live non-TTY and placement behavior

For a mounted application whose output is redirected to a pipe or file, each accepted `Static` block is appended when committed, while the dynamic document writes only once during clean teardown. This preserves useful progress history without emitting cursor movement or erase sequences. Several blocks accepted in one transaction use current Vue host-tree preorder rather than registration, mount, Yoga visual, or reverse-flex order; later accepted history only appends and cannot erase or move bytes already written.

An authored hidden Box ancestor keeps a live `Static` pending for its latest content until every such ancestor is visible. Root, component, Fragment, and ordinary Box placement is valid, but ancestor layout does not shape the isolated block; nested Static and Text or Transform placement reject before output. Initial invalid placement rolls back a consumed mount without Static bytes, while a handled later invalid insertion follows Vue update-error policy and can be repaired. A normal write seals the complete represented batch and lets Vue finish releasing every slot scope and host before Runtime forwards a captured effect-scope cleanup failure; Vue-handled watcher and lifecycle errors retain native timing. A throwing write abandons represented blocks without retry. These unstamped technical semantics were closed by the delegated bounded review and are recorded in the [implementation re-audit](./runtime-public-foundation-reaudit.md#path-2-inline-history).

### Peer evidence and deliberate Vue choices

- [Ink 7.0.4 `renderToString`](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/render-to-string.ts) is synchronous, defaults to 80 columns, acquires no terminal resources, prepends Static output, cleans up before propagating component errors, and exports its named options type. A real pinned-version harness produced `"A\nB\nLIVE"` for two Static entries plus a dynamic frame and omitted a Static below `display="none"`.
- Ink's [original demand](https://github.com/vadimdemedes/ink/issues/459) came from users wanting to write component-rendered terminal output to files and documentation; a small external `ink-render-string` implementation appeared years before Ink added the built-in API in [PR #868](https://github.com/vadimdemedes/ink/pull/868). This proves a recurring task, not broad adoption of one exact contract.
- Ink's non-interactive renderer writes new Static output immediately and the final dynamic frame on unmount. OpenTUI's nearest history operation is a mode-gated scrollback snapshot, while Bubble Tea's `Println` and `Printf` append strings above the live view; neither supplies a comparable component-to-string contract.
- [Vue's SSR renderer](https://vuejs.org/api/ssr.html#rendertostring) accepts a Vue app or VNode and returns a Promise because it handles asynchronous server rendering, SSR context, and teleports. Those HTML concerns do not justify making this bounded terminal snapshot asynchronous or adding an SSR context.
- vue-tui differs from Ink only where Vue semantics require it: several sibling Static instances use Vue tree order instead of Ink's single tracked Static node, and hidden ancestors use Vue visibility. Terminal-specific hooks remain inert in both implementations.

### Current implementation disposition

The current public signature, synchronous result, 80-column default, bounded column validation, Static prefix, inert input services, and cleanup-after-error mechanisms implement this contract. `useApp().exit()` is inert, unrelated runtime keys are ignored without being read, and initial host-insertion failure now guards and releases every reachable Vue scope as well as every Yoga and Runtime-owned resource before rethrowing the original error.

## `Box` and `Text`

**Status:** the exact 46-field `BoxProps`, nine-field `TextProps`, and three named authoring types below were vouched as the minimum public API shape on 2026-07-23 after two bounded two-reviewer adversarial rounds and a follow-up field-by-field Text review against Ink, OpenTUI, Textual, Lip Gloss, Ratatui, and real Gemini CLI code. The implementation now establishes the reviewed range enforcement, layout and paint behavior, six modifiers, five width modes, independent terminal-default color channels, and closed unknown-attribute policy. Earlier stamps on the closed 24-field `BoxProps` and five-field `TextProps` surface no longer describe the target.

The earlier 18-field proposal is withdrawn because it treated silence in vue-tui's small and already-migrated consumer sample as deletion evidence. The later edge-only proposal is also withdrawn because it confused fewer prop spellings with fewer concepts and made ordinary panel code unreasonable. Neither proposal is a fallback.

### What "minimum and solid" means for these two primitives

`Box` and `Text` are not ordinary convenience components. They are the public language for Runtime-owned layout and paint. A layout fact belongs here when an outside component cannot reproduce it without the final parent and sibling sizes; a text fact belongs here when an outside component cannot preserve it through nested ANSI state, terminal-cell measurement, wrapping, clipping, and repaint.

A minimum contract therefore minimizes independent concepts, not the number of property names. `padding`, `paddingX`, and `paddingLeft` are one box-model concept with three useful levels of specificity. Deleting the first two saves names but makes every application repeat a mechanical expansion. The same reasoning applies to margin, gap, and overflow.

Current vue-tui consumers establish a lower bound, not an upper bound. They are positive evidence for the fields they use, but vue-tui has few users and the representative machud consumer was already migrated to the narrowed experiment. Re-reading that migrated source as proof that the experiment is sufficient would be circular. Mature peers and real applications establish that a task recurs; vue-tui still needs a Runtime-ownership reason and a coherent local contract before copying an exact field or behavior.

Being additive later is not by itself a reason to omit an ordinary foundation capability. It is a valid reason to defer a specialized capability only when the accepted set still supports normal panels, responsive rows, constrained panes, clipping, overlays, separators, and styled or width-constrained text without private imports or application-side layout reconstruction.

### User-code acceptance

The following journeys are the acceptance tests for the public shape. They are deliberately application code rather than internal Yoga examples.

#### Ordinary panel

```vue
<Box
  flexDirection="column"
  borderStyle="round"
  :padding="1"
  :gap="1"
  :marginY="1"
>
  <Box alignItems="center" justifyContent="space-between">
    <Text color="cyan" bold>Deploy</Text>
    <Text color="green">ready</Text>
  </Box>
  <Text dimColor>{{ detail }}</Text>
</Box>
```

The current 24-field Box cannot express `padding`, `marginY`, or `marginBottom`. Expanding the padding to four edges still does not recover the margin, and wrapping the panel in empty layout nodes changes its structure. The target keeps the direct code. Real Gemini CLI panels independently use `paddingX`, `marginY`, border, alignment, and percentage width in the same way; these are not API-demo-only spellings.

#### Responsive toolbar or tag list

```vue
<Box flexWrap="wrap" :gap="1" :columnGap="2">
  <Tag v-for="tag in tags" :key="tag.id" :tag="tag" />
</Box>
```

Without `flexWrap`, an application must measure the container, measure every dynamic child, partition the Vue children itself, and repeat that work on resize and content changes. That is an attempted userland layout engine, not a higher-level component policy. `rowGap` and `columnGap` retain the normal rule that an axis value overrides `gap`.

The gap names are physical rather than relative to flex direction: `rowGap` is vertical spacing and `columnGap` is horizontal spacing. Changing `flexDirection` does not exchange their names.

#### Constrained split panes

```vue
<Box :height="24">
  <Box width="35%" :minWidth="20" :maxWidth="50" :flexShrink="0">
    <Navigator />
  </Box>
  <Box :flexGrow="1" :minWidth="0">
    <Preview />
  </Box>
</Box>
```

`maxWidth` and percentage width let the constraint remain relative to the containing Box's available inner width. Replacing this with `useLayoutWidth()` computes against the root, does not generalize to a nested pane, and introduces a second application-side layout pass. "Available" is deliberately not the same as the containing Box's final shrink-to-fit width: an auto-width parent constrained by 40 available columns may end at 20 columns because its `50%` child resolved to 20 during layout. Applications that need percentage-of-final-width behavior give the containing Box a definite width or leave it stretched. Percentage height is deliberately not accepted: nested auto-height Boxes make Yoga resolve it circularly and shrink content even when every host root is vertically unbounded. Numeric height has one stable cell meaning in every host. Percentage flex basis resolves against a definite main-axis size and otherwise falls back to the item's intrinsic basis.

#### Overlay anchored to a containing Box

```vue
<Box position="relative" :width="40" :height="10">
  <Content />
  <Box position="absolute" :right="1" :bottom="1">
    <Text inverse>busy</Text>
  </Box>
</Box>
```

Without `right` and `bottom`, the application must know the overlay's final size. `position="static"` is also real behavior rather than a synonym: it lets an intermediate Box decline to become the containing block for positioned descendants. Relative, absolute, static, and all four offsets therefore remain one positioning family.

Runtime uses left-to-right layout. `relative` is the default: the Box keeps its flow space, then an offset moves it without moving siblings; `left` wins over `right` and `top` wins over `bottom` when both apply. `absolute` leaves normal flow and uses the nearest non-static Box's padding box as its containing block. On an axis with automatic size, supplying both opposing offsets determines the outer size; with an explicit size, or when min/max constraints prevent satisfying both edges, `left` or `top` remains authoritative. A lone `right` or `bottom` still anchors that edge. `static` remains in flow, ignores offsets, and does not establish a containing block. Offsets accept signed cell counts or bounded percentages of the containing padding box; percentage offsets do not participate in the containing Box's intrinsic size.

#### Runtime-sized separator and clipping

```vue
<Box :height="8" overflow="hidden" overflowX="visible">
  <Table />
</Box>

<Box
  width="100%"
  borderStyle="single"
  :borderRight="false"
  :borderBottom="false"
  :borderLeft="false"
/>
```

An outside component cannot safely truncate final painted cells or draw a width-filling border edge without the laid-out rectangle. A specific overflow axis overrides the broad shorthand, so the first Box clips vertically but not horizontally. A hidden axis clips descendants at the Box's padding-box boundary, immediately inside the border; it does not erase the Box's own border or background. Every active ancestor clip remains intersected, so a descendant cannot reopen an outer hidden region. This intentionally does not copy Ink 7.0.4's run-verified `hidden`-wins or innermost-clip-only bugs.

#### Nested styles and long terminal text

```vue
<Text color="cyan" bold>
  Status: <Text color="green">ready</Text>
</Text>

<Text color="red" backgroundColor="blue">
  <Text color="default">{{ terminalForegroundMessage }}</Text>
  <Text backgroundColor="default">{{ terminalBackgroundMessage }}</Text>
</Text>

<Text bold>
  Selected <Text :bold="false" dimColor>secondary detail</Text>
</Text>

<Text wrap="truncate-middle">{{ repositoryPath }}</Text>
<Text wrap="hard">{{ fixedWidthRecord }}</Text>
```

Omitting a nested foreground or background independently inherits that channel from the enclosing Text. `color="default"` emits the terminal-default foreground for the subtree, while `backgroundColor="default"` independently emits the terminal-default background; leaving the other channel unspecified continues to inherit it, and leaving either subtree restores the enclosing resolved channel without resetting independent modifiers. `default` is the one clear replacement for the synonymous experimental names `revert` and `initial`. Text modifiers are resolved as a three-state cascade: omission inherits, `true` enables, and explicit `false` disables the modifier for that subtree without accidentally disabling a different modifier that shares an ANSI reset code. This intentionally corrects Ink's run-verified behavior where nested `bold={false}` remains bold. `wrap` prefers word boundaries but still breaks an over-wide word. `hard` never looks for word boundaries, so it fills the available line instead of moving a whole word merely because a space exists. Start and middle truncation are needed for paths, identifiers, and other strings where the distinguishing suffix or both ends matter; a utility cannot truncate them correctly before Runtime knows the final terminal-cell width.

Hard line breaks are preserved. Every logical line is truncated independently at the final cell width; truncating one line never discards or merges a later line. `truncate` is the only spelling for end truncation. An actually shortened line receives one single-cell `…` inside the width budget; a fitting line receives none, width zero produces an empty line, and width one produces only `…`. Truncation does not split a grapheme or terminal-wide character. Middle truncation gives an odd remaining cell to the prefix. A nested Text is a styled span rather than a separate layout box, so the outermost Text's `wrap` applies to its complete composed content; a nested `wrap` value has no independent effect.

#### Vue visibility

```vue
<Box v-show="visible">
  <Editor />
</Box>
```

`v-if` owns creation and lifecycle. `v-show` preserves the mounted subtree while removing a Box-rooted subtree from layout, paint, measurement, focus, and any later target-bound capability. This is the public Vue replacement for Ink's `display` prop.

### Complete Ink-baseline disposition

Pinned Ink 7.0.4 exposes 63 Box style fields plus four ARIA fields, and 11 non-children Text fields. The table accounts for all of them. "Retain" means retain the user capability with vue-tui's validated declarative semantics; it never means copying Ink's permissive string parsing or fixed-version bugs.

| Ink family                 | Exact Ink fields or values                                                                | vue-tui recommendation                                                                                                             | Reason and user-visible difference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Flex direction             | `flexDirection`: row, column, and both reverse values                                     | Retain the complete value set                                                                                                      | It is one stable Yoga choice. Restricting values after accepting the property creates an arbitrary hole; reversing arbitrary slot children outside Runtime is not generally equivalent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Flex wrapping              | `flexWrap`: nowrap, wrap, wrap-reverse                                                    | Retain the complete value set                                                                                                      | Responsive rows require Runtime layout. Reverse line stacking is the same accepted mechanism, not a new routing policy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Flex factors               | `flexGrow`, `flexShrink`, `flexBasis` number or string                                    | Retain bounded grow/shrink and number or normalized `0%`–`100%` basis                                                              | Grow and shrink are finite values from 0 through 65,535; numeric basis is a bounded non-negative cell count. The ceiling prevents a JavaScript-finite value from overflowing Yoga's float32 storage into invalid layout. Percentage basis resolves against a definite main-axis size and otherwise uses the intrinsic basis. Arbitrary strings, suffixes, values above `100%`, and Ink's integer-truncating percentage parser are rejected.                                                                                                                                                                                                                                                                                                                                                                                                            |
| Cross-axis layout          | `alignItems`, `alignSelf`, `alignContent`, including baseline and all distribution values | Retain start, center, end, stretch, and self auto; defer baseline and `alignContent`                                               | Per-child alignment is ordinary and independently supported by Ink and OpenTUI. Yoga's baseline fallback merely aligns bottom edges unless Runtime supplies a baseline function; vue-tui has no stable terminal rule for multiline Text or Box and no real task requiring one, so exposing that fallback would leak the engine. `alignContent` is a separate policy for distributing multiple wrapped lines inside extra cross-axis space; the accepted responsive-row journey does not require it, and OpenTUI does not expose it. Both omissions are additive.                                                                                                                                                                                                                                                                                       |
| Main-axis layout           | `justifyContent`, all six values                                                          | Retain all six                                                                                                                     | Same accepted distribution concept; current selected-value filtering is arbitrary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Gap                        | `gap`, `rowGap`, `columnGap`                                                              | Retain all three                                                                                                                   | Axis-specific values override `gap`; real apps and three independent peers use this authoring shape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Dimensions                 | `width`, `height`, `minWidth`, `minHeight`, `maxWidth`, `maxHeight`, `aspectRatio`        | Retain bounded number or normalized `0%`–`100%` width; retain numeric height and min/max; defer percentage height and aspect ratio | Numeric constraints and parent-relative horizontal panes are ordinary. Width percentages resolve from the containing Box's available inner-width constraint during layout, which may exceed its final shrink-to-fit width. Under an auto-height Box beneath the renderer root, Yoga can resolve a child's percentage height against the very intrinsic height that child helps create, shrink its layout below its content, and let a sibling overwrite the overflow. Runtime does not yet have a small cross-host definite-height rule that prevents this, so percentage height is not part of the minimum. Percentage min/max are inconsistent across axes and containing blocks; min/max therefore remain numeric. Aspect ratio is specialized, terminal cells are not physically square, and current scenarios do not require inferred dimensions. |
| Positioning                | `position`, `top`, `right`, `bottom`, `left`; offsets accept number or string             | Retain all fields, with relative/absolute/static and bounded numeric or percentage offsets                                         | Trailing-edge anchoring and containing-block control cannot be reconstructed from root size. The public LTR precedence and sizing rules are stated above rather than delegated to an unnamed Yoga behavior. Percentage offsets remain the same public value category as the reviewed shape and are range-checked before Yoga; arbitrary strings such as Ink's accepted `"12junk"` are rejected.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Margin                     | all, X, Y, and four physical edges                                                        | Retain all seven                                                                                                                   | One box-model concept. Edge > axis > all; withdrawing an override falls back to the surviving shorthand instead of reproducing Ink's stale explicit-zero bug.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Padding                    | all, X, Y, and four physical edges                                                        | Retain all seven                                                                                                                   | Same rule as margin; ordinary authoring should stay compact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Visibility                 | `display`                                                                                 | Omit in favor of Vue `v-show` and `v-if`                                                                                           | Vue supplies the public lifecycle-preserving and lifecycle-removing entries. Runtime retains the private display mechanism needed to implement `v-show`; raw `h()` code may use Vue's `withDirectives`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Overflow                   | `overflow`, `overflowX`, `overflowY`                                                      | Retain all three                                                                                                                   | Axis > broad > visible. A hidden axis clips descendants at the padding-box boundary inside the border, and all active ancestor clips intersect. Do not copy Ink's `hidden`-wins precedence bug or its innermost-clip-only bug.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Border style               | `borderStyle` accepts eight `cli-boxes` names or a custom glyph object                    | Retain `single` and `round`; defer the other six presets and custom glyph objects                                                  | A common straight or rounded border is foundational and has current application evidence. The other presets are visual choices rather than shorthand for an accepted box-model fact. A public custom-glyph grammar also needs its own single-cell validation and real theming need; all of these can be added without changing border ownership.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Border edges               | `borderTop`, `borderRight`, `borderBottom`, `borderLeft`                                  | Retain all four                                                                                                                    | Open panels, joined panels, and width-filling separators require Runtime to remove both the painted edge and its reserved cell. With `borderStyle`, every omitted or `undefined` edge is present; explicit `false` removes its glyph and reserved cell, and withdrawing a reactive override restores the edge. Without `borderStyle`, edge flags are inert.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Border foreground          | `borderColor` plus four edge colors                                                       | Retain only the broad `borderColor`                                                                                                | Ordinary theming remains direct. Differently colored edges on one Box are a specialized additive paint capability, not required by the accepted journeys.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Border dim                 | broad plus four edge booleans                                                             | Defer all five                                                                                                                     | This is a specialized border decoration, independently additive, and not required to compose the normal panel and separator set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Border background          | broad plus four edge colors                                                               | Defer all five                                                                                                                     | Same; Box content background and border foreground cover ordinary panels.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Box background             | `backgroundColor`                                                                         | Retain                                                                                                                             | It fills the laid-out Box rectangle, including padding and unused cells; Text background only colors glyph cells and is not a substitute.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ARIA                       | four Box fields and two Text fields                                                       | Remove                                                                                                                             | They only affect Ink's screen-reader presentation. vue-tui has explicitly removed that product mode from the current foundation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Text foreground/background | `color`, `backgroundColor`                                                                | Retain with the closed `Color` grammar and an explicit `default` escape on each channel                                            | Unknown strings do not silently render unstyled. Omission independently inherits the enclosing foreground or background. Explicit `default` actively selects the terminal-default value for that channel without resetting the other channel or modifiers, replacing the synonymous experimental names `revert` and `initial`. OpenTUI, Textual, and Ratatui independently expose terminal-default foreground and background resets.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Text modifiers             | `dimColor`, `bold`, `italic`, `underline`, `strikethrough`, `inverse`                     | Retain all six                                                                                                                     | These are one ANSI style family and every member appears in a pinned real Gemini CLI UI. Only Runtime can resolve and restore nested state correctly through wrapping and repaint. Omission inherits, `true` enables, and explicit `false` disables that modifier for the subtree; unlike Ink, a nested false is not silently defeated by the ancestor's outer ANSI wrapper.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Text wrap                  | wrap, hard, truncate/end alias, middle, start                                             | Retain wrap, hard, truncate, middle, and start; remove the end alias                                                               | The retained modes express distinct final-width tasks. `wrap` preserves word boundaries when possible, while `hard` deliberately ignores them; breaking a single over-wide word is not evidence for `hard` because ordinary `wrap` already does that. `truncate` has current application use, while middle and start preserve both ends or the suffix when those carry the distinguishing information. Carrying the exact synonym `truncate-end` adds no capability and conflicts with the minimum-name rule. Each hard-newline segment truncates independently. Actual deletion adds one budgeted `…`; zero and one-cell widths, grapheme integrity, and the middle-mode odd cell are defined above. This avoids Ink's run-verified behavior where truncating one over-wide line can discard or merge later lines.                                    |

### Vouched public shape

```ts
type Percentage = `${number}%`;
type Offset = number | Percentage;

export interface BoxProps {
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
  flexWrap?: "nowrap" | "wrap" | "wrap-reverse";
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | Percentage;
  alignItems?: "flex-start" | "center" | "flex-end" | "stretch";
  alignSelf?: "auto" | "flex-start" | "center" | "flex-end" | "stretch";
  justifyContent?:
    | "flex-start"
    | "center"
    | "flex-end"
    | "space-between"
    | "space-around"
    | "space-evenly";
  gap?: number;
  rowGap?: number;
  columnGap?: number;

  width?: number | Percentage;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;

  position?: "relative" | "absolute" | "static";
  top?: Offset;
  right?: Offset;
  bottom?: Offset;
  left?: Offset;

  margin?: number;
  marginX?: number;
  marginY?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;

  borderStyle?: "single" | "round";
  borderTop?: boolean;
  borderRight?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;
  borderColor?: Color;
  backgroundColor?: Color;
  overflow?: "visible" | "hidden";
  overflowX?: "visible" | "hidden";
  overflowY?: "visible" | "hidden";
}

export interface TextProps {
  color?: Color | "default";
  backgroundColor?: Color | "default";
  dimColor?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
  wrap?: "wrap" | "hard" | "truncate" | "truncate-middle" | "truncate-start";
}
```

`Percentage` and `Offset` above are explanatory TypeScript approximations; Runtime validation enforces the narrower canonical ranges. They are not separate public exports. `BoxProps`, `TextProps`, and `Color` remain named exports because third-party components accept and forward those complete primitive inputs. The props are authoring input types derived from Vue's public prop declarations, so their fields are not marked `readonly`; the actual props object received inside component setup remains Vue-shallow-readonly. The vouched shape does not export separate alignment, direction, wrap, preset-border, named-color, general style-bag, or layout-subset types.

The vouched Box has 46 public fields, but only nine conceptual groups: flex, gap, size constraints, positioning, margin, padding, borders, background, and clipping. The vouched Text has nine fields in three groups: color, ANSI modifiers, and width handling. Counting all seven margin spellings as seven unrelated primitives would misdescribe the user model.

Defaults are declarative current-prop defaults: row, nowrap, grow `0`, shrink `1`, stretch items, start justification, zero gaps and spacing, relative position, visible overflow, no border, and no background. Once `borderStyle` exists, all four edges default to present; an explicit `false` removes both the painted edge and its reserved cell, and withdrawing the value restores the edge. Outermost Text defaults to `wrap`, inherited terminal colors, and disabled modifiers; a nested Text inherits the enclosing resolved colors and modifiers unless it explicitly changes them. Omission, `undefined`, or reactive prop withdrawal restores the applicable outermost default or nested inheritance. This explicitly rejects Ink's run-verified bugs where `display={undefined}` hides, `flexDirection={undefined}` leaks Yoga's column default, and withdrawing an edge override leaves a stale zero that defeats the surviving shorthand.

Cell quantities are integers from 0 through 65,535. Margins and offsets use the signed range from -65,535 through 65,535; padding, gaps, dimensions, and numeric flex basis are non-negative. Flex grow and shrink may be fractional but must be finite and between 0 and 65,535. The ceiling is a private Runtime safety envelope rather than a separately exported capability constant; it prevents values that JavaScript regards as finite from overflowing Yoga's float32 storage.

Width and flex-basis percentages use canonical decimal text from `0%` through `100%`: `0%`, `0.5%`, `35%`, and `100.0%` are valid; a sign, whitespace, exponent, leading decimal point, unnecessary integer leading zero, arbitrary suffix, or value above 100 is not. Percentage offsets use the same grammar with an optional minus sign and a bounded absolute value; their exact safety envelope is an implementation behavior rather than another exported type. Values above the safe range are not accepted merely to provide speculative proportional overflow; a future additive widening would need a real task and a rule that cannot exceed Runtime's layout and paint resource bounds. Width and height are outer Box dimensions; border and padding consume their inner content area. Unknown component attributes fail before host creation. Raw strings must remain inside Text; Text may nest Text spans but not Box.

All visual hosts use the same accepted layout and paint rules. Fullscreen provides a finite root width and height; Inline may impose a finite height only when its live region must be bounded; string and final non-TTY rendering have a finite width and indefinite root height. Every render root therefore supplies a finite horizontal constraint. Percentage width is resolved during flex layout against the containing Box's available inner-width constraint after border and padding; for an auto shrink-to-fit Box, that constraint may be wider than its final computed box. Percentage height is not accepted, so shared components never acquire a host-dependent vertical percentage meaning. Color escape bytes still depend on the output's color capability; the semantic style contract does not promise ANSI on a color-disabled stream.

The target does not add `zIndex`, a portal or layer model, opacity, titles, markup, blink, hyperlinks, grid, order, arbitrary Yoga access, raw ANSI spans, or a broad `style` object. Those are outside the pinned Ink baseline or need a separate user task and contract. `Spacer` remains a growing Box and line breaks remain Text content.

### Peer and real-application evidence

- Pinned [Ink 7.0.4 Styles](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/styles.ts#L6-L406), [Box defaults](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/components/Box.tsx#L61-L112), and [Text](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/components/Text.tsx#L9-L144) provide the complete inventory and mature baseline. Narrow harnesses against that exact commit verified shorthand precedence, positioning, wrap modes, and the fixed-version reset and overflow bugs instead of inferring them from source.
- Pinned OpenTUI independently exposes [complete common flex and constraints](https://github.com/anomalyco/opentui/blob/34e78b2fbf18fd969efdf5f3e2589d17d1f536f1/packages/core/src/Renderable.ts#L50-L104), [gap variants](https://github.com/anomalyco/opentui/blob/34e78b2fbf18fd969efdf5f3e2589d17d1f536f1/packages/core/src/renderables/Box.ts#L17-L34), and [all/axis/edge spacing](https://github.com/anomalyco/opentui/blob/34e78b2fbf18fd969efdf5f3e2589d17d1f536f1/packages/web/src/content/docs/core-concepts/layout.mdx#L178-L203) through retained renderables, but does not simply publish every Yoga option. Pinned Textual exposes [margin](https://github.com/Textualize/textual/blob/06dbeef4bb70fb718236aa418ed658ef4667a126/docs/styles/margin.md#L1-L33), [padding](https://github.com/Textualize/textual/blob/06dbeef4bb70fb718236aa418ed658ef4667a126/docs/styles/padding.md#L1-L32), constraints, positioning, clipping, borders, and text styles through CSS. Pinned [Lip Gloss](https://github.com/charmbracelet/lipgloss/blob/5bd778d050f0a5a130e7cf041917927496dbe722/README.md#L167-L203) exposes CSS-style spacing shorthand and comparable box/text styling over strings. Their architectures differ, which is evidence for the recurring tasks rather than for copying Ink's exact React API.
- Gemini CLI at `87f785192c34067e4e8f26bda16cf9ce24014d83` is a real large Ink-style application rather than an API showcase. Its [SearchableList](https://github.com/google-gemini/gemini-cli/blob/87f785192c34067e4e8f26bda16cf9ce24014d83/packages/cli/src/ui/components/shared/SearchableList.tsx#L171-L262) uses percentage dimensions, `minWidth`, grow/shrink, both axes, alignment, `paddingX`, `marginX`, border, and width-aware truncation together; its [Table](https://github.com/google-gemini/gemini-cli/blob/87f785192c34067e4e8f26bda16cf9ce24014d83/packages/cli/src/ui/components/Table.tsx#L26-L84) uses grow/shrink/basis and border-edge flags. A complete source scan at that commit also finds actual UI use of all/axis/edge spacing and every proposed Text modifier, including italic help, underlined warnings and clickable results, strikethrough list items, and inverse table or match cells. This directly disproves treating shorthands, the coherent flex/edge families, or ordinary ANSI emphasis as speculative because vue-tui's much smaller consumer sample is silent. That commit uses an Ink fork based on 6.6.9, so it proves real demand for the API family, not exact behavioral parity with pinned Ink 7.0.4.
- Bubble Tea core has no persistent Box or Text primitive, so it is evidence for a different architecture but not evidence that a Yoga-backed Vue renderer should omit individual layout facts.

### Implementation result

Immediately before `f241d1c`, vue-tui publicly declared nearly the complete Ink Box/Text surface and tested it extensively. That commit mainly removed declarations, validators, examples, and public tests; the Yoga setters, spacing reconciliation, text modifiers, wrap implementation, border painter, clipping, and ANSI machinery largely remain private. The audit is therefore selecting from implemented and previously exercised mechanisms, not proposing a renderer rewrite.

The current implementation exposes exactly the reviewed fields and named authoring types. Eager validators enforce the bounded numeric, color, percentage, and unknown-attribute grammar before host creation; shorthand and axis-specific layout props reset and reconcile from current props; overflow uses the reviewed axis precedence; and layout and paint enforce the global cell-allocation bound.

Text now performs per-logical-line grapheme-safe wrapping or truncation, applies nested three-state modifiers, and resolves foreground and background defaults independently. Type fixtures, clean consumers, representative applications, string and final-stream tests, and terminal-visible clipping and style acceptance cover the result. Percentage height, the old permissive arbitrary-string grammar, private host types, `BoxLayoutStyle`, custom border objects, ARIA, and deleted advanced border decoration remain absent.

## Mount host contract

**Status:** the complete contract below was vouched on 2026-07-23 after Node stream review, run-verification of pinned Ink 7.0.4, comparison with Bubble Tea 2.0.6, OpenTUI 0.4.5, and Textual 8.2.8, and a bounded two-reviewer adversarial pass. It is implemented with focused lifecycle, stream, host, package-consumer, PTY, and restoration coverage.

### User tasks and minimum public shape

The normal application uses process streams and Inline mode without configuration. Tests, file output, embedding, and terminal wrappers may supply ordinary Node streams. Fullscreen is an explicit request rather than a hint:

```ts
createApp(App).mount();
createApp(App).mount({ stdout: new PassThrough() });
createApp(App).mount({ mode: "fullscreen" });
```

The accepted public shape is:

```ts
import type { Readable, Writable } from "node:stream";

export interface MountOptions {
  readonly stdin?: Readable;
  readonly stdout?: Writable;
  readonly stderr?: Writable;
  readonly mode?: "inline" | "fullscreen";
  readonly patchConsole?: boolean;
  readonly exitOnCtrlC?: boolean;
}
```

The three streams default to `process.stdin`, `process.stdout`, and `process.stderr`; mode defaults to Inline; console protection defaults on; and automatic Ctrl+C exit defaults off. `Readable` and `Writable` describe the protocols Runtime uses without falsely requiring every custom destination to be a complete TTY. Terminal-only facts such as raw-mode controls, `isTTY`, `columns`, and `rows` are detected separately. Web streams require explicit outside adaptation rather than adding a second writer and backpressure protocol to Runtime.

### Inline non-TTY output

Redirected Inline output is a final document, not a recording of reactive frames. Runtime emits no alternate-screen, cursor, erase, or mouse screen-management sequences. Each accepted `Static` history block appends when accepted, and coordinated console output remains immediate. Dynamic commits replace an internal current document; on clean teardown Runtime writes that current final document once. Empty dynamic output writes no bytes. Non-empty output gets a line ending only if it does not already have one. Error teardown does not replay an earlier successful dynamic document.

Ink 7.0.4 provides the closest model: run-verification showed that dynamic `A → B` writes nothing before unmount and then writes `B\n`, while Static output is immediate. The accepted vue-tui behavior deliberately differs for an empty dynamic document: Ink writes a newline, while vue-tui writes nothing. Bubble Tea, OpenTUI, and Textual remain terminal renderers on redirected streams and can emit ANSI or terminal-mode bytes, so their behavior is not appropriate for this final-document contract.

### Fullscreen capability

An explicit Fullscreen mount requires a TTY stdout and resolvable positive columns and rows. Missing capability synchronously throws before user setup, console patching, or terminal mutation; Runtime never silently changes the request to Inline. Ink, Bubble Tea, OpenTUI, and Textual are more permissive and may ignore alternate-screen requests, use fallback dimensions, or continue on non-TTY output. vue-tui deliberately chooses a truthful result because Inline and Fullscreen have different viewport and terminal-ownership semantics.

### Borrowed stream ownership

Caller-supplied streams remain owned by the caller. Runtime never calls `end()` or `destroy()` on them. It removes its listeners and restores only state it changed, including raw mode and ref state where applicable. Runtime closes only resources it created itself. The caller may close a file or socket after `waitUntilExit()` if desired. Ink, Bubble Tea, and OpenTUI independently follow this practical ownership rule.

### Used-stream failures

Runtime reports failures of operations and capabilities it is actively using rather than treating every event on every borrowed stream as fatal:

- Losing the mounted stdout host is fatal.
- A synchronous throw or callback error from a Runtime-accepted stdout or stderr write is fatal, including `EPIPE`.
- Closing stdout or stderr before an accepted write or backpressure transaction completes is fatal.
- Losing stdin is fatal only while active managed input requires it; input-free stdin EOF is not an application failure.
- A close without an `Error` receives a stable Runtime-created error, while an earlier real error keeps precedence.
- The first fatal cause is recorded when observed. Cleanup or restoration failures cannot replace it.
- A required final or restoration write that fails after clean exit has started changes that exit to rejection.

Runtime then rolls back resources and lets accepted output complete or be abandoned. `waitUntilExit()` rejects with the selected cause. `waitUntilRenderFlush()` remains a non-reporting barrier and does not duplicate that error. The reviewed peers have incomplete versions of this lifecycle: pinned Ink can leave initial write failure state behind and does not route asynchronous stream failure through its exit promise, while the other reviewed runtimes also drop or incompletely settle some write failures. Their mechanisms are evidence, not a contract to copy.

### Transactional preflight and acquisition

Mount proceeds in the following observable order:

1. Resolve and validate options, process-stream defaults, mode, stdout and stderr protocol state, stdout ownership, and Fullscreen TTY and dimensions.
2. Reserve stdout, establish rollback ownership, install stream observers, and install console protection before user component setup.
3. Run setup. If it creates active managed input demand, validate the mounted stdin before acquiring raw mode or other terminal resources.
4. Enter terminal modes and paint only after the required capabilities succeed.

Every acquired resource immediately registers its inverse cleanup, and failure rolls back in reverse order. A later inactive-to-active input transition rechecks stdin capability. A deterministic preflight failure neither mutates state nor consumes the app. Once a real attempt is consumed, `mount()` throws the original failure synchronously and `waitUntilExit()` rejects with that same cause after rollback.

### Invalid `exit` input

The typed component contract remains `exit(error?: Error): void`. On the first call before teardown, an untyped non-`Error`, non-`undefined` value synchronously throws `TypeError` without choosing or consuming the application's exit result:

```js
const { exit } = useApp();

try {
  exit("failure");
} catch {
  // The app is still running.
}
```

If the `TypeError` escapes, normal surrounding Vue or input error handling may still end the application. Once exit or teardown has started, later calls remain no-ops and do not validate arguments. This differs from Ink's arbitrary success-result channel, which is not part of vue-tui's accepted TypeScript API.

### Implementation result

The implemented public streams use base Node `Readable` and `Writable` protocols, `exitOnCtrlC` defaults to `false`, unavailable explicit Fullscreen fails during non-consuming preflight, empty final non-TTY output writes no bytes, and invalid `exit` input throws without choosing an exit result. Stream leasing, ordered output, reverse rollback, active-use failure detection, and first-cause settlement implement the borrowing and lifecycle rules above.

### Implementation evidence

- Declaration and clean-consumer checks accept process streams, `PassThrough`, file streams, sockets, and other ordinary Node `Readable` and `Writable` values without casts; Web streams remain rejected without explicit adaptation.
- Inline non-TTY tests cover current final output, empty output, existing line endings, Static and console exceptions, and clean versus error teardown without screen-control bytes or stale-frame replay.
- Fullscreen preflight tests cover non-TTY stdout, absent or invalid dimensions, busy stdout, no user setup, no console or terminal mutation, and retry after a non-consuming failure.
- Borrowing tests prove Runtime never ends or destroys caller streams and restores only listeners and state it changed.
- Failure tests cover synchronous write throws, callback errors, `EPIPE`, premature close with and without an `Error`, backpressure, active-input stdin loss, input-free EOF, first-cause precedence, failure during clean teardown, and final barrier settlement.
- Acquisition tests prove reverse rollback at each resource boundary and later inactive-to-active input capability checks.
- Untyped exit tests prove synchronous `TypeError`, continued operation when caught, normal outer error handling when uncaught, and no validation after teardown has started.

## `useStdin`

**Status:** retention and the complete low-level contract below were vouched on 2026-07-23 after local consumer and mechanism review, pinned Ink 7.0.4 source and runtime verification, and comparison with Bubble Tea, Textual, OpenTUI, and Ratatui. It is implemented with independent per-hook ownership and shared-stream, suspension, string-host, package-consumer, and restoration coverage.

### User task

Most components should consume the normalized `useInput()` contract. `useStdin()` is the explicit lower-level escape for a reusable component or third-party package that intentionally needs the selected stream and raw terminal input without privileged Runtime internals:

```ts
import { onMounted, onScopeDispose } from "vue";
import { useStdin } from "@vue-tui/runtime";

const { stdin, isRawModeSupported, setRawMode } = useStdin();

onMounted(() => {
  if (!isRawModeSupported) return;
  setRawMode(true);
  stdin.on("data", handleLowLevelInput);
});

onScopeDispose(() => {
  stdin.off("data", handleLowLevelInput);
  setRawMode(false);
});
```

A non-TTY pipe consumer may read the exact mounted `Readable` without requesting raw mode. A raw terminal consumer may implement an unmodeled key sequence or experiment with a protocol. The hook does not turn that behavior into normalized Runtime events.

### Why Runtime must provide it

The mount owner already knows the stream, but a reusable third-party component does not. More importantly, only Runtime can coordinate raw mode with active `useInput()` demand, multiple component scopes, suspension, resume, teardown, shared stdin, and the stream's externally owned baseline state. Requiring a component to call `stdin.setRawMode()` directly would bypass that ownership and could leave the shell raw or disable another consumer.

### Vouched public shape

```ts
import type { Readable } from "node:stream";

export interface UseStdinReturn {
  readonly stdin: Readable;
  readonly isRawModeSupported: boolean;
  readonly setRawMode: (enabled: boolean) => void;
}

export function useStdin(): UseStdinReturn;
```

Each hook call owns one idempotent logical hold. `setRawMode(true)` acquires that hold, repeated `true` does not acquire another, `false` releases only that hook's hold, and scope disposal releases it automatically. Managed `useInput()` uses its own internal hold. Physical raw mode stays active until every owner releases, Runtime temporarily restores terminal state during suspension, and resume reactivates surviving holds.

Raw-only acquisition does not attach Runtime's normalized parser or enable Kitty or bracketed-paste protocols. The caller owns its direct listener. If raw observation and `useInput()` are active together, both may observe the same physical input; Runtime promises no priority, deduplication, protocol filtering, or byte-exact composition between them. That limitation is explicit rather than presenting the low-level stream as another managed route.

Inline and Fullscreen share the same input contract. A non-TTY mounted stream remains available but reports `isRawModeSupported === false`. String rendering supplies an isolated inert `Readable`, reports no raw support, never touches `process.stdin`, and produces no input. It therefore preserves shared-component setup without claiming that a string document owns terminal input.

### Peer evidence

- Ink 7.0.4 exposes `stdin`, `setRawMode`, and `isRawModeSupported`; its input and focus hooks share the same raw-mode mechanism. The shape establishes a real component-level escape, but its anonymous count lets an unmatched `false` release another owner's hold and its input setup may change stream encoding. vue-tui keeps the familiar shape while giving each Vue hook call independent ownership and automatic scope cleanup.
- Bubble Tea configures the input reader at the Program owner and delivers messages to models, while Textual keeps stdin behind its Driver and delivers events to widgets. Those are coherent managed-only models, but they do not meet the accepted requirement that a third-party vue-tui component can implement alternative low-level input without application-specific forwarding.
- OpenTUI exposes the entire renderer, including stdin and ordered consumable input handlers. It proves the low-level extension need but carries a much broader public renderer surface than vue-tui requires.
- Ratatui deliberately owns no input and leaves the whole event loop to the application. That separation is coherent for a rendering library but does not fit a Runtime that already owns normalized input and terminal restoration.

### Implementation result

The public hook returns the exact base `Readable`, capability flag, and per-hook raw-mode setter. Each call owns one independent idempotent hold while Runtime's private reconciliation composes those holds with managed input, suspension, shared streams, and borrowed-stream baseline restoration.

The string host supplies and cleans up its isolated inert input stream. Internal ingress, parser, routing, Kitty, paste, mouse, and availability fields remain inaccessible to JavaScript as well as TypeScript consumers.

### Implementation evidence

- Public and packed-consumer types expose exactly the three accepted fields with `stdin: Readable`; no internal context field is reachable.
- Two `useStdin()` calls, active `useInput()`, and two apps sharing a stream cannot release one another's raw ownership. Repeated booleans are idempotent and scope cleanup releases forgotten holds.
- Raw-only use does not attach the Runtime parser, change stream encoding, or negotiate Kitty or bracketed paste. Its direct listener receives what the mounted stream delivers.
- Inline, Fullscreen, non-TTY, externally pre-raw input, suspension, resume, HMR, normal unmount, error teardown, and acquisition or restoration failure preserve the accepted ownership and borrowed-stream contracts.
- `renderToString()` uses only its inert isolated stream, reports no raw support, never observes `process.stdin`, and cleans the stream and hook scope on success or failure.
- Documentation distinguishes the safe normalized `useInput()` path from the intentionally unmanaged composition of direct stream listeners.

## `useFocus`

**Status:** the complete minimum contract below was accepted on 2026-07-24, is governed by the [decision ledger](./runtime-public-api-decisions.md#focus-handles-and-component-targets-use-one-vue-shaped-contract), and is implemented with focused component-root, host, lifecycle, public-only composition, declaration, and clean-consumer coverage.

### The two user tasks

A logical input owner may have no component that should define its rendered lifetime. It still needs to participate in the same unique focus as visible controls:

```ts
const editorMode = useFocus();
const commandMode = useFocus();

editorMode.focus();
commandMode.focus(); // replaces editorMode
```

A rendered editor needs a stronger guarantee: if the target component is removed or its rendered ancestry is hidden, it must stop claiming focus even when the editor does not know the outer visibility state. The target may be any stateful Vue component instance in the current vue-tui application:

```ts
import { useTemplateRef, type ComponentPublicInstance } from "vue";

const editor = useTemplateRef<ComponentPublicInstance>("editor");
const editorFocus = useFocus(editor);

useInput(handleEditorInput, {
  isActive: editorFocus.isFocused,
});
```

```vue
<!-- Parent.vue -->
<Box v-show="panelVisible">
  <Editor ref="editor" />
</Box>
```

When `panelVisible` becomes false, Runtime can see that the editor's Vue-rendered boundary has a hidden Runtime ancestor and clears `editorFocus`. Showing the panel again does not restore it; the application calls `editorFocus.focus()` when that is actually wanted.

### Exact public shape

The two forms are explicit overloads with one return type:

```ts
import type { ComponentPublicInstance, Ref } from "vue";

export type FocusTarget = Readonly<Ref<ComponentPublicInstance | null | undefined>>;

export interface UseFocusReturn {
  readonly isFocused: Readonly<Ref<boolean>>;
  focus(): void;
  blur(): void;
}

export function useFocus(): UseFocusReturn;
export function useFocus(target: FocusTarget): UseFocusReturn;
```

`FocusTarget` accepts a `useTemplateRef()`, `shallowRef()`, computed ref, or compatible readonly Vue ref. It does not accept a raw component instance or a getter. `null` and `undefined` are ordinary template-ref lifecycle states. A non-null value that is not a stateful component instance in the current vue-tui application is a `TypeError`.

`isFocused` uses the minimum read-only Vue `Ref` contract rather than exposing whether Runtime currently stores or computes the boolean. Both overloads return the same type because the target changes only the identity's validity, not the operations available to the caller. `focus()` and `blur()` return `void`, matching ordinary focus operations in the DOM, Ink, and OpenTUI; the resulting state is observed through `isFocused`.

Every call creates a distinct opaque focus identity in one per-app controller. The target is not that identity; the returned handle controls and observes only the identity created by that hook call. A valid `focus()` synchronously replaces the previous owner. `blur()` releases that handle when it is the owner. Focus does not automatically route input: an application connects it to the accepted broadcast input primitive through `isActive`.

```ts
useInput(handler, {
  isActive: focus.isFocused,
});
```

Global subscriptions that do not use this gate still receive input.

### Component-target normalization

Every stateful Vue component instance has one current root VNode. A normal multi-root template is represented by one Fragment VNode with renderer-owned boundary anchors, so Runtime does not need to select or publicly expose the individual roots.

Runtime privately normalizes the component root as Vue does:

- A host or text root follows its actual Runtime host.
- A single-root stateful component chain follows that one chain.
- A Vue development-root Fragment is unwrapped only when Vue's own single-root rule finds one effective root. This preserves direct `v-show` behavior for components such as `Box` and `Text`.
- A normal Fragment remains one component boundary represented by its anchors, regardless of how many children it contains. Runtime does not collect its roots, reject it, or select its first descendant.
- A Comment or null root is unavailable.

A normal multi-root Fragment therefore follows its mounted boundary and the visibility of the Runtime ancestors shared by the whole Fragment. Hiding one or all of its children inside the component does not make Runtime reinterpret the component boundary; code that wants a particular child to govern validity passes that child's component ref instead. Vue itself does not apply component-level `v-show` to a true multi-root component. An empty ordinary Fragment remains an attached boundary, while a Comment root is unavailable; focus validity is not a promise that the component paints a non-empty cell, just as a zero-sized Box may still be a valid target.

This rule rejects both accidental implementations considered during review: the current first-rendered-descendant resolver, whose meaning changes when Fragment children are reordered, and a collected-root region model, which would introduce partial visibility and multi-host transaction semantics that focus does not need.

### Exact difference between the overloads

| Event                                              | `useFocus()`                                            | `useFocus(target)`                                            |
| -------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| Another handle focuses successfully                | Loses focus                                             | Loses focus                                                   |
| The hook's Vue scope is disposed                   | Registration and current ownership are removed          | Registration and current ownership are removed                |
| A rendered ancestor uses `v-show="false"`          | Remains focused because no rendered target was supplied | Loses focus because Runtime sees the hidden rendered ancestry |
| The target ref becomes null or its boundary leaves | No target state exists to observe                       | Loses focus                                                   |
| A current root becomes a Comment                   | No target state exists to observe                       | Loses focus                                                   |
| The target becomes available again                 | No special behavior                                     | Does not regain focus                                         |

If the component that called targetless `useFocus()` is itself unmounted, its Vue scope ends and focus is removed. If an ancestor owns the targetless handle while only a descendant branch disappears, the handle remains valid. The targeted overload follows the supplied component boundary instead.

Calling `focus()` while the targeted handle is unavailable is a no-op: it does not clear another owner, throw, or create a pending request. If one accepted Vue render changes a target directly between two valid component boundaries, the opaque focus identity remains focused. If Runtime accepts an unavailable state between them, focus is cleared and later availability does not restore it.

The target therefore adds exactly one promise: the handle cannot remain the focused owner after its associated Vue-rendered boundary becomes unavailable or hidden through the boundary semantics above. It does not add input routing, Tab order, traversal, automatic focus, restoration, geometry, caret placement, pointer behavior, styling, or a visual focus ring.

### Why the parameter is named `target`

The parameter remains `target` and is described as a **rendered component target** in prose. The closest Vue precedent, [VueUse's `useFocus(target)`](https://vueuse.org/core/usefocus/), uses the same parameter name. Vue's own [template refs](https://vuejs.org/guide/essentials/template-refs) point to component instances, so `element`, `elementRef`, and `box` would be inaccurate. `renderTarget` commonly suggests an output container, `focusTarget` can be mistaken for the opaque focus identity, and `host` exposes renderer terminology users never pass.

The declaration documentation carries the distinction:

```ts
/**
 * A Vue ref whose component boundary controls this focus handle's rendered
 * availability.
 *
 * The target is not the focus identity and does not define input routing
 * or navigation. If the boundary becomes unavailable or its rendered ancestry
 * is hidden or detached, this handle loses focus. Later availability does not
 * restore focus.
 */
export type FocusTarget = Readonly<Ref<ComponentPublicInstance | null | undefined>>;
```

`FocusTarget` is a named type because third-party composables must be able to accept and forward the targeted overload without copying its source grammar. It is not generalized into `ElementTarget` or `RenderedTarget`, because other private renderer mechanisms may need different target semantics.

### Disabled behavior and explicit acquisition

`useFocus` has no `disabled`, `isActive`, `autoFocus`, `initialFocus`, `tabIndex`, or options object. Disabled state is application policy that a third-party composable can implement with the public handle:

```ts
const focus = useFocus(target);

watch(disabled, (value) => {
  if (value) focus.blur();
});

function requestFocus() {
  if (!disabled.value) focus.focus();
}
```

A component that wants focus on every Vue mount uses `onMounted(() => focus.focus())`. `v-show` does not remount a component, and Runtime does not convert visibility changes or unsuccessful calls into automatic acquisition.

### Host and lifecycle semantics

- Live Inline, Fullscreen, and Inline non-TTY mounted applications use the same focus state model. Output TTY capability does not govern logical focus; Fullscreen non-TTY fails its separate mount preflight before component setup.
- `renderToString()` provides an inert shared-component context: `isFocused.value` remains `false`, and `focus()` and `blur()` are no-ops.
- A targetless identity is usable during setup. A targeted call before its template ref is available is a no-op, so ordinary focus-on-mount uses Vue's `onMounted()`.
- Suspend and resume preserve current focus because the component scopes and renderer tree remain alive.
- Scope disposal, app cleanup, and mount rollback clear registrations and ownership. Calls through a retained disposed handle are no-ops.
- Calling `useFocus()` outside a vue-tui render tree is a programming error and throws immediately.

### Runtime boundary and higher-layer composition

A targetless focus store alone is easy to implement with Vue `provide`, `inject`, and a `shallowRef`. It belongs in Runtime only because it must atomically share ownership with target-bound identities. An outside store cannot replace a Runtime target's current ownership without a public bridge; the zero-argument overload is that bridge and is smaller than exposing the controller, registration methods, or manager.

Target-bound validity requires Runtime's accepted rendered tree and transaction timing. A public presence boolean is not an equivalent replacement: Vue `onMounted()` can run before the frame that accepts the target, while later visibility must not queue or restore focus. Runtime can associate the explicit request with the same render transaction without publishing general tree membership.

String lookup is independent higher-level addressing:

```ts
const focusByName = new Map<string, UseFocusReturn>();
focusByName.get("search")?.focus();
```

Applications and an optional public-only `@vue-tui/use` helper can choose registration, duplicate-name, and cleanup policy using the public handles. Runtime does not need an Ink-style global string namespace or manager.

### Peer evidence

- [Ink 7.0.4](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/hooks/use-focus.ts) registers targetless logical focus and optionally exposes string addressing through its manager. Its [ID example](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/examples/use-focus-with-id/use-focus-with-id.tsx) jumps directly among named children. That is real convenience for distant lookup, not a requirement for unique focus ownership.
- [OpenTUI](https://opentui.com/docs/core-concepts/renderables/#focus-management), [Textual](https://textual.textualize.io/guide/input/#controlling-focus), Blessed, and the DOM associate focus with an actual renderable, widget, or element. Their custom widgets are themselves render-tree nodes, whereas a Vue component may represent a host node, a component chain, or a Fragment.
- Vue's public template-ref type is `ComponentPublicInstance`, and Vue represents a multi-root template with one Fragment VNode. VueUse also accepts component refs and resolves their `$el`, but `$el` alone is insufficient here because Box, Text, and Fragment-root components may expose a boundary anchor. Runtime must privately normalize the supported Vue root forms without leaking VNodes.
- vue-tui retains Ink's useful targetless form and adds an optional Vue-native component binding. A self handle with `focus()` removes most of the need for Ink's string manager, while `useFocus(target)` supplies the ancestor-`v-show` guarantee that a logical-only registration cannot provide.

### Current implementation disposition

The existing private per-app controller, unique ownership, rendered-target transaction, and ancestor-visibility invalidation are reusable mechanisms. The pre-decision public experiment was not the target contract: it required a target, accepted `scope`, `disabled`, `tabIndex`, and `autoFocus`, exposed manager and routing behavior, returned booleans from its methods, and resolved an arbitrary component by selecting its first rendered descendant. Those policies and that resolver were not preserved merely because they had tests.

The completed implementation adds the targetless registration path without creating a second controller; changes the public handle to the accepted read-only `Ref` and void operations; removes navigation, restoration, scopes, manager, string lookup, focused-input routing, disabled policy, and automatic focus; and replaces first-descendant selection with the accepted component-root normalization. The private controller remains only for unique ownership and target validity. `useBoxPresence()` is removed rather than becoming a public prerequisite.

### Implementation evidence

- Several targetless and targeted calls in one or several component scopes prove one current identity per app and atomic replacement across both forms.
- Targetless focus survives ancestor `v-show` while its owning scope remains alive, and ends when that scope is disposed.
- Component targets cover direct Box and Text refs, nested single-root custom components, true multi-root Fragments, empty Fragments, Comment roots, direct and ancestor `v-show`, `v-if` removal, valid-to-valid root replacement, detach, unmount, wrong values, and cross-app refs without exposing or selecting a first descendant.
- Targeted focus clears under the accepted boundary rules; reappearance never restores it or the previous owner. An unavailable `focus()` leaves the existing owner untouched and creates no pending request.
- Explicit `onMounted(() => focus.focus())` works for an eligible target without turning a request made while unavailable into pending restoration.
- Input examples prove `isFocused` composes with `useInput({ isActive })` while unrelated broadcast subscriptions remain unaffected.
- Public declarations and Vue 3.4 and 3.5 clean-consumer fixtures distinguish the overloads, expose the exact named types, document target's narrow role, accept inferred custom-component template refs, and expose no manager, VNode, or renderer node.
- Inline TTY, Fullscreen TTY, Inline non-TTY, string rendering, suspend/resume, cleanup, mount rollback, and retained disposed-handle tests prove the accepted host and lifecycle semantics.
