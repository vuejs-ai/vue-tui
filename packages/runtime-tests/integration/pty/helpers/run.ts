import process from "node:process";
import { createRequire } from "node:module";
import path from "node:path";
import url from "node:url";

const require = createRequire(import.meta.url);
const { spawn } = require("node-pty") as typeof import("node-pty");

const fixturesDir = url.fileURLToPath(new URL("../fixtures", import.meta.url));

type RunProps = { env?: Record<string, string>; columns?: number };

export const run = async (fixture: string, props?: RunProps): Promise<string> => {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    CI: "false",
    NODE_NO_WARNINGS: "1",
    FORCE_COLOR: "3",
    ...props?.env,
  };

  return new Promise<string>((resolve, reject) => {
    const term = spawn("node", ["--import=tsx", path.join(fixturesDir, `${fixture}.tsx`)], {
      name: "xterm-color",
      cols: props?.columns ?? 100,
      cwd: fixturesDir,
      env,
    });

    let output = "";
    term.onData((data) => {
      output += data;
    });
    term.onExit(({ exitCode }) => {
      if (exitCode === 0) {
        resolve(output);
        return;
      }

      reject(new Error(`Process exited with non-zero code: ${exitCode}`));
    });
  });
};
