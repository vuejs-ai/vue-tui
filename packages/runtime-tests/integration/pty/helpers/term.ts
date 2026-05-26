import process from "node:process";
import { spawn } from "node:child_process";
import path from "node:path";
import url from "node:url";

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

  const forceTty = url.fileURLToPath(new URL("./force-tty.cjs", import.meta.url));
  const child = spawn(
    "node",
    ["--require", forceTty, "--import=tsx", path.join(fixturesDir, `${fixture}.tsx`), ...args],
    { cwd: fixturesDir, env, stdio: ["pipe", "pipe", "pipe"] },
  );

  const result = {
    write(input: string) {
      void readyPromise.then(() => {
        child.stdin!.write(input);
      });
    },
    output: "",
    waitForExit: async () => exitPromise,
  };

  child.stdout!.on("data", (data: Buffer) => {
    result.output += data.toString();
    if (result.output.includes("__READY__")) {
      readyResolve();
    }
  });

  child.stderr!.on("data", (data: Buffer) => {
    const text = data.toString();
    if (!text.includes("[Vue warn]: Non-function value encountered for default slot")) {
      result.output += text;
    }
  });

  child.on("exit", (exitCode) => {
    if (exitCode === 0) {
      resolve();
      return;
    }
    reject(new Error(`Process exited with non-zero exit code: ${exitCode}`));
  });

  child.on("error", (err) => {
    reject(err);
  });

  return result;
};

export default term;
