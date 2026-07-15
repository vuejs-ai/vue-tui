import { expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

test("a real PTY delivers Escape to a reactivated targetless approval boundary", async () => {
  const ps = term("approval-reactivation", [], { name: "xterm-256color" });
  try {
    await ps.waitForOutput((output) => output.includes("state=idle approvals=none"));

    ps.write("\r");
    await ps.waitForOutput((output) => output.includes("state=approving approvals=none"));
    ps.write("\r");
    await ps.waitForOutput((output) => output.includes("state=idle approvals=return"));

    ps.write("\r");
    await ps.waitForOutput((output) => output.includes("state=approving approvals=return"));
    ps.write("\x1b");
    await ps.waitForOutput((output) => output.includes("state=idle approvals=return,escape"));

    ps.write("q");
    await ps.waitForOutput((output) => output.includes("__APPROVAL_REACTIVATION_OK__"));
    await ps.waitForExit();
    expect(ps.output).toContain("state=idle approvals=return,escape");
  } finally {
    ps.killNow("SIGKILL");
  }
});
