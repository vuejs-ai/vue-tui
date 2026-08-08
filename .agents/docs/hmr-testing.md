# Testing the dev server and HMR

How the claims in the [dev-server and HMR architecture](./hmr-architecture.md) are proven.

**There is one end-to-end mechanism, a small set of unit tests, and a narrow package-integration layer. Nothing else.** End-to-end is the main body: it runs the real application on a real terminal and is the only thing that can prove the product works. Unit tests cover pure functions where an end-to-end test would be an expensive way to reach many small cases. Package integration verifies the built package and manifest boundary without starting an application.

## The shape

**One test is one child process**, with its own dev server, its own cache directory, and its own view of the terminal. The system under test holds process-global state — the terminal itself, one live app per stdout, the dev-session singleton, a dependency-optimizer cache — so concurrency has to come from process isolation, not from in-process parallelism.

**Root verification uses a simple saturation heuristic.** Process isolation fixes shared state and does nothing about CPU. Each child runs a full dev server, and the flake this package already paid for reproduced "~30% under CPU saturation". The root `test` and `check` tasks keep at most three Vite+ graph branches active; each graph-owned Vitest branch receives native `--maxWorkers` set to one third of `availableParallelism()`, rounded down with a minimum of one. Thus simultaneous suites cannot each size their pool as if they owned the machine. This deliberately counts workers, not operating-system processes: a worker commonly waits for the CLI or PTY child it launched, so charging both as independently saturated CPUs would be false precision. If saturation returns, lower either native limit based on measurement. A direct `tests-vite` run retains its two-CPU reserve.

```
packages/vite/
  src/                       package build inputs
  tests/                     source-level units owned by the package

templates/vite/              cloneable user project; ordinary npm ranges only

tests/vite/
  integration/              built-package and manifest boundary checks
    fixtures/                integration-owned consumer configurations
  e2e/                      end-to-end scenarios and their owned test infrastructure
    harness/                the one launcher and its pieces
    fixtures/               tracked consumer projects copied by the harness
  package.json              private external-test workspace
```

## How a child runs

Every test child is a `node-pty` child launched through `tests/vite/e2e/harness/child.ts`, on a real terminal. **There is one way, not two, and it is enforced by there being exactly one launcher.** A check that needs no running application is not a child at all; it is either a source-level unit test or an explicit package-integration check.

A real terminal is the faithful surface: `process.stdout` is a tty, so the fixture calls `mount()` with no stream argument and exercises exactly the production path. stdout and stderr share one device, as they do for a real user. Raw mode and signals are real rather than simulated, and the parent reads everything the child paints.

**The child runs the real `vite` CLI, not a programmatic `createServer()`**, so it loads the project's own `vite.config.ts` — what a user's setup does. In practice: `node --import=<launcher> <vite-bin>`, where the launcher's only job is to open the event socket before the CLI starts.

**The harness sets the child's environment; it does not inherit it.** Two variables change behaviour and neither may be left to the ambient value:

- `FORCE_COLOR` in **every** child. A pty makes `isTTY` true, but chalk short-circuits before the TTY check: with `CI` present it returns the forced level or none. Measured — no `FORCE_COLOR` with `CI=false` yields no ANSI at all.
- `CI=true`, so no scenario depends on Vite's interactive CLI shortcuts. Those shortcuts produce no terminal output under `logLevel: "error"`, so they are unobservable from outside the child; the plugin's neutralisation of them is a unit check in `packages/vite/tests/dev.test.ts` instead.

The cloneable starter is the explicit exception to the second bullet: its test omits `CI` because it proves the interactive journey of an ordinary user terminal, and the currently released Runtime deliberately disables live rendering when `CI` is present. It still uses the same PTY launcher and forced color.

## What the parent can see

```
   parent (the test)                child (dev server + app)

   read child stdout      ◀──────   painted frames
   read event socket      ◀──────   named events
```

**The rule: events say when, the screen proves what the user saw.** Wait on an event; judge appearance against the terminal model. `paint:committed` also carries the Runtime's complete committed frame as a correlation artifact because that frame cannot be reconstructed reliably from output blocks, but no appearance claim may pass from that payload alone: `expectFrame` requires both the reported frame and its ordered visible rows in the xterm viewport. Other events carry facts and timing, not appearance. In particular, `hmr:update-received` deliberately does not guess whether an ordinary module update will rerender or reload: inlined template and script changes have the same Vite payload, and the compiler accept callback decides later. Tests prove the distinction from component state and lifecycle.

The one exception is deliberate and narrow: **the fixture reports facts about itself** — that it mounted, that its setup ran again, the code it exited with. Those are application facts, not descriptions of the screen, and nothing else can report them.

