# Normalized input and routing

> **Status:** historical unstamped F3 routing record. The parser, serialized ingress, shared-stream ownership, and terminal input-resource mechanisms remain because current input contracts need them. The selected boundary removed the focus-boundary/default/external route topology, route-result policy, availability hook, focus scopes, external forwarding, and delayed Ctrl+C default rather than preserving them privately. The current branch exposes `type: "text" | "key" | "paste"` with nested `TuiKey`, captures a broadcast subscriber list per parser-defined fact, ignores handler returns, defaults `MountOptions.exitOnCtrlC` to false, and returns complete independently owned raw-mode control from `useStdin()`. See the [vouched input event decision](./runtime-public-api-decisions.md#useinput-exposes-one-tagged-text-key-and-paste-event-contract), [delivery decision](./runtime-public-api-decisions.md#useinput-is-a-live-broadcast-subscription-without-propagation-results), and [low-level stdin decision](./runtime-public-api-decisions.md#usestdin-remains-a-complete-low-level-input-escape). The routing designs below are decision history, not current implementation or authoring guidance.

The full F3 routing design — route topology, priority and continuation rules, delayed-default handling, external-owner forwarding, availability hook, focus scopes, and their journey tables — remains in git history for this path. It is decision history, not current implementation or authoring guidance.

The current contract is the three vouched decisions linked above, implemented as `useInput()` broadcast facts and `useStdin()` raw access. One guarantee from this record is vouched and stays current:

vue-tui guarantees that `useStdin().stdin` exposes the actual stdin stream mounted into the application. Bytes read from that stream carry no framework event semantics and are not guaranteed to compose safely with framework input routing. [VOUCHED @hyfdev 2026-07-12]

Do not rebuild route topology, propagation results, focus-selected routing, or an availability hook without a concrete application journey and a new decision-ledger entry.
