# Terminal UI prior art

This record keeps pinned peer evidence used by current vue-tui decisions. It does not choose vue-tui product direction, package membership, or API shape. Those live in [intent](./intent.md), [product-work priority](./product-scenarios.md), the [Runtime decision ledger](./runtime-public-api-decisions.md), and [`@vue-tui/components` principles](./components-design-principles.md).

Exact Ink alignment and divergence belongs in [ink-divergences.md](./ink-divergences.md), not here.

## Evidence rules

- Prefer pinned source, versioned official documentation, or a maintainer-authored issue.
- A peer implementation proves feasibility under that peer's constraints, not portability or desirability for Vue.
- Terminal-dependent behavior is a hypothesis until run against the pinned version.
- Reverify a load-bearing observation before using it for a new decision when the upstream snapshot changes.
- Describe the mechanism and ownership model; do not treat shared names such as “inline” as equivalent contracts.
- Name the reproducible vue-tui problem before choosing a peer, and select only peers whose ownership constraints match it.
- Separate mechanism evidence from the final Vue API and record accepted local judgment in its owning decision record.

## Pinned source snapshots

| System         | Snapshot                                                                                                            | Current use                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Ink            | v7.0.4, [`40b3a757`](https://github.com/vadimdemedes/ink/tree/40b3a7578811fd616341ca4e31cc7748aeeff12f)             | Direct lineage and run-verified behavior baseline.                           |
| Ratatui        | [`de5168de`](https://github.com/ratatui/ratatui/tree/de5168de6ba2f4b310565c287764f213f249a61f)                      | Explicit viewport ownership and separation of rendering from input.          |
| Bubble Tea     | [`fc707bb7`](https://github.com/charmbracelet/bubbletea/tree/fc707bb7ea0161405bb6c653ec93f6a9c6a72fe1)              | Global message delivery and independently configured screen/input modes.     |
| Rich           | [`9d8f9a37`](https://github.com/Textualize/rich/tree/9d8f9a372cc5916fd4781fec207ced7ddac2f08f)                      | Bounded live output and text wrapping/alignment.                             |
| Textual        | [`1d99508b`](https://github.com/Textualize/textual/tree/1d99508b928a771b51e1a527319c6b87dcff9e05)                   | Retained widgets, focus, bindings, and targeted events.                      |
| OpenTUI        | [`a0b90640`](https://github.com/anomalyco/opentui/tree/a0b90640761aa89a303c6b5b0d74ef3e6b945652)                    | Retained TypeScript renderer, screen modes, and targeted input.              |
| prompt_toolkit | [`236bfb7c`](https://github.com/prompt-toolkit/python-prompt-toolkit/tree/236bfb7c15c62e921dc81bac5aefcabb16450f0c) | Mature focus, layout, key binding, and mouse settings.                       |
| fzf            | [`24832e97`](https://github.com/junegunn/fzf/tree/24832e97ef9640e5f859ede8dc163cf3c27145cb)                         | Specialized bounded-main-screen origin tracking.                             |
| VueUse         | [`8442658d`](https://github.com/vueuse/vueuse/tree/8442658d08b17d7aeefb18abcd06dcefd0d4c1e6)                        | Vue composable, ref-bound listener, and renderless-companion precedent only. |

## Evidence retained for current decisions

### Rendering modes and non-TTY output

Peers called “inline” use materially different ownership:

- Ink's default redirected output keeps the latest dynamic document for teardown and writes new Static history immediately. Ink also has its own explicit live-update override.
- Ratatui distinguishes full-screen, inline, and fixed viewports while leaving terminal initialization and input to the application.
- Rich reserves a bounded live region and writes durable console output above it.
- Textual and OpenTUI can use the main screen without thereby promising native scrollback semantics.
- fzf proves that targeted pointer input in a bounded main-screen application is possible only when the application tracks a physical origin and invalidates it after disruptive lifecycle events.

vue-tui adopts neither a generic peer “inline” label nor Ink's live non-TTY override. Both requested vue-tui modes resolve to the final-document host on non-TTY stdout; only TTY Fullscreen acquires the alternate screen. The exact contract is [rendering-mode-matrix.md](./rendering-mode-matrix.md).

The durable lesson is that a mode proposal must state the owned region, history owner, origin stability, external-output behavior, resize behavior, and teardown—not only its name.

### Text wrapping and alignment

This evidence was reverified against the pinned sources on 2026-08-02:

- Ink `Text` exposes styling and wrapping but no physical-line alignment.
- Ratatui `Paragraph` aligns each wrapped line after line formation.
- Rich applies justification to produced Text lines, and Table delegates wrapping and alignment to that text layer.

Therefore Table may select alignment, but terminal-cell wrapping and physical-line alignment belong to Runtime Text rather than Table-specific padding. This evidence supports the current `textAlign` divergence; it does not imply a broader peer Text API.

### Runtime facts and layout

No pinned peer exposes the full request → effective surface → dimensions → capability graph as one public immutable session contract.

- Ink exposes narrow stream and window hooks while keeping effective interactivity private.
- Ratatui distinguishes backend terminal size from the area assigned to one frame.
- Bubble Tea delivers environment, size, and capability changes as messages owned by the model.
- OpenTUI can expose the mutable renderer, but that also exposes substantially more terminal and tree authority than vue-tui needs.

These observations support one internal Runtime authority and narrow public semantic facts such as `useLayoutSize()` and `useBoxMetrics()`. They do not justify exporting a mutable renderer or broad session snapshot.

### Input and focus

- Ink provides global normalized input, logical focus, a low-level stdin escape, and no renderer-targeted mouse API in the pinned baseline.
- Textual, OpenTUI, prompt_toolkit, and browser-like retained systems bind focus or pointer behavior to actual retained renderables.
- Ratatui deliberately leaves input policy outside the renderer.
- Vue refs point to component instances, which may represent one host, a component chain, or a Fragment.

vue-tui therefore keeps broadcast `useInput()`, an independently owned `useStdin()` raw-mode escape, and explicit focus handles with optional Vue rendered-target validity. Peer focus managers, string IDs, propagation models, and pointer APIs do not become implied Runtime work.

### Component catalogs

A peer component proves a recurring task may exist, not that vue-tui should ship the same member. Components follow the package-specific [evidence bar](./components-design-principles.md#inclusion-bar--product-driven-and-evidence-backed) and use peer behavior only after the local need is established.

This evidence does not decide whether vue-tui adds a capability, which package owns it, what it is named, whether another framework's benchmark applies, or whether another project's catalog is a roadmap.
