# @vue-tui/runtime API design

This record owns the non-obvious application-facing design and implemented contract of `@vue-tui/runtime`. The [Runtime public API decision ledger](./runtime-public-api-decisions.md) is authoritative for Yunfei's judgments. Export declarations, public type tests, behavior tests, and package-export tests remain authoritative for exact machine-checkable inventory.

## Supported package entries

| Entry                                | Public surface                                                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@vue-tui/runtime`                   | `createApp`, `renderToString`, `Box`, `Text`, `useApp`, `useInput`, `useStdin`, `useLayoutSize`, `useBoxMetrics`, and `useFocus`, plus the named user-consumable types associated with them. |
| `@vue-tui/runtime/inline`            | The prop-free, one-block `Static` history primitive.                                                                                                                                         |
| `@vue-tui/runtime/package.json`      | Package metadata resolution.                                                                                                                                                                 |
| `@vue-tui/runtime/internal/devtools` | Version-coupled bridge used only by official `@vue-tui/vite`.                                                                                                                                |
| `@vue-tui/runtime/internal/testing`  | Version-coupled bridge used only by official `@vue-tui/testing`.                                                                                                                             |

The two `/internal/*` entries are published integration seams, not application extension contracts. `@vue-tui/use`, `@vue-tui/components`, applications, and third-party packages use only the supported application-facing entries.

The table summarizes the supported entries. [`public-api.test.ts`](../../tests/runtime/integration/public-api.test.ts) and the public type suites under [`tests/runtime/integration/public-types`](../../tests/runtime/integration/public-types) define the complete export inventory.

## Application API

### Application and mount

`createApp()` follows Vue's application model. `TuiApp` carries the consumer's documented Vue application capabilities, replaces DOM-oriented `mount()` with terminal mounting, returns the actual user root component instance, and excludes Vue-private and renderer-node fields.

`MountOptions` has exactly these public keys:

- `stdout?: Writable`, `stdin?: Readable`, and `stderr?: Writable` select borrowed Node streams;
- `mode?: "inline" | "fullscreen"` requests a screen model and defaults to Inline;
- `color?: boolean | ColorProfile` selects automatic, disabled, or forced terminal styling;
- `patchConsole?: boolean` defaults to `true` and coordinates `console.*` output with the active frame;
- `exitOnCtrlC?: boolean` defaults to `false`, leaving Ctrl+C as ordinary normalized input unless explicitly enabled.

Unknown string or symbol mount keys fail before stream inspection, Vue setup, terminal mutation, or output. A consumed mount cannot be retried; a preflight failure that occurs before consumption may be retried where the focused lifecycle contract says so.

Caller-supplied streams are borrowed. Runtime removes its listeners and restores only state it acquired; it never ends or destroys the caller's streams. One live application may own a given stdout at a time.

`waitUntilExit()` is the authoritative application result barrier. The first accepted exit result wins, and settlement waits for teardown and accepted output. `waitUntilRenderFlush()` waits only for accepted render/output work and does not duplicate an exit error.

## Host and rendering-mode contract

The [rendering-mode matrix](./rendering-mode-matrix.md) is the canonical visual-host contract. TTY Inline owns a main-screen live region, TTY Fullscreen owns the alternate-screen viewport, and non-TTY stdout selects the final-document host for either request. Input capability resolves independently from the output surface. Inline and Fullscreen are both first-class modes, but their different screen ownership remains explicit.

`Static` is available only from `/inline`; an effective visual Fullscreen surface rejects its presence before committing output or a new frame.

## String rendering

`renderToString(component, options?)` synchronously produces one terminal-cell document without acquiring caller streams, terminal state, input, resize listeners, or a live application lifecycle.

`RenderToStringOptions` has exactly `width?: number`, `height?: number`, and `color?: boolean | ColorProfile`. Width defaults to 80, height defaults to 24, and `height: Infinity` requests an unbounded document. Color defaults to plain output; explicit `true` uses the shared automatic resolver, while a named profile forces a capability.

The renderer runs a temporary normal Vue tree, prepends present `Static` blocks, and returns the first synchronous commit without an artificial trailing newline. After a successful initial patch it unmounts the temporary Vue tree; after any result it releases Runtime-owned services and Yoga allocations before returning or throwing. An interrupted initial patch follows Vue and runs no component cleanup. Terminal-bound composables receive inert services appropriate to this host; `useApp().exit()` is a no-op.

## Vue component boundary

`Box`, `Text`, and `Static` are public Vue components; raw `tui-box`, `tui-text`, `tui-virtual-text`, and `tui-static` hosts are Runtime implementation details.

Host-prop bindings use exact camelCase keys or `v-bind="object"`; custom-renderer attributes do not apply browser-style kebab-case normalization. Public components expose stable author-facing constructor types rather than generated SFC types tied to one Vue patch release.

The closed `Box` and `Text` contracts reject unknown attributes and invalid declared values on Vue's component-error path before they reach layout or paint. `Text` performs that validation even when it has no content. `Static` accepts no props and suppresses inherited attributes; it does not add a separate runtime attribute validator.

## Box and Text

`Box` is the Runtime layout and containment primitive. Its closed prop surface covers the supported flex, size, position, spacing, overflow, border, background, and custom-frame grammar. Vue `v-show` owns authored visibility; `display` is not a public Box prop.

`Text` is the only primitive that renders characters. Its closed public surface accepts:

- `color` and `backgroundColor` from `Color | "default"`;
- the three-state `dimColor`, `bold`, `italic`, `underline`, `strikethrough`, and `inverse` modifiers;
- `textAlign?: "left" | "center" | "right"`;
- `wrap?: "wrap" | "hard" | "truncate" | "truncate-middle" | "truncate-start"`.

Nested Text is an inline style span. The outermost Text controls wrapping and physical-line alignment.

`Static` represents one mounted Inline history block. Vue owns collection iteration, keys, conditional creation, and slot lifecycle. A non-empty accepted block becomes irreversible terminal history; an empty mounted block remains eligible until it emits or unmounts.

## Composable contract

- `useApp()` exposes application exit for the current render tree. Output barriers remain methods on `TuiApp`.
- `useInput()` broadcasts one readonly tagged `text`, `key`, or `paste` event fact to every active subscription. Handler returns do not implement propagation.
- `useStdin()` exposes the mounted raw stream plus one independently owned, idempotent raw-mode hold. It is an escape hatch, not a normalized-input or routing API.
- `useLayoutSize()` exposes readonly reactive root-layout `width` and `height`; `Infinity` is the explicit unbounded-height sentinel.

Composables throw outside a compatible Runtime render tree rather than returning silent global defaults.

### Rendered-target lifetime

`useFocus(target)` and `useBoxMetrics(target)` accept ordinary caller-owned Vue refs while Runtime privately reconciles them with the host boundary that is actually rendered. A component instance may remain stable while its root host is inserted, removed, hidden, or replaced, so reading the component proxy or `$el` once cannot establish current Runtime ownership.

Reconciliation runs with renderer commits and resolves only the host form accepted by the consuming API. Removal invalidates the old host even when the public ref remains non-null; replacement detaches the old host before attaching the new one. Retargeting, subtree removal, scope disposal, and application teardown release prior registration. No public value exposes a Runtime host node, VNode, Yoga node, or registration controller.

This is not a general target API. Focus keeps a component-boundary availability constraint, while metrics keeps a direct-`Box` target. Neither contract implies input routing, traversal, pointer or caret behavior, surface coordinates, clipping geometry, selection, or clipboard behavior.

### `useBoxMetrics`

```ts
import type { Ref } from "vue";

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

The caller-owned ref binds directly to an exported current-app `Box`. Text, arbitrary component, foreign-app, renderer-node, and Yoga targets are rejected. The four numeric refs describe the Box's complete parent-relative outer layout rectangle. Before accepted measurement and while detached, unmounted, retargeted, or hidden by `v-show`, they are zero and `hasMeasured` is false; a measured zero-sized Box reports zero with `hasMeasured` true. One accepted layout publishes all five facts coherently.

This contract does not expose terminal or root-surface coordinates, clipping, paint fragments, pointer or caret geometry, or a public target abstraction.

### `useFocus`

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

Every call creates one opaque identity in a per-app single-owner controller. `focus()` synchronously replaces the current owner, `blur()` releases only that handle, and disposed-handle operations are inert. The zero-argument form follows its Vue scope. The targeted form additionally follows the supplied Vue component boundary: hidden or detached rendered ancestry clears ownership, and later availability does not restore it.

A targeted handle follows the component's one root VNode boundary, including Vue's single-root normalization for component chains and development-root Fragments. A normal Fragment remains one boundary; Runtime neither selects its first rendered descendant nor collects its children into a region. Calling `focus()` while that boundary is unavailable is a no-op. A valid-to-valid retarget preserves the focus identity, while an unavailable state clears it and later availability does not restore it. String rendering provides inert handles.

The target is not the identity and supplies no input routing, traversal, names, ordering, automatic focus, restoration, geometry, styling, or visual focus ring. Applications gate broadcast `useInput()` explicitly through `isFocused` when desired.

## Contract enforcement

The supported package entries and user-consumable types are one contract. A value is not safely public if consumers cannot name, infer, or compile its types without importing source paths, renderer nodes, Yoga types, or generated SFC internals.

Exact enforcement belongs in:

- Runtime export and package-path tests for entry-point inventory;
- TypeScript and Vue template declaration tests for authoring shape;
- deterministic integration tests for component and lifecycle semantics;
- real-PTY tests for visible screen ownership, terminal controls, restoration, and other physical-terminal claims;
- packed-consumer tests for declaration portability and supported package boundaries.

Repository source paths, raw `tui-*` hosts, Yoga nodes, renderer-node types, module-private testing controls, and implementation-specific scheduling or observation are not public API merely because repository code can reach them.

Rendered-target coverage under [`use-focus`](../../tests/runtime/integration/composables/use-focus) and the Box-metrics integration tests pins stable refs, replacement, removal, visibility, validation, and teardown. [`script-edit-recreates-instance.test.ts`](../../tests/vite/e2e/script-edit-recreates-instance.test.ts) verifies that Vite/Vue replacement reaches the same Runtime lifetime rules.
