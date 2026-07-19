# Runtime public foundation re-audit

## Status and authority

This record is the active re-audit of PR #265's experimental public API. It replaces the unstamped conclusion that the Runtime foundation is complete, but it does not discard the branch's implementation evidence. A path becomes accepted only after this record contains a concrete application example, a Runtime-only justification, a public-only higher-layer composition, explicit host semantics, migrated consumers, local validation, and adversarial review.

The clean-slate instruction reopens unstamped API-completion claims; it does not silently erase unrelated maintainer-vouched behavior. This audit therefore preserves the Vue-shaped `createApp().mount()` model, same-stdout second-mount no-op, shared-stdin multicast and raw-stream escape hatch, multiple Static regions, ref-bound rendered targets, composable handler `MaybeRef` semantics, Vue composable type naming, the exact typed accessibility surface (`ariaLabel`, `ariaHidden`, `ariaRole`, `ariaState`, `AriaRole`, and `AriaState`), and the accepted incidental `TuiNode` type exposure unless the maintainer explicitly replaces one. A smaller primitive may remove a former collection wrapper without changing the vouched rule that any future repeated-content wrapper uses one Vue scoped-slot props object.

Two older vouches directly describe APIs whose public existence this newer goal requires the audit to reconsider. The `Transform` all-comment rule and six-mode Text wrap remeasurement rule remain correctness constraints for the internal mechanisms and any retained public cases; they are not independent application evidence that every old value must remain public. The target therefore preserves render-equals-current-props remeasurement for `wrap` and `truncate`, preserves the all-comment behavior while Transform remains an internal mechanism, and explicitly supersedes the public-existence reading of those older `KEEP` labels for the unevidenced Transform value and four removed wrap spellings. This is different from the accessibility product-boundary vouch, which explicitly says later component work must not remove or redefine that public API.

On 2026-07-19, PR #265 remained open against `main`; its remote and local committed head was `a2d2485` after the accepted Path 2 phase, 25 commits beyond the `3d7e197` head at which this re-audit began. Path 0 below was then validated in the worktree without merging or releasing. The PR conversation contains one automated overview of its first three files, no inline review threads, and no human package-boundary review. The pre-audit test volume therefore proved behavior of the experiment, not correctness of its public boundary.

## Boundary test

A value or named type remains public in `@vue-tui/runtime` only when all of the following hold:

1. Correct behavior requires Runtime ownership of the terminal, renderer tree, layout or accepted paint, input protocol, lifecycle, or terminal resources.
2. The contract describes a stable user fact or operation rather than the current parser, router, painter, or scheduler implementation.
3. The primitive is small enough for a third party to compose without adopting unrelated application policy.
4. A first-party higher layer has no private access that a third party lacks.
5. A real application needs the capability, or another accepted primitive is unusable without it.

Existing tests, Ink parity, and implementation cost are evidence but are not independent reasons to retain an API.

## Current surface under review

The current supported authoring surface has 31 runtime values across the root, `/fullscreen`, and `/inline` (27, 3, and 1 respectively), plus 87 named types (62, 20, and 5 respectively). The package also exports `/internal`, which is described as unsupported while being imported by the published testing and Vite packages. Every value, named type, mount option, app method, and exported subpath remains under review until the exhaustive ledger in this record is complete.

## Path 0: renderer entry and basic nodes

### Current user tasks and code

Applications need to mount a Vue tree into a live terminal, render the same tree to a deterministic string, lay out terminal regions, and render styled text:

```ts
const app = createApp(App);
app.mount({ mode: "fullscreen" });
await app.waitUntilExit();

const help = renderToString(Help, { columns: 80 });
```

```vue
<Box flexDirection="column" borderStyle="round">
  <Text bold color="cyan">Status</Text>
  <Text>{{ message }}</Text>
</Box>
```

These are the irreducible renderer entry points. Only Runtime can create the Vue custom renderer, allocate and dispose Yoga nodes, turn Box and Text hosts into terminal cells, and keep live and string cleanup coherent.

### Proposed Runtime primitives

- Retain `createApp()`, `renderToString()`, `Box`, and `Text`, but do not accept every experimental prop merely by retaining the component value.
- Retain normal inherited Vue app operations such as plugins, provide/inject, directives, component registration, configuration, and unmount. The already accepted incidental `TuiNode` appearance through Vue's underscore `_container` field is not treated as an authoring contract and is not changed in this audit.
- Keep the screen-reader linearizer, Yoga hosts, virtual nested Text nodes, ANSI sanitization, error overview, and renderer transforms internal implementation mechanisms.

All rendering hosts support Box and Text. `renderToString()` accepts only an options object with an optional integer `columns` value from 1 through 65,535, default 80; unknown keys and attempts to pass live mode, rows, or presentation controls fail before rendering. It has no terminal resources, input, focus, caret, or asynchronous flush, and always releases its Vue and Yoga tree before returning or propagating a render failure. A visual non-TTY mount emits a monotonic stream document rather than dynamic cursor rewrites. Screen-reader presentation uses the semantic linearizer rather than the visual cell painter. Invalid props and render failures remain ordinary synchronous Vue/Runtime errors with complete cleanup.

### Box and Text prop-family audit

The current `BoxProps` contains 67 real props plus the four `onClick`, `onMouseDown`, `onMouseUp`, and `onWheel` rejection tombstones; `TextProps` contains 11 real props plus the same tombstones. Retaining the component values does not retain that whole vocabulary. The target keeps 28 Box props and eight Text props, with no compatibility aliases for rejected experimental props.

The shared target domains are exact:

- A cell count is an integer from 0 through 65,535. A signed cell offset or margin is an integer from -65,535 through 65,535. A flex factor is a finite number from 0 through 65,535. This terminal-sized range avoids claiming JavaScript's much larger numeric range as a Yoga or terminal capability: integer cell inputs remain exact in Yoga's float representation, and finite JavaScript factors cannot overflow it.
- A percentage width is an ordinary decimal from 0 through 100 inclusive matching `^(?:0|[1-9]\d*)(?:\.\d+)?%$`; signs, whitespace, exponents, bare numeric strings, truncated decimals, and overflow percentages are not accepted. No current consumer needs a value above the containing block, so that overflow policy is not part of the minimum primitive.
- The single-value range and the final paint allocation are separate contracts. Before allocating a visual grid, Runtime requires each final dimension to be an integer from 1 through 65,535 and requires `width * height` to be at most 1,048,576 cells. Individually legal width and height values therefore do not promise that every combination can be painted. An oversized combination fails with Runtime's own `RangeError` before allocation instead of leaking an engine `Invalid array length` or attempting an unbounded grid.
- The exported `Color` type has exact arms for the 16 canonical ANSI palette spellings (`black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `gray`, `redBright`, `greenBright`, `yellowBright`, `blueBright`, `magentaBright`, `cyanBright`, or `whiteBright`) and a `#${string}` arm. Runtime validates the hex arm as exactly six hexadecimal digits because expressing that finite grammar as a TypeScript union would be prohibitively large. `grey` and `blackBright` are not separate aliases. Unknown names, empty strings, short hex, `rgb(...)`, and `ansi256(...)` are not accepted at runtime. Runtime may downgrade a valid RGB color to the terminal's supported palette without changing the input contract. The named type lets public component and theme authors describe values accepted by Runtime without duplicating or extracting its grammar.
- Only Text foreground `color` additionally accepts `"revert"` and `"initial"`. Both mean terminal-default foreground for that nested run; after the run, the enclosing foreground resumes. Background and border colors do not gain a speculative reset token, and the current empty-string background sentinel is not a public contract.

The exact Box ledger is:

| Current prop                                     | Target contract and decision                                                                                                                                                    | Why this is or is not a Runtime primitive                                                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flexDirection`                                  | Retain `"row" \| "column"`; default and removal reset are `"row"`. Remove both reverse values.                                                                                  | Runtime lays out siblings, and screen-reader output uses the accepted direction to choose spaces or line breaks. Real consumers use row and column; none needs reverse order.                                                                 |
| `flexGrow`                                       | Retain a finite factor from 0 through 65,535; default/reset `0`.                                                                                                                | Machud and ScrollBox need Runtime to distribute remaining sibling space.                                                                                                                                                                      |
| `flexShrink`                                     | Retain a finite factor from 0 through 65,535; default/reset `1`.                                                                                                                | ScrollBox and ErrorOverview need Runtime's sibling shrink calculation.                                                                                                                                                                        |
| `flexBasis`                                      | Retain a non-negative cell count; omission/removal means Yoga `auto`. Remove string and percentage values.                                                                      | Machud and ScrollBox use numeric `0` so content does not distort a flex ratio; no consumer needs a percentage basis.                                                                                                                          |
| `flexWrap`                                       | Remove.                                                                                                                                                                         | No real consumer needs wrapping; machud already makes its responsive layout decision explicitly. Adding it later would be additive.                                                                                                           |
| `alignItems`                                     | Retain `"center" \| "stretch"`; default/reset `"stretch"`. Remove `"flex-start"`, `"flex-end"`, and `"baseline"`.                                                               | Cross-axis placement depends on Runtime's accepted sibling sizes, but real consumers establish only centered and default stretched placement. Other policies can be added later without changing ownership.                                   |
| `alignSelf`                                      | Remove.                                                                                                                                                                         | No real consumer needs a per-child override, and it can be added without changing ownership when one does.                                                                                                                                    |
| `justifyContent`                                 | Retain `"flex-start" \| "center" \| "space-between"`; default/reset `"flex-start"`. Remove `"flex-end"`, `"space-around"`, and `"space-evenly"`.                                | Machud and examples need Runtime to place children after their accepted widths are known; the removed distribution policies have no consumer.                                                                                                 |
| `gap`                                            | Retain a non-negative cell count; default/reset `0`.                                                                                                                            | Machud uses it, and Runtime alone sees the final expanded sibling sequence; a child-margin rewrite is not equivalent for conditional children.                                                                                                |
| `columnGap`                                      | Remove.                                                                                                                                                                         | Without a retained wrap contract there is no evidenced need distinct from `gap`.                                                                                                                                                              |
| `rowGap`                                         | Remove.                                                                                                                                                                         | Same reason as `columnGap`.                                                                                                                                                                                                                   |
| `width`                                          | Retain a non-negative cell count or strict percentage width; omission/removal means `auto`.                                                                                     | Numeric width is universal and machud/ScrollBox need containing-block width percentages. Runtime owns that containing block.                                                                                                                  |
| `height`                                         | Retain a non-negative cell count; omission/removal means `auto`. Remove percentages and all strings.                                                                            | Fullscreen applications and ScrollBox need bounded rows, but Inline and final-output hosts have no coherent percentage-height baseline.                                                                                                       |
| `minWidth`                                       | Retain a non-negative cell count; omission/removal means no minimum.                                                                                                            | Machud prevents columns from collapsing below a usable width.                                                                                                                                                                                 |
| `minHeight`                                      | Retain a non-negative cell count; omission/removal means no minimum.                                                                                                            | ScrollBox needs `0` so its viewport can shrink inside a flex column.                                                                                                                                                                          |
| `maxWidth`                                       | Remove.                                                                                                                                                                         | No consumer needs it; machud already derives a numeric width from `useLayoutWidth()`.                                                                                                                                                         |
| `maxHeight`                                      | Remove.                                                                                                                                                                         | No consumer needs it; a bounded host can read the numeric height from `useViewportHeight()`.                                                                                                                                                  |
| `aspectRatio`                                    | Remove.                                                                                                                                                                         | It is supported only by tests and hypothetical examples.                                                                                                                                                                                      |
| `alignContent`                                   | Remove.                                                                                                                                                                         | It only affects a multi-line wrapped flex container, while `flexWrap` is also removed.                                                                                                                                                        |
| `position`                                       | Retain only `"absolute"`; omission/removal means normal flow. Remove explicit `"relative"` and `"static"`.                                                                      | The mouse example and overlays need out-of-flow placement; spelling normal flow as a second value adds no capability.                                                                                                                         |
| `top`                                            | Retain a signed cell offset, legal only with `position="absolute"`.                                                                                                             | The pointer example needs a top anchor and only Runtime can place it before paint and hit testing.                                                                                                                                            |
| `right`                                          | Remove.                                                                                                                                                                         | No real application needs a trailing-edge anchor; adding it later would be additive.                                                                                                                                                          |
| `bottom`                                         | Remove.                                                                                                                                                                         | No real application needs a bottom anchor; adding it later would be additive.                                                                                                                                                                 |
| `left`                                           | Retain a signed cell offset, legal only with `position="absolute"`.                                                                                                             | The pointer example needs a left anchor.                                                                                                                                                                                                      |
| `margin`                                         | Remove.                                                                                                                                                                         | It is convenience syntax rather than a new Runtime-owned operation; real uses can spell the accepted physical edges.                                                                                                                          |
| `marginX`                                        | Remove.                                                                                                                                                                         | It is convenience syntax and the unsupported right edge should not be published to preserve the shorthand.                                                                                                                                    |
| `marginY`                                        | Remove.                                                                                                                                                                         | It is convenience syntax and the unsupported bottom edge should not be published to preserve the shorthand.                                                                                                                                   |
| `marginTop`                                      | Retain a signed cell count; default/reset `0`.                                                                                                                                  | Mo uses it and ScrollBox needs a negative value to move its content.                                                                                                                                                                          |
| `marginBottom`                                   | Remove.                                                                                                                                                                         | No real application needs it; adding the physical edge later would be additive.                                                                                                                                                               |
| `marginLeft`                                     | Remove.                                                                                                                                                                         | No real application needs horizontal margin semantics. Existing positioning and fixture cases use accepted padding, an ordinary sibling spacer, or absolute `left` according to the actual task; adding a margin edge later remains additive. |
| `marginRight`                                    | Remove.                                                                                                                                                                         | No real application needs it; adding the physical edge later would be additive.                                                                                                                                                               |
| `padding`                                        | Remove.                                                                                                                                                                         | A public helper can expand it into four retained physical edges.                                                                                                                                                                              |
| `paddingX`                                       | Remove.                                                                                                                                                                         | Machud uses the convenience, but identical user code can return `paddingLeft` and `paddingRight`; no Runtime privilege is involved.                                                                                                           |
| `paddingY`                                       | Remove.                                                                                                                                                                         | Repository examples can expand it to `paddingTop` and `paddingBottom`.                                                                                                                                                                        |
| `paddingTop`                                     | Retain a non-negative cell count; default/reset `0`.                                                                                                                            | Padding changes both the Yoga content box and the painter-owned fill region.                                                                                                                                                                  |
| `paddingBottom`                                  | Retain a non-negative cell count; default/reset `0`.                                                                                                                            | Same Runtime-owned content-box reason as `paddingTop`.                                                                                                                                                                                        |
| `paddingLeft`                                    | Retain a non-negative cell count; default/reset `0`.                                                                                                                            | Coding-agent uses it directly, and it is the left half of real `paddingX` migrations.                                                                                                                                                         |
| `paddingRight`                                   | Retain a non-negative cell count; default/reset `0`.                                                                                                                            | It is the right half of real `paddingX` migrations and cannot be derived from the left edge.                                                                                                                                                  |
| `borderStyle`                                    | Retain only `"single" \| "round"`; omission/removal means no border. A present style draws and reserves one cell on all four edges. Remove six other presets and object values. | These two presets have real consumers. Runtime must reserve the cells and paint the glyphs; a custom `cli-boxes` object freezes an internal schema without a consumer.                                                                        |
| `borderColor`                                    | Retain a paint color; omission/removal uses the enclosing/default foreground.                                                                                                   | Only Runtime paints its owned border cells; machud and examples use this fact.                                                                                                                                                                |
| `borderDimColor`                                 | Remove.                                                                                                                                                                         | No consumer needs this border decoration.                                                                                                                                                                                                     |
| `borderTopDimColor`                              | Remove.                                                                                                                                                                         | No consumer needs the per-edge override.                                                                                                                                                                                                      |
| `borderBottomDimColor`                           | Remove.                                                                                                                                                                         | No consumer needs the per-edge override.                                                                                                                                                                                                      |
| `borderLeftDimColor`                             | Remove.                                                                                                                                                                         | No consumer needs the per-edge override.                                                                                                                                                                                                      |
| `borderRightDimColor`                            | Remove.                                                                                                                                                                         | No consumer needs the per-edge override.                                                                                                                                                                                                      |
| `borderTop`                                      | Remove.                                                                                                                                                                         | No real application has established partial borders; adding one edge later is additive.                                                                                                                                                       |
| `borderBottom`                                   | Remove.                                                                                                                                                                         | Same reason as `borderTop`.                                                                                                                                                                                                                   |
| `borderLeft`                                     | Remove.                                                                                                                                                                         | Same reason as `borderTop`.                                                                                                                                                                                                                   |
| `borderRight`                                    | Remove.                                                                                                                                                                         | Same reason as `borderTop`.                                                                                                                                                                                                                   |
| `borderTopColor`                                 | Remove.                                                                                                                                                                         | No consumer needs a per-edge color.                                                                                                                                                                                                           |
| `borderBottomColor`                              | Remove.                                                                                                                                                                         | No consumer needs a per-edge color.                                                                                                                                                                                                           |
| `borderLeftColor`                                | Remove.                                                                                                                                                                         | No consumer needs a per-edge color.                                                                                                                                                                                                           |
| `borderRightColor`                               | Remove.                                                                                                                                                                         | No consumer needs a per-edge color.                                                                                                                                                                                                           |
| `borderBackgroundColor`                          | Remove.                                                                                                                                                                         | No consumer needs a separate background for border cells.                                                                                                                                                                                     |
| `borderTopBackgroundColor`                       | Remove.                                                                                                                                                                         | No consumer needs the per-edge variant.                                                                                                                                                                                                       |
| `borderBottomBackgroundColor`                    | Remove.                                                                                                                                                                         | No consumer needs the per-edge variant.                                                                                                                                                                                                       |
| `borderLeftBackgroundColor`                      | Remove.                                                                                                                                                                         | No consumer needs the per-edge variant.                                                                                                                                                                                                       |
| `borderRightBackgroundColor`                     | Remove.                                                                                                                                                                         | No consumer needs the per-edge variant.                                                                                                                                                                                                       |
| `backgroundColor`                                | Retain a paint color; omission/removal adds no Box background override.                                                                                                         | Runtime must fill empty content and padding cells as well as glyph cells; a Text wrapper cannot do that.                                                                                                                                      |
| `overflow`                                       | Remove.                                                                                                                                                                         | It is convenience syntax and the unsupported horizontal axis should not be published to preserve the shorthand.                                                                                                                               |
| `overflowX`                                      | Remove.                                                                                                                                                                         | Horizontal clipping is Runtime-owned when needed, but no real application currently needs a public switch. Keeping the mechanism private leaves an additive path later.                                                                       |
| `overflowY`                                      | Retain `"visible" \| "hidden"`; default/reset `"visible"`.                                                                                                                      | ScrollBox concretely needs a vertical viewport, and the same accepted clip must constrain paint and interaction.                                                                                                                              |
| `display`                                        | Retain `"flex" \| "none"`; default/reset `"flex"`.                                                                                                                              | `v-show` and TSX need one Runtime operation that removes a subtree from layout, paint, focus, measurement, caret, and pointer targeting together.                                                                                             |
| `ariaLabel`                                      | Retain `string`; omission or the current empty string leaves child text unchanged.                                                                                              | Runtime alone can replace a Box subtree with an application label in the screen-reader transcript.                                                                                                                                            |
| `ariaHidden`                                     | Retain Vue's Boolean prop shape; omitted/false is included in a screen-reader transcript and true hides the subtree from that transcript; visual output is unchanged.           | Runtime alone owns semantic transcript omission. The vouched known edge remains: the literal template string `aria-hidden="false"` is truthy and hides from the transcript, while `:aria-hidden="false"` does not.                            |
| `ariaRole`                                       | Retain the vouched `AriaRole` union exactly; omission adds no role.                                                                                                             | Runtime prefixes a semantic role and suppresses only a duplicate immediate-parent role in its screen-reader transcript. This accepted accessibility surface is not reopened by the unstamped API audit.                                       |
| `ariaState`                                      | Retain the vouched `AriaState` object exactly; omission adds no state, and mutation of a stable reactive object is observed on the next accepted frame.                         | Runtime prefixes the true state keys in object order and ignores false/omitted keys. The behavior is limited but is an accepted accessibility contract, not evidence for publishing a generic semantic tree.                                  |
| `onClick`, `onMouseDown`, `onMouseUp`, `onWheel` | Remove all four `never` tombstones from public props.                                                                                                                           | Fullscreen pointer facts use `useMouse()`; Runtime may still diagnose these unsupported browser-style attributes without advertising them as accepted props.                                                                                  |

Absolute positioning has no shorthand or percentage path. The only public offsets are `left` and `top`; an omitted offset starts at content-box offset zero. Supplying an offset without `position="absolute"` is an error before a candidate layout is accepted. This smaller rule avoids freezing Yoga's relative, static, percentage, trailing-anchor, or stretch behavior.

The exact Text ledger is:

| Current prop                                     | Target contract and decision                                                                                                                                                                                                                  | Why this is or is not a Runtime primitive                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color`                                          | Retain a paint color or `"revert" \| "initial"`; omission/removal inherits the enclosing foreground.                                                                                                                                          | Runtime owns nested styled runs, terminal reset codes, clipping, and repaint. Machud and all representative applications use foreground color.                                                                                                                                                                 |
| `backgroundColor`                                | Retain a paint color; omission/removal inherits the enclosing background.                                                                                                                                                                     | ErrorOverview uses it, and Runtime must apply it to the actual grapheme cells. No reset token is added without a real need.                                                                                                                                                                                    |
| `dimColor`                                       | Retain Boolean; default/reset false.                                                                                                                                                                                                          | Real consumers need it, and Runtime must compose SGR state across nested runs.                                                                                                                                                                                                                                 |
| `bold`                                           | Retain Boolean; default/reset false.                                                                                                                                                                                                          | Machud and representative applications use it; Runtime owns nested SGR restoration.                                                                                                                                                                                                                            |
| `italic`                                         | Remove.                                                                                                                                                                                                                                       | No Text-prop consumer uses it; mo emits already-styled ANSI text instead.                                                                                                                                                                                                                                      |
| `underline`                                      | Remove.                                                                                                                                                                                                                                       | No Text-prop consumer uses it; it can be added later without changing ownership.                                                                                                                                                                                                                               |
| `strikethrough`                                  | Remove.                                                                                                                                                                                                                                       | No real consumer uses it.                                                                                                                                                                                                                                                                                      |
| `inverse`                                        | Retain Boolean; default/reset false.                                                                                                                                                                                                          | A public-only selectable-text implementation needs a theme-independent way to mark arbitrary existing foreground/background combinations; Runtime must invert the accepted glyph cells without exposing paint runs.                                                                                            |
| `wrap`                                           | Retain only `"wrap" \| "truncate"`; default/reset `"wrap"`. Remove `"hard"`, `"truncate-end"`, `"truncate-middle"`, and `"truncate-start"`. Every accepted reactive change still invalidates measurement so the result equals a fresh render. | Runtime alone knows grapheme widths and the accepted Box width. Machud and Flappy Bird use end truncation; the other modes have only hypothetical examples, and the end alias is duplicate. The older six-mode vouch established this correctness invariant, not sufficient application demand for every mode. |
| `ariaLabel`                                      | Retain with the same non-empty-label and omission semantics as Box.                                                                                                                                                                           | Runtime replaces the visual string only in its screen-reader transcript; ErrorOverview uses this.                                                                                                                                                                                                              |
| `ariaHidden`                                     | Retain with the same Boolean, transcript-only omission, and known literal-string behavior as Box.                                                                                                                                             | Runtime alone can omit the text from its semantic transcript while preserving visual output.                                                                                                                                                                                                                   |
| `onClick`, `onMouseDown`, `onMouseUp`, `onWheel` | Remove all four public tombstones.                                                                                                                                                                                                            | Pointer input targets rendered refs through `/fullscreen`, not listener-shaped Text props.                                                                                                                                                                                                                     |

`wrap` preserves explicit newlines, prefers word boundaries, and breaks an overlong token only between complete graphemes. `truncate` applies end truncation independently to each explicit input line and does not create soft-wrapped rows. A reactive change between the two modes invalidates measurement before paint.

Across visual Inline, visual Fullscreen, string rendering, and visual non-TTY documents, the same accepted layout and paint rules apply; only the writer differs. Screen-reader presentation uses `flexDirection`, `display`, and the four accessibility props to produce document-order text; visual string rendering ignores accessibility substitutions. Purely visual color and border validation is skipped only while the whole app is in screen-reader presentation, including for a subtree omitted there by `ariaHidden`, preserving the accepted behavior that inaccessible paint cannot crash semantic output. The Boolean text-style flags are inert there. On every visual host `ariaHidden` has no effect on paint or validation. Layout numbers, layout enums, `display`, wrapping, and structured accessibility values still validate because they affect structure or transcript behavior.

For visual candidates, Runtime-validated wrong JavaScript types fail with `TypeError`, out-of-range numbers fail with `RangeError`, and unsupported strings fail with an error naming the prop and value before any host patch. A final visual surface above the combined cell limit fails with Runtime's own `RangeError` before its grid is allocated. Box and Text also reject every undeclared Vue attribute before creating a host node: removed mouse listeners receive an actionable Fullscreen-composable message, while stale props, typos, and browser-only attributes receive a generic closed-surface error. Vue removes `key`, `ref`, and vnode lifecycle hooks before the component sees `$attrs`, so those component mechanics remain available. Vue-shaped Boolean props retain Vue's normal bare-attribute and coercion behavior rather than adding a second Runtime Boolean protocol; the vouched truthy literal `aria-hidden="false"` case is the deliberate edge. Omission, `undefined`, or reactive prop removal restores the declared default rather than leaving stale Yoga or painter state. An invalid reactive replacement, layout failure, or paint failure does not publish a partial layout, element size, focus topology, text mapping, caret, or pointer generation; the last accepted facts remain authoritative until the application enters its fatal lifecycle. `display="none"` is absence, not a visible zero-sized node.

A single untyped `style` object was rejected because it would hide the same promises behind a broad bag and weaken Vue prop validation. Shorthands were rejected because ordinary application code can expand the supported cases with no Runtime privilege:

```ts
const paddingX = (value: number) => ({ paddingLeft: value, paddingRight: value });
```

`gap` is different because Runtime computes it over the final rendered sibling sequence. Publishing Yoga nodes, measured runs, ANSI spans, or a generic painter would be larger and less stable than the retained declarative facts.

### Public conveniences removed or moved

`Newline` is public Text composition:

```vue
<Text>{{ "\n".repeat(count) }}</Text>
```

`Spacer` is public Box composition:

```vue
<Box :flexGrow="1" :flexShrink="1" />
```

They require no Runtime privilege and have no real consumer, so their values and named prop types leave Runtime. They may later live in `@vue-tui/components` if application practice justifies keeping the names.

`useAnimation()` is a Vue-owned timer policy that already works outside a Runtime tree. Spinner is its only non-test consumer and can own that timer locally. The hook and its option/return types leave Runtime; this does not require creating `@vue-tui/use`.

`Transform` does require a renderer hook to rewrite final lines, but no application uses it and “not externally implementable” is not enough to satisfy the inclusion criteria. The existing mechanism remains private for now, including the vouched rule that an all-comment slot produces no node. That older vouch settles correct behavior conditional on the mechanism; this newer boundary goal explicitly supersedes treating it as product evidence for a public component. A later real need can justify a narrower transform primitive without compatibility pressure from the current speculative component. The same additive rule applies to custom border glyph objects and a second end-truncation alias.

### Implementation and evidence

Path 0 now implements the boundary above. The common root exports `createApp`, `renderToString`, `Box`, and `Text` plus the unrelated values still awaiting their own path audits; it no longer exports `Newline`, `Spacer`, `Transform`, `useAnimation`, or their named public types. `BoxProps` has exactly the 28 listed keys and `TextProps` exactly the eight listed keys. Render-time validation enforces the bounded numeric, enum, accessibility, color, and closed `renderToString` option contracts before a host patch; a separate pre-allocation guard rejects a final paint surface above 1,048,576 cells. Screen-reader documents retain the explicitly selected paint-validation exception. Vue attribute inheritance is disabled on both primitives, and every remaining `$attrs` key fails before host creation, so removed props, typos, listeners, and browser attributes cannot silently disappear or reach a raw host. Package/type fixtures prove the exact positive and negative surface.

The user migration is ordinary public composition rather than a privileged replacement. Repository and pinned applications expand `paddingX` into `paddingLeft` plus `paddingRight`; line breaks use Text content; a spacer is an empty growing Box; Spinner owns and disposes its Vue-scoped timer. `@vue-tui/components`, every example, the fixed capacity workloads, and the pinned coding-agent, mo, and machud sources contain no Runtime internal or source import. The three pinned applications type-check and build against a packed Runtime; their real PTY journeys cover coding-agent interaction, mo accept/cancel, and machud snapshot, resize, theme change, quit, and terminal restoration.

Runtime retained the existing Yoga, paint, ANSI, screen-reader, nested-Text, geometry, and raw transform hosts instead of replacing the renderer. Focused private tests now prove raw transform output and per-line indexing, update remeasurement, control-sequence sanitization, and viewport containment without restoring a public Transform component. Public-path regressions separately prove exact decimal percentage layout, border removal and restoration, nested vertical clip intersection, complete ZWJ grapheme clipping at the terminal edge, reactive accessibility-state snapshots, and string-render cleanup and option rejection. The previous broad public tests for removed Yoga values, border variants, text styles, wrap modes, and animation policy were deleted rather than relabeled as product evidence.

The required one-round adversarial review used two fresh reviewers on the same Path 0 target. It found real acceptance blockers rather than merely test gaps: removed props could disappear through Vue `$attrs`, the numeric contract admitted values Runtime could not allocate, `marginLeft` had only test evidence, relative imports could bypass the package scan, and the private six-mode wrap plus all-comment Transform vouches had lost direct tests. It also found that `ariaState` could be read twice between validation and storage. The fixes closed all remaining attributes, bounded both dimensions and combined paint allocation, removed `marginLeft`, resolved relative-import targets and scanned executable fixtures for stale props, restored private-only evidence without public exports, and snapshot each accessibility entry from one read. This was the bounded review round for the phase; no second review round was added after the reported findings were fixed.

Final local evidence is green through `vp run ready`: Runtime, testing, components, integration, PTY, and example suites all pass together with every build, formatting, zero-warning lint, repository type check, PTY fixture type check, and the clean packed consumer on Vue 3.4.38 plus TypeScript 6.0.3. Fixed capacity journeys J1 through both small and large J6 Inline/Fullscreen workloads pass, including release and retention checks. Fresh packed-source runs of coding-agent, mo, and machud pass their build or type gates and real PTY journeys. The earlier image-observed basic-template journey preserved the 20-column border, color, wrapping, counter update, normal-buffer exit, exact termios, and post-exit shell input; the Spinner journey showed only the colored glyph advancing while its label and layout remained stable, then restored the terminal and accepted a shell command. Post-review changes closed invalid-input, resource-limit, boundary-scan, and private-evidence paths without changing either valid visual fixture. No GitHub workflow was used to obtain this evidence.

One dependency remains deliberately open across paths: `Text.inverse` is retained provisionally because the Path 6 public-only selection composition needs a theme-independent highlight primitive. Path 6 must either prove that use through only the common public Text contract or remove `inverse`; its presence is not justified merely by the existing internal selection implementation.

## Path 1: rendering, layout, viewport, and element measurement

### Pre-Path 1 user code

At the Path 1 audit baseline, the machud consumer used the broad APIs this way:

```ts
const { columns, rows } = useLayoutSize();

const box = shallowRef<ComponentPublicInstance | null>(null);
const { geometry } = useElementGeometry(box);
const width = computed(() => {
  const value = geometry.value;
  return value.status === "zero-size" ||
    value.status === "fully-clipped" ||
    value.status === "visible"
    ? value.parent.width || 24
    : 24;
});
```

`ScrollBox` performs the same status test twice merely to obtain `parent.height`. No application consumer reads geometry fragments, visible rectangles, surface coordinates, or the distinction among the seven public geometry states. No application consumer reads the full render session.

The only external product consumer is machud at pinned commit `a51a685`: its root reads width for a responsive breakpoint and rows only to decide whether a live dashboard has enough vertical space to center; its `Graph` and `Sparkline` read the width assigned by flex layout. The pinned coding-agent and mo consumers read none of the three baseline APIs. Repository tests read geometry positions and fragments to locate fixture cells, and the baseline `@vue-tui/testing` exposed the exact broad session object through an internal observer, but those were test instrumentation and implementation coupling rather than application tasks.

### Actual user problem

Applications need three different facts, and combining them makes the common case harder:

- Every host has a numeric root layout width, including string and unbounded stream rendering.
- Only a finite visual layout has a numeric viewport height. That absence belongs on the height-specific hook, not on the universally available width path.
- A rendered Box may not have an accepted measurement yet. When it does, current consumers need its final full width and height, including a fully clipped Box, not the complete paint provenance used internally for hit testing and caret placement.

The physical stream's `columns` and `rows` are not substitutes. Runtime resolves custom streams, terminal probing, Inline versus Fullscreen allocation, screen-reader transcript fallback, non-TTY output, resize, and string rendering before it knows the layout facts it can promise.

The bounded-height need is not hypothetical. The pinned machud source at `a51a685` reads both live terminal axes and uses rows to decide whether its dashboard can be vertically centered:

```ts
const { columns, rows } = useWindowSize();
const width = computed(() => props.columns || columns.value || 120);
const vh = computed(() => (isLive.value ? rows.value || 24 : props.rows || 0));
const framed = computed(() => vh.value > contentRows.value);
```

The migration must preserve that task without treating an unbounded one-shot stream as a 24-row viewport:

```ts
const layoutWidth = useLayoutWidth();
const viewportHeight = useViewportHeight();
const width = computed(() => props.columns || layoutWidth.value);
const vh = computed(() => (isLive.value ? (viewportHeight?.value ?? 0) : props.rows || 0));
```

The zero fallback is deliberate: machud's one-shot path already top-aligns when no real row bound exists, and a non-TTY or fallback live host must not invent a 24-row viewport. The first-party scroll example independently needs the same finite-height fact to allocate a bounded scrolling region. No product consumer needs viewport columns separately from the root layout width.

### Proposed Runtime primitives

```ts
function useLayoutWidth(): Readonly<Ref<number>>;
function useViewportHeight(): Readonly<Ref<number>> | null;

interface BoxSize {
  readonly width: number;
  readonly height: number;
}

function useBoxSize(
  target: Readonly<Ref<InstanceType<typeof Box> | null | undefined>>,
): Readonly<Ref<BoxSize | null>>;
```

`useLayoutWidth()` is the unconditional path. `useViewportHeight()` is the opt-in gate for code that really needs a row bound; it returns a numeric ref for a bounded visual layout and returns `null` once at setup for an unbounded document. Boundedness is fixed for a mounted render host, while the number inside a bounded ref remains reactive across resize. A final-output or screen-reader TTY can report physical terminal rows while intentionally laying out an unbounded document, so callers do not carry a nullable value through every width or height calculation. `useBoxSize()` makes the inherently dynamic pre-paint or absent-target decision in its value. It deliberately accepts only a Vue ref bound directly to `Box` in the current app: every real size consumer uses a template or shallow ref to measure a Box, while accepting raw values or getters adds no Runtime-only capability and calling the broader concept an element would prematurely commit Runtime to bounding fragmented nested Text and choosing one host from a multi-root component. A caller that needs a derived target can construct a `computed()` ref outside Runtime. A non-ref, non-Box, or foreign-app target is a programming error and is reported through the current render tree's error lifecycle rather than escaping Runtime's commit scheduler. None of these APIs exposes requested/effective mode resolution, writer strategy, paint fragments, clipping provenance, or renderer nodes.

### Resulting user code

```ts
const columns = useLayoutWidth();
const viewportHeight = useViewportHeight();

const box = shallowRef<InstanceType<typeof Box> | null>(null);
const size = useBoxSize(box);
const graphWidth = computed(() => size.value?.width || 24);
```

The common width path is always numeric. Code that genuinely requires a bounded visual height opts into one explicit nullable fact:

```ts
const viewportHeight = useViewportHeight();
const visibleRows = computed(() => viewportHeight?.value ?? 8);
```

### Public-only higher-layer composition

`ScrollBox` needs no private geometry:

```ts
const viewportSize = useBoxSize(viewportRef);
const contentSize = useBoxSize(contentRef);

const maxScroll = computed(() =>
  Math.max(0, (contentSize.value?.height ?? 0) - (viewportSize.value?.height ?? 0)),
);
```

This is sufficient for the current component and both real machud measurement consumers. Pointer hit testing, caret placement, and text mapping continue to use richer private accepted-paint data directly; they do not need to recover it from the public size projection.

### Host and lifecycle semantics

| Host                                              | `useLayoutWidth()`                                       | `useViewportHeight()`                   | `useBoxSize()`                                                                 |
| ------------------------------------------------- | -------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| Live visual Inline TTY                            | Reactive numeric layout columns                          | Numeric terminal-bounded maximum height | `null` before accepted paint; then full numeric size                           |
| Live visual Fullscreen TTY                        | Reactive numeric viewport columns                        | Numeric exact fixed height              | `null` before accepted paint; then full numeric size                           |
| Screen-reader transcript, including a TTY         | Numeric transcript layout columns                        | `null`                                  | `null` because there is no visual paint geometry                               |
| Live visual non-TTY stream                        | Reactive numeric columns, falling back to 80 when absent | `null`                                  | Numeric only after that host accepts a visual document paint; otherwise `null` |
| Final-output stream, including a TTY forced final | Fixed numeric columns, falling back to 80 when absent    | `null`                                  | Numeric only after that host accepts a visual document paint; otherwise `null` |
| String rendering                                  | Option columns, defaulting to 80                         | `null`                                  | `null`; synchronous output must not depend on a later measurement render       |

For `useBoxSize()`, a legitimate zero-sized Box is `{ width: 0, height: 0 }`; a fully clipped Box retains its full numeric size. An accepted detached, authored-hidden, or newly retargeted Box becomes `null`. Repeated accepted frames with the same dimensions retain the same frozen value. A failed output commit, output invalidation, or suspension does not replace the last accepted size for the same target. Vue updates may continue while the terminal is suspended, but Runtime has no accepted surface on which to publish a replacement size; resume settles the current tree and publishes a changed size only with the next accepted repaint. Layout width and viewport height retain their last coherent values while suspended, and an invalid visual resize pair preserves that pair. After unmount, the two layout refs retain their final values and stop updating, while a Box-size ref becomes `null` with its detached target. Calling any of the three hooks outside a vue-tui render tree fails clearly; string rendering supplies a real tree and therefore returns its width plus the documented null absences.

### Retained internal mechanisms

- Render-session resolution and atomic dimension replacement.
- Terminal-size probing and coherent terminal-size selection.
- Yoga root constraints for Inline and Fullscreen.
- Accepted-paint geometry generations, fragments, clipping, paint order, and caret slots.
- Rendered-target lifetime tracking and synchronous invalidation.
- Geometry demand tracking and bounded caches.

### Public contracts changed or removed

- Replace `useLayoutSize()` and `UseLayoutSizeReturn` with an unconditional readonly width ref from `useLayoutWidth()` and a one-time bounded-height gate from `useViewportHeight()`; no named wrapper or duplicate viewport-size type is added.
- Replace `useElementGeometry()` and its public geometry/status/fragment types with Box-only `useBoxSize()` and `BoxSize`.
- Remove `useRenderSession()` and the public render-session graph unless another audited path proves a narrower missing fact. The internal session remains authoritative.
- Remove `@vue-tui/testing`'s public `TestRenderSession` and `RenderResult.session`: no consumer uses them, their fields repeat configured host inputs or internal resolution, and a test can observe the accepted narrow facts inside its component while asserting output and screen behavior outside.
- Keep a small cell point type only if the accepted caret or pointer primitives require it; it is not justified by element size itself.

### Simpler alternatives considered

- Keeping `{ columns, rows: number | null }` was rejected because every consumer of the universally available width inherits an unrelated absence state.
- Returning `{ columns, rows } | null` from `useViewportSize()` was rejected because bounded viewport columns are always the same accepted root layout width and no product consumer needs a second copy. The height-specific hook is the smaller capability gate.
- Naming the measurement `useElementSize()` was rejected because the evidenced targets are all Boxes. It would also promise unneeded and unstable rules for fragmented nested Text and multi-root component refs; Text mapping remains a separate Path 4 decision.
- Accepting a raw Box or `MaybeRefOrGetter` was rejected because every real consumer already has a Vue ref, raw values cannot represent detachment or retargeting, and a caller can wrap a derived target in `computed()` without Runtime help.
- Returning zero before measurement was rejected because it conflates a real zero-sized element with an unavailable measurement.
- Returning Yoga layout directly was rejected because final paint, clipping, hidden state, target replacement, and failed commits can make it differ from the accepted interactive result.
- Keeping the full session for capability checks was rejected because it exposes several internal decisions while granting no capability that the smaller hooks do not already provide.

### Implementation status and acceptance evidence

The worktree implementation follows this target boundary: the common root exports `useLayoutWidth()`, `useViewportHeight()`, `useBoxSize()`, and `BoxSize`; the broad session and geometry projections are no longer public; and `@vue-tui/testing` no longer publishes the session graph. The internal render-session resolver, accepted-paint geometry service, target-lifetime controller, and richer caret and mouse data remain in Runtime rather than being reconstructed above it. This implementation does not make Path 1 accepted by declaration alone; acceptance still requires all of the evidence below.

Focused executable evidence lives in [`layout-size.test.tsx`](../../packages/runtime-tests/integration/composables/layout-size.test.tsx), [`use-box-size.test.tsx`](../../packages/runtime-tests/integration/composables/use-box-size.test.tsx), [`use-box-size-cross-app.test.tsx`](../../packages/runtime-tests/integration/composables/use-box-size-cross-app.test.tsx), and [`use-box-size-string-target.test.tsx`](../../packages/runtime-tests/integration/composables/use-box-size-string-target.test.tsx). Each live invalid-target case deliberately mounts and flushes a healthy app afterward. Together with the unrelated `onRender` failure regression, this proves that a component or commit failure is routed through only its owning app's lifecycle and cannot strand Vue's shared post-flush queue.

- Focused tests for every host row above, retargeting, hidden state, clipping, resize, failed writes, suspension, non-Box misuse, and foreign-app rejection.
- Migration of ScrollBox, the scroll example, machud's packed patch, public type tests, docs, and clean-consumer checks.
- Migration of geometry-dependent test instrumentation to known fixture coordinates, screen observations, or private mechanism tests without restoring public paint fragments.
- Proof that no first-party application package reads full public geometry or render-session fields after migration, and that the testing package no longer publishes the session graph.
- Terminal-visible review where the migrations change displayed behavior.

## Path 2: Inline history

The coding-agent currently gives Runtime its collection and index identity policy:

```vue
<Static :items="completedMessages">
  <template #default="{ item, index }">
    <MessageList :key="index" :message="item" />
  </template>
</Static>
```

The current `/inline` `Static` therefore contains two different responsibilities: Runtime's irreversible output transaction and a collection policy based on an append-only `items` prefix with `Object.is` identity. The transaction is Runtime-only; Vue already composes the collection. The replacement is a single-slot commit primitive used through normal keyed iteration:

```vue
<Static v-for="entry in completedMessages" :key="entry.id">
  <MessageList :message="entry.message" />
</Static>
```

The coding-agent migration wraps each completed message at creation with a monotonic application ID. Runtime does not manufacture identity for application data.

This retains the vouched behavior that every mounted Static region is honored. It does not overturn Vue's vouched scoped-slot convention: if a future collection wrapper supplies `{ item, index }`, it must still use one Vue slot-props object rather than React-style positional arguments. The minimum Runtime primitive itself supplies no collection item or index, so it has no scoped payload to expose.

The public contract is one mounted instance, one slot tree, one commit attempt. A successful output-free commit also settles the instance, so content that is not ready must gate the `<Static>` instance itself with `v-if`; comment-anchor details must not decide whether a later child is treated as new history. `items`, `style`, the `{ item, index }` payload, and all five current named Static types are removed. Layout inside one history block remains ordinary public composition:

```vue
<Static>
  <Box flexDirection="row">
    <Text>A</Text>
    <Text>B</Text>
  </Box>
</Static>
```

There is intentionally no cross-instance Yoga layout. The old `style="row"` collection could output `AB` for items added in one batch but different output when appended over time; that timing-dependent collection layout is not a stable Runtime primitive. Stable Vue keys are required when a repeated higher layer maps logical items to instances. Reusing index keys after insertion or reorder can correctly preserve an already committed component instance while silently associating it with different application data, so the coding-agent migration must give messages stable identities rather than presenting index keys as safe general usage.

The intended identity is the ordinary Vue component instance: it writes once while that mounted instance remains alive. Template-only HMR preserves the instance and does not replay accepted history; a script reload or explicit remount creates a new instance and therefore a new history region. Preserving commits across remount would require a session-level ID ledger and a public identity policy, so it is deliberately not part of the minimum primitive.

Static is a block-level history boundary, not an inline text run or a recursively composable history container. Runtime rejects placement inside Text or Transform before Yoga insertion, and rejects any Static nested at any depth inside another Static before output. Supporting nested history while preserving slot-tree order would require a larger segmented commit model with no application need. A Static below a Box hidden by authored `display="none"` or Box-rooted `v-show` remains open rather than bypassing the hidden subtree; it commits exactly once after every hidden ancestor becomes visible. Fullscreen still rejects Static presence even when an ancestor is hidden because the unsupported capability is mounted on that surface.

Read-only fault probing exposed a bug in the current internal transaction. `abandon()` records only the old host-child identity after an indeterminate throwing write. If that write synchronously replaces the slot child before fatal teardown, the final commit sees the replacement as fresh and writes it. The retained mechanism must instead seal the entire Static host instance as accepted or abandoned before any post-write callback can re-enter Vue; an abandoned instance never writes a later replacement. This is an internal correctness fix and does not justify a public item-identity API.

The host matrix is explicit: visual Inline commits history; Fullscreen requested but screen-reader-fallback effective Inline commits a transcript; a visual non-TTY stream commits each settled Static block while retaining only the mutable tail for teardown; string rendering prepends each Static block to the dynamic document; effective visual Fullscreen rejects component presence before emitting history or a new frame. Current tree order applies among the open instances prepared in one transaction. Terminal history is irreversible, so an instance mounted later appends physically even if Vue inserts it before an already accepted sibling. A stream `write()` returning `false` still accepts the bytes exactly once and settles the instance while Runtime waits for drain. A throwing write has indeterminate physical handoff and seals the instance as abandoned without retry.

Implementation now uses an `open | accepted | abandoned` state on each internal Static host. A successful transaction seals every prepared host before any acceptance callback can re-enter Vue, then releases each accepted slot subtree and its Yoga nodes while preserving the public component instance as its identity. An indeterminate write abandons the whole host, so a synchronous slot replacement cannot become eligible during fatal teardown. String rendering waits for the complete synchronous Vue mount before collecting Static hosts, avoiding premature acceptance between host insertion and slot insertion. Focused unit and integration tests cover initial and appended keyed instances, accepted update and reorder, remount, output-free acceptance, multiple regions, tree order, later-before-accepted insertion, subtree release, ordinary Box composition, removed-attribute fallthrough, backpressure, re-entrant append, re-entrant replacement plus throwing write, resize, suspension, external-output ordering, teardown, screen-reader output, non-TTY output, Fullscreen rejection, and string rendering. Adversarial review additionally found nested-history reordering, hidden-ancestor leakage, and a Text-context Yoga assertion; the placement validation and hidden-pending rules above close those paths in live visual, live screen-reader, visual string, and screen-reader string tests. The packed clean consumer and pinned coding-agent consumer pass with the no-prop `/inline` export. A final real PTY visual journey shows `DONE 0`, `DONE 1`, and `DONE 2` exactly once followed by only the newest mutable `TAIL 2`; the application exits with matching terminal attributes, and the restored parent shell accepts a new command. Path 2 has no remaining acceptance gate.

## Path 3: normalized input, focus, and routing

### Current user code

The coding-agent example needs a text composer, an approval dialog, and one application-wide quit command. Its simple editing path currently has to understand parser output, a Runtime focus graph, and four-way routing:

```ts
useFocusedInput(composer, (event) => {
  if (event.kind === "key" && event.key.name === "return" && event.key.phase !== "release") {
    void submit();
    return "consume";
  }
  if (event.kind === "text") {
    inputText.value += event.text;
    return "consume";
  }
  if (
    event.kind === "key" &&
    event.key.reportedText !== null &&
    event.key.phase !== "release" &&
    !event.key.modifiers.ctrl &&
    !event.key.modifiers.alt &&
    !event.key.modifiers.meta &&
    !event.key.modifiers.super &&
    !event.key.modifiers.hyper
  ) {
    inputText.value += event.key.reportedText;
    return "consume";
  }
  return "continue";
});
```

The mo and machud consumer patches repeat the same reconstruction of application text from `text`, Kitty `reportedText`, key phase, and modifier fields. No real consumer uses protocol identity, sequence fidelity, codepoints, functional codes, lock modifiers, uninterpreted facts, public input availability, external forwarding, handler refs, Kitty flags, or Runtime focus traversal as an application feature.

### Actual user problem

Applications need Runtime to turn terminal byte chunks into three stable facts: typed text, pasted text, or a recognized non-text key. Active subscriptions must own exactly the terminal resources they require, follow their Vue lifetime, survive suspension correctly, and receive a fact against the subscription set captured when that fact begins.

A third party cannot build that subscription from `useStdin().stdin`. Runtime owns UTF-8 and escape-sequence framing across chunks, bracketed paste, Kitty query replies, raw and protocol modes, shared listeners, suspend and resume, and fact-start subscription capture. Moving `useInput()` above Runtime would require publishing an equivalent managed normalized subscription under another name.

Focus selection, scope trees, modal traps, restoration, Tab order, and propagation are different. One higher-level provider can register exactly one application-wide Runtime subscription, snapshot its own route when the normalized callback begins, and dispatch through its own Vue `provide`/`inject` graph. Independent focused handlers do not need privileged Runtime registrations. The one renderer fact that such a provider cannot derive is whether a direct Box ref is part of the last accepted live renderer tree and outside every `display:none` ancestor. `useBoxSize()` cannot supply that fact because screen-reader output has no visual geometry and clipping or zero size does not make a logical control absent.

### Proposed Runtime primitives

The supported surface is deliberately small:

```ts
type TuiKeyName =
  | "backspace"
  | "delete"
  | "down"
  | "end"
  | "enter"
  | "escape"
  | "home"
  | "left"
  | "page-down"
  | "page-up"
  | "right"
  | "tab"
  | "up";

type TuiInputEvent =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "paste"; readonly text: string }
  | {
      readonly kind: "key";
      readonly name: TuiKeyName;
      readonly character?: never;
      readonly shift: boolean;
      readonly alt: boolean;
      readonly ctrl: boolean;
    }
  | {
      readonly kind: "key";
      readonly character: string;
      readonly name?: never;
      readonly shift: boolean;
      readonly alt: boolean;
      readonly ctrl: boolean;
    };

function useInput(
  handler: (event: TuiInputEvent) => void | { readonly preventDefault: true },
  options?: { readonly isActive?: MaybeRefOrGetter<boolean> },
): void;

function useBoxPresence<T extends PublicBoxInstance>(
  target: Readonly<Ref<T | null | undefined>>,
): Readonly<Ref<boolean>>;
```

`useInput()` is application-wide. Active subscriptions captured for one fact all run; one result never stops a peer. Most handlers return nothing. The only special result, `{ preventDefault: true }`, suppresses Runtime's default for that fact without reporting an action or controlling higher-level propagation. A plain handler is sufficient: a reactive callback can close over a ref or call `handler.value(event)`, so Runtime does not publish `MaybeRef<InputHandler>`, `InputHandler`, `InputHandlerResult`, or a named options wrapper.

Every event is frozen. `text` is insertion-ready text exactly as reported by the terminal and may contain more than one Unicode scalar because a byte chunk does not prove physical key boundaries. `paste` is one complete bracketed-paste payload whose contents are never reinterpreted as keys. A named key uses only the finite vocabulary above. A character key carries one Unicode scalar representing the unshifted shortcut identity and is not insertion text; ASCII `A` through `Z` normalize to lowercase. Modifiers live directly on the key event so ordinary code reads `event.ctrl` without a parser-shaped nested object or another named public type. This separation lets an editor append every `text` or `paste` without reconstructing `reportedText`, while Ctrl+C remains a key with `character: "c"`.

The projection is explicit:

- Plain UTF-8 becomes `text`, preserving actual case and content without inventing Shift. Kitty associated text becomes `text` only for a printable non-release report with no Ctrl, Alt, Kitty Meta, Super, or Hyper; Shift and lock state may already be reflected in that terminal-supplied text. Runtime never synthesizes insertion text from a Kitty key code alone: under the privately selected disambiguation mode, the [Kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) sends text-producing input as plain UTF-8 and uses `CSI u` for keys that did not produce text.
- A printable key without safe associated text becomes a character key when Runtime can resolve one Unicode scalar shortcut identity. Kitty uses `baseLayoutCodepoint` when available and otherwise its primary codepoint, so a physical Latin shortcut can remain stable across a non-Latin layout. Legacy ESC-prefix Meta is the terminal convention for Alt and projects as public `alt`.
- Kitty Meta, Super, or Hyper chords are not projected until one of those modifiers has an evidenced public contract; dropping the bit while delivering the key would turn a modified action into an unmodified one. Caps Lock and Num Lock are not public chord modifiers and do not by themselves suppress text or a supported key.
- Carriage return, line feed, and keypad Enter normalize to `enter`; supported keypad navigation normalizes to its ordinary direction, Home, End, Page, Backspace, or Delete identity; `pageup` and `pagedown` normalize to `page-up` and `page-down`.
- Press and repeat produce the same public shape, so a repeat is another event. Release-only, function, Insert, Clear, media, standalone modifier, complete-but-unsupported, invalid, and uninterpreted facts are not projected. A finite pending standalone Escape becomes `escape`; incomplete protocol frames remain pending rather than leaking partial bytes.

Bytes remain observable through the raw `useStdin()` escape hatch, but that does not provide semantic framing. Runtime internally requests only the protocol facts required for this projection; alternate-layout key information does not become a public parser field.

The only valid results are `undefined` or the exact plain object `{ preventDefault: true }`. Runtime reads the result once. A Promise, another primitive, `false`, `{}`, `preventDefault: false`, an inherited field, or an additional field is a programming error. The application fact fails closed, the ordinary fatal lifecycle restores the terminal, and another app sharing the physical stdin is not cancelled.

Runtime keeps exactly one application default: an unshifted, non-Alt character key `c` with `ctrl: true` exits the app after every captured Runtime subscription has run unless any delivered handler requested `preventDefault`. Kitty Meta, Super, and Hyper were already filtered; Caps Lock and Num Lock do not alter the default. Legacy terminals cannot distinguish Ctrl+C from Ctrl+Shift+C, which remains an explicit protocol limitation, while Kitty's distinguishable Ctrl+Shift+C does not exit. An application using Ctrl+C for copy or another action explicitly prevents it. Stopping a route inside a higher-level hub does not implicitly prevent the Runtime default. Runtime removes automatic Tab traversal because terminals have no native Tab-focus behavior that Runtime must restore; Tab navigation is application policy.

`useBoxPresence()` is the accepted renderer fact needed by any alternative focus implementation. It is `true` only when the direct same-app Box belongs to the last accepted live renderer tree, is outside Static history, and neither it nor an ancestor has `display:none`. It is `false` before the first accepted live render, after a candidate containing detach, removal, or hiding is accepted, at app teardown, and throughout string rendering. A zero-sized, completely clipped, overlapped, or scrolled-out Box remains present: those conditions affect visual reachability, not logical interaction ownership. Live screen-reader presentation and mounted non-TTY output publish presence even though neither supplies visual interaction geometry. Suspension and a discarded or failed candidate retain the last accepted value. A same-logical-target keyed replacement is one transaction and does not publish a false interval. Disposing a binding during candidate removal retires it until that candidate is accepted instead of publishing an unaccepted false value. Non-Box and cross-app refs fail with the same direct-Box rules as `useBoxSize()`.

### Public-only higher-layer composition

A replaceable focus package can create one provider using only Vue, `useInput()`, and `useBoxPresence()`:

```ts
const FocusHubKey = Symbol();

const FocusProvider = defineComponent({
  setup(_, { slots }) {
    const hub = createFocusHub();
    provide(FocusHubKey, hub);
    useInput(
      (event) => {
        const route = hub.snapshotRoute();
        const result = route.dispatch(event);
        return result.preventDefault ? { preventDefault: true } : undefined;
      },
      { isActive: () => hub.hasActiveHandlers() },
    );
    return () => slots.default?.();
  },
});

function useFocusTarget(box, options = {}) {
  const hub = inject(FocusHubKey)!;
  const present = useBoxPresence(box);
  const eligible = computed(() => present.value && !toValue(options.disabled ?? false));
  const target = hub.registerTarget({ eligible });
  onScopeDispose(() => hub.unregisterTarget(target));
  return target;
}
```

The hub freezes its target, scope, trap, and handler route before invoking any of its callbacks. It can implement focused handlers, nearest-to-farthest logical scopes through Vue providers, targetless traps, exact-handle restoration, explicit application order, and its own `stopPropagation` result. None of those decisions enter Runtime. A form with known controls keeps its handles in the desired order; no renderer-preorder or wrap policy is required. This is proof of replaceability, not an official `@vue-tui/use` deliverable.

The coding-agent does not need a generic focus package at all. Its product states already determine the one valid input owner:

```ts
useInput((event) => {
  if (state.value === "approving") {
    if (event.kind === "key" && (event.name === "enter" || event.name === "escape")) {
      finishApproval(event.name === "enter");
    }
    return;
  }

  if (state.value === "idle") {
    if (event.kind === "text" || event.kind === "paste") {
      inputText.value += event.text;
      return;
    }
    if (event.kind === "key" && event.name === "backspace") {
      eraseLastGrapheme();
    } else if (event.kind === "key" && event.name === "enter") {
      void submit();
    }
  }
});
```

Ordinary handled input returns nothing. A component that repurposes Ctrl+C for copy is the exceptional case:

```ts
useInput((event) => {
  if (event.kind === "key" && event.character === "c" && event.ctrl) {
    copySelection();
    return { preventDefault: true };
  }
});
```

### Host and lifecycle semantics

- Inline and Fullscreen use the same normalized keyboard input rules. Runtime does not define focus rules.
- Screen-reader transcript output remains interactive when the supplied stdin can be safely managed.
- A non-TTY stdout does not by itself disable input when stdin is a controllable TTY.
- Registering active managed input against an uncontrollable stdin fails before Runtime changes any terminal state. A dormant subscription does not acquire input until activated.
- String rendering has no live input; `useInput()` and `useBoxPresence()` remain inert so shared render-only components can render without acquiring resources.
- A mounted non-TTY document is still a live Vue renderer tree, so it publishes Box presence even when its mutable output is deferred until teardown.
- Suspension retains logical subscriptions and the last Box-presence map while releasing physical input resources; resume reacquires resources before delivery and updates presence only with an accepted live render.
- `useBoxPresence()` alone never creates input demand. A higher-level provider gates one `useInput()` registration according to its own active routes.
- Vue scope disposal and HMR end the corresponding Runtime subscription. One fact always uses the subscription membership captured at its start, even when an earlier handler changes another subscription's reactive activation.

### Retained internal mechanisms

- The streaming parser, UTF-8 and escape framing, normalized internal fact model, Kitty negotiation and reply ownership, bracketed-paste framing, and raw-mode lifecycle.
- Shared-stdin application snapshots, all-run subscription capture, delayed Runtime defaults, and suspend/resume resource state.
- Rendered-target lifetime, synchronous subtree invalidation, inherited `display:none` scanning, accepted-frame transactions, and atomic target replacement needed to publish one complete Box-presence map.
- Internal protocol facts needed for terminal resource management, even though they are no longer projected to ordinary applications.

### Public contracts changed or removed

- Redesign `TuiInputEvent` to insertion `text`, complete `paste`, and the finite `key` projection shown above. Retain only `TuiInputEvent` and `TuiKeyName`; remove protocol, sequence, fidelity, codepoint, phase, release, parser-origin, nested modifier, lock-modifier, and uninterpreted fields. Key repeats arrive as repeated events; release events are not projected until a real application need establishes stable semantics.
- Replace `"continue"`, `"consume"`, the four-field `InputRouteDecision`, `InputHandler`, `InputHandlerResult`, and `UseInputOptions` with an inline ordinary handler, reactive activation, and the one exact `preventDefault` result.
- Add `useBoxPresence()` as the single accepted live renderer fact needed by replaceable interaction layers.
- Remove `useFocus()`, `useFocusScope()`, `useFocusedInput()`, `useFocusScopeInput()`, `useFocusManager()`, all supporting public focus types, Runtime Tab traversal, public focus routing, and propagation policy.
- Remove `useExternalInput()`. Its normalized Unicode `sequence` is not lossless child-PTY input and therefore does not solve terminal-pane forwarding. Transparent terminal transport remains explicitly outside this foundation until a real pane design establishes ownership, encoding, exclusivity, and protocol semantics.
- Remove `useInputAvailability()` for now. Active subscriptions already fail before mutation when managed input is unavailable; a public capability fact can be added when a real application must render one live tree differently based on that availability.
- Remove public `MountOptions.kittyKeyboard`, `kittyFlags`, `kittyModifiers`, `KittyKeyboardOptions`, and `KittyFlagName`. They are protocol controls with no real consumer, and application-selected flags would make the stable projection depend on parser configuration. Runtime privately probes a demanded TTY pair, uses only the protocol facts needed by the public projection, falls back to legacy input, and restores its stack on suspend, signal, HMR, and teardown.

### Alternatives, implementation, and evidence

Moving `useInput()` itself above Runtime was rejected because Runtime would still have to expose an equivalent managed normalized subscription service. Retaining focus attachment inside `useInput()` was rejected after the single-hub composition proved that third parties do not need independent focused Runtime registrations. Reusing `useBoxSize()` for eligibility was rejected because it is absent in live screen-reader presentation and makes clipping or zero size look like logical absence. Keeping `"consume"` was rejected because it combines route stopping, default prevention, external blocking, and an unused action report.

The accepted limitation is explicit: Runtime does not impose one modal boundary across multiple unrelated third-party routers, does not expose parser-byte-start ownership to a high-level router, and does not publish renderer-preorder traversal. One chosen provider can give its own application a complete normalized-event-start snapshot, targetless modal isolation, and explicit target order. A later real need may add a narrower renderer-order or hard-boundary fact without changing the primitives above. Transparent child-terminal forwarding remains outside the foundation rather than being approximated by normalized Unicode.

Path 3 now implements the reduced surface above. The common root exports only `useInput()`, `TuiInputEvent`, `TuiKeyName`, and `useBoxPresence()` from this path. Public focus and scope values, input availability and external forwarding, parser-shaped event fields, routing decisions, public Kitty controls, and the old cell-coordinate caret are absent rather than retained as compatibility aliases. Repository examples, capacity workloads, ScrollBox composition, and the packed clean consumer use the reduced contract. The clean consumer's focus hub imports only Vue and the common Runtime root; package checks also reject the removed names and both the string-keyed and repository-symbol Kitty mount controls. The repository-only symbol is accepted only through an `InternalMountOptions` intersection on `/internal`, and generated root declarations contain neither that symbol nor its protocol option type.

The retained input implementation still owns streaming UTF-8 and escape framing, bracketed paste, shared-stdin snapshots, raw mode, and private Kitty negotiation. Production starts negotiation only for semantic input demand, requests only disambiguation, falls back without changing the public event shape, and restores or abandons its protocol ownership on every lifecycle path. A cancelled in-flight query may keep a finite reply tombstone while the app remains mounted, but dropping the owning application now removes that tombstone, timer, and shared listener immediately. Reactive `isActive` validation no longer throws from a Vue watch source: an invalid replacement first withdraws the subscription and then enters the ordinary fatal Runtime lifecycle exactly once. A thrown handler or invalid handler result likewise enters that lifecycle while the shared ingress still delivers the same fact to another mounted application; tests prove rejection, raw-mode release, listener ownership, and continued peer input.

Box presence is published from the accepted renderer transaction rather than inferred from Yoga dimensions. The implementation covers direct and inherited `display:none`, removal, Static history, zero size and clipping, screen-reader and non-TTY live trees, string absence, suspension, failed candidates, atomic retargeting, cross-app validation, binding disposal, and teardown. The public-only focus proof covers focus, nested scopes, a targetless trap, restoration, route snapshots, and provider-local propagation without any Runtime internal import.

Focused local evidence is green: five Runtime files pass 154 tests, the Path 3 integration set includes the 29-test public input suite, and the ScrollBox composition passes 14 tests. The retained real-PTY input file passes 46 tests, while the seven other migrated PTY files pass 36; these include legacy and Kitty Ctrl+C defaults, private automatic negotiation, query-reply filtering, adjacent ordinary input, one push/pop lifetime, paste, scrolling, suspension, rendering, mouse, and selection paths. The complete local `vp run ready` gate passes: Runtime 810 tests, testing 89, components 34, Runtime integration 1,025, Vite 30, PTY 138, and example PTY smoke 6, together with builds, formatting, zero-warning lint, repository and fixture type checks, and the packed clean consumer on Vue 3.4.38 with TypeScript 6.0.3. Fresh packed-source verification of the pinned coding-agent, mo, and machud revisions passes their builds, tests or format gates, and real PTY journeys using only the reduced public input contract. Global scans find no stale focus APIs, nested parser fields, handler phases, or `consume`/`continue` results in those patches.

The bounded Path 3 adversarial review used two independent reviewers. They found four acceptance blockers: handler failures did not initiate fatal cleanup, the internal Kitty symbol leaked through public `MountOptions`, the exhaustive ledger contradicted the accepted focus removal, and README release wording ignored the bounded Kitty-reply tombstone. The implementation, declaration guard, lifecycle regression tests, ledger, and README now close those four findings. The reviewers found no other blocking defect in the normalized facts, Ctrl+C behavior, host matrix, resource ownership, Box-presence contract, or public-only focus proof. No GitHub workflow or Docker run was used for this evidence.

Path 3 withdraws the old public cell-coordinate `useCaret()` together with public focus; it retains the private writer and restoration mechanism as implementation material. Path 4 may republish a caret primitive only if the semantic Text contract below survives its own boundary audit, so no transitional focus-free cell API is introduced.

## Path 4: editable text and the terminal caret

### Current user code and the stale-cell failure

The current caret API asks an application to calculate a rendered cell itself:

```ts
const focus = useFocus(inputHost, { autoFocus: true });
useCaret(textHost, {
  focus,
  position: computed(() => ({ x: cursorColumn.value, y: cursorRow.value })),
});
```

The coding-agent cannot reproduce Runtime's final text layout and instead appends a `█` glyph. That fails for editing in the middle, wide or combining graphemes, wrapping, clipping, nested styles, and overlap. An earlier audit draft proposed public `cells[]` and `stops[]`, but adversarial inspection found that this would expose the current trace representation while still omitting which graphemes survived final clipping and later overlapping paint. It also permits a point from an old accepted layout to be reinterpreted against a newly reflowed frame, placing the physical caret at the wrong semantic offset.

### Actual user problem

A text editor owns a string and a semantic insertion position. It needs a bidirectional query against one immutable accepted Text layout, while Runtime needs to map that same semantic position atomically through the candidate paint when placing the physical caret. Only the painter knows grapheme boundaries, explicit and soft wrapping, nested style ownership, clipping, overlap, failed output, and the terminal cell that remains visible.

### Proposed Runtime primitives

```ts
interface CellPoint {
  readonly x: number;
  readonly y: number;
}

interface TextPosition {
  readonly offset: number;
  readonly affinity: "backward" | "forward";
}

interface ResolvedTextPosition {
  readonly point: CellPoint;
  readonly visible: boolean;
}

interface TextLayout {
  readonly text: string;
  resolve(position: TextPosition): ResolvedTextPosition | null;
  positionAt(
    point: CellPoint,
    options?: {
      readonly nearest?: boolean;
      readonly visibleOnly?: boolean;
    },
  ): TextPosition | null;
}

function useTextLayout<T extends PublicTextInstance>(
  target: Readonly<Ref<T | null | undefined>>,
): Readonly<Ref<TextLayout | null>>;

function useCaret<T extends PublicTextInstance>(
  target: Readonly<Ref<T | null | undefined>>,
  position: MaybeRefOrGetter<TextPosition | null | undefined>,
): void;
```

`CellPoint` contains safe-integer cell coordinates; the operation using it defines the origin and bounds. Offsets are UTF-16 boundaries into `text`, matching JavaScript slicing. Affinity chooses the visual side of an offset that lies on a soft-wrap boundary; where only one visual position exists, both affinities resolve to it. `resolve()` returns a non-negative target-local cell and whether the corresponding grapheme or insertion stop is visible after clipping and overlap. The immutable query object hides arrays, cache keys, cell identities, surface origins, and trace order.

`positionAt()` defaults both `nearest` and `visibleOnly` to false. An exact point on the first cell of a double-width grapheme maps to the boundary before it; its second cell maps to the boundary after it. If a terminal-width implementation ever produces an exact midpoint, the later document position wins. With `nearest: true`, candidates are ordered first by absolute row distance, then column distance, then later document position, so a captured drag outside the target clamps deterministically. `visibleOnly: true` filters out insertion positions whose associated painted cells did not survive clipping or later overlap; it does not alter tie-breaking.

Both hooks accept only a Vue ref bound directly to one top-level, non-transformed, non-truncated Text in the same Runtime app. They do not accept a generic component, Box, raw host node, or getter. Nested styled Text belongs to that semantic document when Runtime can preserve its grapheme ownership; splitting one grapheme across independently owned nested Text makes the mapping unavailable. This deliberate boundary supports TextInput and owned selectable text without pretending Runtime can truthfully map every arbitrary transformed subtree. The nominal `PublicTextInstance` constraint is carried by the exported Text component type and does not require another root convenience export.

`useCaret()` accepts the semantic position, not a cell copied from a previous frame. Runtime resolves it against the candidate paint, hides it when the position or target did not survive the final paint, and restores the one physical cursor after every successful commit. Focus is not an argument: a higher interaction layer makes an inactive editor's position `null`. Runtime therefore owns only the terminal constraint that at most one non-null, resolvable caret declaration may survive one accepted frame; competing declarations are a programming error rather than paint-order arbitration. It returns no diagnostic state. A generic Box or grid caret is withheld because no real consumer requires it.

### Public-only higher-layer composition

```ts
const layout = useTextLayout(textRef);
const cursor = shallowRef<TextPosition>({ offset: 0, affinity: "forward" });

useCaret(
  textRef,
  computed(() => (focus.isFocused.value ? cursor.value : null)),
);

function moveDown() {
  const current = layout.value?.resolve(cursor.value);
  if (!current) return;
  const next = layout.value?.positionAt(
    { x: preferredColumn.value, y: current.point.y + 1 },
    { nearest: true },
  );
  if (next) cursor.value = next;
}
```

A third-party TextInput can use the same queries for left, right, vertical, and line movement. An owned selectable-text component stores `{ anchor, extent }`, maps Fullscreen mouse-local cells with `positionAt()`, slices `layout.text`, and renders its own selected runs with inverse styling. The foundation does not promise that an outer composable can inject highlighting into an arbitrary existing Text slot tree while preserving every authored style; the component that offers selection owns its semantic document or styled runs.

### Host, absence, and lifecycle semantics

- `useTextLayout()` is `null` before the first accepted paint, after detach or retarget, after an accepted hidden frame, and whenever a truthful mapping is unsupported. Empty Text is a valid document with offset `0`.
- A failed output attempt retains the previous accepted layout. Suspension retains that snapshot but hides the physical caret; resume publishes the refreshed mapping only with a successful repaint.
- Live visual Inline and Fullscreen hosts expose the mapping. Final-output, screen-reader, and string hosts expose `null` and emit no caret controls.
- A malformed initial target or position throws synchronously before registration. A malformed reactive replacement enters the ordinary fatal lifecycle without publishing a partial caret intent. A structurally valid safe-integer offset that is temporarily out of range or not a grapheme boundary simply does not resolve and therefore hides the caret.
- Runtime retains the same query object when text mapping and final visibility are unchanged, so selection-only styling does not create a reactive render loop.

### Retained internals and removed contracts

Retain the grapheme trace, wrap and provenance caches, nested-owner mapping, clipping and overlap data, accepted-frame transaction, caret arbiter, terminal cursor ownership, failed-frame rollback, sibling repaint correction, and suspend/resume restoration. The current caret slots account for clipping but not later sibling overwrite; Path 4 must reuse or generalize the private selection provenance that already records surviving painted cells, and must add frame-final provenance for empty and trailing insertion stops. Remove public `CaretState`, geometry fragments, hidden reasons, the focus dependency, and the current cell-coordinate caret input. Remove the public `useTextSelection()` controller and all of its command, range, state, copy, movement, and unavailability types; those are one high-level selection policy. Do not publish the raw cells/stops draft.

Before acceptance, prove the query and semantic caret on ASCII, wide and combining graphemes, explicit newlines, soft-wrap affinity, nested styles, empty Text, clipping, overlap, retargeting, `v-show`, failure, resize, suspension, final output, screen reader, string rendering, unsupported transform/truncation, stable query identity, and a bounded long document. A representative third-party-style TextInput and owned selectable-text fixture must use only supported entry points.

## Path 5: lifecycle, output ownership, suspension, and package integrations

### Current user code and actual problems

Applications currently receive ten supported mount controls, four custom app methods, three stream composables, and the entire `/internal` barrel. Most of this surface came from testing the implementation rather than from applications:

```ts
app.mount({
  stdout,
  stdin,
  stderr,
  mode: "fullscreen",
  liveUpdates: true,
  maxFps: 30,
  incrementalRendering: true,
  kittyKeyboard: { flags: ["disambiguateEscapeCodes"] },
});
```

The real lifecycle tasks found in consumers are smaller. A mount must select its streams, Inline or Fullscreen screen model, accessible presentation, and console ownership. A component must be able to exit; the code that owns the mounted app must be able to wait for exit and for a specific accepted frame to cross its output barrier. Only Runtime can settle those operations after output and terminal restoration.

The mo consumer currently uses a 50 ms delay as a guess that its last frame is visible. Its selector invokes `onSelect` and `onCancel` synchronously, so merely making those prop callbacks `async` would leave rejection unobserved and could leave the outer `withPathSelector()` promise pending. The migration needs one once-only handoff chain whose synchronous prop callbacks start it and whose own `try`/`catch` settles the outer promise:

```ts
type Outcome = { kind: "select"; path: string } | { kind: "cancel" };

let finishing = false;
const release = async (): Promise<void> => {
  const directFailures: unknown[] = [];
  try {
    await app.waitUntilRenderFlush();
  } catch (error) {
    directFailures.push(error);
  }
  try {
    app.unmount();
  } catch (error) {
    directFailures.push(error);
  }

  try {
    await app.waitUntilExit();
  } catch (error) {
    throw error; // authoritative lifecycle and restoration failure
  }

  if (directFailures.length === 1) throw directFailures[0];
  if (directFailures.length > 1) {
    throw new AggregateError(directFailures, "Failed to release the selector terminal.");
  }
};

const finish = (outcome: Outcome): void => {
  if (finishing) return;
  finishing = true;

  void release()
    .then(() => {
      if (outcome.kind === "cancel") throw new Error("Canceled.");
      return action(outcome.path);
    })
    .then(resolve, reject);
};

const app = createApp(Selector, {
  onSelect: (path: string) => finish({ kind: "select", path }),
  onCancel: () => finish({ kind: "cancel" }),
});
app.mount();
```

The flush barrier proves that the last application frame crossed its output barrier; the exit barrier proves that asynchronous terminal restoration finished after unmount. Calling the command immediately after the void `unmount()` result would still race raw-mode and terminal restoration. This is concrete evidence for both existing app-level barriers, but it is not evidence for handing a still-mounted terminal to `$EDITOR`, `less`, or `fzf`. No application consumer uses mounted terminal handoff, component-level flush, public frame-rate tuning, incremental-render selection, render timing callbacks, forced live ANSI on a pipe, Kitty flags, `app.clear()`, or imperative coordinated stdout/stderr.

### Proposed mount and app primitives

```ts
interface MountOptions {
  readonly stdout?: NodeJS.WriteStream;
  readonly stdin?: NodeJS.ReadStream;
  readonly stderr?: NodeJS.WriteStream;
  readonly mode?: "inline" | "fullscreen";
  readonly presentation?: "visual" | "screen-reader";
  readonly patchConsole?: boolean;
}

interface TuiApp extends Omit<VueApp<TuiNode>, "mount"> {
  mount(options?: MountOptions): ComponentPublicInstance;
  waitUntilExit(): Promise<unknown>;
  waitUntilRenderFlush(): Promise<void>;
}

interface UseAppReturn {
  readonly exit: (errorOrResult?: unknown) => void;
}
```

Omitting `mode` continues to select Inline. Omitting `presentation` continues to honor the supported screen-reader environment convention and otherwise selects visual output; an explicit value is the application and test override. `patchConsole` remains enabled by default with the vouched explicit `false` opt-out. Unknown or invalid mount fields fail before stream access or terminal mutation. The same-stdout second mount keeps the vouched warning and returns its empty inert placeholder without wiring Vue or terminal resources. Its flush barrier resolves immediately, and its own `unmount()` settles its exit promise with `undefined`; neither operation observes or disturbs the live owner. Once the owner unmounts, a fresh app may acquire that stdout normally.

`waitUntilRenderFlush()` waits for the latest scheduled Runtime frame and its output barrier on a live host. On a final-output host it waits until Runtime has accepted the latest logical document without violating the host policy by emitting early. Output failure rejects the waiter and enters the ordinary fatal lifecycle. While suspended, logical updates may coalesce but the operation does not claim they became terminal-visible.

The call-state contract is explicit. Before the first `mount()` attempt, `waitUntilRenderFlush()` returns a rejected promise without reading or writing any default or supplied stream; it never falls back to `process.stdout`. During a successful mount it may wait for the first candidate transaction. On a live visual host, a call snapshots the latest scheduled frame at the time of the call and resolves only after that frame is accepted by the writer; if called while suspended, it waits for resume, repaint, and that output barrier. If the app exits before the suspended frame can become visible, the call rejects rather than hanging or claiming visibility. On screen-reader and final-output hosts it resolves at the host's audited logical acceptance point; it does not wait for a nonexistent repaint and does not force deferred mutable bytes to be emitted early. After clean teardown, a new call resolves immediately for the last successfully accepted document. After mount, render, output, or teardown failure, a new or pending call rejects with the stored authoritative failure. Repeated calls for the same accepted generation do not schedule or write another frame.

`waitUntilExit()` settles only after owned output and restoration work. `exit(Error)` and genuine cross-realm Errors reject with the same Error identity after durable error reporting; `exit(value)` for a non-Error resolves that first result. Any value thrown by setup, render, or a Runtime-delivered handler is always a failure: a genuine Error is preserved, while a non-Error is wrapped in an Error whose message is the same safe message shown by ErrorOverview. Falsy throws cannot turn into a clean exit or a pending promise. Ordinary unmount resolves `undefined`. Cleanup attempts every owned release. A clean exit with restoration failures rejects an `AggregateError`; when an application error already exists, that vouched application error remains primary and cleanup failures are reported as diagnostics rather than replacing it. Signal exit performs the best synchronous restoration available.

`waitUntilExit()` returns the same idempotent promise for the lifetime of the app. It may be obtained before mount and remains pending without touching streams. A failed mount rejects it only after every acquired resource has been released; later calls observe the same rejection. A clean teardown resolves it once, and later calls observe the same result. Suspension alone never settles it. Calling Vue's `unmount()` before a mount attempt is an inert no-op that neither settles this promise nor prevents a later mount. After one mount attempt has begun, another `mount()` on the same app, including after failure or teardown, throws before acquiring a stream or terminal resource; `unmount()` after teardown is idempotent. This one-attempt rule keeps setup failure, teardown, and promise identity unambiguous.

`waitUntilRenderFlush()` is intentionally on `TuiApp`, not `useApp()`: the evidenced caller owns mount and unmount outside the component tree. `useApp()` retains only `exit()`, which is the one lifecycle action a rendered component must initiate. A component that needs to coordinate ordinary application work can update reactive state; exposing the host barrier inside every component would make output timing an application concern without a consumer.

`useApp()` must be called during a Runtime render. Every live host provides the same first-call-wins `exit()` operation; retaining and calling it after teardown is inert. String rendering provides the shape so shared components can render, but invoking `exit()` throws a descriptive live-operation-unavailable error and never changes the synchronous render result.

### Mounted terminal handoff is explicitly deferred

The current signal-driven suspend/resume machinery remains necessary and private: Runtime must release and restore raw input, bracketed paste, Kitty negotiation, mouse reporting, the caret, cursor visibility, the alternate screen, dimensions, output scheduling, and repaint baselines across `SIGTSTP` and `SIGCONT`. Keeping that mechanism does not itself justify a production API.

A future real journey that launches an interactive child while the Vue app remains mounted may justify one callback-scoped operation. That decision must establish whether the caller is inside or outside the component tree, nested-call behavior, callback and restoration error precedence, non-TTY behavior, HMR/unmount races, signal overlap, and when repaint becomes observable. Adding such an operation later is additive and does not require changing Runtime ownership. Publishing `suspendTerminal()` now would freeze all of those semantics using only a hypothetical task, so this audit removes it from the proposed foundation.

### Output conveniences withheld

Remove `useStdout()`, `useStderr()`, their return types, and `CoordinatedWriteResult` rather than replacing the current tri-state result immediately. The current `accepted | blocked | unavailable` shape exposes the output gate and makes `blocked` payload loss the caller's responsibility. No application uses it. Reactive UI, the Inline Static primitive, and the vouched default console coordination cover the evidenced tasks; a mount caller already owns custom streams and can provide one through ordinary Vue injection when deliberately bypassing Runtime.

If an application later proves a need for imperative geometry-safe output, the likely additive primitive is one Runtime-queued `Promise<void>` operation. Publishing it now would prematurely freeze queueing, cancellation, suspension, and teardown semantics.

`useStdin().stdin` is different and remains unchanged because a component cannot otherwise discover the exact stream selected by its mount caller. On every live host it is the identical supplied/default `NodeJS.ReadStream`, including a non-TTY stream; on string rendering it is an isolated inert stream because no mount stream exists. Reading it does not acquire raw mode, enable protocols, normalize chunks, participate in focus routing, pause a caller's own listeners during Runtime suspension, or make direct byte handling safe. The application owns every listener it attaches. This deliberately low-level escape hatch lets a specialized integration inspect bytes without forcing parser or external-forwarding internals into the public API.

Remove `app.clear()`. Updating the rendered Vue state can clear the mutable Runtime region, while Static owns committed history. The current method has no application consumer and its name invites confusion with destructive terminal-history clearing. The deliberate raw escape hatch remains the mount caller's stream before or after Runtime ownership; no mounted coordinated operation is allowed to erase pre-application history.

### Mount controls removed or internalized

- `liveUpdates` leaves the public API. A visual TTY updates live. A visual non-TTY emits committed Static history monotonically as each region settles and writes only its mutable tail at teardown; the concatenated bytes form one document and contain no dynamic cursor-rewrite protocol. CI is not a public host semantic. A future remote-terminal need can justify an explicit host adapter rather than making an ordinary pipe pretend to be a terminal.
- `onRender` leaves the public API because it is scheduler instrumentation with no application consumer.
- `maxFps` becomes an internal Runtime policy. It can be revisited when an application demonstrates a control need rather than a test need.
- `incrementalRendering` leaves the public API because Fullscreen row diffing and Inline update strategy are writer implementations.
- `kittyKeyboard`, `kittyFlags`, `kittyModifiers`, `KittyKeyboardOptions`, and `KittyFlagName` become internal. Runtime negotiates the protocol needed to produce the accepted public input facts.
- `isScreenReaderEnabled` is replaced by the smaller `presentation` request. Presentation resolution remains internal; components do not receive the full session graph.
- The current `clipboard` mount option is decided with the clipboard path rather than retained by lifecycle inertia.

The host policy is fixed: visual TTY mounts update live; Inline owns a bounded main-screen region and Fullscreen owns a fixed alternate-screen viewport; screen-reader presentation writes a main-screen transcript; visual non-TTY output is a monotonic document whose settled Static prefixes may be written immediately and whose mutable tail is written at teardown, without cursor-rewrite controls; string rendering is a synchronous visual document with no terminal resources.

| Host                       | Output ownership                                                                                    | Input and terminal resources                                                                                           | Suspension and teardown                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual Inline TTY          | Live bounded main-screen region; committed Static and pre-app scrollback are never erased           | Cursor plus only input protocols demanded by active subscriptions                                                      | Signal suspension releases the mutable region and owned modes; resume establishes a fresh baseline and repaints; teardown leaves committed history                                        |
| Visual Fullscreen TTY      | Live fixed viewport in the alternate screen                                                         | Alternate screen, cursor, and demanded input/mouse protocols                                                           | Signal suspension leaves the alternate screen and restores the cursor; resume refreshes dimensions, re-enters, repaints, then reacquires input; teardown reveals the original main screen |
| Screen-reader presentation | Ordered main-screen transcript; a non-TTY destination follows the same monotonic-document tail rule | No visual surface, geometry, caret, or mouse; normalized keyboard input remains independent when stdin is controllable | Existing transcript remains; suspension pauses new Runtime delivery/output and releases owned input; teardown never rewrites prior transcript                                             |
| Visual non-TTY stream      | Settled Static prefixes may write once; current mutable tail writes at teardown; no cursor rewrites | No terminal surface; normalized input is independently available only with a controllable stdin                        | Suspension has no fictional screen transition and releases only input resources actually owned; teardown completes the document                                                           |
| String rendering           | One synchronous visual document returned to the caller                                              | Isolated inert services; no streams, signals, input, focus, geometry, caret, or mouse                                  | No live lifecycle; resources are freed before return or throw                                                                                                                             |

A Fullscreen request does not manufacture a terminal surface: screen-reader presentation uses its transcript semantics, while a non-TTY destination uses the visual document semantics. These fallbacks do not emit warnings into redirected output. The public layout, mouse, and caret absence contracts reveal only the facts needed by their consumers rather than a general effective-mode object.

### Internal lifecycle corrections found by the audit

Three implementation defects must be fixed while retaining the current ownership machinery:

1. Runtime currently replaces a user-provided `app.config.errorHandler` during mount. The Vue app surface is public, so Runtime must compose the user's handler with its fatal cleanup path rather than overwrite it. A failure in the user's handler must not hide the original application failure or prevent restoration.
2. The current console patch callback ignores a coordinated-write `blocked` result, so console output can be dropped under backpressure. A Runtime-owned FIFO must retain console records across backpressure and suspension.
3. The installed console patch library stores process-global restoration state, so two concurrently mounted apps on different streams can restore the wrong methods. Runtime must install one process-global patch with a registry of active app sinks. Each app using the default participates in the same console broadcast and coordinates the record against its own output; `patchConsole: false` opts that app out. Removing either app unregisters only that sink, and the last removal restores the original console methods. This preserves the vouched ability for two apps to share stdin while both use default mount behavior.

These are internal correctness changes, not reasons to publish writer queues, scheduler state, or console ownership objects.

### Supported package integrations and removal of `/internal`

Remove the published catch-all `@vue-tui/runtime/internal`. Runtime tests can import source-private files directly, but published first-party packages receive no privilege unavailable to third parties.

`@vue-tui/vite` has one real integration need, so add one narrow supported subpath:

```ts
import { connectDevtools } from "@vue-tui/runtime/devtools";

connectDevtools(import.meta.hot);
```

It exports only `connectDevtools()` against an inline structural input with Vite's `on(event, callback)` and `send(event, data?)` operations. The Vite virtual module calls it before mounting and supplies its live hot context because Runtime is externalized and cannot read that context from its own `import.meta`. The deliberately small bridge supports one dev-connected mounted app per Runtime module instance: the first mounted app claims it, a second concurrent dev app rejects before stream or terminal mutation, and a later app may claim it after the first has unmounted or exited. A full reload unmounts the claimed renderer before Vite imports the new entry without settling `waitUntilExit()` as a user exit, while a genuine app exit notifies the dev server. Repeating the same hot object is idempotent in every phase. A distinct replacement hot context is accepted only after the previous app has released its claim; otherwise it rejects before installing listeners or changing dev state. A first connection attempted after an application has begun mounting and any structurally invalid input likewise fail before changing dev state. This one-app rule matches the real Vite journey and avoids inventing an app token solely for hypothetical concurrent dev servers; an app-scoped bridge can be added later if such a consumer appears. The integration does nothing to production or string rendering. A third-party development plugin can call the same supported function. Dev state, connection queries, claim and teardown registries, renderer nodes, Yoga, resource trackers, parsers, sessions, test symbols, and screen-reader helpers remain private.

The public-only migration proves that streams are sufficient for production-like screen state, key/paste input, resize, and the bytes of SGR mouse reports, but not for three supported testing tasks:

- `@vue-tui/testing` promises `frames` and `lastFrame()` as the renderer's logical content before terminal update controls. On a final-output host, the latest accepted logical frame is deliberately absent from stdout until teardown, so an emulator cannot reconstruct the pre-unmount result.
- Deterministic mouse tests cannot depend on the ambient `TERM` value. Feeding an SGR report through fake stdin exercises the real parser, but Runtime must first model that this test terminal supports SGR mouse reporting. Ordinary mount options must not let production applications manufacture that capability.
- A stream alone does not provide a deterministic input-settlement barrier. A bare Escape or short CSI prefix remains pending for the production parser's finite ambiguity interval, while an input handler may produce no render. `waitUntilRenderFlush()` therefore cannot prove that previously written input was parsed and routed, and a third-party framework should not reproduce the current arbitrary 30 ms sleep.

Suspension is also a legitimate test-host control even though no production handoff API is accepted: Runtime's package and third-party terminal test frameworks need to prove release, no-delivery, resume, and repaint behavior without sending process signals. These tasks justify one sealed, publicly documented integration rather than the catch-all `/internal` barrel:

```ts
// @vue-tui/runtime/testing
interface TestContentFrame {
  readonly dynamic: string;
  readonly staticOutput: string;
}

interface TestHostBridgeOptions {
  readonly onFrame?: (frame: TestContentFrame) => void;
  readonly mouse?: "sgr";
}

interface TestHostBridge {
  mount(app: TuiApp, options?: MountOptions): ComponentPublicInstance;
  writeInput(data: string | Uint8Array): Promise<void>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
}

function createTestHostBridge(options?: TestHostBridgeOptions): TestHostBridge;
```

The bridge is public to any test framework and `@vue-tui/testing` gets no other access. It is one-shot: `mount()` validates the bridge and ordinary mount options before mutation, can be called once, and becomes inactive when that app unmounts. A bridged mount never probes the process's controlling terminal: dimensions come only from the supplied stdout shape and Runtime's documented fallback, and mouse support is absent unless the bridge explicitly says `mouse: "sgr"`. `onFrame` runs after each non-teardown logical content transaction is accepted; `dynamic` is the current renderer document and `staticOutput` is only the new history accepted by that transaction, both retaining authored SGR styling but excluding terminal update controls. A throwing observer is test-instrumentation failure and fails the mounted app rather than being swallowed. Final-output hosts therefore remain physically deferred while still observable to a test framework.

`mouse: "sgr"` declares only the modeled terminal capability. `writeInput()` emits the supplied bytes through the mounted input stream and production UTF-8 decoder, parser, resource ownership, and public routing path; it does not inject a parsed fact. It resolves only after every complete fact caused by that call has finished synchronous routing, the ordinary finite Escape ambiguity interval has settled, and any resulting Vue update and output barrier have settled. A definite but incomplete protocol frame such as an unterminated bracketed paste or CSI rejects with a descriptive test-input error instead of waiting forever or inventing an event; the pending bytes remain available for a later completing call. Calls are serialized, fail while suspended or after teardown, and never consume unrelated bytes emitted directly by another stream owner. This gives a third-party framework a deterministic `stdin.write()` implementation without exposing parser state or a timer constant. `suspend()` and `resume()` invoke the same Runtime lifecycle transactions as process suspension and fail when unmounted or in the wrong phase. Suspension settles after owned resources are released. Resume settles after dimensions and demanded input resources are reacquired and the logical host is active on every host; it additionally waits for repaint only when the host owns a live visual surface. A final-output or non-TTY bridge neither hangs waiting for a nonexistent repaint nor emits its deferred mutable document early. The test framework still owns its streams, emulator, resize mutation, and cleanup.

No session snapshot, parser fact or state, ambiguity duration, Yoga node, renderer node, terminal-resource counter, arbitrary mount symbol, or direct fact-injection route is exposed. `@vue-tui/testing` removes `result.session`, clipboard modeling tied to the removed Runtime service, and its `updates` override; TTY versus stream determines live versus final output. This small `/testing` API is not an application-layer escape hatch, but it removes first-party privilege and lets a third party implement an equivalent testing package.

### Evidence required

Implementation must cover user error-handler composition; duplicate and distinct-output mounts; console ownership, backpressure, signal suspension, and teardown; every clean, application-error, output-error, and cleanup-error exit; signal suspension/resume and disposal; the non-TTY monotonic-document policy; complete, split, bare-Escape, no-render, incomplete, concurrent, suspended, and disposed test-input writes; every other test-bridge phase and failure; packed Vite and testing consumers; and a package assertion that `/internal` is not exported. The existing stream, parser, scheduler, suspension, restoration, console, and error machinery is retained unless a focused test proves a defect.

## Path 6: Fullscreen mouse input, scrolling, selection, and clipboard

### Current user code and actual problem

The current `/fullscreen` API exposes a synthesized click/wheel hook, a separate left-button drag state machine, and a complete one-Text selection controller:

```ts
useMouseEvent(box, "click", onClick);
useMouseEvent(scrollBox, "wheel", onWheel);
useMouseDrag(box, onDrag);
const selection = useTextSelection(text, { pointer: true });
```

These bundle application policies that third parties may reasonably choose differently: whether down and up form a click, which button drags, drag thresholds, double-click timing, focus-on-click, wheel-to-scroll conversion, selection movement, highlighting, and copy fallback. The Runtime-only work underneath is smaller: parse terminal mouse reports, enable and restore reporting modes, hit-test the last accepted Fullscreen paint, deliver through the rendered ancestry, and retain one target when a button gesture leaves its bounds.

Use the term mouse rather than pointer. The supported SGR protocol supplies mouse buttons and terminal cells, not touch, pressure, multiple pointer identities, or browser pointer semantics.

### Proposed Runtime primitive

```ts
type MouseButton = "left" | "middle" | "right";

interface MouseModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
}

interface CellDelta {
  readonly x: number;
  readonly y: number;
}

type TuiMouseEvent =
  | {
      readonly kind: "down" | "up";
      readonly button: MouseButton;
      readonly surface: CellPoint;
      readonly local: CellPoint | null;
      readonly modifiers: MouseModifiers;
    }
  | {
      readonly kind: "move";
      readonly button: MouseButton;
      readonly surface: CellPoint;
      readonly local: CellPoint | null;
      readonly modifiers: MouseModifiers;
    }
  | {
      readonly kind: "wheel";
      readonly delta: CellDelta;
      readonly surface: CellPoint;
      readonly local: CellPoint | null;
      readonly modifiers: MouseModifiers;
    }
  | { readonly kind: "cancel" };

interface MouseEventControls {
  stopPropagation(): void;
  capture(): boolean;
  releaseCapture(): void;
}

function useMouse(
  target: MaybeRefOrGetter<ComponentPublicInstance | null | undefined>,
  handler: MaybeRef<(event: TuiMouseEvent, controls: MouseEventControls) => void>,
  options?: { readonly isActive?: MaybeRefOrGetter<boolean> },
): void;
```

Fullscreen surface coordinates are stable non-negative public facts because Runtime owns origin `(0, 0)` for the fixed viewport. Local `CellPoint` coordinates are relative to the current receiver and may be negative or beyond its size during capture. For Box and top-level Text they continue affinely outside bounds; a nested or disjoint text mapping may return `null` while the surface point remains available. Motion exposes the currently pressed button but not a derived movement delta; a drag utility subtracts successive points. `CellDelta` is separate because wheel steps are signed displacement rather than a location: one SGR wheel report produces a safe-integer unit vector, positive x toward later columns/right and positive y toward later content/down. No hover, pixel position, side button, click count, or parser sequence is published.

Delivery begins at the topmost accepted visible hit and bubbles through rendered ancestors. Every handler attached to one receiver runs in its accepted registration order before `stopPropagation()` blocks the next ancestor. Events are frozen snapshots. Controls are valid only during the synchronous callback and throw if retained and called later. Only a `down` callback may capture; the first receiver on that route to capture wins, and later capture attempts return `false`. Capture belongs to the rendered host and the registration cohort accepted at acquisition, so a newly mounted or retargeted handler cannot inherit an in-progress gesture. Any handler in the owning receiver's captured cohort may release it; `up` releases it automatically.

Every visible active `useMouse()` target acquires button-motion SGR 1002 plus 1006 before its route is published. Runtime ignores motion when no public capture exists. This slightly broader physical level avoids pretending that a synchronous `capture()` can complete a new terminal write or backpressure barrier inside an event callback; capture itself changes only the already-acquired logical route and can therefore return a truthful boolean immediately. Removal of the last visible registration disables reporting. Removal, an accepted hidden frame, retarget, deactivation, suspension, an incompatible new button sequence, or resource failure emits one `cancel` to the live cohort when application callbacks remain safe, then releases capture and reporting. Teardown restoration is callback-silent. A thrown handler or returned Promise fails dispatch closed and still releases owned resources.

### Public-only higher-level composition

Click and drag require no private access:

```ts
function useClick(target: ElementTarget, onClick: () => void) {
  let down = false;
  useMouse(target, (event, controls) => {
    if (event.kind === "down" && event.button === "left") {
      down = controls.capture();
      controls.stopPropagation();
    } else if (event.kind === "up" && event.button === "left" && down) {
      down = false;
      onClick();
      controls.stopPropagation();
    } else if (event.kind === "cancel") {
      down = false;
    }
  });
}
```

A ScrollBox wheel policy calls its existing boolean scroll operation and stops propagation only when the inner box actually moves. When it reaches its boundary, the same event reaches an outer scroll region. This keeps the current useful boolean result while leaving input binding out of the component.

Owned text selection composes `useMouse()` with `useTextLayout()`: down and captured move map `event.local` with `positionAt(event.local, { nearest: true, visibleOnly: true })`, so motion outside the Text clamps to the nearest surviving position and a clipped or later-covered cell cannot select stale content; up releases and cancel abandons the gesture. Keyboard selection uses `useInput()` and the same semantic positions. The component renders its own styled runs. This demonstrates that Runtime does not need to publish one selection state machine.

### Host, failure, and lifecycle semantics

- Only accepted visible targets on an effective visual Fullscreen surface contribute reporting demand or receive facts.
- Visual Inline, screen-reader, string, final-output, and non-targetable non-TTY hosts are inert so a component that optionally enhances itself with the `/fullscreen` primitive can render unchanged elsewhere. The subpath name and this explicit absence contract are the capability gate; Runtime does not expose a full render-session query just to avoid an exception.
- A targetable Fullscreen registration whose stdin cannot be managed, or whose reporting-mode acquisition fails, fails before route publication and rolls back all resources.
- Failed output preserves the previous accepted hit map. Suspension cancels capture and releases mouse and input ownership; resume repaints before a visible registration reacquires it.
- Multiple applications may share one stdin, and SGR bytes contain no stdout or surface identity. Every app that has an accepted visible Fullscreen mouse registration on that stdin therefore receives the same parsed physical report and independently routes it against its own last accepted surface. Physical reporting-mode demand is reference-counted across the shared stdin; capture, propagation stopping, handler failure, and cancellation remain per app and never suppress another app's delivery. Runtime does not claim that one app uniquely owns the physical coordinates.
- A non-function initial handler, invalid initial `isActive`, or cross-app target fails before registration. An invalid reactive handler or activation replacement enters the ordinary fatal lifecycle without publishing a partial route. A detached or not-yet-painted same-app target is simply dormant. Returning a Promise from a handler is a programming error; a throw or invalid return fails this app's fact closed and releases capture without cancelling another app's independent delivery of the shared input fact.

### Selection and clipboard contracts removed or deferred

Remove `useMouseEvent()`, `useMouseDrag()`, and all current click, wheel, synthesized drag, handler-result, movement, options, and return types. Retain their parser, hit map, reporting, ancestry, and capture machinery behind `useMouse()`. Remove `useTextSelection()` and its seven public types; selection is demonstrated above using only public primitives.

Remove `useClipboard()`, its eight public result, availability, and transport types, and `MountOptions.clipboard`. A custom clipboard transport is ordinary application dependency injection, not terminal ownership:

```ts
const props = defineProps<{
  writeClipboard?: (text: string) => void | Promise<void>;
}>();

await props.writeClipboard?.(selectedText);
```

OSC 52 does require ordered terminal output, but no real consumer currently requires it, and terminal acceptance cannot be observed: Runtime can truthfully report only that it requested a copy. Deferring it does not create a foundation gap because application-supplied copying is complete and a future narrow `useTerminalClipboard().writeText()` request operation is additive. If a real consumer appears, that operation must not accept custom transports or report `copied`; it should report only requested, unavailable, or failed while serializing with Runtime output ownership.

### Evidence required

Implementation must prove targeting and local coordinates on Box and Text, overlapping paint, clipping, target and ancestor peer delivery, stop propagation, capture winner and frozen cohort, outside motion, automatic and explicit release, every cancel cause, resource rollback, suspension, teardown, failed frames, shared stdin, real SGR bytes, and all unsupported hosts. Public-only click, drag, nested ScrollBox, TextInput, and owned selection fixtures must compile and behave without Runtime internals. Package and type tests must reject the removed synthesized APIs and clipboard service.

## Audit and refactor gate

The seven paths numbered 0 through 6 now cover the current Runtime authoring surface and official cross-package dependencies. The exhaustive export ledger below must agree with these path decisions, and two independent package-boundary reviews must challenge both minimum size and application sufficiency before implementation begins. No current API is retained merely because it is already implemented or tested.

## Exhaustive current-export ledger

This ledger names every currently exported value and named type. “Replace” means no compatibility alias for the experimental contract; only the smaller contract described by the referenced path remains. Types that merely name a removed value's props, result, transport, or internal state leave with that value.

### Root values: 27 current

| Current value          | Decision                            | Reason and replacement                                                                                                                                                                                  |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Box`                  | Retain                              | Runtime-owned Yoga host and visual/accessibility paint primitive; Path 0.                                                                                                                               |
| `Text`                 | Retain                              | Runtime-owned semantic text, styling, wrapping, and transcript primitive; Paths 0 and 4.                                                                                                                |
| `createApp`            | Retain                              | Creates the Vue terminal renderer and owns live terminal lifecycle; Paths 0 and 5.                                                                                                                      |
| `renderToString`       | Retain                              | Synchronous terminal-layout document rendering without terminal resources; Path 0.                                                                                                                      |
| `Newline`              | Remove                              | `Text` composition; Path 0.                                                                                                                                                                             |
| `Spacer`               | Remove                              | Empty growing `Box` composition; Path 0.                                                                                                                                                                |
| `Transform`            | Keep private, defer public contract | Requires painter access but has no application evidence; Path 0.                                                                                                                                        |
| `useAnimation`         | Remove                              | Ordinary Vue timer policy, moved into its sole Spinner consumer; Path 0.                                                                                                                                |
| `useApp`               | Narrow                              | Retain only component-initiated `exit()`; flush stays on the externally owned `TuiApp` and mounted terminal handoff is deferred; Path 5.                                                                |
| `useInput`             | Redesign                            | Keep the Runtime-owned normalized subscription with smaller facts and one explicit Runtime-default prevention result; routing remains above Runtime; Path 3.                                            |
| `useInputAvailability` | Remove for now                      | No evidenced adaptive consumer; active managed input has explicit failure and string reuse is inert; Path 3.                                                                                            |
| `useFocus`             | Remove                              | Focus identity and eligibility compose above Runtime from Vue state plus the accepted-tree fact exposed by `useBoxPresence()`; Path 3.                                                                  |
| `useFocusScope`        | Remove                              | Scope and modal-trap ownership are higher-level routing policy demonstrably composable through one application-wide subscription; Path 3.                                                               |
| `useFocusedInput`      | Remove                              | A higher-level focus provider routes one public `useInput()` subscription; Runtime does not need one registration per focus target; Path 3.                                                             |
| `useFocusScopeInput`   | Remove                              | Scope-local handler routing belongs to the same replaceable higher-level provider; Path 3.                                                                                                              |
| `useFocusManager`      | Remove                              | No consumer needs generic renderer-order traversal; applications with known targets use their focus handles, while the internal focus policy remains available for a later evidenced primitive; Path 3. |
| `useExternalInput`     | Keep private, defer public contract | Current child-PTY fallthrough exposes normalized-source/router policy with no supported pane consumer; Path 3.                                                                                          |
| `useStdin`             | Retain unchanged                    | Vouched exact mounted raw stream escape hatch; Paths 3 and 5.                                                                                                                                           |
| `useStdout`            | Remove                              | Unevidenced imperative convenience with gate/backpressure result leakage; Path 5.                                                                                                                       |
| `useStderr`            | Remove                              | Same; Path 5.                                                                                                                                                                                           |
| `useLayoutSize`        | Replace                             | Split unconditional `useLayoutWidth()` from the one-time optional bounded `useViewportHeight()` gate; Path 1.                                                                                           |
| `useRenderSession`     | Remove                              | Exposes host resolution, presentation, cadence, dimensions, and capabilities as one internal graph; Paths 1 and 5.                                                                                      |
| `useElementGeometry`   | Replace                             | Box-only `useBoxSize()` exposes the evidenced accepted full size; rich paint geometry stays private; Path 1.                                                                                            |
| `useCaret`             | Redesign                            | Keep focus-bound physical caret ownership but accept a semantic `TextPosition` and return no diagnostics; Path 4.                                                                                       |
| `useClipboard`         | Remove                              | Custom transports and copy policy are externally composable; OSC 52 is explicitly deferred; Path 6.                                                                                                     |
| `kittyFlags`           | Remove                              | Input-protocol negotiation detail; Paths 3 and 5.                                                                                                                                                       |
| `kittyModifiers`       | Remove                              | Input-protocol parser detail; Paths 3 and 5.                                                                                                                                                            |

### Fullscreen and Inline values: four current

| Subpath value                    | Decision                | Reason and replacement                                                                         |
| -------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `/fullscreen` `useMouseEvent`    | Replace with `useMouse` | Click and wheel are policies; retain physical facts, targeting, bubbling, and capture; Path 6. |
| `/fullscreen` `useMouseDrag`     | Remove                  | Drag is public `useMouse` composition; Path 6.                                                 |
| `/fullscreen` `useTextSelection` | Remove                  | Selection is public input, mouse, text-layout, and rendering composition; Paths 4 and 6.       |
| `/inline` `Static`               | Redesign                | One mounted instance commits one slot tree once; remove collection and style policy; Path 2.   |

### Root named types: 62 current

| Current type group            | Exact current names                                                                                                                                                                                          | Decision                                                                                                                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App and rendering             | `MountOptions`, `TuiApp`, `RenderMode`, `RenderToStringOptions`                                                                                                                                              | Retain and narrow `MountOptions`; retain the other three. Keep the two-value presentation union inline rather than adding a convenience name; Paths 0 and 5.                                                                                                                                            |
| Box and Text                  | `AriaRole`, `AriaState`, `BoxLayoutStyle`, `BoxProps`, `BoxStyle`, `TextProps`                                                                                                                               | Retain `AriaRole`, `AriaState`, narrowed `BoxProps`/`TextProps`, and add the shared `Color` domain; remove collection-only `BoxLayoutStyle`, object-shaped custom `BoxStyle`, per-edge color/background/dim overrides, rejected mouse-listener tombstones, and duplicate `truncate-end`; Paths 0 and 2. |
| Removed component props       | `NewlineProps`, `SpacerProps`, `TransformProps`                                                                                                                                                              | Remove from the authoring barrel with their values. The private Transform mechanism may keep a source-private type; Path 0.                                                                                                                                                                             |
| App hook                      | `UseAppReturn`                                                                                                                                                                                               | Narrow to component-initiated `exit()`; Path 5.                                                                                                                                                                                                                                                         |
| Clipboard                     | `ClipboardAvailability`, `ClipboardTransport`, `ClipboardTransportResult`, `ClipboardUnavailableReason`, `ClipboardWriteResult`, `CustomClipboardTransport`, `Osc52ClipboardTransport`, `UseClipboardReturn` | Remove all eight; Path 6.                                                                                                                                                                                                                                                                               |
| Input availability            | `InputAvailability`, `UseInputAvailabilityReturn`                                                                                                                                                            | Remove both; Path 3.                                                                                                                                                                                                                                                                                    |
| Input facts and routing       | `InputHandler`, `InputHandlerResult`, `InputRouteDecision`, `TuiInputEvent`, `TuiInputModifiers`, `TuiInputPhase`, `TuiInputSource`, `UseInputOptions`                                                       | Retain and redesign only `TuiInputEvent`, plus the finite `TuiKeyName` support type. Inline the ordinary handler and reactive activation option; remove the named handler/result/options wrappers, routing decision, nested modifiers, phase, source, and parser facts; Path 3.                         |
| Focus and external forwarding | `ExternalInputHandler`, `ExternalInputSource`, `UseFocusManagerReturn`, `UseFocusOptions`, `UseFocusReturn`, `UseFocusScopeOptions`, `UseFocusScopeReturn`                                                   | Remove all seven. A public-only proof composes focus, scopes, traps, restoration, and propagation from Vue state, `useInput()`, and `useBoxPresence()`; normalized external forwarding is not transparent child-terminal transport; Path 3.                                                             |
| Streams                       | `CoordinatedWriteResult`, `UseStderrReturn`, `UseStdinReturn`, `UseStdoutReturn`                                                                                                                             | Retain only `UseStdinReturn`; Path 5.                                                                                                                                                                                                                                                                   |
| Layout and session            | `RenderLayoutSize`, `RenderModeResolution`, `RenderOutput`, `RenderSession`, `RenderSize`, `UseLayoutSizeReturn`                                                                                             | Remove the session graph and old return. The new width and optional-height projections need no named type; Path 1.                                                                                                                                                                                      |
| Caret                         | `CaretState`, `UseCaretOptions`, `UseCaretReturn`                                                                                                                                                            | Retain and redesign only `UseCaretOptions`; remove diagnostic state and return wrapper; add semantic text query types; Path 4.                                                                                                                                                                          |
| Animation                     | `UseAnimationOptions`, `UseAnimationReturn`                                                                                                                                                                  | Remove both; Path 0.                                                                                                                                                                                                                                                                                    |
| Geometry                      | `CellPoint`, `CellRect`, `ElementGeometry`, `ElementGeometryFragment`, `ElementTarget`, `UseElementGeometryReturn`                                                                                           | Retain the small shared `CellPoint` and target alias; remove the rect, geometry, fragment, and old return; add `BoxSize`; Paths 1, 4, and 6.                                                                                                                                                            |
| Kitty                         | `KittyKeyboardOptions`, `KittyFlagName`                                                                                                                                                                      | Remove both; Paths 3 and 5.                                                                                                                                                                                                                                                                             |

### Fullscreen named types: 20 current

| Current type group       | Exact current names                                                                                                                                                                                                                                                   | Decision                                                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mouse facts and handlers | `CellDelta`, `MouseButton`, `MouseDragHandler`, `MouseEventHandler`, `MouseHandlerResult`, `MouseModifiers`, `TuiMouseClickEvent`, `TuiMouseDragEvent`, `TuiMouseEventMap`, `TuiMouseWheelEvent`, `UseMouseDragOptions`, `UseMouseDragReturn`, `UseMouseEventOptions` | Retain `MouseButton` and `MouseModifiers`; narrow `CellDelta` to the signed wheel vector; replace the synthesized handler/event types with `TuiMouseEvent`, `MouseEventControls`, `MouseHandler`, and `UseMouseOptions`; Path 6. |
| Selection                | `TextSelectionCommands`, `TextSelectionCopyResult`, `TextSelectionMove`, `TextSelectionRange`, `TextSelectionState`, `TextSelectionUnavailableReason`, `UseTextSelectionOptions`                                                                                      | Remove all seven; Paths 4 and 6.                                                                                                                                                                                                 |

### Inline named types: five current

`StaticChildren`, `StaticProps`, `StaticSlot`, `StaticSlotProps`, and `StaticStyle` all describe the removed collection, scoped item payload, or cross-item layout policy. The redesigned no-prop single-slot `Static` exports no named author type. Vue's ordinary slot and component-instance types remain available through the component value.

### Mount option ledger

| Current option              | Decision and exact host contract                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `stdout`, `stdin`, `stderr` | Retain. They select the live host streams; defaults are the corresponding process streams.                                                                   |
| `mode`                      | Retain. Omission means Inline; explicit values are Inline or Fullscreen.                                                                                     |
| `patchConsole`              | Retain. Default true and explicit false opt-out are vouched; Runtime owns one process-global patch with independently disposable app sinks.                  |
| `isScreenReaderEnabled`     | Replace with `presentation?: "visual"                                                                                                                        | "screen-reader"`; omission uses the supported environment preference. |
| `liveUpdates`               | Remove. Visual TTY is live; non-TTY Static prefixes are monotonic and the mutable tail is written at teardown, forming one document without cursor rewrites. |
| `onRender`                  | Remove as instrumentation.                                                                                                                                   |
| `maxFps`                    | Internalize as scheduler policy.                                                                                                                             |
| `incrementalRendering`      | Remove as writer strategy.                                                                                                                                   |
| `kittyKeyboard`             | Internalize negotiation needed for normalized facts.                                                                                                         |
| `clipboard`                 | Remove with the current clipboard service.                                                                                                                   |

### App method and property ledger

| App surface                                                                                                                                | Decision                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime `mount(options)`                                                                                                                   | Retain the Vue-shaped terminal mount and narrowed options.                                                                                        |
| Runtime `waitUntilExit()`                                                                                                                  | Retain with restoration and durable-output settlement.                                                                                            |
| Runtime `waitUntilRenderFlush()`                                                                                                           | Retain as the output barrier proven by mo.                                                                                                        |
| Runtime `clear()`                                                                                                                          | Remove; reactive rendering clears the mutable region and the name overpromises terminal-history control.                                          |
| Vue `unmount()`, `use()`, `mixin()`, `component()`, `directive()`, `provide()`, `runWithContext()`, `onUnmount()`, `config`, and `version` | Retain by inheriting Vue's public `App` contract; Runtime specializes only mount and composes, rather than overwrites, configured error handling. |
| Vue underscore fields including `_container`                                                                                               | Not an author contract. The incidental `TuiNode` declaration exposure is the explicitly accepted non-fix.                                         |

### Package subpath ledger

| Current or proposed subpath     | Decision                                                                                                                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@vue-tui/runtime`              | Retain as the common minimum renderer, lifecycle, layout, normalized-input, and accepted-renderer-fact primitives. Higher-level focus policy remains replaceable.                                                                                       |
| `@vue-tui/runtime/inline`       | Retain only the redesigned single-slot `Static`.                                                                                                                                                                                                        |
| `@vue-tui/runtime/fullscreen`   | Retain only the physical targeted `useMouse` primitive and its small types.                                                                                                                                                                             |
| `@vue-tui/runtime/internal`     | Remove from the published export map and tarball contract.                                                                                                                                                                                              |
| `@vue-tui/runtime/devtools`     | Add as the one supported `connectDevtools()` integration used by the Vite package.                                                                                                                                                                      |
| `@vue-tui/runtime/testing`      | Add only `createTestHostBridge()` and its three small types. Streams cannot observe a pre-teardown logical frame or deterministically declare SGR mouse support; the public bridge gives every test framework equal access without exporting internals. |
| `@vue-tui/runtime/package.json` | Retain for ordinary package metadata/tooling access.                                                                                                                                                                                                    |

### Proposed target surface

The target is intentionally smaller than the current 31 values and 87 named types. After the accepted Path 3 decision, the working common-root target has thirteen values: `Box`, `Text`, `createApp`, `renderToString`, `useApp`, `useInput`, `useStdin`, `useLayoutWidth`, `useViewportHeight`, `useBoxSize`, `useBoxPresence`, `useTextLayout`, and `useCaret`. `/inline` has `Static`; `/fullscreen` has `useMouse`; `/devtools` has `connectDevtools`; `/testing` has `createTestHostBridge`. The later-path names remain proposals until those paths pass their own evidence gates.

The intended common named contracts after Path 3 are `MountOptions`, `TuiApp`, `RenderMode`, `RenderToStringOptions`, `AriaRole`, `AriaState`, `BoxProps`, `TextProps`, `UseAppReturn`, `TuiInputEvent`, `TuiKeyName`, `UseStdinReturn`, `BoxSize`, `CellPoint`, `ElementTarget`, `TextPosition`, `ResolvedTextPosition`, `TextLayout`, and `UseCaretOptions`. `/fullscreen` adds `CellDelta`, `MouseButton`, `MouseModifiers`, `TuiMouseEvent`, `MouseEventControls`, `MouseHandler`, and `UseMouseOptions`. `/inline` adds no named type. `/devtools` may name only the small structural hot-context input if declaration generation cannot keep it inline. `/testing` adds `TestContentFrame`, `TestHostBridgeOptions`, and `TestHostBridge`. Names belonging to Paths 4 through 6 remain provisional here.

This proposed list is not accepted by enumeration alone. Each name points to the concrete code, host semantics, absence behavior, composition proof, and evidence gate in Paths 0–6.
