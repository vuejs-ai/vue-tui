# Product scenarios

> **Status:** maintainer-reviewed product model. This record explains which terminal applications drive vue-tui and how their repeated interaction behavior becomes framework work.

## The three levels

[VOUCHED @hyfdev 2026-07-10]

Keep three different concepts separate:

- An **application scenario** describes the job the terminal application does for its user.
- An **interaction flow** describes reusable UI behavior that appears across several application scenarios.
- A **rendering mode** describes how the application uses the terminal screen: inline on the main screen or full-screen on the alternate screen.

Coding agent, task monitor, and terminal workspace are application scenarios. Workflow, finder, and viewer are interaction flows. Inline and full-screen are rendering modes. None of those categories is a synonym for another.

## Active application scenarios

[VOUCHED @hyfdev 2026-07-10]

### Conversational applications

Examples include coding agents, chat interfaces, REPLs, and interactive debuggers. They combine a long-lived transcript, editable input, asynchronous or streamed output, prompts or approvals, interruption, errors, and process restoration.

Coding agents are a major reference workload because they exercise many framework responsibilities in one journey. They are not the only intended application and do not turn model or agent infrastructure into vue-tui product scope.

### Real-time tasks and monitoring

Examples include build, test, and deployment runners and process, service, job, queue, or cluster monitors and control surfaces. They combine live updates, progress and status, logs, navigation, filtering, actions, failure states, and long-running terminal lifecycle behavior.

This scenario ranges from an inline project command that owns a small changing region to a full-screen operational dashboard. Rendering mode follows the user's workflow; the scenario does not imply one mode.

### Multi-region data workbenches

Examples include Git, database, API, file, project, cloud, Kubernetes, and dependency tools. They combine a collection or tree, a detail or preview region, search and filtering, contextual actions, keyboard focus, and sometimes live data.

These applications put sustained pressure on layout, focus routing, scrolling, overlays, mouse targeting, resizing, and composition of several independently updating regions.

### Terminal workspace and multiplexer

A terminal workspace such as Herdr is a demanding subscenario of the multi-region data workbench. Tabs, split panes, focus, status, resizing, and mouse interaction form a stateful visible application; each pane can additionally display and control another terminal session.

This is a valid scenario for an application built with vue-tui, but it does not move all multiplexer internals into the framework.

## Shared interaction flows

[VOUCHED @hyfdev 2026-07-10]

The first reusable building blocks should come from behavior that repeats across the active scenarios:

- **Workflow:** forms, editable values, validation, confirmation, approval, cancellation, and progress through an action.
- **Finder:** search, filtering, a list or tree, preview, navigation, single or multiple selection, and acceptance.
- **Viewer:** logs, Markdown, code, diffs, structured details, scrolling, search, selection, and copy.

These flows are not separate product verticals and do not prescribe one large component for each name. They are inputs for deciding whether behavior belongs in a small component, an independent composable, a lower-level runtime capability, or application code.

Conversation can use all three: editable prompt and approval are workflow behavior, history search is finder behavior, and streamed Markdown, code, tool output, and diffs are viewer behavior. A monitor can use the same finder and viewer pieces without becoming a coding agent.

## Terminal-workspace responsibility boundary

[VOUCHED @hyfdev 2026-07-10]

| vue-tui framework responsibility                                                                                                                 | Application or specialized-engine responsibility                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Outer layout, tabs, split-pane presentation, focus, keyboard routing, mouse targeting, status, overlays, resizing, and high-frequency UI updates | Spawning and owning PTY processes, process groups, signals, and shell lifecycle                                      |
| Rendering normal vue-tui content and, if repeated evidence supports it, a generic view over an externally supplied styled terminal-cell grid     | Parsing and emulating ANSI/VT terminal protocols, answering terminal queries, and maintaining the emulated cell grid |
| Vue lifecycle, reusable UI state, components, composables, HMR, tests, and visual verification of the application shell                          | Detach and reattach servers, sockets, SSH transport, session persistence, remote discovery, and recovery             |
| Generic application-visible states and events                                                                                                    | Detecting a particular coding agent or child process and interpreting its proprietary state                          |

The boundary is about responsibility, not whether a vue-tui application can deliver the whole user experience. A product can combine vue-tui with specialized libraries and application services while keeping each layer focused.

## How scenarios drive framework work

[VOUCHED @hyfdev 2026-07-10]

A scenario becomes useful product input through a deterministic representative journey or a real consumer, not by adding its name to a list. Record the user action, visible result, failure, and terminal mode. Then ask:

1. Is the missing behavior owned by a terminal UI framework rather than the application's data or business logic?
2. Does it recur across applications or remove a difficult correctness burden from a representative journey?
3. Can the public shape stay generic instead of embedding one provider, protocol, or domain model?
4. Can the behavior be verified at the appropriate layer, including a real PTY when the claim concerns the visible screen or terminal lifecycle?

An affirmative answer is evidence for runtime, composable, component, testing, or tooling work. A one-off presentation choice stays in the application. Coding-agent evidence is important but does not automatically outrank stronger or more reusable evidence from another active scenario.

Reference coverage is journey-based, not showcase-count-based. Several scenarios may share one example application, and one scenario may require several small fixtures. Maintain the smallest set that exposes the framework behavior and prevents regressions.

## Compatibility and stress workloads

[VOUCHED @hyfdev 2026-07-10]

Simple one-shot commands, prompts, and progress output may use vue-tui, but they are not the center of its application-framework design when ordinary CLI techniques already solve the job well.

Complete text editors, terminal emulators, multiplexer backends, and game engines are not core roadmap destinations. They may still be valuable stress workloads for input, layout, rendering frequency, Unicode, or terminal restoration. A useful stress result becomes framework work only when reduced to a generic, reproducible requirement.

## Current reference evidence

- **Conversational:** the first-party [coding-agent example](https://github.com/vuejs-ai/vue-tui/tree/3e44c9a266e52ebeba2db669b4bb96521b9e2f3a/examples/coding-agent).
- **Inline workflow and finder:** an application-owned selector for search, filtering, preview, selection, and shell handoff (scenario only; not external-consumer proof).
- **Full-screen monitoring and control:** a live full-screen dashboard with optional one-shot document output (scenario only; not external-consumer proof).
- **Terminal workspace:** [Herdr](https://herdr.dev/) and its pinned [source](https://github.com/ogulcancelik/herdr/tree/66be0b655fe922867f1eed100a41d67038b6ffd6). It is prior-art evidence for the scenario and responsibility boundary, not a vue-tui consumer.

This list is evidence, not a permanent scenario ranking. Add or replace references when a stronger real consumer or deterministic journey gives the framework better product input.
