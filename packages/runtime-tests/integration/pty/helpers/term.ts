import process from "node:process";
import { createRequire } from "node:module";
import path from "node:path";
import url from "node:url";

const require = createRequire(import.meta.url);

const { spawn } = require("node-pty") as typeof import("node-pty");

const fixturesDir = url.fileURLToPath(new URL("../fixtures", import.meta.url));

const term = (fixture: string, args: string[] = []) => {
  let resolve: (value?: unknown) => void;
  let reject: (error?: Error) => void;

  const exitPromise = new Promise((resolve2, reject2) => {
    resolve = resolve2;
    reject = reject2;
  });

  let readyResolve: () => void;
  const readyPromise = new Promise<void>((r) => {
    readyResolve = r;
  });

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    NODE_NO_WARNINGS: "1",
    CI: "false",
    FORCE_COLOR: "3",
  };

  // First arg is often the desired rows count for viewport tests
  const rowsArg = args.length > 0 ? Number(args[0]) : NaN;
  const rows = Number.isFinite(rowsArg) && rowsArg > 0 ? rowsArg : 24;

  const ps = spawn("node", ["--import=tsx", path.join(fixturesDir, `${fixture}.tsx`), ...args], {
    name: "xterm-color",
    cols: 100,
    rows,
    cwd: fixturesDir,
    env,
  });

  const result = {
    write(input: string) {
      void readyPromise.then(() => {
        ps.write(input);
      });
    },
    output: "",
    waitForExit: async () => exitPromise,
  };

  ps.onData((data) => {
    result.output += data;

    if (result.output.includes("__READY__")) {
      readyResolve();
    }
  });

  ps.onExit(({ exitCode }) => {
    if (exitCode === 0) {
      resolve();
      return;
    }

    reject(new Error(`Process exited with non-zero exit code: ${exitCode}`));
  });

  return result;
};

export default term;
