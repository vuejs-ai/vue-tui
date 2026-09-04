# TODOs — architecture

The work that moves `@vue-tui/runtime` from its current internal structure to the one in [Runtime architecture](./architecture.md). Each task states where the code stands today, the steps that get it there, what "done" means, how to check it, and what to watch for.

**This file deletes itself.** It exists only to hold the gap between the record and the code. When every task below has landed, delete this file and remove its route from [the records map](./README.md); nothing here needs to be preserved, because the architecture record already states the target and git keeps the history. Do not add ordinary follow-up work here — that belongs in [TODOs](./todos.md).

Task 9 is the only one that remains.

## 9. Fold suspend, resume and teardown control into the lifecycle

**Today.** `Session.lifecycle` is the union `"mounting" | "running" | "suspended" | "tearing-down" | "torn-down"`, and exit selection and settlement are unions of their own. Suspension still uses the persistent booleans `pendingMountSuspension`, `terminalResumeInProgress` and `terminalResumePainting`, while `TeardownControl` holds eight independent fields. The lifecycle union therefore rejects invalid top-level transitions but cannot reject invalid combinations inside suspension or teardown.

**Steps.**

1. Model pending mount suspension and the resume transaction as states carried by the lifecycle union.
2. Replace the teardown sub-flags with the combinations teardown can be in, and let the compiler reject the rest.

**Done when.** No boolean in `session/session.ts` expresses a fact the lifecycle union can carry.

**Verify.** The lifecycle suites under `tests/runtime/integration/lifecycle/`, the PTY suspension and signal suites, and the vite e2e suites that exercise HMR replacement and suspension.

**Watch for.** Some of these flags guard re-entrancy inside one transition rather than a state of their own; a flag that is set and cleared within one synchronous call stays a local, not a state.
