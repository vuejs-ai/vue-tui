import { expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

test.each(["inline", "fullscreen"] as const)(
  "public focus routing and Tab traversal work in a real %s terminal",
  async (mode) => {
    const ps = term("focus-routing", [mode]);
    try {
      await ps.waitForOutput((output) => output.includes("focus:first"));
      ps.write("x");
      await ps.waitForOutput((output) => output.includes("external:first:x"));
      ps.write("\t");
      await ps.waitForOutput((output) => output.includes("focus:second"));
      ps.write("y");
      await ps.waitForOutput((output) => output.includes("external:second:y"));
      ps.write("q");
      await ps.waitForOutput((output) => output.includes("__FOCUS_ROUTING_OK__"));
      await ps.waitForExit();
      expect(ps.output).toContain("__FOCUS_ROUTING_OK__");
    } finally {
      ps.killNow("SIGKILL");
    }
  },
);
