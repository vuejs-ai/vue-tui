/**
 * Type-only regression fixture — NOT a runnable PTY program (nothing spawns it,
 * and it is not a `*.test.tsx` so vitest never collects it). It exists purely so
 * `tsc -p integration/pty/fixtures/tsconfig.json` type-checks it.
 *
 * It pins the contract the `WithChildren` shim establishes under the automatic
 * JSX runtime (`jsx: "react-jsx"`, this dir's tsconfig — the mode the main
 * runtime-tests tsconfig does NOT use): components accept JSX children while
 * their declared props stay fully validated. If the shim regresses in either
 * direction, this file fails to compile:
 *   - children rejected     -> the `accepted` cases error
 *   - prop validation lost   -> the `@ts-expect-error` directives become unused
 */
import { Box, Static, Text, Transform } from "@vue-tui/runtime";

// Children are accepted (the shim's whole purpose under the automatic runtime).
export const accepted = [
  <Text color="green">plain text child</Text>,
  <Box flexDirection="row">
    <Text>nested child</Text>
  </Box>,
  <Static items={[1, 2, 3]}>
    <Text>static child</Text>
  </Static>,
  <Transform transform={(line) => line}>
    <Text>transformed child</Text>
  </Transform>,
];

// Declared props stay validated — children must not widen the prop bag.
export const rejected = [
  // @ts-expect-error `display` accepts "flex" | "none", not a number
  <Box display={123}>x</Box>,
  // @ts-expect-error `bold` accepts a boolean, not a string
  <Text bold="yes">x</Text>,
  // @ts-expect-error `bogusProp` is not a declared Box prop
  <Box bogusProp="x">x</Box>,
  // @ts-expect-error `transform` is required
  <Transform>x</Transform>,
  // @ts-expect-error `items` is required
  <Static>x</Static>,
];