### The event channel

A unix socket — a named pipe on Windows — whose address the parent passes in an environment variable and the child dials out to.

```js
// parent: pick an address nobody else uses, listen, pass it down
const address = eventAddress(`${process.pid}-${counter++}`);
await new Promise((r) => net.createServer(onConnection).listen(address, r));
startChild({ env: { ...process.env, VT_EVENTS: address } });

// child: dial out and write one JSON object per line
net.connect(process.env.VT_EVENTS).write(JSON.stringify({ seq, ev: "app:mounted" }) + "\n");
```

An environment variable is inherited however the child was started, so the transport survives any change to how children are launched. The alternatives were measured and rejected: `process.send()` needs an IPC slot `node-pty` cannot reserve, fd 3 fails with `ENXIO` under `node-pty`, and stderr shares the device with stdout so events land inside the frames under assertion.

Each test picks a unique address, so concurrent tests never collide. The stream is bytes, not messages: split on newlines rather than assuming one `data` event per event.

The event stream spans application generations. `app:exit` ends one app instance during a config restart; it does not close the socket. The launcher owns a distinct final `harness:event-stream-end` event. On normal process completion it emits that event from `beforeExit`; during test cleanup the parent first sends an end request and waits for the launcher's sequenced acknowledgement, then terminates the process. A spontaneous disconnect or `process.exit()` before that acknowledgement is a protocol failure. This causal handshake replaces the former `settle(250ms)` snapshot, whose timeout edge could return healthy immediately before a queued socket-close failure arrived.

### Vocabulary

Each event carries a monotonic sequence number so ordering is unambiguous.

```
app:mounted · app:unmounted · app:exit{code}                  ← fixture
hmr:update-received · hmr:update-applied                       ← runtime, ordinary update timing
hmr:update-received{kind: full-reload}                         ← runtime, full reload
hmr:error{phase: compile | evaluate | render}                  ← runtime
terminal:acquired · terminal:released                          ← runtime
paint:committed{frame}                                         ← runtime
harness:event-stream-end                                       ← launcher protocol
```

**One emitter object per child process, shared by both senders**, so sequence numbers come from a single counter and the merged log has one unambiguous order. Its state lives on a `globalThis` key because the runtime exists as two module copies in dev — externalized through Node and transformed through the Vite graph — and two counters would make cross-sender ordering meaningless. The runtime reaches it through the privileged `@vue-tui/runtime/internal/testing` entry, which is not public API.

After `SIGCONT`, `terminal:acquired` is emitted only after the surface has been repainted and still-requested raw input and parser modes have been reacquired. A paint alone is not terminal ownership: announcing it between repaint and `setRawMode(true)` lets an observer send a character while the PTY still has echo enabled. The real suspend scenario proves this boundary behaviourally by writing input immediately after the event.

**The switch gates reporting, never behaviour.** The emitting line sits in the production path and is a no-op when no address is configured:

```ts
releaseTerminal();
emit("terminal:released"); // no-op when unconfigured
```

If the switch wrapped the behaviour instead, tests would exercise a different path from production and prove nothing.

## Asserting on the screen

`screen()` is the current terminal viewport, including whichever part of Inline history is still visible. Two things can live there that are not the current application's frame: **Vite's own coordinated log lines**, printed above it, and **older inline frames** retained in visible scrollback. So a viewport-wide `includes` can pass without the current app showing anything — measured: a row asserting "the overlay carries the developer's error" stayed green while the overlay actually read `Internal Server Error`, because Vite had printed the real message a few lines up. And a negative remains unprovable while an older matching line is still visible.

The harness therefore offers a narrower reader, and it is the default for any claim of the form _the application shows X_:

| Reader              | Returns                                                   |
| ------------------- | --------------------------------------------------------- |
| `child.screen()`    | the current viewport, including visible logs and history  |
| `child.frame()`     | the Runtime's most recently committed complete app frame  |
| `child.expectFrame` | waits for that frame and verifies it in the real viewport |

`frame()` reads the complete frame attached to `paint:committed`; synchronized-output blocks cannot supply it because coordinated side output, including Vite diagnostics, can occur inside those markers, and a Fullscreen commit writes only its changed rows. `expectFrame()` then verifies that the frame's visible part is the xterm viewport's current non-empty suffix, preserving order, duplicate rows, blank layout rows, and leading spaces; an empty reported frame requires an empty viewport. It must be anchored there rather than found anywhere: an older complete Inline frame above corrupted current output cannot certify the new paint. Only when a frame is taller than the viewport are its necessarily-scrolled earlier rows omitted.

