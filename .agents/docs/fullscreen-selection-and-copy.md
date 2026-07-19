# Fullscreen text selection and clipboard

> **Status:** historical unstamped F8 contract. The re-audit removed `/fullscreen`, public arbitrary-Text selection, clipboard hooks, clipboard mount options, and selection-only inverse styling. The mechanisms remain private evidence, but correct pointer targeting and arbitrary painted-Text selection are explicitly outside the minimum foundation until a smaller Runtime-only primitive is proven. Application-owned copy of an already known string remains ordinary dependency injection. No VOUCHED stamp changed. See the [active ledger](./runtime-public-foundation-reaudit.md#exhaustive-retained-public-ledger).

## Product boundary

F8 replaces the native text selection that a terminal normally withholds while Fullscreen SGR mouse reporting is active. The application owns a semantic selection inside one rendered text document; the terminal still owns its system clipboard and decides whether an OSC 52 request is accepted. These are separate responsibilities:

1. `useTextSelection()` owns a range over the semantic plain text of exactly one top-level `<Text>` and maps that range through the last successfully displayed Fullscreen paint.
2. `useClipboard()` exposes the one transport configured for the mounted application and reports what that transport actually knows.
3. `TextSelectionCommands.copy()` sends the current non-empty selected text through the clipboard service; it does not make the transport part of selection state.

Clipboard is a common root capability because an Inline application or non-selection workflow may copy application text. Rendered text selection remains on `@vue-tui/runtime/fullscreen` because it requires a fixed targetable surface and composes with Fullscreen pointer capture. Neither API adds an operating-system clipboard dependency to the runtime.

## Selected public authoring surface

### Common clipboard service

The common root exports `useClipboard()` and the transport, availability, and result types. `MountOptions` accepts one optional `clipboard` transport:

```ts
export type ClipboardTransportResult =
  | { readonly status: "copied" }
  | { readonly status: "requested" }
  | { readonly status: "unavailable"; readonly reason?: string }
  | { readonly status: "rejected"; readonly cause?: unknown };

export interface CustomClipboardTransport {
  readonly kind: "custom";
  readonly writeText: (
    text: string,
  ) => ClipboardTransportResult | PromiseLike<ClipboardTransportResult>;
}

export interface Osc52ClipboardTransport {
  readonly kind: "osc52";
}

export type ClipboardTransport = CustomClipboardTransport | Osc52ClipboardTransport;

export type ClipboardUnavailableReason =
  | "not-configured"
  | "output-not-terminal"
  | "screen-reader"
  | "suspended"
  | "disposed"
  | "string-host"
  | "transport-unavailable";

export type ClipboardAvailability =
  | { readonly status: "available"; readonly transport: "custom" | "osc52" }
  | { readonly status: "unavailable"; readonly reason: ClipboardUnavailableReason };

export type ClipboardWriteResult =
  | { readonly status: "copied"; readonly text: string }
  | { readonly status: "requested"; readonly text: string }
  | {
      readonly status: "unavailable";
      readonly text: string;
      readonly reason: ClipboardUnavailableReason;
      readonly detail?: string;
    }
  | { readonly status: "rejected"; readonly text: string; readonly cause: unknown };

export interface UseClipboardReturn {
  readonly availability: Readonly<ShallowRef<ClipboardAvailability>>;
  readonly writeText: (text: string) => Promise<ClipboardWriteResult>;
}

export interface MountOptions {
  readonly clipboard?: ClipboardTransport;
}
```

`useClipboard()` requires a vue-tui render tree. Its return object and availability ref are readonly. The mount option is validated before stream reservation or terminal mutation, like the other clean-slate mount fields.

### Fullscreen text selection

The supported `@vue-tui/runtime/fullscreen` entry point adds `useTextSelection()` and the selected named types without re-exporting the common clipboard types:

```ts
export interface UseTextSelectionOptions {
  readonly isActive?: MaybeRefOrGetter<boolean>;
  readonly pointer?: MaybeRefOrGetter<boolean>;
}

export type TextSelectionMove =
  | "backward"
  | "forward"
  | "up"
  | "down"
  | "line-start"
  | "line-end"
  | "document-start"
  | "document-end";

export interface TextSelectionRange {
  readonly anchor: number;
  readonly extent: number;
  readonly direction: "forward" | "backward";
  readonly collapsed: boolean;
}

export type TextSelectionUnavailableReason =
  | "host-unavailable"
  | "screen-reader"
  | "string-host"
  | "mapping-unavailable";

export type TextSelectionState =
  | { readonly status: "inactive" | "pending"; readonly range: null; readonly selectedText: "" }
  | {
      readonly status: "unavailable";
      readonly reason: TextSelectionUnavailableReason;
      readonly range: null;
      readonly selectedText: "";
    }
  | {
      readonly status: "ready" | "suspended";
      readonly text: string;
      readonly range: TextSelectionRange | null;
      readonly selectedText: string;
    };

export type TextSelectionCopyResult = { readonly status: "empty" } | ClipboardWriteResult;

export interface TextSelectionCommands {
  readonly state: Readonly<ShallowRef<TextSelectionState>>;
  move(direction: TextSelectionMove, options?: { readonly extend?: boolean }): boolean;
  selectAll(): boolean;
  clear(): boolean;
  copy(): Promise<TextSelectionCopyResult>;
}

export function useTextSelection(
  target: ElementTarget,
  options?: UseTextSelectionOptions,
): TextSelectionCommands;
```

`isActive` and `pointer` default to `true`. `pointer: false` leaves command-driven selection active without registering click or drag demand. The commands report whether a synchronous selection operation changed the current intent; `copy()` reports `empty` for no range or a collapsed range and otherwise returns the clipboard result with the exact selected text.

## Semantic text and successful-paint authority

The target must resolve to exactly one top-level `<Text>`: it may contain nested styled `<Text>` children, but it may not be a `<Box>`, a virtual nested `<Text>` inside another text target, or a collection of separate nodes. One top-level `<Text>` may have only one selection registration. The semantic document is derived from that Text tree; the caller does not pass a duplicate `text`, separator, item list, or renderer node.

Selection endpoints are UTF-16 offsets into `state.text`, matching JavaScript string slicing, and always fall on complete grapheme boundaries. `selectedText` is the exact semantic substring between the ordered endpoints. Soft wrapping changes visual rows but does not insert newlines into the semantic document; explicit source newlines remain. Complete combined and wide graphemes remain indivisible.

Paint supplies provenance rather than merely a bounding rectangle. A candidate maps semantic graphemes to their final cells, clipping and later overlay composition mark which source cells still survive, and the controller publishes the candidate only after the corresponding output frame succeeds. A failed write retains the last accepted document, range, and highlight mapping. Selected semantic text may include clipped or covered content, while inverse highlighting is applied only to surviving cells from that target in the displayed frame. This prevents an overlay, wide-glyph continuation cell, or stale failed frame from receiving a false highlight.

Runtime may reuse an origin-independent local trace for one top-level Text only when its text revision, rendered and wrapped content, wrap width and mode, provenance identities, and selection-target identities remain equal. The trace stores document-local stops and cells. Each candidate frame still projects the current surface origin and clip, recomputes visible-cell survival during composition, and publishes selection and highlight state only after the frame is successfully written. This internal reuse does not change public coordinates, exact selected text, or successful-final-paint authority.

When paint cannot preserve an exact semantic mapping, the state is `unavailable` with `mapping-unavailable` instead of approximating. Current deliberate examples include line transforms, truncation, and ambiguous standalone zero-width graphemes. Removing or retargeting the Text clears the accepted document and range; reattaching it does not revive the previous selection. A compatible later document may retain a range only when the source prefix through both endpoints is unchanged and both endpoints remain grapheme boundaries.

## Selection ownership and commands

Each mounted application has one selection controller. It can register several independent top-level Text documents, but only one range is active across the application: a changed operation in another document clears the previous document's range. Selection remains distinct from logical focus, collection active item, editor insertion state, caret request, physical terminal cursor, pointer target, and clipboard transport.

The framework supplies semantic operations rather than default keyboard bindings:

- `backward` and `forward` move by one complete grapheme boundary;
- `up` and `down` use the nearest stop on the preceding or following visual row and preserve the preferred column across repeated vertical moves;
- `line-start` and `line-end` use the current visual row, including soft wraps;
- `document-start` and `document-end` use the semantic document bounds;
- without `extend`, movement collapses an existing non-collapsed range toward the requested direction before later movement; with `extend`, the anchor remains fixed;
- a normal click collapses at the nearest complete-grapheme boundary, Shift-click extends an existing anchor, and a primary-button drag selects complete graphemes through the existing F6 capture lifecycle.

Applications map `useInput()`, focused commands, menu actions, or their own key bindings to these operations. F8 does not add hidden Ctrl+A, Shift+Arrow, or copy shortcuts and does not make selection a second focus owner.

## Clipboard transport semantics

One mounted application owns zero or one clipboard transport. There is no automatic platform detection, fallback chain, or silent switch from OSC 52 to an application adapter.

- A custom transport returns `copied` only when it can confirm the copy, `requested` when it can confirm only that a request was sent, `unavailable` with an optional transport detail, or `rejected` with an optional cause. The runtime validates the result and attaches the exact requested text.
- `writeText()` accepts only a string. JavaScript misuse rejects with a `TypeError`; a thrown, rejected, or structurally invalid custom-adapter result becomes a public `rejected` result with the cause instead of breaking the FIFO queue.
- The OSC 52 transport writes UTF-8 text as Base64 with selector `c` and a BEL terminator. A successful write returns `requested`, never `copied`, because vue-tui cannot observe whether the terminal accepted, denied, truncated, or forwarded the request.
- Every non-empty public result contains the exact input text so the application can present a manual fallback without retaining a second copy source.
- Calls that begin while available run in FIFO order. Before each queued call starts, the service rechecks suspension, disposal, and transport availability. A custom adapter that already started is allowed to settle honestly; suspension and disposal do not pretend to cancel external work that has already begun.
- Payload limits, user confirmation, remote-terminal policy, timeout, cancellation, and operating-system integration belong to the chosen transport or application. The runtime does not guess a safe OSC 52 size or add an `AbortSignal` that cannot cancel a terminal write.

## Host and lifecycle behavior

| Host or state                                               | Text selection                                                                                                                                                    | Clipboard                                                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Outside a vue-tui render tree                               | Throw the exact missing-context error before treating either API as a standalone utility.                                                                         | Same.                                                                                                              |
| Effective visual Fullscreen live TTY                        | After one successful target paint, publish semantic state, command selection, and optional pointer selection.                                                     | Custom is available when configured. OSC 52 is available only on a live visual terminal output.                    |
| Targetable Fullscreen output with unavailable managed input | Command selection remains usable with `pointer: false`; an active pointer path fails through the existing F6 preflight rather than publishing a dead mouse route. | Clipboard remains independent of stdin; custom and OSC 52 follow their output rules.                               |
| Effective visual Fullscreen deterministic host              | Use modeled paint, pointer, and lifecycle state.                                                                                                                  | A configured `TestClipboardBehavior` supplies the exact custom result without touching the ambient clipboard.      |
| Effective visual Inline                                     | An active registration throws immediately; an inactive registration remains inert and fails if later activated.                                                   | The common custom transport remains independent of mode; OSC 52 may be available on a live visual terminal output. |
| Final stream or live non-terminal output                    | Report `host-unavailable`; do not manufacture a selectable coordinate surface.                                                                                    | Custom remains available when configured; OSC 52 reports `output-not-terminal`.                                    |
| Screen-reader presentation                                  | Report `screen-reader`, acquire no pointer demand, and expose no visual range.                                                                                    | Custom remains available when configured; OSC 52 reports `screen-reader`.                                          |
| String document                                             | Report `string-host` during rendering and become inactive after disposal.                                                                                         | Report `string-host` during rendering and `disposed` afterward; string rendering accepts no transport option.      |
| Suspended Fullscreen session                                | Preserve the last accepted document, range, and selected text under `suspended`; pointer mapping and copy transport are unavailable until continuation repaints.  | Report `suspended`; queued work rechecks this state before starting.                                               |
| Removed target or disposed registration                     | A removed target becomes pending with no range; disposal becomes inactive and contributes no pointer demand.                                                      | Whole-app disposal reports `disposed`.                                                                             |

Continuation re-establishes and successfully repaints the Fullscreen surface before selection becomes ready and pointer demand returns. Normal, fatal, signal, HMR, and failed-acquisition teardown use the existing exact-ownership lifecycle; F8 adds no independent terminal mode beyond the F6 mouse level and optional OSC 52 write.

## Deterministic testing surface

`@vue-tui/testing` extends its root host and result rather than adding a subpath:

```ts
export type TestClipboardBehavior = "copied" | "requested" | "unavailable" | "rejected";

export interface TestHost {
  readonly clipboard?: TestClipboardBehavior;
}

export interface RenderResult {
  readonly clipboard: {
    readonly requests: readonly string[];
  };
}
```

The configured behavior acts as one app-owned custom transport. Every call that reaches the modeled adapter records the exact text in `clipboard.requests`; immediately unavailable calls during suspension or after disposal do not invoke the adapter. The runtime still creates and validates the public `ClipboardWriteResult`. Fullscreen selection tests drive the existing parsed physical `mouse.down()`, `mouse.move()`, and `mouse.up()` methods, so the production paint mapping, click/drag policy, and copy bridge remain under test rather than being bypassed by a test-only selection setter.

## Rejected alternatives

- **Terminal-native selection as the only model:** active SGR reporting deliberately redirects ordinary terminal selection, so this would leave Fullscreen pointer applications without a selectable document.
- **A global or multi-source document API:** joining several nodes requires separator, identity, reorder, clipping, and update policy that the current journeys do not need. One top-level Text gives one semantic owner and exact paint provenance.
- **A duplicated `text` option beside the rendered Text:** the model and paint could disagree. Deriving the document from the rendered semantic source keeps one owner.
- **A Box or generic geometry selection target:** geometry cannot reconstruct semantic grapheme boundaries, explicit newlines, nested text, transformations, or copied content.
- **Clipboard hidden inside `useTextSelection()`:** non-selection workflows also copy text, and transport availability is independent from one range. The common service composes without merging the states.
- **Assuming OSC 52 means copied:** writing a control sequence proves only that vue-tui requested the operation. The terminal, multiplexer, remote boundary, and user policy remain outside the process.
- **Automatic OSC 52, native addon, command, or shell fallback:** this would add platform policy, process spawning, security, and ambiguous confirmation to the runtime. Applications can provide one explicit custom adapter instead.

## Historical F8 checkpoint and final reconfirmation

F8 first became Done at `3d7e197`. The following values and totals are historical evidence for that checkpoint; they are retained rather than rewritten as final Runtime totals:

- the guarded root and `/fullscreen` values and named types, Vue template and TSX behavior, JavaScript validation, package declarations, `@vue-tui/testing` model, clean Vue 3.4.38 and TypeScript 6.0.3 tarball consumer, documentation, changelog, and first-party mouse example agree;
- deterministic journeys cover exact complete-grapheme command, click, Shift-click and captured-drag behavior; one active range across several documents; compatible updates; removal and retargeting; clipping, wrapping, nested styles, overlays, transforms, truncation, zero-width ambiguity, failed output, suspension, unsupported hosts, and lifecycle disposal;
- selection remains exact across 500-line semantic text, a non-coding-agent workbench, HMR rerender and reload, and the packed public surface; final review added regressions for copy during invalidated paint, duplicated soft-wrap visual stops, and a complete grapheme split by nested ANSI styling;
- clipboard tests cover custom copied, requested, unavailable and rejected outcomes, OSC 52's honest requested result, exact text, FIFO ordering, re-entrant suspension and disposal, invalid results, and caller-owned fallback without ambient operating-system access;
- the declared real-PTY profile passes command and Unicode pointer selection, OSC 52 bytes, suspension and continuation, alternate-screen ownership, exit, termios restoration, and working shell input;
- image-observed visual-controller sessions prove exact selected inverse cells and copy status through command, clear, Unicode soft-wrap pointer selection, release, clean exit, and shell recovery, plus `alternate → normal → alternate → normal` suspension and continuation with the same accepted range;
- native macOS Terminal 2.15 did not acknowledge the OSC 52 probe, so no acceptance claim is made. The explicit custom transport copied the exact selected `alp` through `pbcopy`, the application reported `copied`, exit returned to a working shell, the disposable window closed, and the previous clipboard contents were restored;
- final `vp run ready` passed 27 tasks: 685 runtime, 89 testing, 31 components, 30 Vite, 1,543 passing integration tests plus two expected failures and two skips, 174 real-PTY tests, six example tests, all builds, formatting, lint, types, and the clean package consumer;
- one fresh `CI=true vp run ci` passed all 28 tasks with zero cache hits, and the required independent reviews ended with no remaining concrete finding.

Final Runtime closure reconfirmed public values, named types, package consumption, deterministic and long-document behavior, clipboard outcomes, real PTYs, image-observed Unicode soft-wrap selection, capacity, release, repository, and review evidence at [Final closure evidence](./runtime-foundation-closure.md#final-closure-evidence). PR #265 was the development vehicle, but its current external state and older remote head are recorded separately from the local candidate. Push, PR-body or review-state changes, merge, release, and publication remain maintainer-directed external work. No VOUCHED stamp changed.
