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

  const exitPromise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
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

  const ps = spawn("node", ["--import=tsx", path.join(fixturesDir, `${fixture}.tsx`), ...args], {
    name: "xterm-color",
    cols: 100,
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