**A frame is still not a panel.** It carries the user's tree as well, so a claim about the overlay needs `errorPanel(frame)` — scoping to one without the other is not enough, and both failure modes were measured. Reach for `screen()` only for "this text appeared at all".

## How a test waits

Wait for a named event, never for a wall-clock budget to expire. A timeout is a backstop and always a bug report; its message must carry the event log, so that _stuck after `hmr:update-received`, never reached `hmr:update-applied`_ replaces _the screen did not contain the string_. That is the difference between a suite whose failures can be diagnosed and one whose failures cannot.

**A screen claim waits on `paint:committed`.** `hmr:update-applied` means applied, not painted — the repaint goes through a throttled commit scheduler, so a screen assertion made on that event races the paint. `expectScreen(predicate)` waits for the next `paint:committed`, re-tests, and repeats.

**An absence claim needs an end point, and that end point costs wall-clock.** "A template edit caused no full reload" cannot be settled without deciding when to stop waiting. `quiesce(ms)` resolves when no event has arrived for `ms`, and the absence is asserted against the log at that moment. The wall-clock element cannot be removed; what matters is that it is one explicit helper rather than a budget buried in every wait.

**Two synthetic writes to the same path need the watcher boundary.** The pinned Vite 8.2 watcher suppresses a second `change` for the same path inside 50ms even when the contents differ. A test can receive the first error and repair its fixture faster than that, leaving the valid file on disk with no second HMR update. Failure/recovery tests therefore call `settleViteWatchChange()` after observing the failure and before writing the recovery. Its 100ms quiescence is a test-input precondition, not evidence that an update succeeded; the subsequent named event and frame remain the proof.

## Which channel proves which claim

Assert where the truth lives.

| Claim                                                       | How it is observed                                                                                                                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What the user sees after an update                          | screen                                                                                                                                                                                                     |
| Entering or leaving the alternate screen, cursor visibility | screen — they are escape sequences                                                                                                                                                                         |
| Raw mode taken or released                                  | screen, behaviourally — write a character and see whether the terminal echoes it. Cooked mode echoes, raw mode does not. The termios call emits no bytes, but it changes what the terminal does with input |
| That a full reload did _not_ happen                         | state survived — a counter that kept its value went through neither a full reload nor a script-level instance recreation. The two are distinguished by which file the test edited                          |
| Which cause was preserved on a failure                      | exit code and stderr, or the rejection of `waitUntilExit()`                                                                                                                                                |
| Application-level facts about itself                        | events, emitted by the fixture                                                                                                                                                                             |
| Ordering of a config-restart handover                       | events for old `terminal:released` before new `terminal:acquired`, plus a new mount and PTY frame                                                                                                          |

## One file, one claim

`tests/vite/e2e/*.test.ts` holds every product end-to-end claim; the owned `fixtures/` and `harness/` support it underneath the same suite. **One root-level file proves one claim from the table below, and its name is that claim** — `template-edit-keeps-instance`, `one-writer-at-a-time`, `reload-carries-nothing-across`. Never the mechanism (`real-cli`, `port-zero`, `optimizer`) and never the module under test.

The directory listing is therefore the coverage report: scan it and you know what is proven without opening anything. That property is lost one commit at a time, so two rules hold it in place:

1. A new end-to-end file names a claim from the architecture.
2. **A spike helper never becomes a permanent test.** Its finding goes in a record; the check it justified either joins the harness or is deleted. Keeping the helper is how a second launcher appears, and a second launcher is how the single-mechanism rule dies.

