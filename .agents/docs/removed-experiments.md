# Removed experiments

> **Status:** one tombstone file for public surfaces that were built, reviewed, and then removed from the Runtime foundation. None of them is a current or hidden contract. They are collected here so that searching for a removed name finds the reason it is gone instead of re-deriving the design.

Current authority is the [Runtime public API decision ledger](./runtime-public-api-decisions.md) for what was accepted and the [public API contract](./api-contract.md) for the exact implemented surface. Current implementation evidence belongs in code and tests rather than a second prose inventory.

The rule for every entry below: **do not reintroduce it without a concrete application journey and a new decision-ledger entry.** Full design tables, journey prototypes, and status narratives remain in git history for each path.

## Application API design record

The earlier `api-design.md` concluded that a broad application foundation — render session, element geometry, focus manager and scopes, input routing, caret, pointer, selection, and clipboard — was complete. The 2026-07 item-by-item review replaced that surface with the narrower one now implemented. Its mode contract survives in [rendering-mode-matrix.md](./rendering-mode-matrix.md), its package-placement rules in [package-layers.md](./package-layers.md), and the remaining proposal process lives in Git history rather than a current operating record.

## API foundation roadmap

An execution ledger that classified F1–F8 and R1–R17 for an earlier candidate, including "complete foundation" claims that later became false. The decision ledger is the sole acceptance authority; a completed checkpoint never created foundation work by itself.

## Former Runtime root exports

| Former name                                                | Current status                                                                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Newline`, `Spacer`                                        | Exported from `@vue-tui/components`, where these public compositions of Runtime primitives belong.                                                       |
| `Static`                                                   | Exported from `@vue-tui/runtime/inline` as the explicit Inline history primitive.                                                                        |
| `Transform`, `useAnimation`                                | No current Runtime replacement. Vue components and reactive state compose presentation above Runtime without a Runtime-owned transform or animation API. |
| `usePaste`                                                 | Paste is one member of the tagged event union delivered by `useInput()`.                                                                                 |
| `useStdout`, `useStderr`                                   | Runtime coordinates mounted output internally; no application-facing raw-output hook is exported.                                                        |
| `useWindowSize`, `useLayoutWidth`, `useViewportHeight`     | `useLayoutSize()` exposes the accepted root layout width and height for every supported host.                                                            |
| `useFocusManager`                                          | `useFocus()` exposes one explicit focus identity; Runtime has no public manager, traversal, scope, or string-ID API.                                     |
| `useBoxSize`, `BoxSize`, `measureElement`                  | Direct-Box `useBoxMetrics()` and `UseBoxMetricsReturn` form the public measurement contract.                                                             |
| `useCursor`                                                | Runtime exposes no public physical-cursor or caret contract.                                                                                             |
| `useIsScreenReaderEnabled`                                 | Runtime exposes no accessibility-presentation selector; the removed experiment is recorded below.                                                        |
| `kittyFlags`, `kittyModifiers`, and related protocol types | Terminal protocol negotiation and parser facts are private; public input uses `TuiInputEvent` and `TuiKey`.                                              |
| `@vue-tui/runtime/fullscreen`                              | Fullscreen is selected by `MountOptions.mode`; no Fullscreen package entry exists.                                                                       |

## Render session

A broad readonly `useRenderSession()` projection of mode, output destination, presentation, host, and capability facts. Production Runtime keeps only the internal session facts `useLayoutSize()` and direct-target validation need: supported surface resolution and reactive root layout dimensions. Do not reintroduce a public `useRenderSession()` or a full private mirror of the removed snapshot fields.

## Logical focus and focus scopes

The F4 focus manager, scopes, traversal, modal traps, restoration, string identities, and focus-selected input routing. Runtime retains only per-app unique ownership plus optional component-boundary validity, through the two [vouched `useFocus()` overloads](./runtime-public-api-decisions.md#focus-identities-may-optionally-follow-a-rendered-target).

## Semantic geometry and caret

The F5 `ElementTarget`, frozen `ElementGeometry` snapshots with local-to-parent-to-surface paint fragments, `useElementGeometry()`, and a focus-eligible `useCaret()` at an element-local `CellPoint`. The implemented layout contract is numeric `useLayoutSize()` and direct-Box `useBoxMetrics()` only; rich paint provenance, grapheme positions, and physical caret transport were removed. A future editor-facing primitive requires a selected application journey.

## Targeted pointer and mouse input

The F6 `/fullscreen` pointer subpath plus the earlier terminal-wide `useMouseInput()` hook: SGR parsing, reporting-level negotiation, hit testing, ancestry propagation, capture, and drag adapters. The current package exposes no mouse hook. Review a smaller Runtime primitive only when a selected public-only pointer journey requires one; no exact shape is preselected.

## Fullscreen selection and clipboard

The F8 `useTextSelection()` semantic document model and `useClipboard()` root service with custom and OSC 52 transports, built on grapheme paint provenance. Keyboard- or source-owned selection and injected known-string copy compose publicly today. Physical painted-Text selection or OSC 52 would require a future selected narrow Runtime operation.

## Screen-reader presentation and ARIA

Runtime has one visual rendering model across Inline, Fullscreen, stream, and string hosts. It does not expose or recognize a `presentation` mount option; `ariaLabel`, `ariaHidden`, `ariaRole`, or `ariaState` props; public `AriaRole`, `AriaState`, or `RenderPresentation` types; `INK_SCREEN_READER` as an environment selector; or a transcript renderer, internal screen-reader string helper, or testing-only presentation control. The closed component and option surfaces reject these removed inputs rather than silently accepting inert accessibility claims.

Version `0.1.0` advertised a linear transcript and an 18-value `AriaRole` union; the published changelog remains that release's historical record. The previous vouch covered keeping the linearizer internal _while the feature existed_; because the helper and the feature are both gone, that stamp was removed rather than transferred, and no new vouch replaced it.

This is not a claim that terminal accessibility is unimportant — it is a refusal to advertise a partial contract. vue-tui has no DOM and no browser accessibility tree, so merely accepting ARIA-shaped props would make user code look accessible while nothing consumes the values. Two reusable design facts survived the experiment:

- A no-DOM renderer cannot rely on browser attribute fallthrough. Any future semantic values must be interpreted by the renderer or by another explicitly owned accessibility engine.
- Vue and Volar type-check declared camelCase props, but kebab `aria-*` is treated as a broadly allowed global template attribute and can bypass component-prop checking. A future design must not assume that accepting arbitrary kebab attributes gives a checked semantic contract.

Future accessibility work starts from a concrete assistive-technology journey and a complete additive Runtime contract.
