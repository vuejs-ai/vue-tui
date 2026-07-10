# TUI visual review tool

This private workspace tool lets a coding agent run vue-tui's basic-template reference application or a focused review fixture through a real PTY, observe the active screen after terminal emulation, load a reference PNG, operate the application one step at a time, and keep the evidence for that visual review. It lives under `tools/` because it is repository infrastructure, not a deterministic test, published package, or runtime API.

## Start an interactive session

From the repository root after `vp install`, run:

```sh
vp run visual:basic-template
```

For the fullscreen fixed-origin regression fixture, use:

```sh
vp run visual:fullscreen-origin
```

Pass `--scenario <static|stdout|stderr|console|debug|overflow|horizontal-overflow|horizontal-wide|horizontal-transform|screen-reader>` after `--` to choose a focused state; `static` is the default.

The command builds the workspace targets required by its selected review target, then prints a JSON `ready` event. Keep the process running and send one JSON object per line. Start by waiting for a named state and observing it:

When an agent's command tool distinguishes one-shot commands from interactive sessions, use a persistent session or allocate a parent TTY so stdin remains open for later commands.

```json
{"id":1,"type":"waitForText","text":"0 (+/-","timeoutMs":20000}
{"id":2,"type":"observe","name":"initial"}
```

`observe` returns the visible revision and paths to the structured screen, text view, SVG, and PNG. Load the PNG into the agent's visual input before deciding what to do. Then perform one action using the observed revision:

```json
{"id":3,"type":"input","data":"+","label":"increment counter","sourceRevision":12}
{"id":4,"type":"waitForText","text":"1 (+/-","timeoutMs":5000}
{"id":5,"type":"observe","name":"count-one"}
```

The controller requires an observation between state-sensitive actions. After an action, wait for an explicit resulting state with `waitForText` when possible, or at minimum call `waitForRevision` with the action's `executedRevision`, before observing its result. `observe` rejects an unchanged action result unless `allowUnchanged: true` includes an `unchangedReason`; this prevents a screenshot taken before the application's next render from being mislabeled as the result. If an animation makes the source observation stale without changing the intended target, set `allowStale: true` on the action and explain that judgment in `staleReason`; otherwise observe again. Supported requests are `waitForText`, `waitForRevision`, `observe`, `input`, `key`, `paste`, `resize`, `localScroll`, `signal`, `status`, and `close`.

Finish the application through an action chosen from an observation, observe the post-exit state, then send `{"type":"close"}` to finalize the controller and `process.json`. `close` is cleanup, not a graceful application-exit action: if the app is still running, the controller may have to terminate its PTY after the cleanup timeout, and that run has no restoration evidence. Ctrl-C is only an emergency stop: the Vite+ task runner may terminate the process group before the controller can finish writing artifacts, so a surviving `process.json` with `state: "running"` means that run ended abruptly and is not acceptance evidence.

## Check the infrastructure

Run a thin infrastructure health check with one command:

```sh
vp run visual:basic-template:smoke
```

The smoke run checks that the reference app starts, a structured screen and readable PNG can be captured, the app can be operated through the PTY, recorded emulator modes return to their reference values, and POSIX terminal attributes and shell input are restored where those checks are available. It is not part of visual acceptance, does not assert what the interface should look like, and is not run by `vp run ready`.

Visual acceptance is intentionally agent-driven rather than a fixed journey or image snapshot. For the current change, the agent chooses a relevant state, loads and reviews its PNG, acts from that observation, and iterates when it finds a problem. Deterministic behavior belongs in the existing component and PTY tests.

## Artifacts

Each run creates a unique ignored directory under `tui-visual-review-results/` containing:

- `profile.json`: fixed reference settings plus actual package, host, Node, and PTY-backend versions;
- `screens/*.json`: active buffer, cells, styles, cursor, modes, viewport, scrollback, process state, and visible revision;
- `screens/*.png`: reference image generated from the same structured snapshot;
- `actions.jsonl`: observations, executed actions, source and execution revisions, and the result revision attached by the next observation;
- `transcript.log`: the decoded merged PTY stream for protocol diagnosis, not final-screen authority;
- `process.json`: launch, exit, query-reply, application-restoration, and controller-error details;
- `smoke.json`: the infrastructure health-check result when the smoke command is used.

## Compatibility boundary

The main process path uses `node-pty`, xterm's headless emulator, Unicode 11 cell widths, and an SVG-to-PNG reference renderer. The POSIX path has been exercised on macOS and additionally keeps a shell alive to compare terminal attributes and exercise input after the application exits. A Windows/ConPTY direct-process path is implemented, but it is not covered by this repository's current CI; run the smoke command on each target computer rather than treating the macOS result as Windows evidence.

The PNG is produced by this repository's cell-grid renderer, not xterm's browser renderer, and intentionally uses the host's monospace font fallback. Glyph rasterization can therefore differ across computers. It follows the fixed palette and xterm's default bright-color treatment for bold text, but it does not reproduce dynamic OSC palette changes, blink timing, underline variants, or selection pixels. The structured cell grid, pinned emulator profile, dimensions, base palette, and Unicode width provider are the exact reference state. One xterm-compatible profile does not prove behavior in every native terminal.