Each row below is a file. Two deliberate exceptions: rows 3 and 4 share `failure-keeps-app-running.test.ts` because they are one failure-containment claim exercised across compile, setup, render, callback, Inline, and Fullscreen paths, and the output-failure row is proven under `tests/runtime` for the reason given after the table. Two further files carry named regressions rather than architecture claims — `dev-mode-emits-ansi-color.test.ts` (#214) and `jsx-renders.test.ts`. `workspace-examples-launch.test.ts` is the single smoke for the repository's four Vite examples; their production bundles are proven separately by the Runtime example suite. Any other root-level test file in that directory is drift.

| Architecture claim                                   | Scenario                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template edit keeps the instance                     | edit a template; a counter keeps its value and the frame updates                                                                                                                                                                              |
| Script edit recreates the instance                   | edit a script; state resets — the correct behavior, asserted deliberately                                                                                                                                                                     |
| Compile failure keeps the previous component running | write a syntax error; the previous frame and state survive and the error is visible                                                                                                                                                           |
| A render throw does not unmount                      | make a component throw while rendering; the user tree is still mounted                                                                                                                                                                        |
| Output failure restores the terminal, then exits     | accept a Fullscreen frame write on a borrowed TTY stream, fail its callback with `EIO`, hold the restoration and durable-error callbacks in turn, then require `waitUntilExit()` to reject with the same error only after both complete       |
| A reload carries nothing across                      | trigger a full reload; state is gone and the terminal was released before it was reacquired                                                                                                                                                   |
| Suspend and continue                                 | real SIGTSTP and SIGCONT; everything released, then reacquired and repainted                                                                                                                                                                  |
| One writer at a time                                 | provoke a dev-server diagnostic that has no HMR payload, then assert the app's frame is intact. Without provoking one there is nothing to detect: `logLevel` is `error`, so a happy path writes nothing and the assertion would be vacuous    |
| A failure shows the developer's own error            | break an SFC and a JSX component; the overlay carries the real message and source location, not a Vite-internal one                                                                                                                           |
| A broken setup fails by name                         | misconfigure the compiler or the SSR environment factory; startup fails with a named error instead of a blank frame                                                                                                                           |
| A stale error cannot overwrite a newer update        | hold an old runner error while a newer edit applies and paints; the newer result stands                                                                                                                                                       |
| Exiting closes the dev server                        | a genuine `useApp().exit()`, and Ctrl-C alone, each bring the real CLI process down — the second matters because the harness escalates to SIGTERM, so a broken Ctrl-C would fail nothing                                                      |
| Config edit restarts without overlapping ownership   | import the built package by its bare published specifier, edit `vite.config.ts`, and require a fresh app instance after the old session releases the terminal                                                                                 |
| A cloned starter works outside the workspace         | copy `templates/vite` to the operating-system temp directory, reject repository-only dependency protocols, run a real `npm install`, type-check and production build, then use the installed Vite for input, HMR state preservation, and exit |
| Workspace examples launch through Vite               | launch every Vite-powered example through the same real CLI, PTY, event channel, and frame assertion as product HMR scenarios                                                                                                                 |

**Why output failure is proven elsewhere.** Closing the last pty master raises `SIGHUP` and removes the only channel that could observe later restoration bytes, so one test cannot prove both that `EIO` was the first cause and that restoration reached the terminal. The proof is therefore split under `tests/runtime`: `integration/lifecycle/fatal-output-durability/fullscreen.test.tsx` covers the accepted-write failure, restoration, durable error, and exit ordering; `e2e/pty/signal-teardown.test.ts` covers real `SIGHUP` teardown bytes while the master stays observable.

## What stays a unit test

Pure functions, where an end-to-end test would be an expensive way to cover many small cases — Vite-compatible entry-path matching (including external entries and both symlink policies), payload pairing, frame-to-viewport matching.

## What stays a package-integration test

Checks whose truth lives at the installed-package boundary rather than in one source module: resolving the built plugin from a CommonJS config (#238), and keeping the package's compatibility peers equal to the versions exercised by this suite. They remain separate from end-to-end tests because they do not launch an application, and separate from unit tests because a source import cannot prove the package contract.

The starter deliberately straddles two boundaries without blurring them. Its committed manifest contains only ordinary npm ranges; inside the repository, pnpm may link matching local versions so the root task graph can format, type-check, and build it. The end-to-end test first proves that those committed ranges accept the branch-local package versions, then copies the template outside the workspace, packs the local Runtime, components, and Vite plugin, and rewrites only the copied manifest to install those tarballs with npm. The root lockfile, overrides, links, and generated template output therefore cannot make a broken release candidate look healthy, while an incompatible committed range fails before the tarball substitution. The main Node 22 CI lane proves the optional executable command gives the dependency's upgrade error without raising the starter's ordinary Node floor. A focused Node 26 lane runs the same isolated journey, builds the executable from the Vite output, launches it, and exits through application input. This proves the exact release candidates in the checkout; registry publication remains a release-step concern rather than being disguised as a product test.

What does **not** belong here is a check that characterises a dependency rather than this package. `port: 0` behaviour in Vite was measured once during the rewrite and pinned as a test; the finding belongs in a record, and the test was deleted — the product never passes `port: 0`, so it protected nothing.

Everything about whether an update actually arrived, or whether the terminal was actually restored, is end-to-end. Those are exactly the places a unit test passes while the product is broken.

## Windows

Best effort, not guaranteed. The event address is built per platform — a named pipe there, a socket path elsewhere. Windows is not a CI gate: SIGTSTP does not exist there so the suspend scenario has no meaning, and ConPTY is a mechanism this project has never exercised. Nothing promises Windows works, and nothing goes out of its way to break it.
