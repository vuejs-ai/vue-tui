# Visual development feedback loop for vue-tui applications

> **For coding agents:** use this loop by default whenever a change can alter what a terminal user sees or how they interact with it. Do not accept the change from source inspection, raw stdout, or `lastFrame()` alone.

## Why this loop exists

A terminal is a state machine. A vue-tui application writes text and ANSI/VT control sequences, then the terminal applies those sequences to its current buffers, cursor, styles, modes, viewport, and scrollback. The final visible screen is that post-emulation state, not the application's latest output chunk or vue-tui's latest content frame.

`@vue-tui/testing` remains the fast way to test components, input handlers, layout behavior, content-frame invariants, and deterministic terminal-emulated screens. The visual loop adds a real PTY, the built application, rendered images, and observation-driven interaction: a coding agent can run the user path, see the screen, operate it one step at a time, and use those observations to decide what to change next.

A browser is not required. A local headless terminal emulator can produce the structured cell grid for its declared profile, and a separate renderer can turn that grid into a reference PNG. Use a browser-hosted terminal or a real-terminal screenshot only when the behavior being checked depends on that terminal surface.

## Required capabilities

The controller may be a project script, an existing agent tool, or a disposable helper. Its name and transport do not matter, but it must provide:

- a real pseudo-terminal (PTY), the operating-system interface that makes the child process behave as if a person launched it in a terminal, so TTY detection, raw input, resize, signals, and process lifecycle follow the user path;
- a declared terminal-emulator profile that consumes ANSI/VT output and returns terminal replies to the PTY;
- a structured observation of the active screen, including cells, styles, cursor, active buffer, dimensions, terminal modes, and a monotonic visible revision;
- an image of that same post-emulation screen that the agent can load into visual input;
- incremental keyboard, text, paste, mouse, resize, scroll, selection, copy, interrupt, and exit actions as the workflow requires;
- process exit, timeout, unexpected output, and terminal-restoration diagnostics.

A practical local implementation is a PTY library plus an xterm-compatible headless emulator and a direct cell-grid-to-SVG-or-PNG renderer. This is an example, not a required vue-tui dependency or public API.

`@vue-tui/runtime` ships this guide, not a controller, PTY library, terminal emulator, or image renderer. The coding-agent environment or application project must supply the capabilities above.

```text
agent -> controller -> PTY -> vue-tui application -> ANSI/VT -> terminal emulator
  ^                                                            |
  |                                                            +-> structured active screen
  +------------------------------------------------------------+-> rendered image
```

## Development loop

### 1. Define the intended result

State the user workflow and the visible start, intermediate, success, failure, recovery, and exit states affected by the change. Declare inline or full-screen mode, terminal profile, dimensions, theme, locale, and fixture.

For a bug fix, reproduce the visible defect before editing when practical. Preserve it as a focused component assertion, PTY screen predicate, or other deterministic regression.

### 2. Implement and run fast checks

Make the smallest coherent change. Add or update component tests for known behavior, then run the project's focused checks. Do not wait for the visual pass to find deterministic failures.

### 3. Launch the built application in a real PTY

Use the development build for rapid iteration and a production-like build for final acceptance when bundling can change the result. Keep PTY and emulator dimensions synchronized and forward terminal-query replies.

Wait for an explicit screen predicate, named application state, process event, or deadline. Output silence alone does not mean the screen is ready: animations may never become quiet, and escape-sequence parsers can be waiting for more bytes.

### 4. Observe the post-emulation result

Capture the structured active screen and render its image. The coding agent must load and inspect the image; creating a PNG that nobody observes is not visual verification.

Inspect hierarchy, clipping, alignment, wrapping, focus, cursor, selection, color and non-color cues, busy and error states, resize behavior, scroll behavior, and state continuity. Use the structured screen for exact text, cell, style, cursor, mode, and buffer facts rather than guessing them from pixels.

For a full-screen application, observe the alternate buffer before exit and then verify restoration separately. For an inline application, include the relevant normal-buffer viewport and scrollback rather than treating the latest redrawn region as the whole user experience.

