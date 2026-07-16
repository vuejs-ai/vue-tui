import { expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

test.each(["inline", "fullscreen"] as const)(
  "framed facts recapture routes inside one PTY write (%s)",
  async (mode) => {
    const ps = term("input-route-batching", [mode, "assert"]);
    ps.write("x\x7f");
    await ps.waitForExit();

    expect(ps.output).toContain("__ROUTE_BATCHING_OK__");
  },
);
