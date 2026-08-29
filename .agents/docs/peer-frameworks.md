# Peer framework references

vue-tui is designed as an independent product. Peer frameworks are a bounded source of behavioral evidence: they help identify established terminal conventions, mature edge-case handling, and behavior users are likely to expect. They do not define vue-tui's product scope, package catalog, public API, or default behavior. Similarity is not a goal, and a difference is not a bug unless vue-tui's own intent or contract says it is.

Product direction remains in [intent](./intent.md). Accepted local behavior belongs in the owning design record or decision ledger and is enforced by code and tests. This record only defines which peers are consulted regularly and how their evidence is used.

## Why the standing set is small

A standing reference must be actively maintained, widely used in real applications, documented or inspectable well enough to verify behavior, and relevant to a distinct part of vue-tui's problem space. Popularity alone is insufficient, and another language or architecture is useful only when it exposes a transferable terminal or application-design constraint.

Do not grow the set merely because another framework exists or has a useful component. Add a standing reference only when it contributes a durable perspective that the current set does not already cover.

## Standing reference set

| Framework                                                                                                                                                                                   | Strongest reference value                                                                                                                                          | Limits                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| [Ink](https://github.com/vadimdemedes/ink)                                                                                                                                                  | Component-driven command-line applications, Inline history and scrollback, non-TTY output, borrowed streams, and mixed short- and long-lived workloads.            | React authoring and Ink's catalog are not templates for Vue APIs or package membership. Ink has no privileged baseline status. |
| [Bubble Tea](https://github.com/charmbracelet/bubbletea), with [Bubbles](https://github.com/charmbracelet/bubbles) and [Lip Gloss](https://github.com/charmbracelet/lipgloss) when relevant | Stateful application loops, messages and commands, asynchronous work, terminal lifecycle, input, and Inline, Fullscreen, or mixed screen ownership.                | Its Elm-style application model and ecosystem package split are evidence, not required vue-tui architecture.                   |
| [Ratatui](https://github.com/ratatui/ratatui)                                                                                                                                               | Explicit frames and areas, viewport ownership, layout, widgets, paint behavior, and separation between rendering and input.                                        | Its immediate-mode Rust model does not determine Vue component lifecycle or public API shape.                                  |
| [OpenTUI](https://github.com/anomalyco/opentui)                                                                                                                                             | Modern TypeScript terminal rendering, retained renderables, Flexbox layout, focus and input, terminal protocols, performance, and Fullscreen application surfaces. | It is fast-moving; any load-bearing observation must be pinned to the version or commit actually examined.                     |
| [Textual](https://github.com/Textualize/textual)                                                                                                                                            | Complex retained applications, widgets, focus and event routing, asynchronous lifecycle, layout, testing, and development tooling.                                 | Its Python, CSS, and DOM-shaped choices are not automatically appropriate for Vue or for Inline output.                        |

These are reference strengths, not exclusive mode assignments. A framework may provide useful evidence outside the area named above. Select peers whose actual ownership model and constraints match the question instead of consulting every member mechanically.

## Evidence snapshots retained for accepted decisions

Some accepted decisions cite a peer by project name because they predate the local evidence workflow below. Unless an owning record names another version, these are the source snapshots retained for those citations. This compact index keeps the evidence inspectable; it is not a shared behavior baseline and carries no peer conclusions forward. New or reopened decisions pin their evidence in the owning record.

| Source     | Retained snapshot                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Ink        | v7.0.4, [`40b3a757`](https://github.com/vadimdemedes/ink/tree/40b3a7578811fd616341ca4e31cc7748aeeff12f) |
| Bubble Tea | [`fc707bb7`](https://github.com/charmbracelet/bubbletea/tree/fc707bb7ea0161405bb6c653ec93f6a9c6a72fe1)  |
| Ratatui    | [`de5168de`](https://github.com/ratatui/ratatui/tree/de5168de6ba2f4b310565c287764f213f249a61f)          |
| OpenTUI    | [`a0b90640`](https://github.com/anomalyco/opentui/tree/a0b90640761aa89a303c6b5b0d74ef3e6b945652)        |
| Textual    | [`1d99508b`](https://github.com/Textualize/textual/tree/1d99508b928a771b51e1a527319c6b87dcff9e05)       |
| Rich       | [`9d8f9a37`](https://github.com/Textualize/rich/tree/9d8f9a372cc5916fd4781fec207ced7ddac2f08f)          |

## How peer evidence is used

1. State the vue-tui problem, affected workload, rendering mode, terminal host, and owning package before selecting a peer.
2. Choose the smallest relevant subset of the standing references. For a non-trivial behavior question, compare more than one when their architectures expose different trade-offs.
3. Use official documentation and source. For a new or reopened decision, pin the examined version or commit in the owning record; this file does not impose one global baseline.
4. Treat a terminal-dependent behavioral claim as a hypothesis until a real harness verifies it against the pinned source. Source reading, names, and memory are not sufficient when observable output, input, timing, or cleanup is at issue.
5. Compare behavior, ownership, constraints, and user-visible consequences rather than copying names or APIs. Shared terminology such as "inline" does not imply equivalent screen ownership.
6. Decide from vue-tui's product intent, Vue philosophy, terminal correctness, representative workloads, and local architectural boundaries. Peer agreement is a reason to scrutinize a surprising local choice, not an authority that decides it.
7. Record the accepted vue-tui judgment in its owning design record or decision ledger, with peer evidence in that decision's Why or Source when it is load-bearing. Do not maintain a parallel alignment or divergence catalog.

## Evidence outside the standing set

Specialized libraries, applications, terminal emulators, specifications, or other frameworks may answer a narrowly defined question that the standing set cannot. Using such evidence does not add its source to the standing set.

Terminal specifications and real emulator behavior take precedence over framework precedent for protocol correctness. Vue's documented behavior and philosophy take precedence for Vue authoring semantics. Libraries such as text renderers, prompt toolkits, and individual terminal applications remain specialist evidence rather than standing product references.

## Maintaining the set

Reconsider a standing reference when it is no longer maintained, its relevant behavior can no longer be verified, or another project supplies a materially stronger and non-duplicative perspective. Update this record for the membership or role change; new and reopened decisions pin exact evidence locally. The retained snapshot index exists only to keep older accepted citations inspectable and is not advanced as a group.