### 5. Operate from what was observed

Choose the next key, paste, mouse action, resize, scroll, selection, interrupt, or exit from the current observation. Record the visible revision that informed the action. If a relevant state change makes that observation stale, observe again before acting.

Do not replay a complete prewritten sequence and call it interactive review. A scripted sequence is valuable deterministic evidence, but the agent closes the feedback loop only when an observation can change its next action or implementation decision.

### 6. Iterate

Turn a concrete finding into another code pass, rerun the narrowest deterministic check that can catch a regression, and repeat the affected PTY observation and interaction. A layout-only change can still alter focus, scrolling, or another terminal size.

Stop subjective polishing when requirements pass and only low-impact cosmetic differences remain. Do not accept crashes, broken primary interactions, unreadable required content, major clipping, misleading state, terminal corruption, or failed restoration.

### 7. Run final acceptance

Run the project's full programmatic gate, applicable deterministic PTY scenarios, and the final interactive observation on the same revision. Report the exact command, profile, dimensions, mode, actions, observed named states, diagnostics, restoration evidence, and remaining gaps.

## Intermediate artifacts

Keep artifacts together for one run so the observation that caused a decision can be reconstructed. These files are diagnostic material and are normally temporary and gitignored.

| Artifact                             | Purpose                                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `profile.json`                       | Pins emulator and PTY versions, `TERM`, locale, dimensions, palette, font or cell metrics, enabled protocols, and terminal-query replies. |
| `screens/0001.json`                  | Stores the exact active screen, cursor, modes, buffer, viewport, process state, and visible revision for machine inspection.              |
| `screens/0001.png`                   | Shows the same revision as pixels for the agent's visual review.                                                                          |
| `actions.jsonl`                      | Records each incremental action, the visible revision it was chosen from, the revision at execution, and the resulting revision.          |
| `transcript.bin` or `transcript.log` | Preserves raw PTY traffic for parser and protocol diagnosis; it is not the final-screen authority.                                        |
| `process.json`                       | Records launch details, timing, timeout, signal, exit code, and separately available diagnostics.                                         |
| `acceptance.md`                      | Summarizes commands, named states observed, findings fixed, checks passed, and remaining gaps for the verified revision.                  |

For example, an action record can connect a visible decision to its result:

```json
{ "action": "key", "key": "+", "sourceRevision": 2, "executedRevision": 2, "resultRevision": 3 }
```

Do not commit transcripts or images by default. They can contain user data, environment details, or secrets, and temporary artifact paths are not durable project evidence. Durable evidence is the committed requirement, reproducible scenario, regression test, command, and verified revision.

## Compatibility boundary

One reliable xterm-compatible profile is enough for the normal agent development loop. It does not prove every terminal implementation, version, font, palette, or operating-system backend.

Add a profile-specific emulator pass or a real-terminal pass when vue-tui or the application explicitly promises support for that terminal, or when a reported defect reproduces only there. Record the exact terminal and version rather than generalizing one result to all terminals.

## Tell an agent to use this guide

From the application directory after installing `@vue-tui/runtime`, locate the version-matched copy with:

```sh
node -p "require('node:path').join(require.resolve('@vue-tui/runtime/package.json'), '../docs/visual-development-feedback-loops.md')"
```

Put this instruction in the application's root `AGENTS.md`, `CLAUDE.md`, or equivalent agent-instruction file:

```md
For every terminal-visible change, read the visual development guide shipped with `@vue-tui/runtime` before editing or accepting the result. Locate it with `node -p "require('node:path').join(require.resolve('@vue-tui/runtime/package.json'), '../docs/visual-development-feedback-loops.md')"`. Follow it by default: run the real application through a pseudo-terminal, inspect the screen after a terminal emulator has applied its control sequences, load the rendered image, choose each action from the observed state, and verify that the terminal is restored after exit.
```

There is no universal npm mechanism that forces every coding agent to read dependency documentation. A root-level project instruction is therefore the reliable handoff; the package README and shipped guide provide the discovery path and version-matched content.
