# Public API contract & surface

> **Status:** inventory and enforcement record for the public contract currently implemented on the branch. The [Runtime public API decision ledger](./runtime-public-api-decisions.md) is authoritative for Yunfei's expressed judgments; the [Runtime public foundation re-audit](./runtime-public-foundation-reaudit.md) records implementation results and evidence. The root and `/inline` contract below match the accepted target. Official Vite and testing packages use narrow unsupported `/internal/devtools` and `/internal/testing` entries; the former public-looking `/devtools` and `/testing` package paths are absent.

What is — and isn't — part of `@vue-tui/runtime`'s public contract, and how the contract is
tested. The checklist a new API proposal must satisfy lives in
[autonomous-iteration](./autonomous-iteration.md#review-template-for-each-proposed-api). Behavioral _divergences_ from Ink live in
[ink-divergences](./ink-divergences.md); this file is about the SHAPE of the public surface itself.

## Experimental stability policy

Here, “public contract” means the authoring surface intentionally supported, documented, typed, and tested in the current version. It does not promise cross-release backward compatibility while vue-tui remains experimental. Under the [vouched product policy](./intent.md#api-stability-during-experimentation), a public value, type, option, path, or behavior may be renamed, moved, changed, or removed directly when an accepted target design supports that change; aliases, deprecation windows, and runtime shims are not required merely because an API shipped before 1.0.

The public-surface guards remain important. They make every change deliberate, prevent accidental exports or type drift, and prove that the resulting current API is internally coherent. A clean-slate change updates the implementation, value and type guards, documentation, examples, tests, and first-party consumers together.

The target contract keeps only facts and operations that an external layer cannot reproduce correctly without Runtime ownership. Numeric `useLayoutSize()` and direct-Box `useBoxMetrics()` are the implemented minimum layout facts. Runtime privately retains coherent layout dimensions plus the rendered-target and accepted-layout transaction required by those hooks; the broader render-session graph, general paint fragments, and caret coordinates were removed.

The vouched Focus target is one `useFocus()` return contract with two explicit overloads. Every call creates a distinct opaque identity in one private per-app controller; `useFocus()` follows its Vue scope, while `useFocus(target)` additionally follows a readonly ref to a current-app stateful component's rendered boundary. The handle exposes only readonly `isFocused`, `focus(): void`, and `blur(): void`. Valid acquisition synchronously replaces the previous owner. Unavailable, disposed, and string-rendering operations are inert without queued acquisition; target loss, scope disposal, rollback, and cleanup clear ownership without restoration. Runtime exposes no manager, focus scopes, traversal, Tab handling, disabled or automatic-focus policy, string lookup, focused-input routing, geometry, or renderer nodes. See the [vouched review](./api-contract.md#usefocus) and completed implementation evidence in the [re-audit](./runtime-public-foundation-reaudit.md#path-3-normalized-input-and-minimum-focus-without-routing-policy).

The current branch exposes one broadcast `useInput()` subscription with the named `TuiInputEvent`, `TuiKey`, and `TuiKeyName` types. Events discriminate on `type: "text" | "key" | "paste"`: non-empty insertion text may carry one complete reliable nested key, key-only input requires that nested key and has no text, and bracketed paste carries one complete payload including an empty payload and has no key. A key has exactly one normalized semantic name or one logical character plus `shift`, `alt`, `ctrl`, `meta`, `super`, and `hyper`; suggested known names retain a forward-compatible lower-kebab-case string tail. Protocol, raw sequence, parser token, codepoint, base-layout identity, locks, release, and unsupported input remain private.

`useInput()` accepts a direct handler or live handler ref and resolves it when input arrives; `isActive` is a reactive boolean source and defaults to true. Every active subscription receives each event, returns are ignored, repeats are ordinary events, and releases are not delivered. Focus, priority, routing, propagation, and ordering policy remain outside the result contract. `MountOptions.exitOnCtrlC` defaults to false, which delivers exact Ctrl+C normally; true exits before that key reaches subscribers, while paste never triggers it. A focus handle composes through `useInput(handler, { isActive: focus.isFocused })` without turning focus ownership into routing. This implements the [vouched event decision](./runtime-public-api-decisions.md#useinput-exposes-one-tagged-text-key-and-paste-event-contract) and [vouched delivery decision](./runtime-public-api-decisions.md#useinput-is-a-live-broadcast-subscription-without-propagation-results).

`useStdin()` returns exactly `{ stdin: Readable, isRawModeSupported: boolean, setRawMode(enabled): void }`. Every call independently owns one idempotent logical raw-mode hold and Vue scope cleanup; managed input owns a separate hold, so one consumer cannot disable another. Raw-only use does not start Runtime parsing, change encoding, or negotiate Kitty or bracketed paste, while caller-owned direct listeners have no ordering, deduplication, protocol-filtering, or byte-exact composition guarantee with managed input. Non-TTY streams remain observable without raw support, and string rendering uses an isolated inert stream that never touches `process.stdin`. Runtime does not expose stdin ingress, input availability, parser, route, protocol configuration, or `useRawInput()`. See the [vouched low-level input decision](./runtime-public-api-decisions.md#usestdin-remains-a-complete-low-level-input-escape).

Runtime lifecycle exposes `createApp()`, a finite `MountOptions` host choice, `useApp().exit()`, and the app-owner barriers `waitUntilRenderFlush()` and `waitUntilExit()`. The public mount fields are exactly `stdin?: Readable`, `stdout?: Writable`, `stderr?: Writable`, `mode`, `patchConsole`, and `exitOnCtrlC`; omitted streams select their corresponding process streams and omitted mode selects Inline. Explicit Fullscreen on a live TTY requires positive dimensions and otherwise fails synchronously before setup or mutation. A non-TTY stdout selects the same fixed-80×24 document host for either mode without terminal controls or intermediate dynamic frames. Deterministic preflight, including busy-stdout ownership, is non-consuming; a failure after acquisition begins consumes the attempt, synchronously throws the original error, and rejects `waitUntilExit()` with that same object after rollback. Caller streams remain borrowed, final non-TTY output is one newline-normalized current document after immediate Static and coordinated output, and active stream loss or write failure enters first-cause lifecycle settlement. Output coordination, scheduler cadence, terminal acquisition, suspend/resume, restoration, and first-cause selection remain Runtime mechanisms rather than general application APIs. The vouched console contract is implemented as default-on protection, a `false` escape hatch, normally nested application registrations, installation before user components run, release after Vue cleanup, and forwarding without content-based filtering.

**Implemented superseding decision, 2026-07-23:** `waitUntilRenderFlush()` is an always-callable barrier for already-accepted work, not a mounted-state validator. It resolves immediately before mount and after completed exit, waits for accepted work while mounted, and waits for already-started teardown output without reporting the exit result; `waitUntilExit()` remains authoritative for complete restoration, accepted output, and the first fatal error.

The contract exposes one prop-free `Static` value on `@vue-tui/runtime/inline`; Vue iteration owns collection identity while Runtime owns irreversible acceptance. A mounted instance participates immediately regardless of ancestor or direct `v-show`. An output-free render leaves the instance open until a later render produces non-empty bytes or ordinary Vue unmount removes it; `v-if` controls whether the instance exists. Only blocks represented by non-empty bytes in the current settlement transaction settle; acceptance commits once, releases the slot subtree through ordinary Vue lifecycle, and prevents later changes from rewriting history. Blocks accepted together use current rendered host-tree preorder, later eligibility appends without moving history, ordinary conditional unmount cannot erase accepted bytes, remount creates a new block, accepted non-TTY blocks append immediately, string rendering includes current non-empty Static blocks before the dynamic document regardless of `v-show`, and true Fullscreen throws.

The supported authoring path permits Static through roots, components, Fragments, and ordinary Box structure. Its output is an isolated block rather than an ancestor-laid-out node, so ancestor size, padding, flex, clipping, display, and visual order do not shape it. Other placement and nesting combinations are unsupported and add no public normalization, diagnostic, recovery, or Static-specific failure-timing contract. Private host validation, batch sealing, cleanup isolation, retry prevention, rollback, and first-cause bookkeeping remain implementation mechanisms governed by the general Vue, stream, mount, and app-lifecycle contracts.

`renderToString()` has a TypeScript options surface of exactly `readonly width?: number` and `readonly height?: number`. Width defaults to 80; height defaults to 24 and accepts explicit `Infinity` for an unbounded document. Runtime reads only those keys and ignores unrelated string or symbol keys without reading their values. Shared components observe the modeled values through `useLayoutSize()`. `useApp().exit()` is an inert no-op in this host. String rendering owns the root VNode and a render-local Yoga allocation ledger so an initial Vue patch failure still disposes all created Vue scopes and inert streams, frees every Yoga node allocated for that render, and rethrows the original error.

The current contract has no screen-reader presentation, ARIA component props or named types, `INK_SCREEN_READER` selection, transcript renderer, internal screen-reader string helper, or testing-only presentation selector. Removed live-mount inputs and component props are rejected by their closed surfaces; a removed field passed only as an unrelated `renderToString()` runtime key is ignored without being recognized. The historical accessibility experiment is recorded in [accessibility-api](./removed-experiments.md#screen-reader-presentation-and-aria), but neither a public nor hidden support path remains.

A component must not inspect the ambient rendering mode and quietly change what it means. One name has one contract; if a capability only exists under one [history-ownership model](./intent.md#rendering-modes), the component says so by failing on the other surface rather than by silently becoming a different feature. `Static` is the worked example: it commits terminal history, which only Inline delegates to the terminal, so a true Fullscreen surface rejects it instead of reinterpreting it as viewport content. A mode-dependent meaning would make an author read the mount call to know what a component in their template does.

The common rendering vocabulary is `Box` and `Text`. Newlines and flex spacers stay out of Runtime and ship as `@vue-tui/components` `Newline` and `Spacer`, composed only from public Runtime APIs; animation, transforms, broad Yoga styles, physical caret, pointer routing, arbitrary painted-Text selection, clipboard transport, and arbitrary coordinated stdout/stderr are not part of the minimum public foundation. The physical caret, pointer, selection, and clipboard experiments were removed rather than retained as hidden features. `ScrollBox` retains Boolean scroll results because an outer application can use them to decide whether to continue its own routing.

Vue's Box-rooted `v-show` behavior remains supported renderer behavior; `Box` exposes no public `display` prop. Nested Text foreground and background independently inherit when omitted and select the terminal default through `color="default"` or `backgroundColor="default"`. The six `dimColor`, `bold`, `italic`, `underline`, `strikethrough`, and `inverse` modifiers use omission, `true`, and `false` as inherit, enable, and disable states, while `wrap` accepts exactly `"wrap"`, `"hard"`, `"truncate"`, `"truncate-middle"`, and `"truncate-start"`. These features need Runtime host and paint semantics but add no policy hook.

## The contract = exports from supported package entry points **and their user-consumable types**

The common authoring entry exposes exactly these values:

```ts
import {
  Box,
  Text,
  createApp,
  renderToString,
  useApp,
  useBoxMetrics,
  useFocus,
  useInput,
  useLayoutSize,
  useStdin,
} from "@vue-tui/runtime";
```

The root also exports only the named user-consumable types associated with those values: `TuiApp`, `MountOptions`, `RenderToStringOptions`, `BoxProps`, `Color`, `TextProps`, `UseAppReturn`, `FocusTarget`, `UseFocusReturn`, `TuiInputEvent`, `TuiKey`, `TuiKeyName`, `UseStdinReturn`, `UseLayoutSizeReturn`, and `UseBoxMetricsReturn`.

The selected supported subpaths are deliberately small:

| Package entry                   | Public values    | Intended consumer                          | Why it is public                                                                                                           |
| ------------------------------- | ---------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `@vue-tui/runtime/inline`       | `Static`         | Applications using Inline terminal history | Runtime alone can turn a mounted Vue slot tree into irreversible terminal history.                                         |
| `@vue-tui/runtime/package.json` | Package metadata | Version-matched tooling and guide lookup   | Consumers can resolve the shipped Runtime version and visual-development guide without depending on private `dist` layout. |

`/fullscreen` is absent because Fullscreen is a mount mode rather than a separate component or composable universe. Per-area implementation evidence — which test proves which contract — is maintained in the [re-audit](./runtime-public-foundation-reaudit.md), not duplicated here.

The independent higher layer now has two supported entries. The `@vue-tui/use` root exports exactly the `useInputWhileMounted` value and named `InputWhileMountedTargetRef` type. `@vue-tui/use/components` exports exactly the `UseInputWhileMounted` value and named `UseInputWhileMountedProps` type. Its lifecycle contract is recorded in [input-while-mounted](./input-while-mounted.md); it composes only the public Runtime root and does not expand Runtime's own foundation.

The Runtime public API is everything exported from the common root (`@vue-tui/runtime`) and every explicitly documented supported public subpath, together with **their types**: component prop types, composable return/options types, and named types such as `UseBoxMetricsReturn`, `BoxProps`, `UseXReturn`, and `UseXOptions`. A package `exports` entry is not sufficient by itself; the path becomes supported only when the project documents and guards it as an authoring surface. The same value-and-type rule applies to the separate public `@vue-tui/use` root.

A type is **as much a part of the current contract as runtime behavior**. If user code can name a type and annotate with it, changing or removing it changes the supported authoring surface at compile time. That is allowed during experimentation when deliberate, but the type surface must be designed, updated, and tested with the same care as runtime behavior.

Because it is contract, it is **tested, not merely shipped**:

- `public-api.test.ts` snapshots the **exact** Runtime common-root value-export set, and the `@vue-tui/use` root and `/components` entry each have an exact guard — adding, removing, or renaming a value fails the owning package's test, so every surface change must be deliberate. Each supported public subpath needs its own exact value-export guard, named-type checks, declaration inspection, and clean package consumer. Type-only exports are erased at runtime, so the type surface is guarded individually rather than exhaustively snapshotted. The removed presentation option, ARIA names, environment behavior, and helper paths have negative package and runtime guards rather than private compatibility shims.
- Type-safety behavior is established by running the type-checker against real TSX and template usage, never assumed. The historical ARIA experiment in [accessibility-api](./removed-experiments.md#screen-reader-presentation-and-aria) remains evidence that permissive template global attributes cannot replace a closed Runtime semantic contract.

## Explicitly outside this foundation

- `@vue-tui/use` is a replaceable public-only higher layer and is not part of the Runtime foundation. Its current lifecycle helper does not add a Runtime primitive, target route, or privileged dependency.
- No physical caret, pointer targeting, arbitrary painted-text selection, OSC 52 clipboard, child-PTY forwarding, or generic terminal-protocol transaction is promised.
- No screen-reader or ARIA contract is claimed.
- No component catalog, formatted error screen, application policy, release, or 1.0 compatibility promise is part of this foundation.
- Private implementation breadth is not a public API defect by itself. Reopen it only for correctness, measured performance, maintainability, or a concrete public capability.

## Exact public shapes

These are the declarations, defaults, and validation rules the accepted rulings adopt. They were relocated here on 2026-07-25 from the item-by-item review so that one file holds the surface and the decision ledger holds the judgments.

### `Box` and `Text`

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
  alignContent?:
    | "flex-start"
    | "center"
    | "flex-end"
    | "stretch"
    | "space-between"
    | "space-around"
    | "space-evenly";
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
  aspectRatio?: number;

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

  borderStyle?:
    | "single"
    | "double"
    | "round"
    | "bold"
    | "singleDouble"
    | "doubleSingle"
    | "classic"
    | "arrow"
    | BorderCharacters;
  borderTop?: boolean;
  borderRight?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;
  borderColor?: Color;
  borderTopColor?: Color;
  borderRightColor?: Color;
  borderBottomColor?: Color;
  borderLeftColor?: Color;
  borderDimColor?: boolean;
  borderTopDimColor?: boolean;
  borderRightDimColor?: boolean;
  borderBottomDimColor?: boolean;
  borderLeftDimColor?: boolean;
  borderBackgroundColor?: Color;
  borderTopBackgroundColor?: Color;
  borderRightBackgroundColor?: Color;
  borderBottomBackgroundColor?: Color;
  borderLeftBackgroundColor?: Color;
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

The Box has 62 public fields, but only nine conceptual groups: flex, gap, size constraints, positioning, margin, padding, borders, background, and clipping. The vouched Text has nine fields in three groups: color, ANSI modifiers, and width handling. Counting all seven margin spellings as seven unrelated primitives would misdescribe the user model.

Defaults are declarative current-prop defaults: row, nowrap, grow `0`, shrink `1`, stretch items, start justification, zero gaps and spacing, relative position, visible overflow, no border, and no background. Once `borderStyle` exists, all four edges default to present; an explicit `false` removes both the painted edge and its reserved cell, and withdrawing the value restores the edge. Outermost Text defaults to `wrap`, inherited terminal colors, and disabled modifiers; a nested Text inherits the enclosing resolved colors and modifiers unless it explicitly changes them. Omission, `undefined`, or reactive prop withdrawal restores the applicable outermost default or nested inheritance. This explicitly rejects Ink's run-verified bugs where `display={undefined}` hides, `flexDirection={undefined}` leaks Yoga's column default, and withdrawing an edge override leaves a stale zero that defeats the surviving shorthand.

Cell quantities are integers from 0 through 65,535. Margins and offsets use the signed range from -65,535 through 65,535; padding, gaps, dimensions, and numeric flex basis are non-negative. Flex grow and shrink may be fractional but must be finite and between 0 and 65,535. The ceiling is a private Runtime safety envelope rather than a separately exported capability constant; it prevents values that JavaScript regards as finite from overflowing Yoga's float32 storage.

Width and flex-basis percentages use canonical decimal text from `0%` through `100%`: `0%`, `0.5%`, `35%`, and `100.0%` are valid; a sign, whitespace, exponent, leading decimal point, unnecessary integer leading zero, arbitrary suffix, or value above 100 is not. Percentage offsets use the same grammar with an optional minus sign and a bounded absolute value; their exact safety envelope is an implementation behavior rather than another exported type. Values above the safe range are not accepted merely to provide speculative proportional overflow; a future additive widening would need a real task and a rule that cannot exceed Runtime's layout and paint resource bounds. Width and height are outer Box dimensions; border and padding consume their inner content area. Unknown component attributes fail before host creation. Raw strings must remain inside Text; Text may nest Text spans but not Box.

All supported renderers use the same accepted Box layout and paint rules. Live-TTY Fullscreen and Inline provide finite root width and height. Explicit `renderToString()` defaults to a modeled finite 80×24 root and may select an unbounded root height with `height: Infinity`; the mounted non-TTY document host uses the same fixed default 80×24 model. Every supported renderer therefore supplies a finite horizontal constraint. Percentage width is resolved during flex layout against the containing Box's available inner-width constraint after border and padding; for an auto shrink-to-fit Box, that constraint may be wider than its final computed box. Percentage height is not accepted, so shared components never acquire a host-dependent vertical percentage meaning. Color escape bytes still depend on the output's color capability; the semantic style contract does not promise ANSI on a color-disabled stream.

The target does not add `zIndex`, a portal or layer model, opacity, titles, markup, blink, hyperlinks, grid, order, arbitrary Yoga access, raw ANSI spans, or a broad `style` object. Those are outside the pinned Ink baseline or need a separate user task and contract. `Spacer` remains a growing Box and line breaks remain Text content.

### `useBoxMetrics`

**Status:** Yunfei vouched the target public shape on 2026-07-24 after reviewing the current `useBoxSize()` experiment, the earlier vue-tui implementation, pinned Ink 7.0.4, ordinary anchored-layout code, and a bounded adversarial capability audit. It is implemented with direct-target, lifecycle, coherent-snapshot, parent-relative layout, declaration, and clean-consumer evidence.

```ts
export interface UseBoxMetricsReturn {
  readonly width: Readonly<Ref<number>>;
  readonly height: Readonly<Ref<number>>;
  readonly left: Readonly<Ref<number>>;
  readonly top: Readonly<Ref<number>>;
  readonly hasMeasured: Readonly<Ref<boolean>>;
}

export function useBoxMetrics(
  target: Readonly<Ref<InstanceType<typeof Box> | null | undefined>>,
): UseBoxMetricsReturn;
```

The hook replaces rather than aliases the experimental `useBoxSize()`. It accepts a readonly Vue ref bound directly to the exported `Box` in the current application. It does not accept renderer nodes, arbitrary objects, Text, another application's Box, getters, or a component whose descendants would need to be searched.

`width` and `height` are the Box's complete outer layout size. `left` and `top` are the Box's outer-layout offsets in its direct layout parent's coordinate system; they are not terminal or root-render-surface coordinates. Together the four numeric refs describe the complete parent-relative layout rectangle that Yoga alone can determine after flex sizing, margins, siblings, and wrapping. A same-parent anchored overlay can therefore use `left`, `top + height`, and `width` without rebuilding Runtime layout.

Before the first accepted measurement and while the target is detached, unmounted, retargeted, or excluded from layout by `v-show`, the four numbers are zero and `hasMeasured` is false. A real zero-sized Box has zero numbers and `hasMeasured` true. A pending repaint or temporary suspension for the same target retains the last accepted values; an accepted resize, sibling-driven layout change, or target layout change publishes all four numeric facts from one coherent internal snapshot. The public refs are readonly even if the implementation derives them from one private atomic state.

This contract does not publish root-render-surface coordinates, terminal coordinates, clipping or visibility rectangles, paint fragments, renderer or Yoga nodes, pointer targeting, caret placement, or a layer and portal model. Those form a separate spatial capability and are explicitly outside this Box-layout measurement contract.

The former imperative `measureElement()` is not retained. Ordinary reactive measurement, reading the current metrics in an event handler, and copying one accepted result for later use all use `useBoxMetrics()`. A dynamic collection can put the hook in each item component and report the accepted metrics to its parent, so third-party higher layers are not blocked. A second API that reads an arbitrary Box on demand would mainly avoid that composition while introducing a separate answer for pre-layout, pending, hidden, detached, failed-output, and stale-layout reads. The minimum foundation keeps one coherent measurement model instead.

Pinned [Ink 7.0.4 `useBoxMetrics`](https://github.com/vadimdemedes/ink/blob/40b3a7578811fd616341ca4e31cc7748aeeff12f/src/hooks/use-box-metrics.ts) independently exposes `width`, `height`, parent-relative `left` and `top`, and `hasMeasured`. vue-tui follows the same complete layout facts while using readonly Vue refs, a direct Vue Box template ref, accepted Runtime commits, and no public host node.

### `useFocus`

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

#### Component-target normalization

Every stateful Vue component instance has one current root VNode. A normal multi-root template is represented by one Fragment VNode with renderer-owned boundary anchors, so Runtime does not need to select or publicly expose the individual roots.

Runtime privately normalizes the component root as Vue does:

- A host or text root follows its actual Runtime host.
- A single-root stateful component chain follows that one chain.
- A Vue development-root Fragment is unwrapped only when Vue's own single-root rule finds one effective root. This preserves direct `v-show` behavior for components such as `Box` and `Text`.
- A normal Fragment remains one component boundary represented by its anchors, regardless of how many children it contains. Runtime does not collect its roots, reject it, or select its first descendant.
- A Comment or null root is unavailable.

A normal multi-root Fragment therefore follows its mounted boundary and the visibility of the Runtime ancestors shared by the whole Fragment. Hiding one or all of its children inside the component does not make Runtime reinterpret the component boundary; code that wants a particular child to govern validity passes that child's component ref instead. Vue itself does not apply component-level `v-show` to a true multi-root component. An empty ordinary Fragment remains an attached boundary, while a Comment root is unavailable; focus validity is not a promise that the component paints a non-empty cell, just as a zero-sized Box may still be a valid target.

This rule rejects both accidental implementations considered during review: the current first-rendered-descendant resolver, whose meaning changes when Fragment children are reordered, and a collected-root region model, which would introduce partial visibility and multi-host transaction semantics that focus does not need.

#### Exact difference between the overloads

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

#### Disabled behavior and explicit acquisition

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

#### Host and lifecycle semantics

- Supported live-TTY Inline and Fullscreen applications use the same focus state model. The mounted non-TTY document host remains a mounted Vue application and may use the same logical focus controller, but managed `useInput()` is inert there; document-host support does not imply interactive focus parity.
- `renderToString()` provides an inert shared-component context: `isFocused.value` remains `false`, and `focus()` and `blur()` are no-ops.
- A targetless identity is usable during setup. A targeted call before its template ref is available is a no-op, so ordinary focus-on-mount uses Vue's `onMounted()`.
- Suspend and resume preserve current focus because the component scopes and renderer tree remain alive.
- Scope disposal, app cleanup, and mount rollback clear registrations and ownership. Calls through a retained disposed handle are no-ops.
- Calling `useFocus()` outside a vue-tui render tree is a programming error and throws immediately.

## Repository internals are not a package contract

There is no broad `@vue-tui/runtime/internal` package export. Repository tests may build a private `dist/internal.mjs` bridge so their symbols share identity with the built public bundle, but that file is excluded from the published tarball and cannot be imported through the package export map.

The branch exports `@vue-tui/runtime/internal/devtools` with `connectDevtools(hot)` and `@vue-tui/runtime/internal/testing` with `createTestHostBridge()` plus its three bridge/frame types. Their behavior is necessary because the separately published official Vite and testing packages must coordinate with private Runtime-owned HMR state, accepted commits, production-parser input, deterministic suspension, and resume. They are privileged, version-coupled official implementation channels rather than public third-party integration contracts. Node package exports cannot make an entry importable only by selected packages, so these shipped internal entries remain unsupported by contract even though another consumer can technically resolve them.

`@vue-tui/runtime/package.json` remains a supported metadata path used to locate the version-matched shipped visual-development guide; metadata resolution is supported without promising every JSON field as an independent API.

Placement rule for any export:

- A user-facing contract whose semantics are common across supported rendering surfaces → the **main barrel**.
- A user-facing contract that intentionally requires one explicit terminal surface → a documented **public subpath**, when that boundary is part of the selected design rather than a directory-organizing convenience.
- A version-coupled protocol used only by official Runtime tooling → a narrow **internal package entry** when separate package publication requires one; it is not a supported public API.
- Needed only inside Runtime or repository white-box tests → a source-private module or unpublished repository test barrel.

Packaging/build internals (the `exports` field shape, `.mjs` paths, `dist` layout) are likewise
**not** part of the behavioral/type contract and are not aligned to Ink — see the alignment-scope
note in [ink-divergences](./ink-divergences.md).

### Historical incidental exposure: `TuiNode` via `TuiApp`

`TuiNode` is an `/internal` type, but it is **incidentally reachable** through the public `TuiApp`, which `extends Omit<App<TuiNode>, "mount">` to inherit Vue's full app surface — Vue's `App<HostElement>` carries the host type on its internal `_container` field. This is a **conscious non-fix, not a supported authoring contract**: `_container` is a Vue-internal field no consumer uses, so the exposure is cosmetic. Narrowing it (`App<unknown>` / a `Pick<App, …>` allowlist) was considered and skipped as ceremony without user-visible benefit. Treat `TuiNode`-through-`TuiApp` as unsupported and don't re-flag it. [VOUCHED @hyfdev]

**Implemented superseding decision, 2026-07-22:** `TuiApp` projects the public keys of the consumer's installed Vue `App` type, excludes underscore-prefixed private app fields and `TuiNode`, replaces Vue's DOM-oriented `mount()`, and returns the actual user root instance. The historical paragraph above explains the previous implementation but no longer describes the current contract. See the [vouched decision](./runtime-public-api-decisions.md#createapp-retains-the-documented-vue-application-model) and [current item review](./runtime-public-foundation-reaudit.md#createapp-and-tuiapp).
