// Subprocess fixture for testing-render-ci.sequential.test.ts.
//
// Imports the BUILT, PUBLISHED dist of @vue-tui/testing (the artifact consumers
// install) and exercises deterministic resize plus route-owned input state:
//   - terminal.resize() → layout-driven components must re-lay-out
//   - terminal.rawMode  → an active useInput route must acquire raw mode
//
// The parent test spawns this with CI=true vs CI=false to prove render() pins
// `interactive` deterministically instead of inheriting the ambient CI/TTY-
// derived default (which silently disabled both APIs for consumers in CI).
//
// Plain ESM with h() (no JSX/tsx) so `node <file>` runs it directly, matching
// how the published consumer would call the dist.
import { render } from "@vue-tui/testing";
import { Box, Text, useInput } from "@vue-tui/runtime";
import { h } from "vue";

// Width of the box's top border line, ANSI-stripped. A bordered <Box> with no
// explicit width fills the terminal columns, so this tracks the laid-out width.
function topBorderWidth(frame) {
  const line = (frame ?? "").split("\n").find((l) => l.includes("╭") || l.includes("┌")) ?? "";
  // Control-char class is required to strip terminal SGR escapes byte-faithfully.
  // eslint-disable-next-line no-control-regex
  return line.replace(/\x1b\[[0-9;]*m/g, "").trim().length;
}

const App = () => {
  useInput(() => {});
  return h(Box, { borderStyle: "round" }, () => h(Text, () => "x"));
};

const r = await render(App, { columns: 40, rows: 10 });
const before = topBorderWidth(r.lastFrame());

await r.terminal.resize(12, 6);
const after = topBorderWidth(r.lastFrame());

// Single machine-readable line the parent test parses.
process.stdout.write(JSON.stringify({ before, after, rawMode: r.terminal.rawMode.current }) + "\n");

r.unmount();
process.exit(0);
