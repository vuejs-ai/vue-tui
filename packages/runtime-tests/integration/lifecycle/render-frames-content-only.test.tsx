import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { Text, usePaste } from "@vue-tui/runtime";
import { render } from "@vue-tui/testing";

// Headline invariant of the B′ "source-hook frame capture" design: the testing
// helper's `frames[]` / `lastFrame()` are CONTENT-ONLY. They are fed each
// committed frame DIRECTLY from the runtime (an internal per-app frame sink),
// NOT reverse-engineered out of stdout. So terminal-control escapes that the
// runtime legitimately writes to stdout (to stay byte-faithful to Ink) must NOT
// leak into `frames[]`.
//
// usePaste() enables bracketed-paste mode, which writes the OSC `\x1b[?2004h`
// enable sequence to stdout (gated on stdout.isTTY, which the testing helper's
// fake stdout is — render.ts setBracketedPasteMode). Under the OLD
// stdout-sniffing capture this escape was pushed into `frames[]` as its own
// frame, polluting the content the test observer sees. Under B′ it goes only to
// stdout; `frames[]` contains the rendered content alone.
test("render() frames are content-only — bracketed-paste escape never leaks into frames", async () => {
  const App = defineComponent(() => {
    usePaste(() => {});
    return () => <Text>content</Text>;
  });

  const { frames, lastFrame } = await render(App);

  // The rendered content is observable.
  expect(lastFrame()).toBe("content");

  // The bracketed-paste enable escape was written to stdout (byte-faithful to
  // Ink) but must NEVER appear in any captured frame.
  for (const frame of frames) {
    expect(frame).not.toContain("\x1b[?2004h");
    expect(frame).not.toContain("\x1b[?2004l");
  }
});
